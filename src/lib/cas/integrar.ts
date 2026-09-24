import {
  clave, contiene, DOS, esNum, evaluar, fn, MEDIO, MENOS, pot, prod, q, reconstruir, s, simbolos, suma, sustituir, UNO, valor, type E,
} from './expr'
import { derivar } from './derivar'
import { desarrollar, polinomio, racional, simplificar } from './algebra'
import { aExpr, divP, factorizarP, grado, prodP, r as rac, rDiv, rProd, rResta, type P, type R } from './polinomios'

/**
 * Integración: primero la tabla (linealidad, potencias, exponenciales,
 * logaritmo, trigonométricas e hiperbólicas con argumento lineal, arcos), y si
 * no basta, las técnicas de clase en este orden: fracciones simples, cambio de
 * variable y partes. Cada primitiva se comprueba derivándola: una técnica mal
 * aplicada no llega a la pantalla.
 */

/** Si u = a·x + b, devuelve a (que no depende de x). */
function lineal(u: E, x: string): E | null {
  const d = simplificar(derivar(u, x))
  return contiene(d, x) ? null : d
}

function tabla(f: E, x: string): E | null {
  const X = s(x)
  if (!contiene(f, x)) return prod(f, X)
  if (f.t === 's') return prod(MEDIO, pot(X, DOS))

  if (f.t === '^') {
    const { b, e } = f
    // (a·x + b)ⁿ
    if (!contiene(e, x)) {
      const a = lineal(b, x)
      if (!a) return integrarEspeciales(f, x)
      if (esNum(e) && valor(e) === -1) return prod(fn('ln', [fn('abs', [b])]), pot(a, MENOS))
      const n1 = suma(e, UNO)
      return prod(pot(b, n1), pot(prod(n1, a), MENOS))
    }
    // c^(a·x + b)
    if (!contiene(b, x)) {
      const a = lineal(e, x)
      if (!a) return null
      return prod(f, pot(prod(a, fn('ln', [b])), MENOS))
    }
    return null
  }

  if (f.t === 'fn' && f.a.length === 1) {
    const u = f.a[0]
    const a = lineal(u, x)
    if (!a) return null
    const inv = pot(a, MENOS)
    const conU = (r: E) => prod(r, inv)
    switch (f.v) {
      case 'sin':
        return conU(prod(MENOS, fn('cos', [u])))
      case 'cos':
        return conU(fn('sin', [u]))
      case 'tan':
        return conU(prod(MENOS, fn('ln', [fn('abs', [fn('cos', [u])])])))
      case 'sinh':
        return conU(fn('cosh', [u]))
      case 'cosh':
        return conU(fn('sinh', [u]))
      case 'tanh':
        return conU(fn('ln', [fn('cosh', [u])]))
      case 'ln':
        return conU(suma(prod(u, fn('ln', [u])), prod(MENOS, u)))
      case 'atan':
        return conU(suma(prod(u, fn('atan', [u])), prod(MENOS, MEDIO, fn('ln', [suma(UNO, pot(u, DOS))]))))
      case 'asin':
        return conU(suma(prod(u, fn('asin', [u])), pot(suma(UNO, prod(MENOS, pot(u, DOS))), MEDIO)))
      case 'acos':
        return conU(suma(prod(u, fn('acos', [u])), prod(MENOS, pot(suma(UNO, prod(MENOS, pot(u, DOS))), MEDIO))))
      default:
        return null
    }
  }
  return null
}

/** 1/(p + r·u²) → atan, 1/√(p − r·u²) → asin, 1/cos²u → tan, sin²u y cos²u. */
function integrarEspeciales(f: Extract<E, { t: '^' }>, x: string): E | null {
  const { b, e } = f
  if (b.t === 'fn' && b.a.length === 1 && esNum(e)) {
    const a = lineal(b.a[0], x)
    if (!a) return null
    const u = b.a[0]
    const inv = pot(a, MENOS)
    if (b.v === 'cos' && valor(e) === -2) return prod(fn('tan', [u]), inv)
    if (b.v === 'sin' && valor(e) === -2) return prod(MENOS, fn('cos', [u]), pot(fn('sin', [u]), MENOS), inv)
    if (b.v === 'cosh' && valor(e) === -2) return prod(fn('tanh', [u]), inv)
    if ((b.v === 'sin' || b.v === 'cos') && valor(e) === 2) {
      const signo = b.v === 'sin' ? MENOS : UNO
      return suma(prod(MEDIO, s(x)), prod(signo, q(1, 4), fn('sin', [prod(DOS, u)]), inv))
    }
    return null
  }
  // b = p + r·u² con u lineal
  if (b.t !== '+' || b.a.length !== 2 || !esNum(e)) return null
  const constante = b.a.find((t) => !contiene(t, x))
  const cuadrado = b.a.find((t) => contiene(t, x))
  if (!constante || !cuadrado || !esNum(constante)) return null
  const partes = cuadrado.t === '*' ? cuadrado.a : [cuadrado]
  const r = partes.find(esNum) ?? UNO
  const resto = partes.filter((p) => !esNum(p))
  if (resto.length !== 1 || resto[0].t !== '^' || !esNum(resto[0].e) || valor(resto[0].e) !== 2) return null
  const u = resto[0].b
  const a = lineal(u, x)
  if (!a || !esNum(r)) return null
  const p = valor(constante)
  const rv = valor(r as Extract<E, { t: 'q' }>)
  const inv = pot(a, MENOS)
  if (valor(e) === -1 && p > 0 && rv > 0) {
    // ∫ du/(p + r u²) = atan(u·√(r/p)) / √(p·r)
    return prod(fn('atan', [prod(u, pot(prod(r, pot(constante, MENOS)), MEDIO))]), pot(prod(constante, r), q(-1, 2)), inv)
  }
  if (valor(e) === -0.5 && p > 0 && rv < 0) {
    const rr = prod(MENOS, r)
    return prod(fn('asin', [prod(u, pot(prod(rr, pot(constante, MENOS)), MEDIO))]), pot(rr, q(-1, 2)), inv)
  }
  return null
}

const MAX_PROFUNDIDAD = 3

function primitiva(f: E, x: string, profundidad = 0): E | null {
  if (profundidad > MAX_PROFUNDIDAD) return null
  if (f.t === '+') {
    const partes = f.a.map((t) => primitiva(t, x, profundidad))
    if (partes.every(Boolean)) return suma(...(partes as E[]))
    // término a término no sale: puede salir entera (una fracción, un cambio de variable)
  }
  if (f.t === '*') {
    const constantes = f.a.filter((t) => !contiene(t, x))
    const resto = f.a.filter((t) => contiene(t, x))
    if (constantes.length) {
      const r = primitiva(prod(...resto), x, profundidad)
      return r ? prod(...constantes, r) : null
    }
  }
  const directa = f.t === '+' ? null : tabla(f, x)
  if (directa) return directa
  // un producto de polinomios (x(x+1)², (2x+1)³…) se integra desarrollado
  if (profundidad === 0 && f.t !== '+') {
    try {
      const d = desarrollar(f)
      if (clave(d) !== clave(f)) {
        const r = primitiva(d, x, 1)
        if (r) return r
      }
    } catch {
      /* demasiado grande para desarrollar */
    }
  }
  return fraccionesSimples(f, x) ?? cambioDeVariable(f, x, profundidad) ?? partes(f, x, profundidad)
}

/* ---------- fracciones simples ---------- */

/** Resuelve A·v = b sobre Q por Gauss-Jordan; null si es singular. */
export function sistemaQ(A: R[][], b: R[]): R[] | null {
  const n = b.length
  const m = A.map((fila, i) => [...fila, b[i]])
  const cols = A[0]?.length ?? 0
  const piv: number[] = []
  let f = 0
  for (let c = 0; c < cols && f < n; c++) {
    const p = m.findIndex((fila, i) => i >= f && fila[c].n !== 0n)
    if (p < 0) continue
    ;[m[f], m[p]] = [m[p], m[f]]
    const inv = rDiv(rac(1), m[f][c])
    m[f] = m[f].map((v) => rProd(v, inv))
    for (let i = 0; i < n; i++) {
      if (i === f || m[i][c].n === 0n) continue
      const k = m[i][c]
      m[i] = m[i].map((v, j) => rResta(v, rProd(k, m[f][j])))
    }
    piv.push(c)
    f++
  }
  if (piv.length < cols) return null
  const sol: R[] = new Array(cols).fill(rac(0))
  piv.forEach((c, i) => (sol[c] = m[i][cols]))
  return sol
}

const Q = (v: R) => q(v.n, v.d)

/**
 * Cociente de polinomios en x: parte entera + fracciones simples sobre los
 * factores del denominador en Q (lineales con su multiplicidad y cuadráticos
 * irreducibles sin repetir), con los coeficientes de un sistema lineal exacto.
 */
function fraccionesSimples(f: E, x: string): E | null {
  const par = [...simbolos(f)].every((v) => v === x) ? racional(f, x) : null
  if (!par) return null
  const [N, D] = par
  if (grado(D) < 1) return null
  const { c: entera, r: resto } = divP(N, D)
  const fact = factorizarP(D)
  if (fact.factores.some(({ p, m }) => grado(p) > 2 || (grado(p) === 2 && m > 1))) return null
  // D = c0 · Π pᵢ^mᵢ; se trabaja con D/c0 y el resto dividido entre c0
  const Dp = fact.factores.reduce<P>((acc, { p, m }) => {
    let a = acc
    for (let k = 0; k < m; k++) a = prodP(a, p)
    return a
  }, [rac(1)])
  const R0 = resto.map((v) => rDiv(v, fact.c))
  // incógnitas: por cada factor lineal A₁…Aₘ, por cada cuadrático B·x + C
  type Termino = { p: P; j: number; x: boolean }
  const terminos: Termino[] = []
  for (const { p, m } of fact.factores) {
    if (grado(p) === 1) for (let j = 1; j <= m; j++) terminos.push({ p, j, x: false })
    else terminos.push({ p, j: 1, x: true }, { p, j: 1, x: false })
  }
  const n = grado(Dp)
  const columnas = terminos.map(({ p, j, x: conX }) => {
    let cof = divP(Dp, [rac(1)]).c
    for (let k = 0; k < j; k++) cof = divP(cof, p).c
    if (conX) cof = prodP(cof, [rac(0), rac(1)])
    return Array.from({ length: n }, (_, k) => cof[k] ?? rac(0))
  })
  const A = Array.from({ length: n }, (_, fila) => columnas.map((col) => col[fila]))
  const b = Array.from({ length: n }, (_, k) => R0[k] ?? rac(0))
  const sol = sistemaQ(A, b)
  if (!sol) return null

  const X = s(x)
  const partesF: E[] = [primitiva(aExpr(entera, x), x, MAX_PROFUNDIDAD) ?? q(0)]
  for (let i = 0; i < terminos.length; i++) {
    const { p, j, x: conX } = terminos[i]
    const pe = aExpr(p, x)
    if (grado(p) === 1) {
      const a = Q(p[1])
      const coef = Q(sol[i])
      partesF.push(
        j === 1
          ? prod(coef, pot(a, MENOS), fn('ln', [fn('abs', [pe])]))
          : prod(coef, pot(prod(a, q(1 - j)), MENOS), pot(pe, q(1 - j))),
      )
    } else if (conX) {
      // (B·x + C)/(a x² + b x + c) = B/(2a)·p′/p + (C − B·b/(2a))/p
      const B = sol[i]
      const C = sol[i + 1]
      const [c0, b1, a2] = p
      const k1 = rDiv(B, rProd(rac(2), a2))
      const k2 = rResta(C, rProd(k1, b1))
      const disc = rResta(rProd(rProd(rac(4), a2), c0), rProd(b1, b1))
      const raiz = pot(Q(disc), MEDIO)
      partesF.push(
        prod(Q(k1), fn('ln', [pe])),
        prod(Q(k2), DOS, pot(raiz, MENOS), fn('atan', [prod(suma(prod(DOS, Q(a2), X), Q(b1)), pot(raiz, MENOS))])),
      )
      i++
    }
  }
  return suma(...partesF)
}

/* ---------- cambio de variable ---------- */

/** Subexpresiones candidatas a u: argumentos de funciones, bases y exponentes, y las propias funciones. */
function candidatos(f: E, x: string, out = new Map<string, E>()): E[] {
  const anota = (u: E) => {
    if (contiene(u, x) && !(u.t === 's') && !out.has(clave(u))) out.set(clave(u), u)
  }
  switch (f.t) {
    case 'fn':
      anota(f)
      f.a.forEach((a) => {
        anota(a)
        candidatos(a, x, out)
      })
      break
    case '^':
      anota(f.b)
      anota(f.e)
      if (!esNum(f.e)) anota(f)
      candidatos(f.b, x, out)
      candidatos(f.e, x, out)
      break
    case '+':
    case '*':
      f.a.forEach((a) => candidatos(a, x, out))
  }
  return [...out.values()]
}

/** u = g(x): si f/u′ se escribe solo con u, ∫ f dx = ∫ h(u) du. */
function cambioDeVariable(f: E, x: string, profundidad: number): E | null {
  const T = s('τ')
  for (const u of candidatos(f, x)) {
    const du = simplificar(derivar(u, x))
    if (esNum(du) && valor(du) === 0) continue
    // con u = b^g, cualquier b^(k·g) es uᵏ (e^(2x) = (eˣ)²)
    const kU = clave(u)
    const h = reconstruir(simplificar(prod(f, pot(du, MENOS))), (y) => {
      if (clave(y) === kU) return T
      if (u.t === '^' && y.t === '^' && clave(y.b) === clave(u.b) && !contiene(u.b, x)) {
        const k = simplificar(prod(y.e, pot(u.e, MENOS)))
        if (esNum(k)) return pot(T, k)
      }
      return null
    })
    if (contiene(h, x)) continue
    const G = primitiva(h, 'τ', profundidad + 1)
    if (G) return sustituir(G, T, u)
  }
  return null
}

/* ---------- partes ---------- */

const EXP_TRIG = new Set(['sin', 'cos', 'sinh', 'cosh'])
const ARCOS = new Set(['ln', 'atan', 'asin', 'acos'])

function esRepetible(g: E, x: string): boolean {
  if (g.t === 'fn' && EXP_TRIG.has(g.v)) return true
  return g.t === '^' && !contiene(g.b, x) && contiene(g.e, x)
}

function partes(f: E, x: string, profundidad: number): E | null {
  const fs = f.t === '*' ? f.a : [f]
  // e^(αx+β)·sin(ωx+φ): la fórmula cíclica de dos partes
  if (fs.length === 2) {
    const ex = fs.find((g) => g.t === '^' && !contiene(g.b, x) && contiene(g.e, x)) as Extract<E, { t: '^' }> | undefined
    const tr = fs.find((g) => g.t === 'fn' && (g.v === 'sin' || g.v === 'cos')) as Extract<E, { t: 'fn' }> | undefined
    if (ex && tr) {
      const al = simplificar(prod(derivar(ex.e, x), fn('ln', [ex.b])))
      const om = simplificar(derivar(tr.a[0], x))
      if (!contiene(al, x) && !contiene(om, x)) {
        const den = pot(suma(pot(al, DOS), pot(om, DOS)), MENOS)
        const [sn, cs] = [fn('sin', tr.a), fn('cos', tr.a)]
        const dentro = tr.v === 'sin' ? suma(prod(al, sn), prod(MENOS, om, cs)) : suma(prod(al, cs), prod(om, sn))
        return prod(ex, dentro, den)
      }
    }
  }
  // polinomio × (lo que se integra una y otra vez): método tabular
  const poli = fs.filter((g) => polinomio(g, x) !== null)
  const resto = fs.filter((g) => polinomio(g, x) === null)
  const P = prod(...poli)
  if (resto.length === 1 && poli.length && esRepetible(resto[0], x)) {
    const terminos: E[] = []
    // cada integral sucesiva lleva constantes delante (−cos x): hace falta la linealidad, no la tabla pura
    const integra = (g: E) => primitiva(g, x, MAX_PROFUNDIDAD)
    let d = P
    let G = integra(resto[0])
    for (let k = 0; G && k < 12; k++) {
      if (esNum(d) && valor(d) === 0) break
      terminos.push(prod(k % 2 ? MENOS : UNO, d, G))
      d = simplificar(derivar(d, x))
      G = integra(G)
    }
    if (esNum(d) && valor(d) === 0) return suma(...terminos)
  }
  // u = ln, atan, asin, acos (o una potencia de ln) y dv = polinomio
  const arco = resto.length === 1 ? resto[0] : null
  const esArco = !!arco && ((arco.t === 'fn' && ARCOS.has(arco.v)) || (arco.t === '^' && arco.b.t === 'fn' && arco.b.v === 'ln' && esNum(arco.e) && valor(arco.e) > 0))
  if (arco && esArco) {
    const V = primitiva(P, x, profundidad + 1)
    if (!V) return null
    const resta = primitiva(simplificar(prod(V, derivar(arco, x))), x, profundidad + 1)
    return resta ? suma(prod(arco, V), prod(MENOS, resta)) : null
  }
  return null
}

/** Comprueba F′ = f en unos cuantos puntos; una regla mal aplicada no llega a la pantalla. */
function comprobar(F: E, f: E, x: string): boolean {
  const dF = derivar(F, x)
  let probados = 0
  for (const t of [0.37, 1.3, 2.1, -0.61, 0.83, -1.7, 3.3, 0.11]) {
    const a = evaluar(dF, { [x]: t })
    const b = evaluar(f, { [x]: t })
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue
    probados++
    if (Math.abs(a - b) > 1e-7 * Math.max(1, Math.abs(b))) return false
  }
  return probados >= 2
}

export function integrar(f0: E, x: string): E | null {
  const f = simplificar(f0)
  const F = primitiva(f, x)
  if (!F) return null
  const Fs = simplificar(F)
  // con parámetros la comprobación numérica necesita darles un valor cualquiera
  const parametros = [...simbolos(f)].filter((v) => v !== x)
  const sust = (e: E) => parametros.reduce((acc, v, i) => sustituir(acc, s(v), q(13 + 7 * i, 10)), e)
  if (!comprobar(sust(Fs), sust(f), x)) return null
  return Fs
}

/** Simpson adaptativo, para las definidas sin primitiva de tabla. */
export function integralNumerica(f: (t: number) => number, a: number, b: number): number {
  const simpson = (a: number, b: number, fa: number, fm: number, fb: number) => ((b - a) / 6) * (fa + 4 * fm + fb)
  const paso = (a: number, b: number, fa: number, fm: number, fb: number, entero: number, tol: number, prof: number): number => {
    const m = (a + b) / 2
    const lm = (a + m) / 2
    const rm = (m + b) / 2
    const flm = f(lm)
    const frm = f(rm)
    const izq = simpson(a, m, fa, flm, fm)
    const der = simpson(m, b, fm, frm, fb)
    if (prof > 18 || Math.abs(izq + der - entero) < 15 * tol) return izq + der + (izq + der - entero) / 15
    return paso(a, m, fa, flm, fm, izq, tol / 2, prof + 1) + paso(m, b, fm, frm, fb, der, tol / 2, prof + 1)
  }
  const fa = f(a)
  const fb = f(b)
  const fm = f((a + b) / 2)
  return paso(a, b, fa, fm, fb, simpson(a, b, fa, fm, fb), 1e-10, 0)
}
