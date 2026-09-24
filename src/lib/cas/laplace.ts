/**
 * Transformada de Laplace (tabla + propiedades), su inversa por fracciones simples y la
 * resolución de EDO lineales de coeficientes constantes con condiciones en t = 0.
 * Cada resultado se contrasta numéricamente: L{f}(s) = ∫₀^∞ f(t) e^{−st} dt en tres valores de s.
 * Convenio: límite inferior 0⁻ (L{δ(t)} = 1) y H(0) = ½.
 */
import {
  CERO, DOS, MEDIO, MENOS, NEPER, UNO, contiene, flo, esCero, esNum, evaluar, fn, igual, partirTermino, pot, prod, q, s as sim, simbolos,
  suma, sustituir, desdeNodo, type E,
} from './expr'
import { derivar } from './derivar'
import { desarrollar, racional, simplificar } from './algebra'
import { aExpr, divP, factorizarP, grado, mcdP, prodP, r, rDiv, rProd, rResta, type P, type R } from './polinomios'
import { sistemaQ } from './integrar'
import { tex } from './tex'
import { analizar } from '../expresion'
import { raicesPolinomio } from '../matrices'
import { nodos, rupturas } from '../senales'

export interface PasoL {
  t: string
  tex?: string
}

export interface ResultadoL {
  resultado: E
  pasos: PasoL[]
  /** diferencia relativa máxima entre la fórmula y la integral numérica */
  error: number
  verificada: boolean
  aproximada: boolean
}

const T = 't'
const S = 's'
const t = sim(T)
const sv = sim(S)

class NoTabla extends Error {}

const numero = (e: E) => {
  try {
    return evaluar(e, {})
  } catch {
    return NaN
  }
}

/** u = a·x + b con a, b sin x. */
function lineal(u: E, x: string): [E, E] | null {
  const a = simplificar(derivar(u, x))
  if (contiene(a, x)) return null
  const b = simplificar(sustituir(u, sim(x), CERO))
  if (!esCero(simplificar(suma(u, prod(MENOS, suma(prod(a, sim(x)), b)))))) return null
  return [a, b]
}

const factores = (e: E): E[] => (e.t === '*' ? e.a : [e])
const TRIG = new Set(['sin', 'cos'])
const HIPER = new Set(['sinh', 'cosh'])

/** Γ(p) exacto para p entero positivo o semientero positivo. */
function gammaExacta(p: E): E | null {
  if (p.t !== 'q') return null
  if (p.d === 1n && p.n > 0n) {
    let f = 1n
    for (let k = 2n; k < p.n; k++) f *= k
    return q(f)
  }
  if (p.d === 2n && p.n > 0n) {
    // Γ(j + ½) = (2j)! √π / (4ʲ j!)
    const j = (p.n - 1n) / 2n
    let num = 1n
    for (let k = 2n; k <= 2n * j; k++) num *= k
    let den = 1n
    for (let k = 2n; k <= j; k++) den *= k
    den *= 4n ** j
    return prod(q(num, den), pot(sim('pi'), MEDIO))
  }
  return null
}

/* ═══════════ transformada directa ═══════════ */

interface Directa {
  F: E
  /** abscisa de convergencia (numérica): la transformada vale para Re s mayor */
  sigma: number
  /** parte debida a δ: e^{−τs}·peso, que la integral numérica no ve */
  deltas: E[]
}

/** Reescrituras que dejan cada término con a lo sumo un factor trigonométrico de argumento b·t. */
function normalizar(e: E): E {
  const r1 = reescribir(e, (y) => {
    if (y.t === 'fn' && (TRIG.has(y.v) || HIPER.has(y.v))) {
      const l = lineal(y.a[0], T)
      if (l && !esCero(l[1]) && !esCero(l[0])) {
        const [a, b] = l
        const at = prod(a, t)
        // fases fuera: sin(at + b) = sin at cos b + cos at sin b, y sus parientes
        if (y.v === 'sin') return suma(prod(fn('sin', [at]), fn('cos', [b])), prod(fn('cos', [at]), fn('sin', [b])))
        if (y.v === 'cos') return suma(prod(fn('cos', [at]), fn('cos', [b])), prod(MENOS, fn('sin', [at]), fn('sin', [b])))
        if (y.v === 'sinh') return suma(prod(fn('sinh', [at]), fn('cosh', [b])), prod(fn('cosh', [at]), fn('sinh', [b])))
        return suma(prod(fn('cosh', [at]), fn('cosh', [b])), prod(fn('sinh', [at]), fn('sinh', [b])))
      }
    }
    // potencias enteras: f^k = f^{k−2}·f², con f² por el ángulo doble (multiplicarlas a mano no sirve:
    // prod vuelve a juntar f·f en f²)
    if (y.t === '^' && y.b.t === 'fn' && (TRIG.has(y.b.v) || HIPER.has(y.b.v)) && y.e.t === 'q' && y.e.d === 1n && y.e.n >= 2n && y.e.n <= 12n) {
      const f = y.b
      const u2 = prod(DOS, f.a[0])
      const cuadrado =
        f.v === 'sin' ? prod(MEDIO, suma(UNO, prod(MENOS, fn('cos', [u2]))))
        : f.v === 'cos' ? prod(MEDIO, suma(UNO, fn('cos', [u2])))
        : f.v === 'sinh' ? prod(MEDIO, suma(fn('cosh', [u2]), MENOS))
        : prod(MEDIO, suma(fn('cosh', [u2]), UNO))
      return y.e.n === 2n ? cuadrado : prod(pot(f, q(y.e.n - 2n)), cuadrado)
    }
    return null
  })
  return desarrollar(r1)
}

/** Aplica `f` de fuera hacia dentro hasta que no cambie nada. */
function reescribir(e: E, f: (y: E) => E | null): E {
  const r0 = f(e)
  if (r0) return reescribir(r0, f)
  switch (e.t) {
    case '+':
      return suma(...e.a.map((y) => reescribir(y, f)))
    case '*':
      return prod(...e.a.map((y) => reescribir(y, f)))
    case '^':
      return pot(reescribir(e.b, f), reescribir(e.e, f))
    case 'fn':
      return fn(e.v, e.a.map((y) => reescribir(y, f)))
    default:
      return e
  }
}

/** Producto a suma para dos factores trigonométricos (o hiperbólicos pasados a exponenciales). */
function productoASuma(a: Extract<E, { t: 'fn' }>, b: Extract<E, { t: 'fn' }>): E {
  const u = a.a[0]
  const v = b.a[0]
  const mas = suma(u, v)
  const menos = suma(u, prod(MENOS, v))
  const k = MEDIO
  if (a.v === 'sin' && b.v === 'sin') return prod(k, suma(fn('cos', [menos]), prod(MENOS, fn('cos', [mas]))))
  if (a.v === 'cos' && b.v === 'cos') return prod(k, suma(fn('cos', [menos]), fn('cos', [mas])))
  if (a.v === 'sin' && b.v === 'cos') return prod(k, suma(fn('sin', [mas]), fn('sin', [menos])))
  if (a.v === 'cos' && b.v === 'sin') return prod(k, suma(fn('sin', [mas]), prod(MENOS, fn('sin', [menos]))))
  throw new NoTabla('producto de funciones trigonométricas')
}

const aExponenciales = (y: Extract<E, { t: 'fn' }>): E => {
  const u = y.a[0]
  const ep = pot(NEPER, u)
  const em = pot(NEPER, prod(MENOS, u))
  return y.v === 'sinh' ? prod(MEDIO, suma(ep, prod(MENOS, em))) : prod(MEDIO, suma(ep, em))
}

function directaSuma(e: E, pasos: PasoL[]): Directa {
  const n = normalizar(e)
  const terminos = n.t === '+' ? n.a : [n]
  const partes = terminos.map((x) => directaTermino(x, pasos))
  return {
    F: suma(...partes.map((p) => p.F)),
    sigma: Math.max(-Infinity, ...partes.map((p) => p.sigma)),
    deltas: partes.flatMap((p) => p.deltas),
  }
}

function directaTermino(termino: E, pasos: PasoL[]): Directa {
  const [c0, resto] = partirTermino(termino)
  let coef: E = c0
  if (!resto) return { F: prod(coef, pot(sv, MENOS)), sigma: 0, deltas: [] }
  const fs = factores(resto)
  // 1. retardos y deltas primero: cambian el término entero
  for (let i = 0; i < fs.length; i++) {
    const f = fs[i]
    if (f.t !== 'fn' || (f.v !== 'heaviside' && f.v !== 'delta')) continue
    const l = lineal(f.a[0], T)
    if (!l || esCero(l[0])) throw new NoTabla(`${f.v} con argumento no lineal en t`)
    const [a, b] = l
    const av = numero(a)
    const tau = simplificar(prod(MENOS, b, pot(a, MENOS)))
    const tv = numero(tau)
    if (!Number.isFinite(av) || !Number.isFinite(tv)) throw new NoTabla('el retardo tiene que ser un número')
    const otros = prod(coef, ...fs.filter((_, j) => j !== i))
    if (f.v === 'heaviside') {
      if (av > 0) {
        if (tv <= 0) return directaSuma(otros, pasos)
        // L{g(t)·H(t − τ)} = e^{−τs}·L{g(t + τ)}
        const gDesp = desarrollar(sustituir(otros, t, suma(t, tau)))
        pasos.push({ t: 'Retardo: L{g(t)·H(t − τ)} = e^{−τs}·L{g(t + τ)}', tex: String.raw`\tau = ${tex(tau)}` })
        const d = directaSuma(gDesp, pasos)
        const e = pot(NEPER, prod(MENOS, tau, sv))
        return { F: prod(e, d.F), sigma: d.sigma, deltas: d.deltas.map((x) => prod(e, x)) }
      }
      // H(τ − t) = 1 − H(t − τ) salvo en un punto
      if (tv <= 0) return { F: CERO, sigma: -Infinity, deltas: [] }
      return directaSuma(suma(otros, prod(MENOS, otros, fn('heaviside', [suma(t, prod(MENOS, tau))]))), pasos)
    }
    // δ(a(t − τ)) = δ(t − τ)/|a|
    if (tv < 0) return { F: CERO, sigma: -Infinity, deltas: [] }
    const peso = prod(sustituir(otros, t, tau), pot(fn('abs', [a]), MENOS))
    const Fd = simplificar(prod(peso, pot(NEPER, prod(MENOS, tau, sv))))
    pasos.push({ t: 'Delta: L{g(t)·δ(t − τ)} = g(τ)·e^{−τs}', tex: String.raw`\tau = ${tex(tau)}` })
    if (contiene(Fd, T)) throw new NoTabla('δ multiplicada por algo que no se puede evaluar en τ')
    return { F: Fd, sigma: -Infinity, deltas: [Fd] }
  }
  // 2. hiperbólicas con otra función del tiempo: a exponenciales
  const conT = fs.filter((f) => contiene(f, T))
  const trig = conT.filter((f): f is Extract<E, { t: 'fn' }> => f.t === 'fn' && (TRIG.has(f.v) || HIPER.has(f.v)))
  if (trig.length >= 2) {
    const hip = trig.find((f) => HIPER.has(f.v))
    if (hip) return directaSuma(prod(coef, ...fs.map((f) => (f === hip ? aExponenciales(hip) : f))), pasos)
    const [a, b] = trig
    pasos.push({ t: 'Producto a suma de dos funciones trigonométricas' })
    return directaSuma(prod(coef, productoASuma(a, b), ...fs.filter((f) => f !== a && f !== b)), pasos)
  }
  // 3. núcleo tⁿ·e^{αt}·K(βt)
  let n: E = CERO
  let alfa: E = CERO
  let K: Extract<E, { t: 'fn' }> | null = null
  for (const f of fs) {
    if (!contiene(f, T)) {
      coef = prod(coef, f)
      continue
    }
    if (f.t === 's' && f.v === T) {
      n = suma(n, UNO)
      continue
    }
    if (f.t === '^' && f.b.t === 's' && f.b.v === T && esNum(f.e)) {
      n = suma(n, f.e)
      continue
    }
    if (f.t === '^' && f.b.t === 's' && f.b.v === 'e') {
      const l = lineal(f.e, T)
      if (!l) throw new NoTabla(`exponencial de argumento no lineal: ${tex(f)}`)
      alfa = suma(alfa, l[0])
      coef = prod(coef, pot(NEPER, l[1]))
      continue
    }
    if (f.t === 'fn' && (TRIG.has(f.v) || HIPER.has(f.v))) {
      K = f
      continue
    }
    throw new NoTabla(`no está en la tabla: ${tex(f)}`)
  }
  alfa = simplificar(alfa)
  let G: E
  let beta: E = CERO
  const nv = numero(n)
  if (!K) {
    const p = suma(n, UNO)
    if (nv > -1 && !(n.t === 'q' && (n.d === 1n || n.d === 2n))) throw new NoTabla('tᵖ solo con p entero o semientero')
    if (nv <= -1) throw new NoTabla('tᵖ con p ≤ −1 no tiene transformada')
    const g = gammaExacta(p)!
    G = prod(g, pot(sv, prod(MENOS, p)))
    pasos.push({ t: nv === 0 ? 'Constante: L{1} = 1/s' : 'Potencia: L{tᵖ} = Γ(p + 1)/s^{p+1}', tex: String.raw`\mathcal L\{t^{${tex(n)}}\}=${tex(G)}` })
  } else {
    if (!(n.t === 'q' && n.d === 1n && n.n >= 0n)) throw new NoTabla('tᵖ·sen/cos solo con p entero')
    const l = lineal(K.a[0], T)!
    beta = l[0]
    const b2 = pot(beta, DOS)
    const base =
      K.v === 'sin' ? prod(beta, pot(suma(pot(sv, DOS), b2), MENOS))
      : K.v === 'cos' ? prod(sv, pot(suma(pot(sv, DOS), b2), MENOS))
      : K.v === 'sinh' ? prod(beta, pot(suma(pot(sv, DOS), prod(MENOS, b2)), MENOS))
      : prod(sv, pot(suma(pot(sv, DOS), prod(MENOS, b2)), MENOS))
    pasos.push({ t: `Tabla: L{${K.v}(βt)}`, tex: String.raw`\mathcal L\{${tex(fn(K.v, [prod(beta, t)]))}\}=${tex(base)}` })
    G = base
    const k = Number(n.t === 'q' ? n.n : 0n)
    if (k > 0) {
      for (let i = 0; i < k; i++) G = prod(MENOS, derivar(G, S))
      G = simplificar(G)
      pasos.push({ t: `Multiplicar por t^${k}: (−1)^${k}·d^${k}/ds^${k}`, tex: String.raw`${tex(G)}` })
    }
  }
  if (!esCero(alfa)) {
    G = sustituir(G, sv, suma(sv, prod(MENOS, alfa)))
    pasos.push({ t: 'Desplazamiento en s: e^{αt}·g(t) ↦ G(s − α)', tex: String.raw`\alpha = ${tex(alfa)}` })
  }
  const av = numero(alfa)
  const bv = K && HIPER.has(K.v) ? Math.abs(numero(beta)) : 0
  return { F: simplificar(prod(coef, G)), sigma: av + bv, deltas: [] }
}

/** Retardos que aparecen en la expresión (H(t − τ), δ, |t − τ|): ahí la función salta o hace pico. */
function cortes(e: E, out: number[] = []): number[] {
  if (e.t === 'fn' && ['heaviside', 'delta', 'abs', 'sign'].includes(e.v)) {
    const l = lineal(e.a[0], T)
    if (l && !esCero(l[0])) {
      const tv = numero(prod(MENOS, l[1], pot(l[0], MENOS)))
      if (tv > 0) out.push(tv)
    }
  }
  if (e.t === '+' || e.t === '*') for (const y of e.a) cortes(y, out)
  if (e.t === '^') {
    cortes(e.b, out)
    cortes(e.e, out)
  }
  if (e.t === 'fn') for (const y of e.a) cortes(y, out)
  return out
}

/**
 * ∫₀^∞ f e^{−st} dt con t = u²: las potencias semienteras (√t) quedan polinómicas en u y la
 * cuadratura no pierde el orden en t = 0. Se parte en √τ de cada retardo conocido y en los saltos.
 */
function laplaceNumerica(f: (t: number) => number, s0: number, sigma: number, cortesT: number[]): number {
  const Tfin = 60 / (s0 - Math.max(sigma, -5)) + 5
  const U = Math.sqrt(Tfin)
  const g = (u: number) => 2 * u * f(u * u) * Math.exp(-s0 * u * u)
  const cs = [...new Set([...cortesT.filter((c) => c < Tfin).map(Math.sqrt), ...rupturas(g, 0, U)])].sort((a, b) => a - b)
  const { t: nodosU, w } = nodos(0, U, cs, 3000)
  let acc = 0
  for (let i = 0; i < nodosU.length; i++) {
    const v = g(nodosU[i])
    if (Number.isFinite(v)) acc += w[i] * v
  }
  return acc
}

function comprobar(f: E, F: E, sigma: number, deltas: E[]): number {
  if (!Number.isFinite(sigma)) sigma = 0
  const fe = (x: number) => evaluar(f, { [T]: x })
  const cs = cortes(f)
  let peor = 0
  for (const d of [1.3, 2.1, 3.7]) {
    const s0 = sigma + d
    const exacta = evaluar(F, { [S]: s0 }) - deltas.reduce((acc, x) => acc + evaluar(x, { [S]: s0 }), 0)
    const num = laplaceNumerica(fe, s0, sigma, cs)
    peor = Math.max(peor, Math.abs(exacta - num) / Math.max(1e-6, Math.abs(exacta)))
  }
  return peor
}

/** Junta los términos de cada retardo e^{−τs} en una sola fracción (si son varios y es racional). */
function juntar(F: E): E {
  let grupos: Grupo[]
  try {
    grupos = agrupar(F)
  } catch {
    return F
  }
  return suma(
    ...grupos.map((g) => {
      const e = esCero(g.tau) ? UNO : pot(NEPER, prod(MENOS, g.tau, sv))
      let R = simplificar(suma(...g.racional))
      if (g.racional.length > 1) {
        const par = racional(R, S)
        if (par) {
          const [N, D] = par
          const m = mcdP(N, D)
          R = prod(aExpr(divP(N, m).c, S), pot(aExpr(divP(D, m).c, S), MENOS))
        }
      }
      return prod(e, R)
    }),
  )
}

export function laplace(f: E): ResultadoL {
  if ([...simbolos(f)].some((v) => v !== T && v !== 'pi' && v !== 'e')) throw new Error('solo t puede quedar libre: da valor a los parámetros')
  const pasos: PasoL[] = []
  let d: Directa
  try {
    d = directaSuma(f, pasos)
  } catch (e) {
    if (e instanceof NoTabla) throw new Error(`fuera de la tabla: ${e.message}`)
    throw e
  }
  const F = juntar(simplificar(d.F))
  const error = comprobar(f, F, d.sigma, d.deltas)
  return { resultado: F, pasos, error, verificada: error < 1e-7, aproximada: false }
}

/* ═══════════ inversa ═══════════ */

interface Grupo {
  tau: E
  racional: E[]
}

/** F(s) = Σ e^{−τₖ s}·Rₖ(s): separa por retardos. */
function agrupar(F: E): Grupo[] {
  // desarrollar deja los denominadores fuera; aquí hay que repartirlos sobre las sumas que llevan
  // un retardo, o (1 − e^{−s})/s² se quedaría como un solo término sin separar
  const tieneRetardo = (y: E): boolean => y.t === '^' && y.b.t === 's' && y.b.v === 'e' && contiene(y.e, S) || ((y.t === '+' || y.t === '*') && y.a.some(tieneRetardo))
  const repartir = (y: E): E[] => {
    if (y.t === '+') return y.a.flatMap(repartir)
    if (y.t === '*') {
      const i = y.a.findIndex((f) => f.t === '+' && tieneRetardo(f))
      if (i >= 0) {
        const otros = y.a.filter((_, j) => j !== i)
        return (y.a[i] as Extract<E, { t: '+' }>).a.flatMap((z) => repartir(prod(z, ...otros)))
      }
    }
    return [y]
  }
  const terminos = repartir(desarrollar(F))
  const grupos: Grupo[] = []
  for (const termino of terminos) {
    const fs = factores(termino)
    let tau: E = CERO
    const resto: E[] = []
    for (const f of fs) {
      if (f.t === '^' && f.b.t === 's' && f.b.v === 'e' && contiene(f.e, S)) {
        const l = lineal(f.e, S)
        if (!l) throw new Error(`exponencial no lineal en s: ${tex(f)}`)
        const tv = numero(prod(MENOS, l[0]))
        if (!(tv >= 0)) throw new Error('e^{as} con a > 0 no es la transformada de una función causal')
        tau = suma(tau, prod(MENOS, l[0]))
        resto.push(pot(NEPER, l[1]))
      } else resto.push(f)
    }
    tau = simplificar(tau)
    const g = grupos.find((y) => igual(y.tau, tau))
    if (g) g.racional.push(prod(...resto))
    else grupos.push({ tau, racional: [prod(...resto)] })
  }
  return grupos
}

const Qe = (v: R) => q(v.n, v.d)
const expo = (a: E): E => (esCero(a) ? UNO : pot(NEPER, prod(a, t)))

interface Inversa {
  f: E
  deltas: E[]
  raices: number[]
  aproximada: boolean
}

function inversaRacional(R0: E, pasos: PasoL[]): Inversa {
  // sᵖ puro con exponente no entero: L⁻¹{s^{−p}} = t^{p−1}/Γ(p)
  const [c, resto] = partirTermino(R0)
  if (resto && resto.t === '^' && resto.b.t === 's' && resto.b.v === S && resto.e.t === 'q' && resto.e.d !== 1n) {
    const p = prod(MENOS, resto.e)
    const g = gammaExacta(simplificar(p))
    if (!g || numero(p) <= 0) throw new Error('potencia de s sin inversa')
    pasos.push({ t: 'Potencia: L⁻¹{s^{−p}} = t^{p−1}/Γ(p)' })
    return { f: simplificar(prod(c, pot(t, suma(p, MENOS)), pot(g, MENOS))), deltas: [], raices: [0], aproximada: false }
  }
  const par = racional(R0, S)
  if (!par || [...simbolos(R0)].some((v) => v !== S && v !== 'pi' && v !== 'e'))
    throw new Error('F(s) tiene que ser un cociente de polinomios en s con coeficientes numéricos (por cada retardo e^{−τs})')
  const [N, D] = par
  if (grado(D) < 0) throw new Error('denominador nulo')
  const { c: entera, r: restoP } = divP(N, D)
  const deltas: E[] = []
  let f: E = CERO
  if (grado(entera) > 0) throw new Error('F(s) no es propia: su inversa lleva derivadas de δ')
  if (grado(entera) === 0) {
    f = prod(Qe(entera[0]), fn('delta', [t]))
    deltas.push(Qe(entera[0]))
    pasos.push({ t: 'Parte entera constante c ↦ c·δ(t)' })
  }
  if (grado(restoP) < 0) return { f, deltas, raices: [], aproximada: false }
  const fact = factorizarP(D)
  const Dp = fact.factores.reduce<P>((acc, { p, m }) => {
    let a = acc
    for (let k = 0; k < m; k++) a = prodP(a, p)
    return a
  }, [r(1)])
  const R1 = restoP.map((v) => rDiv(v, fact.c))
  // incógnitas: por cada factor p y cada potencia j ≤ m, un numerador de grado < grado(p)
  type Inc = { p: P; j: number; k: number }
  const incs: Inc[] = []
  for (const { p, m } of fact.factores) for (let j = 1; j <= m; j++) for (let k = 0; k < grado(p); k++) incs.push({ p, j, k })
  const n = grado(Dp)
  const columnas = incs.map(({ p, j, k }) => {
    let cof: P = Dp
    for (let i = 0; i < j; i++) cof = divP(cof, p).c
    const conS: P = [...Array.from({ length: k }, () => r(0)), ...cof]
    return Array.from({ length: n }, (_, fila) => conS[fila] ?? r(0))
  })
  const A = Array.from({ length: n }, (_, fila) => columnas.map((col) => col[fila]))
  const b = Array.from({ length: n }, (_, fila) => R1[fila] ?? r(0))
  const sol = sistemaQ(A, b)
  if (!sol) throw new Error('no se pudo descomponer en fracciones simples')
  const coef = (p: P, j: number, k: number) => sol[incs.findIndex((x) => x.p === p && x.j === j && x.k === k)]
  pasos.push({ t: 'Fracciones simples sobre los factores del denominador', tex: String.raw`\text{denominador} = ${tex(aExpr(D, S))}` })
  const raices: number[] = []
  let aproximada = false
  const partes: E[] = [f]
  for (const { p, m } of fact.factores) {
    const gp = grado(p)
    if (gp === 1) {
      // p = p₁s + p₀: raíz ρ = −p₀/p₁; A/(p₁s + p₀)ʲ = (A/p₁ʲ)/(s − ρ)ʲ ↦ (A/p₁ʲ) tʲ⁻¹ e^{ρt}/(j−1)!
      const rho = rDiv(rResta(r(0), p[0]), p[1])
      raices.push(Number(rho.n) / Number(rho.d))
      for (let j = 1; j <= m; j++) {
        let A: R = coef(p, j, 0)
        if (A.n === 0n) continue
        for (let i = 0; i < j; i++) A = rDiv(A, p[1])
        let fa = 1n
        for (let i = 2n; i < BigInt(j); i++) fa *= i
        partes.push(prod(Qe(A), q(1n, fa), pot(t, q(j - 1)), expo(Qe(rho))))
      }
      pasos.push({ t: `Polo ${m > 1 ? `de orden ${m} ` : ''}en s = ${Number(rho.n) / Number(rho.d)}: A/(s − ρ)ʲ ↦ A tʲ⁻¹ e^{ρt}/(j − 1)!` })
      continue
    }
    if (gp === 2) {
      const [c0, b1, a2] = p
      const alfa = rDiv(b1, rProd(r(2), a2))
      const kappa = rResta(rDiv(c0, a2), rProd(alfa, alfa))
      const osc = kappa.n > 0n
      const w = pot(Qe(osc ? kappa : r(-kappa.n, kappa.d)), MEDIO)
      const wt = prod(w, t)
      const [C1, S1] = osc ? ['cos', 'sin'] : ['cosh', 'sinh']
      const ea = expo(prod(MENOS, Qe(alfa)))
      const av = Number(alfa.n) / Number(alfa.d)
      raices.push(-av + (osc ? 0 : Math.sqrt(-Number(kappa.n) / Number(kappa.d))))
      if (m > 2) throw new Error('factor cuadrático repetido más de dos veces: no está en la tabla')
      for (let j = 1; j <= m; j++) {
        // (B s + C)/(a₂ᵈ((s + α)² ± ω²)ʲ): numerador B(s + α) + (C − Bα)
        let B: R = coef(p, j, 1)
        let C: R = coef(p, j, 0)
        for (let i = 0; i < j; i++) {
          B = rDiv(B, a2)
          C = rDiv(C, a2)
        }
        const Bq = Qe(B)
        const Cq = Qe(rResta(C, rProd(B, alfa)))
        if (j === 1) {
          partes.push(prod(ea, suma(prod(Bq, fn(C1, [wt])), prod(Cq, pot(w, MENOS), fn(S1, [wt])))))
        } else if (osc) {
          // L⁻¹{u/(u²+ω²)²} = t sin ωt/(2ω),  L⁻¹{1/(u²+ω²)²} = (sin ωt − ωt cos ωt)/(2ω³)
          partes.push(prod(ea, suma(
            prod(Bq, t, fn('sin', [wt]), pot(prod(DOS, w), MENOS)),
            prod(Cq, suma(fn('sin', [wt]), prod(MENOS, wt, fn('cos', [wt]))), pot(prod(DOS, pot(w, q(3))), MENOS)),
          )))
        } else {
          // L⁻¹{u/(u²−γ²)²} = t sinh γt/(2γ),  L⁻¹{1/(u²−γ²)²} = (γt cosh γt − sinh γt)/(2γ³)
          partes.push(prod(ea, suma(
            prod(Bq, t, fn('sinh', [wt]), pot(prod(DOS, w), MENOS)),
            prod(Cq, suma(prod(wt, fn('cosh', [wt])), prod(MENOS, fn('sinh', [wt]))), pot(prod(DOS, pot(w, q(3))), MENOS)),
          )))
        }
      }
      pasos.push({ t: `Factor cuadrático ${osc ? 'sin raíces reales' : 'con raíces irracionales'}: se completa el cuadrado (s + α)² ${osc ? '+' : '−'} ω²`, tex: tex(aExpr(p, S)) })
      continue
    }
    // grado ≥ 3 irreducible sobre Q: residuos en las raíces numéricas
    if (m > 1) throw new Error('factor irreducible de grado ≥ 3 repetido: fuera de la tabla')
    aproximada = true
    const coefsN: number[] = Array.from({ length: gp }, (_, k) => {
      const v = coef(p, 1, k)
      return Number(v.n) / Number(v.d)
    })
    const pc = p.map((v) => Number(v.n) / Number(v.d))
    const dp = pc.slice(1).map((v, i) => v * (i + 1))
    const ev = (co: number[], zr: number, zi: number): [number, number] => {
      let pr = 0
      let pi = 0
      for (let k = co.length - 1; k >= 0; k--) {
        const tr = pr * zr - pi * zi + co[k]
        pi = pr * zi + pi * zr
        pr = tr
      }
      return [pr, pi]
    }
    const redondeo = (v: number) => flo(+v.toPrecision(12))
    for (const [zr, zi] of raicesPolinomio(pc)) {
      if (zi < 0) continue
      raices.push(zr)
      const [nr, ni] = ev(coefsN, zr, zi)
      const [dr, di] = ev(dp, zr, zi)
      const mm = dr * dr + di * di
      const rr = (nr * dr + ni * di) / mm
      const ri = (ni * dr - nr * di) / mm
      if (zi === 0) partes.push(prod(redondeo(rr), expo(redondeo(zr))))
      else {
        // par conjugado: 2 Re(Res·e^{zt}) = e^{at}(2Re·cos bt − 2Im·sin bt)
        const bt = prod(redondeo(zi), t)
        partes.push(prod(expo(redondeo(zr)), suma(prod(redondeo(2 * rr), fn('cos', [bt])), prod(redondeo(-2 * ri), fn('sin', [bt])))))
      }
    }
    pasos.push({ t: `Factor de grado ${gp} sin raíces racionales: residuos en sus raíces numéricas (resultado con decimales)` })
  }
  return { f: simplificar(suma(...partes)), deltas, raices, aproximada }
}

export function laplaceInversa(F: E): ResultadoL {
  if ([...simbolos(F)].some((v) => v !== S && v !== 'pi' && v !== 'e')) throw new Error('solo s puede quedar libre: da valor a los parámetros')
  const pasos: PasoL[] = []
  const grupos = agrupar(F)
  const partes: E[] = []
  const deltasF: E[] = []
  let sigma = -Infinity
  let aproximada = false
  for (const g of grupos) {
    const R0 = simplificar(suma(...g.racional))
    if (esCero(R0)) continue
    const inv = inversaRacional(R0, pasos)
    aproximada ||= inv.aproximada
    sigma = Math.max(sigma, ...inv.raices)
    const e = esCero(g.tau) ? UNO : pot(NEPER, prod(MENOS, g.tau, sv))
    for (const d of inv.deltas) deltasF.push(prod(d, e))
    if (esCero(g.tau)) partes.push(inv.f)
    else {
      pasos.push({ t: 'Retardo: e^{−τs}G(s) ↦ g(t − τ)·H(t − τ)', tex: String.raw`\tau = ${tex(g.tau)}` })
      const desp = suma(t, prod(MENOS, g.tau))
      partes.push(prod(sustituir(inv.f, t, desp), fn('heaviside', [desp])))
    }
  }
  const f = simplificar(suma(...partes))
  // la comprobación mira la parte sin δ: la integral numérica no ve las deltas
  const sinDelta = reescribir(f, (y) => (y.t === 'fn' && y.v === 'delta' ? CERO : null))
  const error = comprobar(simplificar(sinDelta), simplificar(F), Number.isFinite(sigma) ? sigma : 0, deltasF)
  return { resultado: f, pasos, error, verificada: error < (aproximada ? 1e-6 : 1e-7), aproximada }
}

/* ═══════════ EDO lineales por Laplace ═══════════ */

export interface ResultadoEdoL extends ResultadoL {
  Y: E
  ecuacionS: string
  /** residuo máximo de la ecuación en varios t > 0 (sustituyendo la solución) */
  residuo: number
  /** a₀ … aₙ de Σ aₖ y⁽ᵏ⁾ = g(t) */
  coeficientes: number[]
  g: E
}

const Yk = (k: number) => 'y' + "'".repeat(k)

export function edoPorLaplace(src: string, condiciones: number[] | E[]): ResultadoEdoL {
  const lados = src.split('=')
  if (lados.length !== 2) throw new Error('falta un signo = (o sobra alguno)')
  const vars = [T, ...Array.from({ length: 7 }, (_, k) => Yk(k))]
  const aE = (x: string) => desdeNodo(analizar(x, { variables: vars }), { funciones: {}, valores: {} })
  const Fx = simplificar(suma(aE(lados[0]), prod(MENOS, aE(lados[1]))))
  let orden = 0
  for (let k = 1; k <= 6; k++) if (contiene(Fx, Yk(k))) orden = k
  if (!orden) throw new Error('no aparece ninguna derivada de y')
  const a: E[] = []
  for (let k = 0; k <= orden; k++) {
    const ak = simplificar(derivar(Fx, Yk(k)))
    if ([...simbolos(ak)].some((v) => vars.includes(v))) throw new Error('la ecuación tiene que ser lineal y de coeficientes constantes')
    a.push(ak)
  }
  let g = Fx
  for (let k = 0; k <= orden; k++) g = sustituir(g, sim(Yk(k)), CERO)
  g = simplificar(prod(MENOS, g))
  // lineal de verdad: F − Σ aₖ y⁽ᵏ⁾ + g = 0
  const comprobacion = simplificar(suma(Fx, prod(MENOS, suma(...a.map((ak, k) => prod(ak, sim(Yk(k)))))), g))
  if (!esCero(comprobacion)) throw new Error('la ecuación no es lineal en y')
  if (condiciones.length !== orden) throw new Error(`hacen falta ${orden} condiciones iniciales: y(0)${orden > 1 ? ", y'(0)…" : ''}`)
  const ci = condiciones.map((v) => (typeof v === 'number' ? q(BigInt(Math.round(v * 1e9)), 1000000000n) : v))
  const pasos: PasoL[] = []
  pasos.push({ t: 'L{y⁽ᵏ⁾} = sᵏY − sᵏ⁻¹y(0) − … − y⁽ᵏ⁻¹⁾(0)' })
  const G = esCero(g) ? CERO : laplace(g).resultado
  // Σ aₖ(sᵏY − Σ_{j<k} s^{k−1−j} y⁽ʲ⁾(0)) = G  ⇒  Y = (G + Σ aₖ Σ s^{k−1−j} y⁽ʲ⁾(0)) / Σ aₖ sᵏ
  const caracteristico = suma(...a.map((ak, k) => prod(ak, pot(sv, q(k)))))
  const iniciales = suma(...a.map((ak, k) => prod(ak, suma(...Array.from({ length: k }, (_, j) => prod(pot(sv, q(k - 1 - j)), ci[j]))))))
  const Y = simplificar(prod(suma(G, iniciales), pot(caracteristico, MENOS)))
  const ecuacionS = String.raw`\left(${tex(simplificar(caracteristico))}\right)Y(s) = ${tex(simplificar(suma(G, iniciales)))}`
  pasos.push({ t: 'Se transforma la ecuación y se despeja Y(s)', tex: String.raw`Y(s)=${tex(Y)}` })
  const inv = laplaceInversa(Y)
  pasos.push(...inv.pasos)
  // la solución se sustituye en la ecuación para t > 0 (lejos de los saltos) y en las condiciones
  const y = inv.resultado
  // lejos de los saltos (donde se evalúa el residuo) las δ que salen al derivar H valen 0: se quitan
  // en cada paso, porque derivar una δ no tiene sentido como función
  const quitaDelta = (x: E) => reescribir(x, (z) => (z.t === 'fn' && z.v === 'delta' ? CERO : null))
  const ders = [quitaDelta(y)]
  for (let k = 1; k <= orden; k++) ders.push(quitaDelta(simplificar(derivar(ders[k - 1], T))))
  let residuo = 0
  for (const tv of [0.37, 1.13, 2.71, 4.4]) {
    let lhs = 0
    for (let k = 0; k <= orden; k++) lhs += numero(a[k]) * evaluar(quitaDelta(ders[k]), { [T]: tv })
    const rhs = evaluar(quitaDelta(g), { [T]: tv })
    residuo = Math.max(residuo, Math.abs(lhs - rhs) / Math.max(1, Math.abs(rhs)))
  }
  for (let k = 0; k < orden; k++) {
    // y⁽ᵏ⁾(0⁺): se evalúa un pelo a la derecha para no caer en H(0) = ½
    const v = evaluar(quitaDelta(ders[k]), { [T]: 1e-12 })
    residuo = Math.max(residuo, Math.abs(v - numero(ci[k])))
  }
  return { ...inv, Y, ecuacionS, pasos, residuo, verificada: inv.verificada && residuo < 1e-7, coeficientes: a.map(numero), g }
}

/** Lee una expresión del usuario en t o en s. */
export function leerExpr(src: string, variable: 't' | 's'): E {
  return desdeNodo(analizar(src, { variables: [variable] }), { funciones: {}, valores: {} })
}
