import { compilar } from './expresion'
import { rk4 } from './numerico'

/**
 * Analiza una ecuación diferencial escrita tal cual, con el signo igual y con
 * y, y' e y'' donde toque. No hace álgebra simbólica: mide los coeficientes
 * evaluando la expresión, que para una ecuación lineal los determina del todo.
 */
export interface Analisis {
  orden: 1 | 2
  lineal: boolean
  constantes: boolean
  homogenea: boolean
  /** a₀(x)·y + a₁(x)·y′ + a₂(x)·y″ = f(x) */
  a: Array<(x: number) => number>
  f: (x: number) => number
  error: string | null
}

const VARS = ['x', 'y', "y'", "y''"]

export function analizar(ecuacion: string): Analisis | { error: string } {
  const partes = ecuacion.split('=')
  if (partes.length !== 2) return { error: 'falta un signo = (o sobra alguno)' }
  let E: (...v: number[]) => number
  try {
    E = compilar(`(${partes[0]})-(${partes[1]})`, VARS)
  } catch (e) {
    return { error: (e as Error).message }
  }

  // E es afín en (y, y′, y″) si la ecuación es lineal: los coeficientes salen
  // de evaluar en la base canónica
  const cero = (x: number) => E(x, 0, 0, 0)
  const coef = (k: number) => (x: number) => {
    const v = [x, 0, 0, 0]
    v[k] = 1
    return E(v[0], v[1], v[2], v[3]) - cero(x)
  }
  const a = [coef(1), coef(2), coef(3)]
  const f = (x: number) => -cero(x)

  // ¿de verdad es lineal? se comprueba en puntos al azar
  let lineal = true
  for (const [x, y, p, q] of [
    [0.3, 1.7, -0.9, 2.1],
    [-1.1, -0.4, 2.3, 0.6],
    [2.4, 0.8, 1.2, -1.5],
  ]) {
    const real = E(x, y, p, q)
    const afin = a[0](x) * y + a[1](x) * p + a[2](x) * q - f(x)
    if (!Number.isFinite(real) || Math.abs(real - afin) > 1e-6 * (1 + Math.abs(real))) lineal = false
  }

  const muestras = [-2, -0.7, 0.4, 1.3, 2.6]
  const varia = (g: (x: number) => number) => {
    const vs = muestras.map(g).filter(Number.isFinite)
    return Math.max(...vs) - Math.min(...vs) > 1e-9
  }
  const grande = (g: (x: number) => number) => muestras.some((x) => Math.abs(g(x)) > 1e-9)

  const orden: 1 | 2 = grande(a[2]) ? 2 : 1
  if (orden === 1 && !grande(a[1])) return { error: 'no aparece ninguna derivada de y' }

  return {
    orden,
    lineal,
    constantes: lineal && !a.some(varia),
    homogenea: !grande(f),
    a,
    f,
    error: null,
  }
}

/** Pasa a forma normal: y″ = (f − a₁y′ − a₀y)/a₂ (o y′ = … si es de orden 1). */
export function formaNormal(an: Analisis) {
  const lider = an.orden === 2 ? an.a[2] : an.a[1]
  return (x: number, y: number, p: number) => {
    const L = lider(x)
    if (Math.abs(L) < 1e-12) return NaN
    return an.orden === 2 ? (an.f(x) - an.a[1](x) * p - an.a[0](x) * y) / L : (an.f(x) - an.a[0](x) * y) / L
  }
}

export function integrar(an: Analisis, y0: number, p0: number, X: number, pasos = 3000): number[][] {
  const F = formaNormal(an)
  const h = X / pasos
  const out: number[][] = [[0, y0, p0]]
  let Y = an.orden === 2 ? [y0, p0] : [y0]
  for (let i = 0; i < pasos; i++) {
    const campo =
      an.orden === 2
        ? (t: number, v: number[]) => [v[1], F(t, v[0], v[1])]
        : (t: number, v: number[]) => [F(t, v[0], 0)]
    Y = rk4(campo, i * h, Y, h)
    if (!Y.every(Number.isFinite) || Math.abs(Y[0]) > 1e10) break
    out.push([(i + 1) * h, Y[0], an.orden === 2 ? Y[1] : F((i + 1) * h, Y[0], 0)])
  }
  return out
}

export interface Cerrada {
  /** Solución general, con las constantes sin fijar. */
  general: string
  /** La misma con C₁ y C₂ ya resueltas por las condiciones iniciales. */
  particular: string
  /** Para dibujarla y compararla con la numérica. */
  y: (x: number) => number
  raices: string
  constantes: Array<[string, number]>
}

const num = (v: number, d = 4) => {
  const r = Math.round(v * 10 ** d) / 10 ** d
  return String(r).replace('.', '{,}')
}

/** El mismo número para texto plano, no para KaTeX. */
const numT = (v: number, d = 4) => num(v, d).replace('{,}', ',')

/** Coeficiente delante de algo: 1 y −1 no se escriben. */
const coef = (v: number, tex: string) => {
  const r = Math.round(v * 1e4) / 1e4
  if (!tex) return num(r)
  if (Math.abs(r - 1) < 1e-9) return tex
  if (Math.abs(r + 1) < 1e-9) return `-${tex}`
  return `${num(r)}${tex}`
}

/** Exponencial con el exponente limpio: e^{x}, e^{-x}, e^{2{,}5x}; con exponente nulo no se escribe. */
const expo = (l: number) => (Math.abs(Math.round(l * 1e4)) < 1e-9 ? '' : `e^{${coef(l, 'x')}}`)

/** Suma de términos c·tex sin los nulos y con los signos bien puestos; si no queda ninguno, 0. */
const suma = (terminos: Array<[number, string]>) => {
  const vivos = terminos.filter(([v]) => Math.abs(Math.round(v * 1e4)) > 0)
  if (!vivos.length) return { tex: '0', n: 0 }
  const [[v0, t0], ...resto] = vivos
  return { tex: [coef(v0, t0), ...resto.map(([v, t]) => mas(v, t))].join(' '), n: vivos.length }
}

/** e^{λx} delante de una suma: los paréntesis solo si hay más de un término. */
const porExpo = (l: number, s: { tex: string; n: number }) => {
  const e = expo(l)
  if (!e || s.tex === '0') return s.tex
  return s.n > 1 ? String.raw`${e}\big(${s.tex}\big)` : `${s.tex}\\,${e}`
}

/** Suma con el signo bien puesto: « + 3 » o « − 3 ». */
const mas = (v: number, tex: string) => `${v >= 0 ? '+' : '-'} ${coef(Math.abs(v), tex)}`

/**
 * Solución en forma cerrada cuando la ecuación es lineal de coeficientes
 * constantes. La parte particular solo se resuelve si el término independiente
 * es constante; en los demás casos se devuelve `null` y queda la numérica.
 */
export function solucionCerrada(an: Analisis, y0: number, p0: number): Cerrada | null {
  if (!an.lineal || !an.constantes) return null
  const a0 = an.a[0](0)
  const a1 = an.a[1](0)
  const a2 = an.a[2](0)
  const f0 = an.f(0)
  const fConstante = [-1.3, 0.7, 2.2].every((x) => Math.abs(an.f(x) - f0) < 1e-9)
  if (!fConstante) return null

  if (an.orden === 1) {
    const lam = -a0 / a1
    if (Math.abs(a0) < 1e-12) {
      // y′ = f/a₁ : una recta
      const m = f0 / a1
      return {
        general: String.raw`y = C_1 + ${num(m)}\,x`,
        particular: String.raw`y = ${num(y0)} ${mas(m, 'x')}`,
        y: (x) => y0 + m * x,
        raices: 'a₀ = 0: no hay exponencial, la solución es una recta',
        constantes: [['C₁', y0]],
      }
    }
    const yp = f0 / a0
    const C = y0 - yp
    return {
      general: `y = C_1 ${expo(lam)}${Math.abs(yp) > 1e-12 ? ` ${mas(yp, '')}` : ''}`,
      particular: `y = ${suma([[C, expo(lam)], [yp, '']]).tex}`,
      y: (x) => C * Math.exp(lam * x) + yp,
      raices: `λ = ${numT(lam)}`,
      constantes: [['C₁', C], ['y particular', yp]],
    }
  }

  const disc = a1 * a1 - 4 * a0 * a2
  const yp = Math.abs(a0) > 1e-12 ? f0 / a0 : 0
  const sinParticular = Math.abs(a0) <= 1e-12 && Math.abs(f0) > 1e-12
  if (sinParticular) return null

  const resolver2 = (u1: (x: number) => number, u2: (x: number) => number, d1: number, d2: number) => {
    // C₁u₁(0) + C₂u₂(0) = y₀ − y_p ;  C₁u₁′(0) + C₂u₂′(0) = y₀′
    const det = u1(0) * d2 - u2(0) * d1
    const b1 = y0 - yp
    const b2 = p0
    return [(b1 * d2 - u2(0) * b2) / det, (u1(0) * b2 - b1 * d1) / det]
  }
  const cola = Math.abs(yp) > 1e-12 ? ` ${yp >= 0 ? '+' : '-'} ${num(Math.abs(yp))}` : ''

  if (disc > 1e-12) {
    const r = Math.sqrt(disc)
    const l1 = (-a1 + r) / (2 * a2)
    const l2 = (-a1 - r) / (2 * a2)
    const [C1, C2] = resolver2((x) => Math.exp(l1 * x), (x) => Math.exp(l2 * x), l1, l2)
    return {
      general: String.raw`y = C_1 ${expo(l1)} + C_2 ${expo(l2)}${cola}`,
      particular: `y = ${suma([[C1, expo(l1)], [C2, expo(l2)], [yp, '']]).tex}`,
      y: (x) => C1 * Math.exp(l1 * x) + C2 * Math.exp(l2 * x) + yp,
      raices: `λ₁ = ${numT(l1)}, λ₂ = ${numT(l2)} (reales distintas)`,
      constantes: [['C₁', C1], ['C₂', C2], ['y particular', yp]],
    }
  }
  if (disc > -1e-12) {
    const l = -a1 / (2 * a2)
    const [C1, C2] = resolver2((x) => Math.exp(l * x), (x) => x * Math.exp(l * x), l, 1)
    return {
      general: String.raw`y = (C_1 + C_2 x)\,${expo(l)}${cola}`,
      particular: `y = ${porExpo(l, suma([[C1, ''], [C2, 'x']]))}${cola}`,
      y: (x) => (C1 + C2 * x) * Math.exp(l * x) + yp,
      raices: `λ = ${numT(l)} (doble)`,
      constantes: [['C₁', C1], ['C₂', C2], ['y particular', yp]],
    }
  }
  const al = -a1 / (2 * a2)
  const be = Math.sqrt(-disc) / (2 * a2)
  const [C1, C2] = resolver2(
    (x) => Math.exp(al * x) * Math.cos(be * x),
    (x) => Math.exp(al * x) * Math.sin(be * x),
    al,
    be,
  )
  return {
    general: `y = ${porExpo(al, { tex: String.raw`C_1\cos(${coef(be, 'x')}) + C_2\sin(${coef(be, 'x')})`, n: 2 })}${cola}`,
    // las plantillas anidadas NO son String.raw: la barra hay que doblarla
    particular: `y = ${porExpo(al, suma([[C1, '\\cos(' + coef(be, 'x') + ')'], [C2, '\\sin(' + coef(be, 'x') + ')']]))}${cola}`,
    y: (x) => Math.exp(al * x) * (C1 * Math.cos(be * x) + C2 * Math.sin(be * x)) + yp,
    raices: `λ = ${numT(al)} ± ${numT(be)}i (complejas)`,
    constantes: [['C₁', C1], ['C₂', C2], ['y particular', yp]],
  }
}

/** Cuánto se aleja una función de cumplir la ecuación, medido en [0, X]. */
export function residuo(an: Analisis, y: (x: number) => number, X: number): number {
  const h = 1e-4
  let peor = 0
  for (let i = 1; i < 60; i++) {
    const x = (X * i) / 60
    const yp = (y(x + h) - y(x - h)) / (2 * h)
    const ypp = (y(x + h) - 2 * y(x) + y(x - h)) / (h * h)
    const r = an.a[0](x) * y(x) + an.a[1](x) * yp + an.a[2](x) * ypp - an.f(x)
    const escala = 1 + Math.abs(an.a[0](x) * y(x)) + Math.abs(an.a[2](x) * ypp)
    peor = Math.max(peor, Math.abs(r) / escala)
  }
  return peor
}

/* ---------- orden n, escrita tal cual ---------- */

/**
 * La ecuación como residuo R(x, y, y′, …, y⁽ⁿ⁾) = izquierda − derecha. La
 * derivada más alta se despeja en cada evaluación por Newton (una iteración si
 * la ecuación es lineal en ella), así que vale también si no viene despejada.
 */
export interface EdoNum {
  n: number
  R: (x: number, Y: number[]) => number
}

export function compilarEdo(src: string, variables: string[], n: number): EdoNum {
  const partes = src.split('=')
  if (partes.length !== 2) throw new Error('falta un signo = (o sobra alguno)')
  const E = compilar(`(${partes[0]})-(${partes[1]})`, variables)
  return { n, R: (x, Y) => E(x, ...Y) }
}

/** y⁽ⁿ⁾ a partir de (x, y, …, y⁽ⁿ⁻¹⁾), empezando a buscar en `z0`. */
export function derivadaAlta(ed: EdoNum, x: number, Y: number[], z0 = 0): number {
  const v = [...Y, z0]
  let z = z0
  for (let it = 0; it < 12; it++) {
    v[ed.n] = z
    const r = ed.R(x, v)
    const h = 1e-6 * (1 + Math.abs(z))
    v[ed.n] = z + h
    const d = (ed.R(x, v) - r) / h
    if (!Number.isFinite(r) || !Number.isFinite(d) || Math.abs(d) < 1e-14) return NaN
    const paso = r / d
    z -= paso
    if (Math.abs(paso) < 1e-12 * (1 + Math.abs(z))) return z
  }
  return z
}

const DP = {
  c: [0, 1 / 5, 3 / 10, 4 / 5, 8 / 9, 1, 1],
  a: [
    [],
    [1 / 5],
    [3 / 40, 9 / 40],
    [44 / 45, -56 / 15, 32 / 9],
    [19372 / 6561, -25360 / 2187, 64448 / 6561, -212 / 729],
    [9017 / 3168, -355 / 33, 46732 / 5247, 49 / 176, -5103 / 18656],
    [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84],
  ],
  b: [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84, 0],
  e: [71 / 57600, 0, -71 / 16695, 71 / 1920, -17253 / 339200, 22 / 525, -1 / 40],
}

export interface Tramo {
  /** Filas [x, y, y′, …, y⁽ⁿ⁾]. */
  puntos: number[][]
  /** Dónde se paró antes de llegar, y por qué. */
  parada?: { x: number; motivo: string }
}

/**
 * Dormand–Prince 5(4) con paso adaptativo de x0 a x1 (en cualquier sentido).
 * El paso máximo se limita para que la curva salga con resolución de sobra.
 */
export function integrarEdo(ed: EdoNum, x0: number, Y0: number[], x1: number, tol = 1e-9): Tramo {
  const dir = Math.sign(x1 - x0) || 1
  const largo = Math.abs(x1 - x0)
  const hMax = largo / 300
  let h = Math.min(hMax, 1e-3 * (1 + largo)) * dir
  let x = x0
  let Y = Y0.slice()
  let zPrev = derivadaAlta(ed, x0, Y0)
  const f = (t: number, v: number[]) => {
    const z = derivadaAlta(ed, t, v, zPrev)
    return [...v.slice(1), z]
  }
  const puntos: number[][] = [[x0, ...Y0, zPrev]]
  if (!Number.isFinite(zPrev)) return { puntos, parada: { x: x0, motivo: 'la ecuación no se deja despejar en la derivada más alta en el punto inicial (punto singular)' } }
  for (let paso = 0; paso < 200000 && dir * (x1 - x) > 1e-12; paso++) {
    if (dir * (x + h - x1) > 0) h = x1 - x
    const k: number[][] = []
    for (let i = 0; i < 7; i++) {
      const yi = Y.map((v, j) => v + h * DP.a[i].reduce((acc, a, m) => acc + a * k[m][j], 0))
      k.push(f(x + DP.c[i] * h, yi))
    }
    const Yn = Y.map((v, j) => v + h * DP.b.reduce((acc, b, m) => acc + b * k[m][j], 0))
    const err = Math.max(...Y.map((v, j) => Math.abs(h * DP.e.reduce((acc, e, m) => acc + e * k[m][j], 0)) / (tol + tol * Math.max(Math.abs(v), Math.abs(Yn[j])))))
    if (!Number.isFinite(err) || !Yn.every(Number.isFinite)) {
      h /= 4
      if (Math.abs(h) < 1e-12 * (1 + Math.abs(x))) return { puntos, parada: { x, motivo: 'la solución deja de estar definida (asíntota o punto singular)' } }
      continue
    }
    if (err <= 1) {
      x += h
      Y = Yn
      zPrev = k[6][ed.n - 1]
      puntos.push([x, ...Y, zPrev])
      if (Math.abs(Y[0]) > 1e8) return { puntos, parada: { x, motivo: 'la solución explota (|y| > 10⁸)' } }
    }
    const factor = Math.min(4, Math.max(0.2, 0.9 * Math.pow(err || 1e-10, -1 / 5)))
    h = dir * Math.min(hMax, Math.abs(h) * factor)
    if (Math.abs(h) < 1e-12 * (1 + Math.abs(x))) return { puntos, parada: { x, motivo: 'el paso se hace cero: la solución explota o es rígida' } }
  }
  return { puntos }
}

export interface Cond {
  k: number
  x0: number
  v: number
}

/**
 * Valores iniciales en el punto más a la izquierda que cumplen todas las
 * condiciones: directo si están todas en el mismo punto, por disparo (Newton
 * sobre los que faltan) si están repartidas.
 */
export function valoresIniciales(ed: EdoNum, conds: Cond[]): { x0: number; Y0: number[] } | { error: string } {
  if (conds.length !== ed.n) return { error: `hacen falta ${ed.n} condiciones (hay ${conds.length})` }
  const a = Math.min(...conds.map((c) => c.x0))
  const Y0: Array<number | null> = Array.from({ length: ed.n }, () => null)
  const lejos: Cond[] = []
  for (const c of conds) {
    if (c.k >= ed.n) return { error: `con orden ${ed.n} las condiciones llegan hasta y${"'".repeat(ed.n - 1)}` }
    if (c.x0 === a) {
      if (Y0[c.k] !== null) return { error: `y${"'".repeat(c.k)}(${a}) está dada dos veces` }
      Y0[c.k] = c.v
    } else lejos.push(c)
  }
  const libres = Y0.map((v, i) => (v === null ? i : -1)).filter((i) => i >= 0)
  if (!lejos.length) return { x0: a, Y0: Y0 as number[] }

  const disparo = (u: number[]) => {
    const Y = Y0.map((v, i) => (v === null ? u[libres.indexOf(i)] : v)) as number[]
    return lejos.map((c) => {
      const t = integrarEdo(ed, a, Y, c.x0, 1e-10)
      const fin = t.puntos[t.puntos.length - 1]
      return t.parada ? NaN : fin[1 + c.k] - c.v
    })
  }
  for (const ini of [0, 1, -1, 3, -3, 10]) {
    let u = libres.map(() => ini)
    for (let it = 0; it < 40; it++) {
      const r = disparo(u)
      if (!r.every(Number.isFinite)) break
      if (Math.max(...r.map(Math.abs)) < 1e-9) return { x0: a, Y0: Y0.map((v, i) => (v === null ? u[libres.indexOf(i)] : v)) as number[] }
      const J = r.map((_, i) =>
        u.map((_, j) => {
          const d = u.slice()
          const h = 1e-6 * (1 + Math.abs(u[j]))
          d[j] += h
          return (disparo(d)[i] - r[i]) / h
        }),
      )
      const paso = resolverLineal(J, r.map((v) => -v))
      if (!paso) break
      u = u.map((v, i) => v + paso[i])
    }
  }
  return { error: 'el disparo no converge: el problema de contorno puede no tener solución (o tener infinitas)' }
}

function resolverLineal(A: number[][], b: number[]): number[] | null {
  const n = A.length
  const M = A.map((f, i) => [...f, b[i]])
  for (let c = 0; c < n; c++) {
    let p = c
    for (let i = c + 1; i < n; i++) if (Math.abs(M[i][c]) > Math.abs(M[p][c])) p = i
    if (Math.abs(M[p][c]) < 1e-12) return null
    ;[M[c], M[p]] = [M[p], M[c]]
    for (let i = 0; i < n; i++) {
      if (i === c) continue
      const k = M[i][c] / M[c][c]
      for (let j = c; j <= n; j++) M[i][j] -= k * M[c][j]
    }
  }
  return M.map((f, i) => f[n] / f[i])
}

/** La solución en [xa, xb], integrando desde x0 hacia los dos lados. */
export function solucionEn(ed: EdoNum, x0: number, Y0: number[], xa: number, xb: number): { puntos: number[][]; paradas: Array<{ x: number; motivo: string }> } {
  const der = x0 < xb ? integrarEdo(ed, x0, Y0, xb) : { puntos: [] as number[][] }
  const izq = x0 > xa ? integrarEdo(ed, x0, Y0, xa) : { puntos: [] as number[][] }
  const paradas = [der, izq].flatMap((t) => ('parada' in t && t.parada ? [t.parada] : []))
  return { puntos: [...izq.puntos.slice(1).reverse(), ...der.puntos], paradas }
}
