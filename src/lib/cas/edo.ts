import { aLatex, analizar } from '../expresion'
import {
  CERO, clave, contiene, desdeNodo, esCero, esEntero, esNum, evaluar, flo, fn, MEDIO, MENOS, NEPER, negativo, partirTermino, pot, prod,
  q, reconstruir, s, simbolos, suma, sustituir, UNO, valor, type E,
} from './expr'
import { derivar, derivarN } from './derivar'
import { desarrollar, simplificar } from './algebra'
import { integrar } from './integrar'
import { resolver, resolverSistema } from './resolver'
import { identificar } from './limites'
import { factorizarP, grado, prodP, r as rq, sumaP, type P } from './polinomios'
import { texConExponenciales as tex } from './tex'

/**
 * EDOs escritas tal cual, resueltas en forma cerrada cuando hay método de
 * libro que las cubra. Nada sale sin comprobar: cada solución general se mete
 * en la propia ecuación con valores cualesquiera de las constantes.
 */

export const MAX_ORDEN = 6
export const Y = (k: number) => 'y' + "'".repeat(k)
export const VARIABLES_EDO = ['x', ...Array.from({ length: MAX_ORDEN + 1 }, (_, k) => Y(k))]
const X = s('x')
export const Cn = (i: number) => s('C' + i)

export interface Paso {
  t: string
  tex?: string
}

export interface SolEdo {
  orden: number
  clases: string[]
  metodo: string
  pasos: Paso[]
  /** y = explicita, con C1…Cn libres. */
  explicita: E | null
  /** Φ(x, y) = C1 cuando no se puede despejar y. */
  implicita: E | null
  /** Soluciones constantes que la separación de variables pierde. */
  singulares: E[]
  /** Si la particular no sale, al menos la homogénea (con C1…Cn). */
  homogenea: E | null
  /** Todas las ramas explícitas cuando el despeje da varias (±√…); `explicita` es la primera. */
  ramas?: E[]
  verificada: boolean
}

export interface Leida {
  F: E
  orden: number
  texto: string
}

const vacias = { funciones: {}, valores: {} }
const aE = (src: string) => desdeNodo(analizar(src, { variables: VARIABLES_EDO }), vacias, (e, v) => derivar(e, v))

export function leerEdo(src: string): Leida {
  const partes = src.split('=')
  if (partes.length !== 2) throw new Error('falta un signo = (o sobra alguno)')
  const izq = aE(partes[0])
  const der = aE(partes[1])
  const F = simplificar(suma(izq, prod(MENOS, der)))
  let orden = 0
  for (let k = 1; k <= MAX_ORDEN; k++) if (contiene(F, Y(k))) orden = k
  if (!orden) throw new Error('no aparece ninguna derivada de y')
  for (const v of simbolos(F)) if (!VARIABLES_EDO.includes(v)) throw new Error(`«${v}» no es x, y ni una derivada de y: dale un valor`)
  // la ecuación se enseña como se escribió, no en la forma canónica reordenada
  const lado = (src: string, e: E) => (aLatex(src, { variables: VARIABLES_EDO }) ?? tex(e)).replace(/\\mathrm\{(y'+)\}/g, '$1')
  return { F, orden, texto: `${lado(partes[0], izq)} = ${lado(partes[1], der)}` }
}

/* ---------- utilidades ---------- */

const tamano = (e: E) => clave(e).length
const expo = (a: E): E => (esCero(a) ? UNO : pot(NEPER, prod(a, X)))

/** ln|u| → ln u: en una exponencial o delante de C el signo se lo come la constante. */
const sinAbsEnLn = (e: E): E =>
  reconstruir(e, (y): E | null => (y.t === 'fn' && y.v === 'ln' && y.a[0].t === 'fn' && y.a[0].v === 'abs' ? fn('ln', [sinAbsEnLn(y.a[0].a[0])]) : null))

/** e^(g + C) → C·e^g: renombrar la constante deja la solución como en los libros. */
function absorberConstante(e: E, c: E): E {
  return reconstruir(e, (y) => {
    if (y.t !== '^' || y.b.t !== 's' || y.b.v !== 'e' || y.e.t !== '+') return null
    const conC = y.e.a.filter((t) => contiene(t, clave(c)) && clave(t) === clave(c))
    if (conC.length !== 1) return null
    const resto = y.e.a.filter((t) => t !== conC[0])
    return prod(c, pot(NEPER, suma(...resto)))
  })
}

function numeros(v: number): E {
  if (Math.abs(v) < 1e-11) return CERO
  return identificar(v) ?? flo(+v.toPrecision(12))
}

const IMPARES = new Set(['sin', 'tan', 'sinh', 'tanh', 'asin', 'atan'])
const todoNegativo = (u: E) => (u.t === '+' ? u.a.every(negativo) : negativo(u))

/** Saca los signos de dentro: −tan(−x − C) = tan(x + C), 1/(−x − C) = −1/(x + C). */
export function pulir(e: E): E {
  // el −1 se reparte a mano: prod(−1, suma) no se desarrolla y fn lo volvería a sacar
  const opuesta = (u: E) => (u.t === '+' ? suma(...u.a.map((t) => prod(MENOS, t))) : prod(MENOS, u))
  return reconstruir(e, (y): E | null => {
    if (y.t === 'fn' && IMPARES.has(y.v) && y.a.length === 1 && y.a[0].t === '+' && todoNegativo(y.a[0]))
      return prod(MENOS, fn(y.v, [pulir(opuesta(y.a[0]))]))
    if (y.t === '^' && y.b.t === '+' && todoNegativo(y.b) && esEntero(y.e) && y.e.n % 2n !== 0n)
      return prod(MENOS, pot(pulir(opuesta(y.b)), y.e))
    return null
  })
}

const PX = [0.37, 0.83, 1.27, 1.91, 0.55, 2.3, 0.21, 1.6]
const PC = [0.7, -0.4, 1.3, 0.9, -1.1, 0.6]

function valoresC(n: number, desplaza = 0) {
  const v: Record<string, number> = {}
  for (let i = 1; i <= n; i++) v['C' + i] = PC[(i - 1 + desplaza) % PC.length]
  return v
}

/** ¿Cumple y(x; C) la ecuación? Se mira en puntos sueltos con constantes cualesquiera. */
export function cumple(F: E, n: number, y: E, nC = n): boolean {
  const derivadas = Array.from({ length: n + 1 }, (_, k) => (k ? derivarN(y, 'x', k) : y))
  let buenos = 0
  for (const desplaza of [0, 2]) {
    for (const x of [...PX, ...PX.map((t) => -t)]) {
      const vars: Record<string, number> = { x, ...valoresC(nC, desplaza) }
      const ds = derivadas.map((d) => evaluar(d, vars))
      if (!ds.every(Number.isFinite)) continue
      for (let k = 0; k <= n; k++) vars[Y(k)] = ds[k]
      const r = evaluar(F, vars)
      if (!Number.isFinite(r)) continue
      const escala = 1 + Math.max(...ds.map(Math.abs))
      if (Math.abs(r) > 1e-6 * escala) return false
      buenos++
    }
  }
  return buenos >= 4
}

/** Φ(x, y) = C es solución de y′ = G si Φx + Φy·G = 0. */
function cumpleImplicita(phi: E, G: E): boolean {
  const px = derivar(phi, 'x')
  const py = derivar(phi, 'y')
  let buenos = 0
  for (const x of PX)
    for (const y of [0.43, 1.37, -0.71, 2.2]) {
      const v = { x, y }
      const a = evaluar(px, v)
      const b = evaluar(py, v) * evaluar(G, v)
      if (!Number.isFinite(a) || !Number.isFinite(b)) continue
      if (Math.abs(a + b) > 1e-6 * (1 + Math.abs(a) + Math.abs(b))) return false
      buenos++
    }
  return buenos >= 4
}

/* ---------- lineales ---------- */

interface Lineal {
  /** a₀·y + a₁·y′ + … + aₙ·y⁽ⁿ⁾ = f */
  a: E[]
  f: E
}

function comoLineal(F: E, n: number): Lineal | null {
  const a: E[] = []
  for (let k = 0; k <= n; k++) {
    const ak = simplificar(derivar(F, Y(k)))
    for (let j = 0; j <= n; j++) if (contiene(ak, Y(j))) return null
    a.push(ak)
  }
  let resto = F
  for (let k = 0; k <= n; k++) resto = sustituir(resto, s(Y(k)), CERO)
  return { a, f: simplificar(prod(MENOS, resto)) }
}

const texOp = (L: Lineal) =>
  tex(suma(...L.a.map((ak, k) => prod(ak, s(Y(k)))))) + ' = ' + tex(L.f)

interface Raiz {
  re: E
  /** Parte imaginaria positiva; null si es real. */
  im: E | null
  m: number
}

const aplicarL = (L: Lineal, y: E) => suma(...L.a.map((ak, k) => prod(ak, k ? derivarN(y, 'x', k) : y)))

/** Raíces de un polinomio real por Durand–Kerner, como pares (re, im). */
function raicesNum(c: number[]): Array<[number, number]> {
  const n = c.length - 1
  const lc = c[n]
  const a = c.map((v) => v / lc)
  let z: Array<[number, number]> = Array.from({ length: n }, (_, k) => {
    const ang = (2 * Math.PI * k) / n + 0.4
    const rad = 1 + Math.max(...a.slice(0, n).map(Math.abs))
    return [rad * Math.cos(ang), rad * Math.sin(ang)]
  })
  const mul = (p: [number, number], r: [number, number]): [number, number] => [p[0] * r[0] - p[1] * r[1], p[0] * r[1] + p[1] * r[0]]
  const div = (p: [number, number], r: [number, number]): [number, number] => {
    const d = r[0] * r[0] + r[1] * r[1]
    return [(p[0] * r[0] + p[1] * r[1]) / d, (p[1] * r[0] - p[0] * r[1]) / d]
  }
  for (let it = 0; it < 800; it++) {
    let cambio = 0
    z = z.map((zk, k) => {
      let p: [number, number] = [1, 0]
      for (let j = n - 1; j >= 0; j--) p = [mul(p, zk)[0] + a[j], mul(p, zk)[1]]
      let den: [number, number] = [1, 0]
      z.forEach((zj, j) => {
        if (j !== k) den = mul(den, [zk[0] - zj[0], zk[1] - zj[1]])
      })
      const d = div(p, den)
      cambio = Math.max(cambio, Math.hypot(d[0], d[1]))
      return [zk[0] - d[0], zk[1] - d[1]]
    })
    if (cambio < 1e-14) break
  }
  return z
}

function raicesDe(c: E[]): Raiz[] | null {
  if (c.some((v) => simbolos(v).size)) return null
  const out: Raiz[] = []
  if (c.every((v) => v.t === 'q')) {
    const p: P = c.map((v) => (v.t === 'q' ? rq(v.n, v.d) : rq(0)))
    for (const { p: f, m } of factorizarP(p).factores) {
      const g = grado(f)
      const k = (i: number) => q(f[i].n, f[i].d)
      if (g === 1) out.push({ re: simplificar(prod(MENOS, k(0), pot(k(1), MENOS))), im: null, m })
      else if (g === 2) {
        const disc = simplificar(suma(pot(k(1), q(2)), prod(q(-4), k(2), k(0))))
        const dosA = prod(q(2), k(2))
        const re = simplificar(prod(MENOS, k(1), pot(dosA, MENOS)))
        if (valor(disc as never) > 0) {
          const r = simplificar(prod(pot(disc, MEDIO), pot(dosA, MENOS)))
          out.push({ re: simplificar(suma(re, r)), im: null, m }, { re: simplificar(suma(re, prod(MENOS, r))), im: null, m })
        } else {
          let im = simplificar(prod(pot(prod(MENOS, disc), MEDIO), pot(dosA, MENOS)))
          if (negativo(im)) im = simplificar(prod(MENOS, im))
          out.push({ re, im, m })
        }
      } else {
        for (const [a, b] of raicesNum(f.map((r) => Number(r.n) / Number(r.d)))) {
          if (b < -1e-9) continue
          out.push({ re: numeros(a), im: b > 1e-9 ? numeros(b) : null, m })
        }
      }
    }
    return out
  }
  // coeficientes con π o raíces: raíces numéricas agrupando las repetidas
  const num = c.map((v) => evaluar(v))
  const zs = raicesNum(num)
  const grupos: Array<{ z: [number, number]; m: number }> = []
  for (const z of zs) {
    const g = grupos.find((gr) => Math.hypot(gr.z[0] - z[0], gr.z[1] - z[1]) < 1e-5)
    if (g) g.m++
    else grupos.push({ z, m: 1 })
  }
  for (const { z, m } of grupos) {
    if (z[1] < -1e-7) continue
    out.push({ re: numeros(z[0]), im: z[1] > 1e-7 ? numeros(z[1]) : null, m })
  }
  return out
}

const texRaiz = (r: Raiz) =>
  (r.im ? `${tex(r.re)} \\pm ${tex(r.im)}\\,i` : tex(r.re)) + (r.m > 1 ? `\\ (\\text{multiplicidad } ${r.m})` : '')

function baseConstante(raices: Raiz[]): E[] {
  const out: E[] = []
  for (const r of raices)
    for (let j = 0; j < r.m; j++) {
      const xj = pot(X, q(j))
      if (!r.im) out.push(prod(xj, expo(r.re)))
      else {
        const bx = prod(r.im, X)
        out.push(prod(xj, expo(r.re), fn('cos', [bx])), prod(xj, expo(r.re), fn('sin', [bx])))
      }
    }
  return out
}

function baseEuler(raices: Raiz[]): E[] {
  const out: E[] = []
  const lnx = fn('ln', [X])
  for (const r of raices)
    for (let j = 0; j < r.m; j++) {
      const lj = pot(lnx, q(j))
      if (!r.im) out.push(prod(lj, pot(X, r.re)))
      else {
        const b = prod(r.im, lnx)
        out.push(prod(lj, pot(X, r.re), fn('cos', [b])), prod(lj, pot(X, r.re), fn('sin', [b])))
      }
    }
  return out
}

const combinacion = (base: E[]) => suma(...base.map((b, i) => prod(Cn(i + 1), b)))

/** Resuelve A·c = b por mínimos cuadrados (ecuaciones normales con pivote). */
function minimosCuadrados(A: number[][], b: number[]): number[] | null {
  const n = A[0].length
  const M = Array.from({ length: n }, (_, i) => [
    ...Array.from({ length: n }, (_, j) => A.reduce((acc, f) => acc + f[i] * f[j], 0)),
    A.reduce((acc, f, k) => acc + f[i] * b[k], 0),
  ])
  for (let c = 0; c < n; c++) {
    let p = c
    for (let i = c + 1; i < n; i++) if (Math.abs(M[i][c]) > Math.abs(M[p][c])) p = i
    if (Math.abs(M[p][c]) < 1e-13) return null
    ;[M[c], M[p]] = [M[p], M[c]]
    for (let i = 0; i < n; i++) {
      if (i === c) continue
      const k = M[i][c] / M[c][c]
      for (let j = c; j <= n; j++) M[i][j] -= k * M[c][j]
    }
  }
  return M.map((f, i) => f[n] / f[i])
}

interface Familia {
  a: E
  b: E
  k: number
}

/** f como suma de xᵏ·e^(ax)·{cos, sin}(bx): lo que admite coeficientes indeterminados. */
function familias(f: E): Familia[] | null {
  const hip = reconstruir(f, (y) => {
    if (y.t !== 'fn' || (y.v !== 'sinh' && y.v !== 'cosh')) return null
    const u = y.a[0]
    return prod(MEDIO, suma(pot(NEPER, u), prod(y.v === 'sinh' ? MENOS : UNO, pot(NEPER, prod(MENOS, u)))))
  })
  const d = desarrollar(hip)
  const mapa = new Map<string, Familia>()
  for (const t of d.t === '+' ? d.a : [d]) {
    const [, resto] = partirTermino(t)
    const fs = !resto ? [] : resto.t === '*' ? resto.a : [resto]
    let k = 0
    let a: E = CERO
    let b: E = CERO
    let trig = 0
    for (const g of fs) {
      if (!contiene(g, 'x')) continue
      if (g.t === 's') k += 1
      else if (g.t === '^' && g.b.t === 's' && g.b.v === 'x' && esEntero(g.e) && g.e.n > 0n) k += Number(g.e.n)
      else if (g.t === '^' && g.b.t === 's' && g.b.v === 'e') {
        const d1 = simplificar(derivar(g.e, 'x'))
        if (contiene(d1, 'x')) return null
        a = simplificar(suma(a, d1))
      } else if (g.t === 'fn' && (g.v === 'sin' || g.v === 'cos')) {
        if (trig++) return null
        const d1 = simplificar(derivar(g.a[0], 'x'))
        if (contiene(d1, 'x')) return null
        b = negativo(d1) ? simplificar(prod(MENOS, d1)) : d1
      } else return null
    }
    const key = clave(a) + '|' + clave(b)
    const previa = mapa.get(key)
    if (!previa || previa.k < k) mapa.set(key, { a, b, k })
  }
  return [...mapa.values()]
}

function multiplicidad(raices: Raiz[], a: E, b: E): number {
  const av = evaluar(a)
  const bv = evaluar(b)
  const r = raices.find((r) => Math.abs(evaluar(r.re) - av) < 1e-9 && Math.abs((r.im ? evaluar(r.im) : 0) - bv) < 1e-9)
  return r?.m ?? 0
}

/** Coeficientes indeterminados: ansatz, sistema numérico, números exactos y comprobación. */
function indeterminados(L: Lineal, raices: Raiz[], pasos: Paso[]): E | null {
  const fams = familias(L.f)
  if (!fams) return null
  const prueba: E[] = []
  for (const { a, b, k } of fams) {
    const m = multiplicidad(raices, a, b)
    for (let j = 0; j <= k; j++) {
      const xp = pot(X, q(m + j))
      if (esCero(b)) prueba.push(prod(xp, expo(a)))
      else prueba.push(prod(xp, expo(a), fn('cos', [prod(b, X)])), prod(xp, expo(a), fn('sin', [prod(b, X)])))
    }
  }
  if (prueba.length > 24) return null
  const Lf = prueba.map((p) => aplicarL(L, p))
  const xs = [0.31, 0.77, -0.52, 1.23, -0.94, 0.12, 1.61, -1.37, 0.58, 2.05, -0.21, 0.94]
  const filas: number[][] = []
  const lado: number[] = []
  for (let i = 0; filas.length < prueba.length + 4 && i < 60; i++) {
    const x = xs[i % xs.length] + 0.013 * Math.floor(i / xs.length)
    const fila = Lf.map((e) => evaluar(e, { x }))
    const fx = evaluar(L.f, { x })
    if (!fila.every(Number.isFinite) || !Number.isFinite(fx)) continue
    filas.push(fila)
    lado.push(fx)
  }
  const c = minimosCuadrados(filas, lado)
  if (!c) return null
  const yp = simplificar(suma(...c.map((v, i) => prod(numeros(v), prueba[i]))))
  if (!cumpleL(L, yp)) return null
  pasos.push({ t: 'Coeficientes indeterminados: se prueba con', tex: `y_p = ${tex(combinacionAnsatz(prueba))}` })
  pasos.push({ t: 'Metiéndola en la ecuación e igualando', tex: `y_p = ${tex(yp)}` })
  return yp
}

function combinacionAnsatz(prueba: E[]): E {
  const letras = 'ABCDEFGHJKLMNPQRSTUVW'
  return suma(...prueba.map((p, i) => prod(s(letras[i] ?? 'A'), p)))
}

function cumpleL(L: Lineal, y: E): boolean {
  const r = suma(aplicarL(L, y), prod(MENOS, L.f))
  let buenos = 0
  for (const x of [...PX, ...PX.map((t) => -t)]) {
    const v = evaluar(r, { x })
    const esc = 1 + Math.abs(evaluar(L.f, { x })) + Math.abs(evaluar(y, { x }))
    if (!Number.isFinite(v)) continue
    if (Math.abs(v) > 1e-6 * esc) return false
    buenos++
  }
  return buenos >= 4
}

/** Variación de parámetros para orden 2, con la base ya conocida. */
function variacion(L: Lineal, y1: E, y2: E, pasos: Paso[]): E | null {
  const W = simplificar(suma(prod(y1, derivar(y2, 'x')), prod(MENOS, y2, derivar(y1, 'x'))))
  if (esCero(W)) return null
  const g = simplificar(prod(L.f, pot(L.a[2], MENOS)))
  const I1 = integrar(simplificar(prod(y2, g, pot(W, MENOS))), 'x')
  const I2 = integrar(simplificar(prod(y1, g, pot(W, MENOS))), 'x')
  if (!I1 || !I2) return null
  const yp = simplificar(suma(prod(MENOS, y1, I1), prod(y2, I2)))
  if (!cumpleL(L, yp)) return null
  pasos.push({ t: 'Variación de parámetros: wronskiano', tex: `W = ${tex(W)}` })
  pasos.push({ t: 'Con g = f/a₂', tex: String.raw`y_p = -y_1\!\int\!\frac{y_2\,g}{W}\,dx + y_2\!\int\!\frac{y_1\,g}{W}\,dx = ${tex(yp)}` })
  return yp
}

function polCaracteristico(c: E[]) {
  return tex(suma(...c.map((ck, k) => prod(ck, pot(s('r'), q(k)))))) + ' = 0'
}

function lineal1(L: Lineal, pasos: Paso[]): E | null {
  const p = simplificar(prod(L.a[0], pot(L.a[1], MENOS)))
  const g = simplificar(prod(L.f, pot(L.a[1], MENOS)))
  pasos.push({ t: 'Forma estándar y′ + p(x)·y = q(x)', tex: `y' + ${esCero(p) ? '0' : tex(p)}\\,y = ${tex(g)}` })
  const P0 = integrar(p, 'x')
  if (!P0) return null
  const mu = simplificar(pot(NEPER, sinAbsEnLn(P0)))
  pasos.push({ t: 'Factor integrante', tex: String.raw`\mu(x) = e^{\int p\,dx} = ${tex(mu)}` })
  let I: E | null = CERO
  if (!esCero(g)) I = integrar(simplificar(prod(mu, g)), 'x')
  if (!I) return null
  pasos.push({ t: '(μ·y)′ = μ·q, así que', tex: String.raw`\mu\,y = \int \mu\,q\,dx = ${tex(I)} + C_1` })
  // repartida sale como en los libros: x − 1 + C₁e^(−x) en vez de una sola fracción
  const inv = pot(mu, MENOS)
  const yp = I.t === '+' ? suma(...I.a.map((t) => simplificar(prod(t, inv)))) : simplificar(prod(I, inv))
  return suma(yp, prod(Cn(1), inv))
}

function resolverLineal(F: E, n: number, L: Lineal, pasos: Paso[], clases: string[]): { y: E | null; yh?: E; metodo: string } | null {
  const constantes = L.a.every((a) => !contiene(a, 'x'))
  const euler = !constantes && L.a.every((a, k) => !contiene(simplificar(prod(a, pot(X, q(-k)))), 'x'))
  if (constantes) clases.push('coeficientes constantes')
  else if (euler) clases.push('Cauchy–Euler')
  else clases.push('coeficientes variables')

  if (n === 1) {
    const sub: Paso[] = []
    const y = lineal1(L, sub)
    if (y && cumple(F, 1, y)) {
      pasos.push(...sub)
      return { y, metodo: 'lineal de primer orden: factor integrante' }
    }
  }

  if (constantes || euler) {
    // en Euler, xᵏ·y⁽ᵏ⁾ ↦ r(r−1)…(r−k+1)·xʳ
    const c: E[] = []
    if (constantes) c.push(...L.a)
    else {
      let pol: P = []
      L.a.forEach((a, k) => {
        const ck = simplificar(prod(a, pot(X, q(-k))))
        let caida: P = [rq(1)]
        for (let j = 0; j < k; j++) caida = prodP(caida, [rq(-j), rq(1)])
        if (ck.t !== 'q') return
        pol = sumaP(pol, caida.map((v) => rq(v.n * ck.n, v.d * ck.d)))
      })
      if (L.a.some((a, k) => simplificar(prod(a, pot(X, q(-k)))).t !== 'q')) return null
      c.push(...pol.map((v) => q(v.n, v.d)))
    }
    const raices = raicesDe(c)
    if (!raices) return null
    pasos.push({ t: constantes ? 'Ecuación característica' : 'Con y = xʳ, ecuación indicial', tex: polCaracteristico(c) })
    pasos.push({ t: 'Raíces', tex: raices.map(texRaiz).join(',\\quad ') })
    const base = constantes ? baseConstante(raices) : baseEuler(raices)
    const yh = combinacion(base)
    pasos.push({ t: 'Solución de la homogénea', tex: `y_h = ${tex(yh)}` })
    let yp: E = CERO
    if (!esCero(L.f)) {
      const r = (constantes ? indeterminados(L, raices, pasos) : null) ?? (n === 2 && base.length === 2 ? variacion(L, base[0], base[1], pasos) : null)
      if (!r) {
        pasos.push({ t: 'La particular no sale: f no es de la forma xᵏ·e^(ax)·cos/sin(bx) y las integrales de variación de parámetros no son elementales' })
        return { y: null, yh, metodo: 'solo la homogénea' }
      }
      yp = r
    }
    const y = esCero(yp) ? yh : suma(yh, yp)
    return { y, metodo: constantes ? (esCero(L.f) ? 'ecuación característica' : 'característica + solución particular') : 'Cauchy–Euler (y = xʳ)' }
  }
  return null
}

/* ---------- primer orden no lineal ---------- */

/** y′ = G(x, y), si la ecuación se deja despejar. */
function despejada(F: E): { G: E; M: E; N: E } | null {
  const N = simplificar(derivar(F, Y(1)))
  if (contiene(N, Y(1))) return null
  const M = simplificar(sustituir(F, s(Y(1)), CERO))
  return { G: simplificar(prod(MENOS, M, pot(N, MENOS))), M, N }
}

const CANDIDATOS = [q(1), q(0), q(2), q(1, 2), q(-1), q(3), q(1, 3)]

function separar(G: E): { X: E; Y: E } | null {
  const ev = (x: number, y: number) => evaluar(G, { x, y })
  const puntos = [[0.4, 1.3, 1.7, -0.6], [2.1, 0.7, 0.9, 2.4], [-0.8, 1.1, 0.35, 1.9]]
  for (const [x1, x2, y1, y2] of puntos) {
    const a = ev(x1, y1) * ev(x2, y2)
    const b = ev(x1, y2) * ev(x2, y1)
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null
    if (Math.abs(a - b) > 1e-9 * (1 + Math.abs(a))) return null
  }
  if (!contiene(G, 'x')) return { X: UNO, Y: G }
  if (!contiene(G, 'y')) return { X: G, Y: UNO }
  for (const xs of CANDIDATOS)
    for (const ys of CANDIDATOS) {
      const g0 = simplificar(sustituir(sustituir(G, X, xs), s('y'), ys))
      const v = evaluar(g0)
      if (!Number.isFinite(v) || Math.abs(v) < 1e-9) continue
      return {
        X: simplificar(sustituir(G, s('y'), ys)),
        Y: simplificar(prod(sustituir(G, X, xs), pot(g0, MENOS))),
      }
    }
  return null
}

/**
 * Despeja y de Φ(x, y) = C1 y devuelve todas las ramas que cumplen la ecuación: con
 * y² = 2C − x² salen y = ±√(2C − x²), y es la condición inicial la que elige.
 */
function despejarY(phi: E, F: E): E[] {
  const ramas: E[] = []
  const vista = new Set<string>()
  const anota = (y: E) => {
    const k = clave(y)
    if (!vista.has(k)) {
      vista.add(k)
      ramas.push(y)
    }
  }
  try {
    const sol = resolver(suma(phi, prod(MENOS, Cn(1))), 'y')
    for (const c of sol.exactas) {
      const y = simplificar(absorberConstante(c, Cn(1)))
      if (cumple(F, 1, y, 1)) anota(y)
      else if (cumple(F, 1, c, 1)) anota(c)
    }
  } catch {
    /* sin despeje */
  }
  return ramas
}

/**
 * ∫dy/Y = Σ cᵢ·ln|uᵢ(y)| = K(x) + C: exponenciando, Π uᵢ^(m·cᵢ) = C·e^(m·K), con
 * m el que deja enteros los exponentes; quitando denominadores suele quedar
 * lineal o cuadrática en y.
 */
function despejarLogs(H0: E, K: E, F: E): E | null {
  const H = desarrollar(H0)
  const terminos = H.t === '+' ? H.a : [H]
  const logs: Array<{ u: E; c: E }> = []
  for (const t of terminos) {
    const [c, resto] = partirTermino(t)
    if (!resto) continue
    const f = resto.t === 'fn' && resto.v === 'ln' ? resto.a[0] : null
    if (!f || c.t !== 'q') return null
    logs.push({ u: f.t === 'fn' && f.v === 'abs' ? f.a[0] : f, c })
  }
  if (logs.length < 2) return null
  let m = 1n
  for (const { c } of logs) if (c.t === 'q') m = (m * c.d) / mcdB(m, c.d)
  // y después se divide por el mcd de los exponentes: (y−1)² = C·y²·e^(−2x) es (y−1) = C·y·e^(−x)
  let g = 0n
  for (const { c } of logs) if (c.t === 'q') g = mcdB(g, (c.n * m) / c.d)
  if (!g) return null
  const arriba: E[] = []
  const abajo: E[] = [prod(Cn(1), pot(NEPER, prod(q(m, g), sinAbsEnLn(K))))]
  for (const { u, c } of logs) {
    if (c.t !== 'q') return null
    const k = (c.n * m) / c.d / g
    if (k > 0n) arriba.push(pot(u, q(k)))
    else abajo.push(pot(u, q(-k)))
  }
  try {
    const ec = desarrollar(suma(prod(...arriba), prod(MENOS, ...abajo)))
    for (const c of resolver(ec, 'y').exactas) {
      const y = simplificar(c)
      if (cumple(F, 1, y, 1)) return y
    }
  } catch {
    /* sin despeje */
  }
  return null
}

const mcdB = (a: bigint, b: bigint): bigint => (b === 0n ? (a < 0n ? -a : a) : mcdB(b, a % b))

function potenciasDeY(G: E): Map<string, { k: E; c: E[] }> | null {
  const mapa = new Map<string, { k: E; c: E[] }>()
  const d = desarrollar(G)
  for (const t of d.t === '+' ? d.a : [d]) {
    const fs = t.t === '*' ? t.a : [t]
    let k: E = CERO
    const resto: E[] = []
    for (const f of fs) {
      if (f.t === 's' && f.v === 'y') k = suma(k, UNO)
      else if (f.t === '^' && f.b.t === 's' && f.b.v === 'y' && esNum(f.e)) k = suma(k, f.e)
      else if (contiene(f, 'y')) return null
      else resto.push(f)
    }
    const e = mapa.get(clave(k)) ?? { k, c: [] }
    e.c.push(prod(...resto))
    mapa.set(clave(k), e)
  }
  return mapa
}

function primerOrden(F: E, pasos: Paso[], clases: string[]): Omit<SolEdo, 'orden' | 'clases' | 'verificada' | 'homogenea'> | null {
  const d = despejada(F)
  if (!d) return null
  const { G, M, N } = d
  const sinX = !contiene(G, 'x')
  if (sinX) clases.push('autónoma')
  pasos.push({ t: 'Despejada', tex: `y' = ${tex(G)}` })

  // separable
  const sep = separar(G)
  if (sep) {
    clases.push('separable')
    const sub: Paso[] = [{ t: 'Separable: y′ = X(x)·Y(y)', tex: `X(x) = ${tex(sep.X)},\\quad Y(y) = ${tex(sep.Y)}` }]
    const H = integrar(pot(sep.Y, MENOS), 'y')
    const K = integrar(sep.X, 'x')
    if (H && K) {
      const phi = simplificar(suma(H, prod(MENOS, K)))
      sub.push({ t: 'Integrando cada lado', tex: String.raw`\int \frac{dy}{Y(y)} = ${tex(H)} = ${tex(K)} + C_1` })
      const singulares: E[] = []
      try {
        for (const c of resolver(sep.Y, 'y').exactas) if (!contiene(c, 'x')) singulares.push(c)
      } catch {
        /* sin ceros */
      }
      const ramas = despejarY(simplificar(suma(sinAbsEnLn(H), prod(MENOS, sinAbsEnLn(K)))), F)
      if (!ramas.length) {
        const l = despejarLogs(H, K, F)
        if (l) ramas.push(l)
      }
      const y = ramas[0] ?? null
      if (y) sub.push({ t: 'Despejando y (el signo del valor absoluto se lo come C₁)', tex: ramas.map((r) => `y = ${tex(r)}`).join(',\\quad ') })
      if (y || cumpleImplicita(phi, G)) {
        pasos.push(...sub)
        if (singulares.length) pasos.push({ t: 'Al dividir por Y(y) se pierden las constantes', tex: singulares.map((c) => `y = ${tex(c)}`).join(',\\quad ') })
        return { metodo: 'separación de variables', pasos, explicita: y, implicita: y ? null : phi, singulares, ramas }
      }
    }
  }

  // Bernoulli: y′ = −p·y + q·yⁿ
  const pot0 = potenciasDeY(G)
  if (pot0 && pot0.size === 2 && pot0.has('1')) {
    const [otra] = [...pot0.values()].filter((e) => clave(e.k) !== '1')
    const n = otra.k
    if (!esCero(n)) {
      clases.push('Bernoulli')
      const p = simplificar(prod(MENOS, suma(...pot0.get('1')!.c)))
      const qx = simplificar(suma(...otra.c))
      const uno_n = simplificar(suma(UNO, prod(MENOS, n)))
      const sub: Paso[] = [
        { t: 'Bernoulli: y′ + p·y = q·yⁿ', tex: `p = ${tex(p)},\\quad q = ${tex(qx)},\\quad n = ${tex(n)}` },
        { t: 'Con v = y^(1−n) queda lineal', tex: `v' + ${tex(simplificar(prod(uno_n, p)))}\\,v = ${tex(simplificar(prod(uno_n, qx)))}` },
      ]
      const v = lineal1({ a: [simplificar(prod(uno_n, p)), UNO], f: simplificar(prod(uno_n, qx)) }, sub)
      if (v) {
        const y = simplificar(pot(v, pot(uno_n, MENOS)))
        if (cumple(F, 1, y, 1)) {
          pasos.push(...sub, { t: 'Deshaciendo el cambio', tex: `y = v^{1/(1-n)} = ${tex(y)}` })
          return { metodo: 'Bernoulli (v = y¹⁻ⁿ)', pasos, explicita: y, implicita: null, singulares: valor(n as never) > 0 ? [CERO] : [] }
        }
      }
    }
  }

  // exacta, o exacta tras un factor integrante que dependa de una sola variable
  const exacta = (Mm: E, Nn: E, sub: Paso[]): E | null => {
    const dif = simplificar(suma(derivar(Mm, 'y'), prod(MENOS, derivar(Nn, 'x'))))
    if (!esCero(dif) && !casiCero(dif)) return null
    const A = integrar(Mm, 'x')
    if (!A) return null
    const h1 = simplificar(suma(Nn, prod(MENOS, derivar(A, 'y'))))
    if (contiene(h1, 'x') && !casiSinX(h1)) return null
    const h = esCero(h1) ? CERO : integrar(sustituir(h1, X, q(1, 3)), 'y')
    if (!h) return null
    const phi = simplificar(suma(A, h))
    sub.push({ t: 'Φ con Φx = M y Φy = N', tex: String.raw`\Phi(x,y) = \int M\,dx + h(y) = ${tex(phi)}` })
    return phi
  }
  const texMN = (Mm: E, Nn: E) => `\\big(${tex(Mm)}\\big)\\,dx + \\big(${tex(Nn)}\\big)\\,dy = 0`
  {
    const sub: Paso[] = [{ t: 'Como forma diferencial', tex: texMN(M, N) }, { t: 'Es exacta', tex: String.raw`\partial_y M = \partial_x N` }]
    const phi = exacta(M, N, sub)
    if (phi && cumpleImplicita(phi, G)) {
      clases.push('exacta')
      const ramas = despejarY(phi, F)
      const y = ramas[0] ?? null
      pasos.push(...sub)
      if (y) pasos.push({ t: 'Despejando y', tex: ramas.map((r) => `y = ${tex(r)}`).join(',\\quad ') })
      return { metodo: 'ecuación exacta', pasos, explicita: y, implicita: y ? null : phi, singulares: [], ramas }
    }
    const My = derivar(M, 'y')
    const Nx = derivar(N, 'x')
    for (const [cual, cociente, v] of [
      ['μ(x)', simplificar(prod(suma(My, prod(MENOS, Nx)), pot(N, MENOS))), 'x'],
      ['μ(y)', simplificar(prod(suma(Nx, prod(MENOS, My)), pot(M, MENOS))), 'y'],
    ] as const) {
      if (contiene(cociente, v === 'x' ? 'y' : 'x') || esCero(cociente)) continue
      const I = integrar(cociente, v)
      if (!I) continue
      const mu = simplificar(pot(NEPER, sinAbsEnLn(I)))
      const sub2: Paso[] = [{ t: 'Como forma diferencial', tex: texMN(M, N) }, { t: `No es exacta; factor integrante ${cual}`, tex: `\\mu = ${tex(mu)}` }]
      const phi2 = exacta(simplificar(prod(mu, M)), simplificar(prod(mu, N)), sub2)
      if (phi2 && cumpleImplicita(phi2, G)) {
        clases.push(`exacta con factor integrante ${cual}`)
        const ramas = despejarY(phi2, F)
        const y = ramas[0] ?? null
        pasos.push(...sub2)
        if (y) pasos.push({ t: 'Despejando y', tex: ramas.map((r) => `y = ${tex(r)}`).join(',\\quad ') })
        return { metodo: `factor integrante ${cual}`, pasos, explicita: y, implicita: y ? null : phi2, singulares: [], ramas }
      }
    }
  }

  // homogénea: G(λx, λy) = G(x, y), con y = v·x
  const ev = (x: number, y: number) => evaluar(G, { x, y })
  const homog = [[0.7, 1.3, 2.1], [1.4, -0.5, 0.6], [2.2, 0.9, 1.7]].every(([x, y, l]) => {
    const a = ev(x, y)
    const b = ev(l * x, l * y)
    return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < 1e-9 * (1 + Math.abs(a))
  })
  if (homog) {
    clases.push('homogénea (y = v·x)')
    const R = simplificar(sustituir(sustituir(G, X, UNO), s('y'), s('v')))
    const den = simplificar(suma(R, prod(MENOS, s('v'))))
    if (!esCero(den)) {
      const H = integrar(pot(den, MENOS), 'v')
      if (H) {
        const phi = simplificar(suma(sustituir(sinAbsEnLn(H), s('v'), prod(s('y'), pot(X, MENOS))), prod(MENOS, fn('ln', [X]))))
        if (cumpleImplicita(phi, G)) {
          const ramas = despejarY(phi, F)
          const y = ramas[0] ?? null
          pasos.push(
            { t: 'Homogénea: con y = v·x, x·v′ = R(v) − v', tex: `R(v) = ${tex(R)}` },
            { t: 'Separando', tex: String.raw`\int \frac{dv}{R(v) - v} = ${tex(H)} = \ln x + C_1` },
          )
          if (y) pasos.push({ t: 'Despejando y', tex: ramas.map((r) => `y = ${tex(r)}`).join(',\\quad ') })
          return { metodo: 'homogénea (cambio y = v·x)', pasos, explicita: y, implicita: y ? null : phi, singulares: [], ramas }
        }
      }
    }
  }
  return null
}

function casiCero(e: E): boolean {
  let buenos = 0
  for (const x of PX)
    for (const y of [0.43, 1.37, -0.71]) {
      const v = evaluar(e, { x, y })
      if (!Number.isFinite(v)) continue
      if (Math.abs(v) > 1e-9) return false
      buenos++
    }
  return buenos >= 3
}

function casiSinX(e: E): boolean {
  for (const y of [0.43, 1.37, -0.71]) {
    const a = evaluar(e, { x: 0.37, y })
    const b = evaluar(e, { x: 1.83, y })
    if (Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) > 1e-9 * (1 + Math.abs(a))) return false
  }
  return true
}

/* ---------- la entrada ---------- */

/** Baja un orden: y⁽ᵏ⁾ ↦ y⁽ᵏ⁻¹⁾ (para ecuaciones sin y). */
function bajar(F: E, n: number): E {
  return reconstruir(F, (e) => {
    if (e.t !== 's') return null
    for (let k = 1; k <= n; k++) if (e.v === Y(k)) return s(Y(k - 1))
    return null
  })
}

export function resolverEdo(src: string): SolEdo {
  const { F, orden: n } = leerEdo(src)
  return resolverF(F, n, 0)
}

function resolverF(F: E, n: number, prof: number): SolEdo {
  const pasos: Paso[] = []
  const clases: string[] = [`orden ${n}`]
  const L = comoLineal(F, n)
  const base = { orden: n, clases, pasos, explicita: null as E | null, implicita: null as E | null, singulares: [] as E[], homogenea: null as E | null, verificada: false, metodo: '' }

  if (L) {
    clases.push('lineal', esCero(L.f) ? 'homogénea' : 'no homogénea')
    pasos.push({ t: 'Lineal', tex: texOp(L) })
    const r = resolverLineal(F, n, L, pasos, clases)
    if (r?.y) {
      const y = simplificar(r.y)
      return { ...base, metodo: r.metodo, explicita: y, verificada: cumple(F, n, y) }
    }
    if (r?.yh) return { ...base, metodo: r.metodo, homogenea: simplificar(r.yh) }
  } else clases.push('no lineal')

  if (n === 1) {
    const r = primerOrden(F, pasos, clases)
    if (r) {
      const explicita = r.explicita ? pulir(r.explicita) : null
      const verificada = explicita ? cumple(F, 1, explicita, 1) : true
      return { ...base, ...r, explicita, verificada }
    }
  }

  // sin y: p = y′ baja un orden y después se integra
  if (n >= 2 && !contiene(F, 'y') && prof < 3) {
    clases.push('falta y (p = y′)')
    const sub = resolverF(bajar(F, n), n - 1, prof + 1)
    if (sub.explicita) {
      const I = integrar(sub.explicita, 'x')
      if (I) {
        const y = simplificar(suma(I, Cn(n)))
        pasos.push(
          { t: 'No aparece y: con p = y′ baja a orden ' + (n - 1) },
          ...sub.pasos,
          { t: 'p = y′, así que se integra una vez más', tex: `y = \\int p\\,dx = ${tex(y)}` },
        )
        return { ...base, metodo: `reducción de orden (p = y′) + ${sub.metodo}`, explicita: y, verificada: cumple(F, n, y) }
      }
    }
  }
  if (!contiene(F, 'x')) if (!clases.includes('autónoma')) clases.push('autónoma')
  return { ...base, metodo: '' }
}

/* ---------- condiciones ---------- */

export interface Condicion {
  k: number
  x0: E
  v: E
  texto: string
}

/** «y(0) = 1, y'(0) = 0» (también con ; entre condiciones, y con puntos distintos: contorno). */
export function leerCondiciones(src: string): Condicion[] {
  const out: Condicion[] = []
  for (const trozo of src.split(/[;,](?![^(]*\))/)) {
    const t = trozo.trim()
    if (!t) continue
    const m = t.match(/^y('*)\s*\((.+)\)\s*=\s*(.+)$/i)
    if (!m) throw new Error(`«${t}»: se escribe y(x₀) = valor, y'(x₀) = valor…`)
    const k = m[1].length
    const x0 = simplificar(aE(m[2]))
    const v = simplificar(aE(m[3]))
    if (simbolos(x0).size || simbolos(v).size) throw new Error(`«${t}»: el punto y el valor tienen que ser números`)
    if (!Number.isFinite(evaluar(x0)) || !Number.isFinite(evaluar(v))) throw new Error(`«${t}»: no es un número real`)
    out.push({ k, x0, v, texto: `${Y(k)}(${tex(x0)}) = ${tex(v)}` })
  }
  return out
}

export interface Particular {
  y: E | null
  /** Curva de nivel Φ(x, y) = 0 si la solución es implícita. */
  phi: E | null
  constantes: Array<[string, E]>
  nota?: string
}

function gauss(A: number[][], b: number[]): number[] | null {
  const n = A.length
  const M = A.map((f, i) => [...f, b[i]])
  for (let c = 0; c < n; c++) {
    let p = c
    for (let i = c + 1; i < n; i++) if (Math.abs(M[i][c]) > Math.abs(M[p][c])) p = i
    if (Math.abs(M[p][c]) < 1e-10) return null
    ;[M[c], M[p]] = [M[p], M[c]]
    for (let i = 0; i < n; i++) {
      if (i === c) continue
      const k = M[i][c] / M[c][c]
      for (let j = c; j <= n; j++) M[i][j] -= k * M[c][j]
    }
  }
  return M.map((f, i) => f[n] / f[i])
}

export function particular(sol: SolEdo, conds: Condicion[]): Particular | null {
  const ramas = sol.ramas ?? []
  if (ramas.length < 2) return particularRama(sol, conds)
  // cada rama por separado: la condición inicial decide cuál es
  let primero: Particular | null = null
  for (const r of ramas) {
    const p = particularRama({ ...sol, explicita: r }, conds)
    if (p?.y) return p
    primero ??= p
  }
  return primero
}

function particularRama(sol: SolEdo, conds: Condicion[]): Particular | null {
  if (!conds.length) return null
  if (sol.implicita) {
    const c = conds.find((c) => c.k === 0)
    if (!c || conds.length > 1) return { y: null, phi: null, constantes: [], nota: 'con la solución implícita solo se usa y(x₀) = y₀' }
    const C = simplificar(sustituir(sustituir(sol.implicita, X, c.x0), s('y'), c.v))
    if (!Number.isFinite(evaluar(C))) return { y: null, phi: null, constantes: [], nota: 'Φ no está definida en el punto inicial' }
    return { y: null, phi: simplificar(suma(sol.implicita, prod(MENOS, C))), constantes: [['C1', C]] }
  }
  const yg = sol.explicita
  if (!yg) return null
  const nombres = [...simbolos(yg)].filter((v) => /^C\d+$/.test(v)).sort()
  if (conds.length !== nombres.length)
    return { y: null, phi: null, constantes: [], nota: `hacen falta ${nombres.length} condiciones (hay ${conds.length})` }

  const filas = conds.map((c) => ({ e: c.k ? derivarN(yg, 'x', c.k) : yg, x0: evaluar(c.x0), v: evaluar(c.v), c }))
  const residuo = (cs: number[]) =>
    filas.map((f) => evaluar(f.e, { x: f.x0, ...Object.fromEntries(nombres.map((n, i) => [n, cs[i]])) }) - f.v)
  const b0 = residuo(nombres.map(() => 0))
  const A = nombres.map((_, j) => residuo(nombres.map((_, i) => (i === j ? 1 : 0))).map((v, i) => v - b0[i]))
  const At = filas.map((_, i) => nombres.map((_, j) => A[j][i]))
  // ¿lineal en las constantes? se mira en otro punto
  const prueba = nombres.map((_, i) => 0.3 + 0.7 * i)
  const esperado = At.map((f, i) => f.reduce((acc, a, j) => acc + a * prueba[j], 0) + b0[i])
  const lineal = residuo(prueba).every((v, i) => Number.isFinite(v) && Math.abs(v - esperado[i]) < 1e-7 * (1 + Math.abs(v)))

  let cs: number[] | null = null
  if (lineal) {
    // exactas si se puede: el sistema lineal en C con los valores en los puntos sin redondear
    try {
      const ecs = filas.map((f) => simplificar(suma(sustituir(f.e, X, f.c.x0), prod(MENOS, f.c.v))))
      const r = resolverSistema(ecs, nombres)
      if (r.tipo === 'unica' && r.valores.every((v) => Number.isFinite(evaluar(v)))) {
        const vals = r.valores.map((v) => simplificar(v))
        if (Math.max(...residuo(vals.map((v) => evaluar(v))).map(Math.abs)) < 1e-8) {
          let y = yg
          nombres.forEach((n, i) => (y = sustituir(y, s(n), vals[i])))
          return { y: simplificar(y), phi: null, constantes: nombres.map((n, i) => [n, vals[i]]) }
        }
      }
    } catch {
      /* se sigue en numérico */
    }
  }
  if (lineal && At.every((f) => f.every(Number.isFinite)) && b0.every(Number.isFinite)) {
    cs = gauss(At, b0.map((v) => -v))
    if (!cs) return { y: null, phi: null, constantes: [], nota: 'las condiciones no fijan las constantes: no hay solución, o hay infinitas' }
  } else if (nombres.length === 1) {
    // una constante que entra no linealmente: primero exacta, si no Newton
    try {
      const c = conds[0]
      const eq = simplificar(suma(sustituir(filas[0].e, X, c.x0), prod(MENOS, c.v)))
      for (const r of resolver(eq, nombres[0]).exactas) {
        const v = evaluar(r)
        if (Number.isFinite(v) && Math.abs(residuo([v])[0]) < 1e-8) {
          const y = simplificar(sustituir(yg, s(nombres[0]), r))
          return { y, phi: null, constantes: [[nombres[0], r]] }
        }
      }
    } catch {
      /* se sigue con Newton */
    }
    cs = newton(residuo, nombres.length)
  } else cs = newton(residuo, nombres.length)
  if (!cs) return { y: null, phi: null, constantes: [], nota: 'no encuentro constantes que cumplan las condiciones' }
  const exactas = cs.map(numeros)
  let y = yg
  nombres.forEach((n, i) => (y = sustituir(y, s(n), exactas[i])))
  y = simplificar(y)
  return { y, phi: null, constantes: nombres.map((n, i) => [n, exactas[i]]) }
}

function newton(res: (c: number[]) => number[], n: number): number[] | null {
  for (const ini of [0, 1, -1, 2, 0.5, -2, 5]) {
    let c = Array.from({ length: n }, () => ini)
    for (let it = 0; it < 60; it++) {
      const r = res(c)
      if (!r.every(Number.isFinite)) break
      if (Math.max(...r.map(Math.abs)) < 1e-11) return c
      const J = r.map((_, i) =>
        c.map((_, j) => {
          const h = 1e-6 * (1 + Math.abs(c[j]))
          const d = c.slice()
          d[j] += h
          return (res(d)[i] - r[i]) / h
        }),
      )
      const paso = gauss(J, r.map((v) => -v))
      if (!paso) break
      c = c.map((v, i) => v + paso[i])
    }
  }
  return null
}

/* ---------- serie de Taylor de la solución de un problema de valor inicial ---------- */

export function serieTaylor(src: string, conds: Condicion[], grados = 8): { serie: E; texto: string } | null {
  const { F, orden: n } = leerEdo(src)
  if (conds.length !== n || conds.some((c) => clave(c.x0) !== clave(conds[0].x0))) return null
  const inicial = Array.from({ length: n }, (_, k) => conds.find((c) => c.k === k))
  if (inicial.some((c) => !c)) return null
  const N = simplificar(derivar(F, Y(n)))
  if (contiene(N, Y(n))) return null
  const G = simplificar(prod(MENOS, sustituir(F, s(Y(n)), CERO), pot(N, MENOS)))
  const x0 = conds[0].x0
  const vars: Record<string, number> = { x: evaluar(x0) }
  inicial.forEach((c, k) => (vars[Y(k)] = evaluar(c!.v)))
  const d: number[] = inicial.map((c) => evaluar(c!.v))
  let cur = G
  for (let m = n; m <= grados; m++) {
    if (m > n) {
      let D = derivar(cur, 'x')
      for (let k = 0; k < n - 1; k++) D = suma(D, prod(s(Y(k + 1)), derivar(cur, Y(k))))
      D = suma(D, prod(G, derivar(cur, Y(n - 1))))
      cur = reconstruir(D)
      if (tamano(cur) > 40000) break
    }
    const v = evaluar(cur, vars)
    if (!Number.isFinite(v)) return null
    d.push(v)
  }
  let fact = 1
  const terminos: E[] = []
  const h = esCero(x0) ? X : suma(X, prod(MENOS, x0))
  d.forEach((v, k) => {
    if (k) fact *= k
    if (Math.abs(v) > 1e-13) terminos.push(prod(numeros(v / fact), pot(h, q(k))))
  })
  const serie = suma(...terminos)
  return { serie, texto: `y \\approx ${tex(serie)} + O\\big(${esCero(x0) ? 'x' : `(${tex(h)})`}^{${d.length}}\\big)` }
}

export const texE = tex
