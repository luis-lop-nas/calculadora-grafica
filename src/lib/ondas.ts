/**
 * Ondas: elipse de polarización y parámetros de Stokes, coeficientes de Fresnel (con reflexión
 * total, en complejos) y paquetes con una relación de dispersión cualquiera.
 */
import { gauss20 } from './especiales'
import { desdeNodo } from './cas/expr'
import { derivar } from './cas/derivar'
import { simplificar } from './cas/algebra'
import { compilarE } from './cas/compilar'
import { analizar } from './expresion'

/* ── polarización: Ex = a cos(kz − ωt), Ey = b cos(kz − ωt + δ) ── */

export interface Elipse {
  /** orientación del eje mayor respecto de x, en (−π/2, π/2] */
  psi: number
  /** elipticidad: tan χ = ±b/a de la elipse, en [−π/4, π/4]; χ > 0 si S₃ > 0 */
  chi: number
  semiMayor: number
  semiMenor: number
  S: [number, number, number, number]
}

export function elipse(a: number, b: number, delta: number): Elipse {
  const S0 = a * a + b * b
  const S1 = a * a - b * b
  const S2 = 2 * a * b * Math.cos(delta)
  const S3 = 2 * a * b * Math.sin(delta)
  const psi = 0.5 * Math.atan2(S2, S1)
  const chi = 0.5 * Math.asin(Math.max(-1, Math.min(1, S0 > 0 ? S3 / S0 : 0)))
  const r = Math.sqrt(S0)
  return { psi, chi, semiMayor: r * Math.cos(chi), semiMenor: r * Math.abs(Math.sin(chi)), S: [S0, S1, S2, S3] }
}

/** Campo en z = 0 a tiempo t (ω = 1): la punta recorre la elipse. */
export const campoPolarizado = (a: number, b: number, delta: number, fase: number): [number, number] => [a * Math.cos(fase), b * Math.cos(fase + delta)]

/* ── Fresnel ── */

type C = [number, number]
const cmul = (x: C, y: C): C => [x[0] * y[0] - x[1] * y[1], x[0] * y[1] + x[1] * y[0]]
const cdiv = (x: C, y: C): C => {
  const d = y[0] * y[0] + y[1] * y[1]
  return [(x[0] * y[0] + x[1] * y[1]) / d, (x[1] * y[0] - x[0] * y[1]) / d]
}
const cabs2 = (x: C) => x[0] * x[0] + x[1] * x[1]

export interface Fresnel {
  rs: C
  rp: C
  ts: C
  tp: C
  Rs: number
  Rp: number
  Ts: number
  Tp: number
  /** reflexión total interna */
  total: boolean
  thetaT: number
}

/**
 * Coeficientes de amplitud (convención de Hecht para p: r_p = (n₂cos θᵢ − n₁cos θₜ)/(n₂cos θᵢ + n₁cos θₜ)).
 * Con reflexión total cos θₜ es imaginario puro (onda evanescente) y T = 0.
 */
export function fresnel(n1: number, n2: number, ti: number): Fresnel {
  const ci = Math.cos(ti)
  const st = (n1 / n2) * Math.sin(ti)
  const total = st > 1
  // cos θₜ = √(1 − sin²θₜ), rama con parte imaginaria positiva (evanescente que decae)
  const ct: C = total ? [0, Math.sqrt(st * st - 1)] : [Math.sqrt(1 - st * st), 0]
  const a: C = [n1 * ci, 0]
  const b: C = [n2 * ct[0], n2 * ct[1]]
  const c: C = [n2 * ci, 0]
  const d: C = [n1 * ct[0], n1 * ct[1]]
  const rs = cdiv([a[0] - b[0], a[1] - b[1]], [a[0] + b[0], a[1] + b[1]])
  const rp = cdiv([c[0] - d[0], c[1] - d[1]], [c[0] + d[0], c[1] + d[1]])
  const ts = cdiv([2 * n1 * ci, 0], [a[0] + b[0], a[1] + b[1]])
  const tp = cdiv([2 * n1 * ci, 0], [c[0] + d[0], c[1] + d[1]])
  const factor = total ? 0 : (n2 * ct[0]) / (n1 * ci)
  return { rs, rp, ts, tp, Rs: cabs2(rs), Rp: cabs2(rp), Ts: factor * cabs2(ts), Tp: factor * cabs2(tp), total, thetaT: total ? NaN : Math.asin(st) }
}

export const brewster = (n1: number, n2: number) => Math.atan2(n2, n1)
export const critico = (n1: number, n2: number) => (n2 < n1 ? Math.asin(n2 / n1) : NaN)

/** Fase del coeficiente complejo (para la reflexión total). */
export const fase = (z: C) => Math.atan2(z[1], z[0])
export { cmul }

/* ── paquetes: ψ(x, t) = ∫ A(k) e^{i(kx − ω(k)t)} dk con A gaussiana ── */

export function paquete(omega: (k: number) => number, k0: number, sk: number, x: number, t: number): C {
  let re = 0
  let im = 0
  const f = (k: number, parte: 0 | 1) => {
    const A = Math.exp(-((k - k0) ** 2) / (2 * sk * sk))
    const fi = k * x - omega(k) * t
    return A * (parte ? Math.sin(fi) : Math.cos(fi))
  }
  re = gauss20((k) => f(k, 0), k0 - 7 * sk, k0 + 7 * sk, 14)
  im = gauss20((k) => f(k, 1), k0 - 7 * sk, k0 + 7 * sk, 14)
  return [re, im]
}

/** Máximo de |ψ(·, t)| cerca de x₀ por sección áurea (la envolvente es unimodal cerca del pico). */
export function picoEnvolvente(omega: (k: number) => number, k0: number, sk: number, t: number, x0: number, ancho: number): number {
  const g = (Math.sqrt(5) - 1) / 2
  let a = x0 - ancho
  let b = x0 + ancho
  const m = (x: number) => cabs2(paquete(omega, k0, sk, x, t))
  for (let i = 0; i < 90; i++) {
    const x1 = b - g * (b - a)
    const x2 = a + g * (b - a)
    if (m(x1) > m(x2)) b = x2
    else a = x1
  }
  return (a + b) / 2
}

/** ω(k) escrita y su derivada exacta (CAS): velocidad de fase ω/k y de grupo dω/dk. */
export function dispersion(src: string): { w: (k: number) => number; dw: (k: number) => number } {
  const e = simplificar(desdeNodo(analizar(src, { variables: ['k'] }), { funciones: {}, valores: {} }))
  const f = compilarE(e, ['k'])
  const df = compilarE(simplificar(derivar(e, 'k')), ['k'])
  const buf = new Float64Array(1)
  return {
    w: (k) => ((buf[0] = k), f(buf)),
    dw: (k) => ((buf[0] = k), df(buf)),
  }
}
