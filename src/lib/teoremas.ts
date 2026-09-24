/**
 * Los teoremas integrales del cálculo vectorial, con sus dos lados calculados por separado:
 * Green (circulación y flujo en el plano), Stokes y Gauss. Las derivadas (rotacional, divergencia,
 * vectores tangentes y jacobianos) salen exactas del CAS; las integrales, de Gauss–Legendre.
 */
import { desdeNodo, prod, suma, MENOS, type E } from './cas/expr'
import { derivar } from './cas/derivar'
import { simplificar } from './cas/algebra'
import { compilarE } from './cas/compilar'
import { analizar } from './expresion'
import { gauss20 } from './especiales'

type F = (...x: number[]) => number

function leer(src: string, vars: string[]): E {
  return simplificar(desdeNodo(analizar(src, { variables: vars }), { funciones: {}, valores: {} }))
}

function compilarEn(e: E, vars: string[]): F {
  const f = compilarE(e, vars)
  const buf = new Float64Array(vars.length)
  return (...x: number[]) => {
    for (let i = 0; i < x.length; i++) buf[i] = x[i]
    return f(buf)
  }
}

const resta = (a: E, b: E) => simplificar(suma(a, prod(MENOS, b)))
const d = (e: E, v: string) => simplificar(derivar(e, v))

/* ── plano: F = (P, Q) y una curva cerrada r(t) ── */

export interface Plano {
  P: F
  Q: F
  rot: F
  div: F
  texRot: E
  texDiv: E
}

export function campoPlano(Psrc: string, Qsrc: string): Plano {
  const P = leer(Psrc, ['x', 'y'])
  const Q = leer(Qsrc, ['x', 'y'])
  const rot = resta(d(Q, 'x'), d(P, 'y'))
  const div = simplificar(suma(d(P, 'x'), d(Q, 'y')))
  const c = (e: E) => compilarEn(e, ['x', 'y'])
  return { P: c(P), Q: c(Q), rot: c(rot), div: c(div), texRot: rot, texDiv: div }
}

export interface Curva2 {
  x: F
  y: F
  dx: F
  dy: F
  t0: number
  t1: number
}

export function curvaPlana(xs: string, ys: string, t0: number, t1: number): Curva2 {
  const X = leer(xs, ['t'])
  const Y = leer(ys, ['t'])
  const c = (e: E) => compilarEn(e, ['t'])
  return { x: c(X), y: c(Y), dx: c(d(X, 't')), dy: c(d(Y, 't')), t0, t1 }
}

/** ∮ P dx + Q dy */
export function circulacionPlana(F: Plano, C: Curva2, tramos = 32): number {
  return gauss20((t) => {
    const x = C.x(t)
    const y = C.y(t)
    return F.P(x, y) * C.dx(t) + F.Q(x, y) * C.dy(t)
  }, C.t0, C.t1, tramos)
}

/** ∮ F·n ds con n ds = (y′, −x′) dt (normal exterior si la curva gira en sentido positivo). */
export function flujoPlano(F: Plano, C: Curva2, tramos = 32): number {
  return gauss20((t) => {
    const x = C.x(t)
    const y = C.y(t)
    return F.P(x, y) * C.dy(t) - F.Q(x, y) * C.dx(t)
  }, C.t0, C.t1, tramos)
}

/**
 * ∬_D g dA sobre la región estrellada respecto de c que encierra la curva:
 * (ρ, t) ↦ c + ρ (r(t) − c), con jacobiano ρ ((r − c) × r′). El signo sigue a la orientación.
 */
export function integralRegion(g: F, C: Curva2, c: [number, number], tramos = 24): number {
  return gauss20((t) => {
    const ax = C.x(t) - c[0]
    const ay = C.y(t) - c[1]
    const cr = ax * C.dy(t) - ay * C.dx(t)
    return gauss20((rho) => g(c[0] + rho * ax, c[1] + rho * ay) * rho * cr, 0, 1, 2)
  }, C.t0, C.t1, tramos)
}

/** ¿Es la región estrellada respecto de c? (el radio vector gira siempre en el mismo sentido) */
export function estrellada(C: Curva2, c: [number, number], n = 800): boolean {
  let signo = 0
  for (let i = 0; i < n; i++) {
    const t = C.t0 + ((C.t1 - C.t0) * (i + 0.5)) / n
    const cr = (C.x(t) - c[0]) * C.dy(t) - (C.y(t) - c[1]) * C.dx(t)
    if (Math.abs(cr) < 1e-12) continue
    if (!signo) signo = Math.sign(cr)
    else if (Math.sign(cr) !== signo) return false
  }
  return signo !== 0
}

export function centroide(C: Curva2, n = 400): [number, number] {
  let x = 0
  let y = 0
  for (let i = 0; i < n; i++) {
    const t = C.t0 + ((C.t1 - C.t0) * i) / n
    x += C.x(t)
    y += C.y(t)
  }
  return [x / n, y / n]
}

/* ── espacio: F = (P, Q, R) ── */

export interface Espacio {
  F: [F, F, F]
  rot: [F, F, F]
  div: F
  texRot: [E, E, E]
  texDiv: E
}

export function campoEspacio(Ps: string, Qs: string, Rs: string): Espacio {
  const v = ['x', 'y', 'z']
  const [P, Q, R] = [Ps, Qs, Rs].map((s) => leer(s, v))
  const rot: [E, E, E] = [resta(d(R, 'y'), d(Q, 'z')), resta(d(P, 'z'), d(R, 'x')), resta(d(Q, 'x'), d(P, 'y'))]
  const div = simplificar(suma(d(P, 'x'), d(Q, 'y'), d(R, 'z')))
  const c = (e: E) => compilarEn(e, v)
  return { F: [c(P), c(Q), c(R)], rot: rot.map(c) as [F, F, F], div: c(div), texRot: rot, texDiv: div }
}

/** Una parametrización r(u, v) o r(u, v, w) con sus derivadas parciales exactas. */
export interface Param {
  r: [F, F, F]
  /** dr[k][i] = ∂rᵢ/∂(k-ésimo parámetro) */
  dr: Array<[F, F, F]>
  rangos: Array<[number, number]>
}

export function parametrizacion(src: [string, string, string], params: string[], rangos: Array<[number, number]>): Param {
  const R = src.map((s) => leer(s, params))
  const c = (e: E) => compilarEn(e, params)
  return { r: R.map(c) as [F, F, F], dr: params.map((p) => R.map((e) => c(d(e, p))) as [F, F, F]), rangos }
}

const cruz = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const ev = (fs: [F, F, F], ...x: number[]) => [fs[0](...x), fs[1](...x), fs[2](...x)]
const pto = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

/** ∬_S (∇ × F)·(r_u × r_v) du dv */
export function flujoRotacional(E3: Espacio, S: Param, tramos = 8): number {
  const [[u0, u1], [v0, v1]] = S.rangos
  return gauss20((u) => gauss20((v) => {
    const p = ev(S.r, u, v)
    const n = cruz(ev(S.dr[0], u, v), ev(S.dr[1], u, v))
    return pto(ev(E3.rot, p[0], p[1], p[2]), n)
  }, v0, v1, tramos), u0, u1, tramos)
}

/** ∮ F·dr por el borde del rectángulo de parámetros, en sentido positivo en (u, v). */
export function circulacionBorde(E3: Espacio, S: Param, tramos = 16): number {
  const [[u0, u1], [v0, v1]] = S.rangos
  const tramo = (fija: 'u' | 'v', valor: number, a: number, b: number) => {
    const k = fija === 'u' ? 1 : 0
    return gauss20((s) => {
      const [u, v] = fija === 'u' ? [valor, s] : [s, valor]
      const p = ev(S.r, u, v)
      return pto(ev(E3.F, p[0], p[1], p[2]), ev(S.dr[k], u, v))
    }, a, b, tramos)
  }
  return tramo('v', v0, u0, u1) + tramo('u', u1, v0, v1) - tramo('v', v1, u0, u1) - tramo('u', u0, v0, v1)
}

/** ∭ ∇·F det J du dv dw */
export function integralDivergencia(E3: Espacio, V: Param, tramos = 4): number {
  const [[u0, u1], [v0, v1], [w0, w1]] = V.rangos
  return gauss20((u) => gauss20((v) => gauss20((w) => {
    const p = ev(V.r, u, v, w)
    const J = pto(ev(V.dr[0], u, v, w), cruz(ev(V.dr[1], u, v, w), ev(V.dr[2], u, v, w)))
    return E3.div(p[0], p[1], p[2]) * J
  }, w0, w1, tramos), v0, v1, tramos), u0, u1, tramos)
}

/** ∯ F·dS por las seis caras de la caja de parámetros (normales r_v × r_w, r_w × r_u, r_u × r_v). */
export function flujoCerrado(E3: Espacio, V: Param, tramos = 8): number {
  const rs = V.rangos
  let total = 0
  for (let k = 0; k < 3; k++) {
    const [a, b] = [(k + 1) % 3, (k + 2) % 3]
    for (const [valor, signo] of [[rs[k][1], 1], [rs[k][0], -1]] as const) {
      total += signo * gauss20((s) => gauss20((q) => {
        const x = [0, 0, 0]
        x[k] = valor
        x[a] = s
        x[b] = q
        const p = ev(V.r, x[0], x[1], x[2])
        const n = cruz(ev(V.dr[a], x[0], x[1], x[2]), ev(V.dr[b], x[0], x[1], x[2]))
        return pto(ev(E3.F, p[0], p[1], p[2]), n)
      }, rs[b][0], rs[b][1], tramos), rs[a][0], rs[a][1], tramos)
    }
  }
  return total
}
