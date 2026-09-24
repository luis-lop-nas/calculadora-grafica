export type Mat = number[][]
export type Vec = number[]

export const mul = (A: Mat, B: Mat): Mat =>
  A.map((f) => B[0].map((_, j) => f.reduce((s, v, k) => s + v * B[k][j], 0)))

export const aplicar = (A: Mat, v: Vec): Vec => A.map((f) => f.reduce((s, a, i) => s + a * v[i], 0))

export const transpuesta = (A: Mat): Mat => A[0].map((_, j) => A.map((f) => f[j]))

export const det = (A: Mat): number => {
  const n = A.length
  if (n === 1) return A[0][0]
  if (n === 2) return A[0][0] * A[1][1] - A[0][1] * A[1][0]
  if (n === 3)
    return (
      A[0][0] * (A[1][1] * A[2][2] - A[1][2] * A[2][1]) -
      A[0][1] * (A[1][0] * A[2][2] - A[1][2] * A[2][0]) +
      A[0][2] * (A[1][0] * A[2][1] - A[1][1] * A[2][0])
    )
  throw new Error('det solo hasta 3×3')
}

export const traza = (A: Mat): number => A.reduce((s, f, i) => s + f[i], 0)

export const norma = (v: Vec) => Math.hypot(...v)

export const escalar = (v: Vec, k: number): Vec => v.map((c) => c * k)

export const suma = (a: Vec, b: Vec): Vec => a.map((c, i) => c + b[i])

export const producto = (a: Vec, b: Vec) => a.reduce((s, c, i) => s + c * b[i], 0)

export const cruz = (a: Vec, b: Vec): Vec => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]

/** Forma escalonada reducida; devuelve también los pivotes. */
export function rref(A: Mat): { R: Mat; pivotes: number[] } {
  const R = A.map((f) => f.slice())
  const m = R.length
  const n = R[0].length
  const pivotes: number[] = []
  let fila = 0
  for (let col = 0; col < n && fila < m; col++) {
    let mejor = fila
    for (let i = fila; i < m; i++) if (Math.abs(R[i][col]) > Math.abs(R[mejor][col])) mejor = i
    if (Math.abs(R[mejor][col]) < 1e-10) continue
    ;[R[fila], R[mejor]] = [R[mejor], R[fila]]
    const p = R[fila][col]
    for (let j = 0; j < n; j++) R[fila][j] /= p
    for (let i = 0; i < m; i++) {
      if (i === fila) continue
      const f = R[i][col]
      if (!f) continue
      for (let j = 0; j < n; j++) R[i][j] -= f * R[fila][j]
    }
    pivotes.push(col)
    fila++
  }
  for (const f of R) for (let j = 0; j < n; j++) if (Math.abs(f[j]) < 1e-12) f[j] = 0
  return { R, pivotes }
}

export const rango = (A: Mat) => rref(A).pivotes.length

/** Base del núcleo a partir de la escalonada reducida. */
export function nucleo(A: Mat): Vec[] {
  const n = A[0].length
  const { R, pivotes } = rref(A)
  const libres = [...Array(n).keys()].filter((j) => !pivotes.includes(j))
  return libres.map((l) => {
    const v = new Array(n).fill(0)
    v[l] = 1
    pivotes.forEach((p, i) => {
      v[p] = -R[i][l]
    })
    return v
  })
}

export interface Autovalor {
  re: number
  im: number
  vector?: Vec
}

/** Autovalores (y autovectores reales) de una 2×2. */
export function auto2(A: Mat): Autovalor[] {
  const t = traza(A)
  const d = det(A)
  const disc = t * t - 4 * d
  if (disc >= 0) {
    const r = Math.sqrt(disc)
    return [(t + r) / 2, (t - r) / 2].map((l) => ({ re: l, im: 0, vector: autovector2(A, l) }))
  }
  const r = Math.sqrt(-disc) / 2
  return [
    { re: t / 2, im: r },
    { re: t / 2, im: -r },
  ]
}

function autovector2(A: Mat, l: number): Vec {
  const [a, b] = A[0]
  const [c, d] = A[1]
  const v: Vec = Math.abs(b) > 1e-9 ? [b, l - a] : Math.abs(c) > 1e-9 ? [l - d, c] : [1, 0]
  const n = norma(v) || 1
  return [v[0] / n, v[1] / n]
}

/** Clasificación del punto de equilibrio de x' = A x. */
export function clasificar(A: Mat): { nombre: string; estable: 'estable' | 'inestable' | 'neutro' } {
  const t = traza(A)
  const d = det(A)
  const disc = t * t - 4 * d
  if (Math.abs(d) < 1e-9) {
    if (t > 1e-9) return { nombre: 'degenerado inestable (λ = 0 y λ > 0)', estable: 'inestable' }
    if (t < -1e-9) return { nombre: 'degenerado estable (λ = 0 y λ < 0)', estable: 'estable' }
    const tam = A.reduce((s, f) => s + f.reduce((q, v) => q + v * v, 0), 0)
    return tam < 1e-18
      ? { nombre: 'equilibrio completamente neutro', estable: 'neutro' }
      : { nombre: 'degenerado inestable (bloque nilpotente)', estable: 'inestable' }
  }
  if (d < 0) return { nombre: 'punto de silla', estable: 'inestable' }
  if (disc < 0) {
    if (Math.abs(t) < 1e-9) return { nombre: 'centro', estable: 'neutro' }
    return t < 0
      ? { nombre: 'foco estable (espiral)', estable: 'estable' }
      : { nombre: 'foco inestable (espiral)', estable: 'inestable' }
  }
  if (Math.abs(disc) < 1e-9)
    return t < 0
      ? { nombre: 'nodo impropio estable', estable: 'estable' }
      : { nombre: 'nodo impropio inestable', estable: 'inestable' }
  return t < 0
    ? { nombre: 'nodo estable', estable: 'estable' }
    : { nombre: 'nodo inestable', estable: 'inestable' }
}

/** Autovalores reales de una 3×3 por las raíces del polinomio característico. */
export function autovalores3(A: Mat): number[] {
  // λ³ − c2 λ² + c1 λ − c0
  const c2 = traza(A)
  const c1 =
    A[0][0] * A[1][1] - A[0][1] * A[1][0] +
    A[0][0] * A[2][2] - A[0][2] * A[2][0] +
    A[1][1] * A[2][2] - A[1][2] * A[2][1]
  const c0 = det(A)
  return raicesCubica(1, -c2, c1, -c0)
}

/** Raíces reales de a x³ + b x² + c x + d. */
export function raicesCubica(a: number, b: number, c: number, d: number): number[] {
  if (Math.abs(a) < 1e-12) return raicesCuadratica(b, c, d)
  const p = (3 * a * c - b * b) / (3 * a * a)
  const q = (2 * b ** 3 - 9 * a * b * c + 27 * a * a * d) / (27 * a ** 3)
  const desp = -b / (3 * a)
  const disc = (q * q) / 4 + (p * p * p) / 27
  if (disc > 1e-12) {
    const s = Math.cbrt(-q / 2 + Math.sqrt(disc)) + Math.cbrt(-q / 2 - Math.sqrt(disc))
    return [s + desp]
  }
  if (Math.abs(p) < 1e-12) return [desp]
  const r = 2 * Math.sqrt(-p / 3)
  // t_k = 2√(−p/3)·cos[(1/3)·arccos(3q/(2p)·√(−3/p)) − 2πk/3]
  const fi = Math.acos(Math.max(-1, Math.min(1, (3 * q) / (p * r))))
  return [0, 1, 2].map((k) => r * Math.cos((fi - 2 * Math.PI * k) / 3) + desp).sort((x, y) => x - y)
}

export function raicesCuadratica(a: number, b: number, c: number): number[] {
  if (Math.abs(a) < 1e-12) return Math.abs(b) < 1e-12 ? [] : [-c / b]
  const disc = b * b - 4 * a * c
  if (disc < 0) return []
  const r = Math.sqrt(disc)
  return [(-b - r) / (2 * a), (-b + r) / (2 * a)].sort((x, y) => x - y)
}

/** Autovector real asociado a λ, por el núcleo de (A − λI). */
export function autovector(A: Mat, l: number): Vec | null {
  const M = A.map((f, i) => f.map((v, j) => v - (i === j ? l : 0)))
  const k = nucleo(M)
  if (!k.length) return null
  const v = k[0]
  const nn = norma(v) || 1
  return v.map((c) => c / nn)
}

/** Gram-Schmidt: devuelve una base ortonormal del subespacio generado. */
export function gramSchmidt(vs: Vec[]): Vec[] {
  const out: Vec[] = []
  for (const v of vs) {
    let w = v.slice()
    for (const u of out) {
      const p = producto(w, u)
      w = w.map((c, i) => c - p * u[i])
    }
    const n = norma(w)
    if (n > 1e-9) out.push(w.map((c) => c / n))
  }
  return out
}

/** Proyección ortogonal de v sobre el subespacio de base ortonormal `base`. */
export function proyectar(v: Vec, base: Vec[]): Vec {
  const out = new Array(v.length).fill(0)
  for (const u of base) {
    const p = producto(v, u)
    for (let i = 0; i < v.length; i++) out[i] += p * u[i]
  }
  return out
}
