/**
 * Óptica geométrica: sistemas de lentes delgadas con matrices ABCD (rayo = (y, θ) paraxial),
 * trazado exacto en un espejo esférico y desviación por un prisma.
 */

export type M2 = [[number, number], [number, number]]

export const traslacion = (d: number): M2 => [[1, d], [0, 1]]
export const lente = (f: number): M2 => [[1, 0], [-1 / f, 1]]
export const mul = (a: M2, b: M2): M2 => [
  [a[0][0] * b[0][0] + a[0][1] * b[1][0], a[0][0] * b[0][1] + a[0][1] * b[1][1]],
  [a[1][0] * b[0][0] + a[1][1] * b[1][0], a[1][0] * b[0][1] + a[1][1] * b[1][1]],
]
export const det = (m: M2) => m[0][0] * m[1][1] - m[0][1] * m[1][0]
export const aplicar = (m: M2, [y, t]: [number, number]): [number, number] => [m[0][0] * y + m[0][1] * t, m[1][0] * y + m[1][1] * t]

export interface Lente {
  z: number
  f: number
}

/** Matriz desde el plano z₀ hasta justo después de la última lente (las lentes, ordenadas por z). */
export function matrizSistema(lentes: Lente[], z0: number): M2 {
  const ls = [...lentes].sort((a, b) => a.z - b.z).filter((l) => l.z > z0)
  let M: M2 = [[1, 0], [0, 1]]
  let z = z0
  for (const l of ls) {
    M = mul(lente(l.f), mul(traslacion(l.z - z), M))
    z = l.z
  }
  return M
}

/** Matriz entre la primera y la última lente (incluidas): de ella salen focal y planos principales. */
export function matrizLentes(lentes: Lente[]): M2 {
  const ls = [...lentes].sort((a, b) => a.z - b.z)
  let M: M2 = lente(ls[0].f)
  for (let i = 1; i < ls.length; i++) M = mul(lente(ls[i].f), mul(traslacion(ls[i].z - ls[i - 1].z), M))
  return M
}

/**
 * Imagen de un objeto en z₀: tras la última lente hay que recorrer d = −B/D para que B′ = 0
 * (todos los rayos del punto objeto se cortan). Aumento lateral m = A + dC = 1/D si det = 1.
 */
export function imagen(lentes: Lente[], z0: number): { z: number; m: number; real: boolean } {
  const ls = [...lentes].sort((a, b) => a.z - b.z)
  const M = matrizSistema(ls, z0)
  const d = -M[0][1] / M[1][1]
  const zUltima = ls.filter((l) => l.z > z0).at(-1)?.z ?? z0
  return { z: zUltima + d, m: M[0][0] + d * M[1][0], real: d > 0 }
}

/** Focal efectiva, distancia focal posterior (desde la última lente) y anterior (antes de la primera). */
export function focales(lentes: Lente[]) {
  const M = matrizLentes(lentes)
  const C = M[1][0]
  return { f: -1 / C, posterior: -M[0][0] / C, anterior: -M[1][1] / C }
}

/** Trayectoria de un rayo (y, θ) que sale de z₀ hasta zFin: lista de vértices. */
export function trazar(lentes: Lente[], z0: number, rayo: [number, number], zFin: number): Array<[number, number]> {
  const ls = [...lentes].sort((a, b) => a.z - b.z).filter((l) => l.z > z0 && l.z < zFin)
  const pts: Array<[number, number]> = [[z0, rayo[0]]]
  let r = rayo
  let z = z0
  for (const l of ls) {
    r = aplicar(traslacion(l.z - z), r)
    pts.push([l.z, r[0]])
    r = aplicar(lente(l.f), r)
    z = l.z
  }
  r = aplicar(traslacion(zFin - z), r)
  pts.push([zFin, r[0]])
  return pts
}

/* ── espejo esférico cóncavo: vértice en z = 0, centro en z = −R; la luz llega desde z < 0 ── */

/** Rayo paralelo al eje a altura h: punto de impacto y dirección reflejada (trazado exacto). */
export function reflejoEsferico(R: number, h: number): { p: [number, number]; d: [number, number] } | null {
  if (Math.abs(h) >= R) return null
  // superficie: (z + R)² + y² = R², rama del vértice; la normal apunta al centro
  const z = -R + Math.sqrt(R * R - h * h)
  const n: [number, number] = [(-R - z) / R, -h / R]
  const u: [number, number] = [1, 0]
  const k = 2 * (u[0] * n[0] + u[1] * n[1])
  return { p: [z, h], d: [u[0] - k * n[0], u[1] - k * n[1]] }
}

/** Punto donde el rayo reflejado corta el eje. Cerrado: −(R − R/(2 cos α)), sin α = h/R; paraxial −R/2. */
export function corteEje(R: number, h: number): number {
  const r = reflejoEsferico(R, h)
  if (!r || Math.abs(r.d[1]) < 1e-300) return NaN
  return r.p[0] - (r.p[1] * r.d[0]) / r.d[1]
}

/* ── prisma de ángulo A e índice n ── */

/** Desviación total para incidencia θ₁ (null si hay reflexión total en la segunda cara). */
export function desviacionPrisma(A: number, n: number, t1: number): number | null {
  const t1p = Math.asin(Math.sin(t1) / n)
  const t2 = A - t1p
  const s = n * Math.sin(t2)
  if (Math.abs(s) > 1) return null
  return t1 + Math.asin(s) - A
}

/** Mínima desviación de la fórmula: n = sin((A + δ)/2)/sin(A/2). */
export const desviacionMinima = (A: number, n: number) => 2 * Math.asin(n * Math.sin(A / 2)) - A

/** Índice de Cauchy n(λ) = a + b/λ² (λ en μm), valores de un vidrio crown BK7 aproximado. */
export const cauchy = (lambdaNm: number, a = 1.5046, b = 0.0042) => a + b / (lambdaNm / 1000) ** 2
