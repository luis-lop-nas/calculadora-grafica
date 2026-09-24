/**
 * Magnetostática: campo de Biot–Savart de una curva con corriente I, en unidades con μ₀ = 1.
 * B = (I/4π) ∮ dl × (r − r′)/|r − r′|³.
 */
import { gauss20 } from './especiales'

export type P3 = [number, number, number]

const cruz = (a: P3, b: P3): P3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const punto = (a: P3, b: P3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const norma = (a: P3) => Math.sqrt(punto(a, a))

/** Muestrea la curva en N tramos rectos. */
export function poligonal(r: (s: number) => P3, a: number, b: number, N: number): P3[] {
  return Array.from({ length: N + 1 }, (_, i) => r(a + ((b - a) * i) / N))
}

/**
 * Campo de un tramo recto de A a B (forma cerrada):
 * B = (I/4π) (a × b)(|a| + |b|) / (|a||b|(|a||b| + a·b)), con a = A − P, b = B − P.
 */
export function campoTramo(A: P3, B: P3, P: P3, I: number): P3 {
  const a: P3 = [A[0] - P[0], A[1] - P[1], A[2] - P[2]]
  const b: P3 = [B[0] - P[0], B[1] - P[1], B[2] - P[2]]
  const na = norma(a)
  const nb = norma(b)
  const den = na * nb * (na * nb + punto(a, b))
  if (!(den > 1e-300)) return [0, 0, 0]
  const k = (I / (4 * Math.PI)) * ((na + nb) / den)
  const c = cruz(a, b)
  return [k * c[0], k * c[1], k * c[2]]
}

export function campoPoligonal(pts: P3[], P: P3, I: number): P3 {
  const B: P3 = [0, 0, 0]
  for (let i = 0; i + 1 < pts.length; i++) {
    const d = campoTramo(pts[i], pts[i + 1], P, I)
    B[0] += d[0]
    B[1] += d[1]
    B[2] += d[2]
  }
  return B
}

/** Segundo método: Biot–Savart sobre la curva lisa con Gauss–Legendre (dr/ds por diferencias centradas de cuarto orden). */
export function campoCuadratura(r: (s: number) => P3, a: number, b: number, P: P3, I: number, tramos = 64): P3 {
  const h = 3e-4 * (b - a)
  const comp = (k: number) =>
    gauss20(
      (s) => {
        const p = r(s)
        const [m2, m1, p1, p2] = [r(s - 2 * h), r(s - h), r(s + h), r(s + 2 * h)]
        const dl = [0, 1, 2].map((j) => (m2[j] - 8 * m1[j] + 8 * p1[j] - p2[j]) / (12 * h)) as P3
        const d: P3 = [P[0] - p[0], P[1] - p[1], P[2] - p[2]]
        const n = norma(d)
        return cruz(dl, d)[k] / (n * n * n)
      },
      a,
      b,
      tramos,
    )
  const f = I / (4 * Math.PI)
  return [f * comp(0), f * comp(1), f * comp(2)]
}

/** Circulación de B por la circunferencia de centro C, radio ρ, en el plano de normal n. Ampère: μ₀ I_enl. */
export function circulacion(B: (p: P3) => P3, C: P3, rho: number, n: P3, tramos = 16): number {
  const nn = norma(n)
  const w: P3 = [n[0] / nn, n[1] / nn, n[2] / nn]
  // base ortonormal (u, v) del plano, con u × v = w
  const aux: P3 = Math.abs(w[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]
  const u0 = cruz(aux, w)
  const u: P3 = u0.map((x) => x / norma(u0)) as P3
  const v = cruz(w, u)
  return gauss20(
    (t) => {
      const c = Math.cos(t)
      const s = Math.sin(t)
      const p: P3 = [C[0] + rho * (c * u[0] + s * v[0]), C[1] + rho * (c * u[1] + s * v[1]), C[2] + rho * (c * u[2] + s * v[2])]
      const dl: P3 = [rho * (-s * u[0] + c * v[0]), rho * (-s * u[1] + c * v[1]), rho * (-s * u[2] + c * v[2])]
      return punto(B(p), dl)
    },
    0,
    2 * Math.PI,
    tramos,
  )
}

/** Línea de B desde p0 (RK4 sobre la dirección); se corta al volver cerca del inicio o salir de la caja. */
export function lineaB(B: (p: P3) => P3, p0: P3, h: number, caja: number, maxPasos = 1500): P3[] {
  const dir = (p: P3): P3 => {
    const b = B(p)
    const n = norma(b)
    return n > 0 ? [b[0] / n, b[1] / n, b[2] / n] : [0, 0, 0]
  }
  const pts: P3[] = [p0]
  let p = p0
  for (let i = 0; i < maxPasos; i++) {
    const k1 = dir(p)
    const k2 = dir([p[0] + (h / 2) * k1[0], p[1] + (h / 2) * k1[1], p[2] + (h / 2) * k1[2]])
    const k3 = dir([p[0] + (h / 2) * k2[0], p[1] + (h / 2) * k2[1], p[2] + (h / 2) * k2[2]])
    const k4 = dir([p[0] + h * k3[0], p[1] + h * k3[1], p[2] + h * k3[2]])
    p = [0, 1, 2].map((j) => p[j] + (h / 6) * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j])) as P3
    pts.push(p)
    if (i > 20 && norma([p[0] - p0[0], p[1] - p0[1], p[2] - p0[2]]) < 0.7 * h) {
      pts.push(p0)
      break
    }
    if (Math.max(Math.abs(p[0]), Math.abs(p[1]), Math.abs(p[2])) > caja) break
  }
  return pts
}
