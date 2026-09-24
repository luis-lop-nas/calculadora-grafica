/**
 * Muestreo de ψ(x,y,z) en una rejilla cúbica, isosuperficies por marching
 * tetrahedra y nube de puntos con |ψ|² como densidad.
 * Portado del artifact «Atlas de ψ».
 */
export interface Rejilla {
  f: Float32Array
  N: number
  L: number
}

export function construirRejilla(fn: (x: number, y: number, z: number) => number, L: number, N = 64): Rejilla {
  const f = new Float32Array(N * N * N)
  const h = (2 * L) / (N - 1)
  let p = 0
  for (let k = 0; k < N; k++) {
    const z = -L + k * h
    for (let j = 0; j < N; j++) {
      const y = -L + j * h
      for (let i = 0; i < N; i++) f[p++] = fn(-L + i * h, y, z)
    }
  }
  let mx = 0
  for (let i = 0; i < f.length; i++) {
    const a = Math.abs(f[i])
    if (a > mx) mx = a
  }
  if (mx > 0) for (let i = 0; i < f.length; i++) f[i] /= mx
  return { f, N, L }
}

/** Valor de |ψ| que encierra la fracción P de la probabilidad total. */
export function isoParaProbabilidad(g: Rejilla, P: number): number {
  const a = new Float32Array(g.f.length)
  let tot = 0
  for (let i = 0; i < a.length; i++) {
    a[i] = Math.abs(g.f[i])
    tot += a[i] * a[i]
  }
  a.sort()
  let acc = 0
  for (let i = a.length - 1; i >= 0; i--) {
    acc += a[i] * a[i]
    if (acc >= P * tot) return a[i]
  }
  return 0
}

const CO = [
  [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
  [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1],
]
const TETS = [
  [0, 5, 1, 6], [0, 1, 2, 6], [0, 2, 3, 6],
  [0, 3, 7, 6], [0, 7, 4, 6], [0, 4, 5, 6],
]

/** Isosuperficie de `sgn·ψ = iso` en el cubo físico [−L,L]³. */
export function marching(g: Rejilla, sgn: number, iso: number) {
  const { f, N } = g
  const pos: number[] = []
  const nor: number[] = []
  const idx = (i: number, j: number, k: number) => i + N * (j + N * k)
  const val = (i: number, j: number, k: number) => sgn * f[idx(i, j, k)]
  const cl = (v: number) => Math.min(N - 1, Math.max(0, v))
  const grad = (i: number, j: number, k: number) => [
    val(cl(i + 1), j, k) - val(cl(i - 1), j, k),
    val(i, cl(j + 1), k) - val(i, cl(j - 1), k),
    val(i, j, cl(k + 1)) - val(i, j, cl(k - 1)),
  ]
  const P: number[][] = new Array(8)
  const V = new Float32Array(8)
  const step = (2 * g.L) / (N - 1)
  type Nodo = { p: number[]; n: number[] }
  const edge = (a: number, b: number): Nodo => {
    const t = (iso - V[a]) / (V[b] - V[a])
    const pa = P[a]
    const pb = P[b]
    const ga = grad(pa[0], pa[1], pa[2])
    const gb = grad(pb[0], pb[1], pb[2])
    return {
      p: [0, 1, 2].map((c) => -g.L + (pa[c] + t * (pb[c] - pa[c])) * step),
      n: [0, 1, 2].map((c) => -(ga[c] + t * (gb[c] - ga[c]))),
    }
  }
  const tri = (A: Nodo, B: Nodo, C: Nodo) => {
    const u = [0, 1, 2].map((c) => B.p[c] - A.p[c])
    const v = [0, 1, 2].map((c) => C.p[c] - A.p[c])
    const cx = u[1] * v[2] - u[2] * v[1]
    const cy = u[2] * v[0] - u[0] * v[2]
    const cz = u[0] * v[1] - u[1] * v[0]
    const s = (A.n[0] + B.n[0] + C.n[0]) * cx + (A.n[1] + B.n[1] + C.n[1]) * cy + (A.n[2] + B.n[2] + C.n[2]) * cz
    for (const q of s < 0 ? [A, C, B] : [A, B, C]) {
      pos.push(q.p[0], q.p[1], q.p[2])
      const m = Math.hypot(q.n[0], q.n[1], q.n[2]) || 1
      nor.push(q.n[0] / m, q.n[1] / m, q.n[2] / m)
    }
  }
  for (let k = 0; k < N - 1; k++)
    for (let j = 0; j < N - 1; j++)
      for (let i = 0; i < N - 1; i++) {
        let mn = Infinity
        let mx = -Infinity
        for (let c = 0; c < 8; c++) {
          const o = CO[c]
          P[c] = [i + o[0], j + o[1], k + o[2]]
          V[c] = val(P[c][0], P[c][1], P[c][2])
          if (V[c] < mn) mn = V[c]
          if (V[c] > mx) mx = V[c]
        }
        if (mx < iso || mn >= iso) continue
        for (const T of TETS) {
          const ins = T.filter((q) => V[q] >= iso)
          const out = T.filter((q) => V[q] < iso)
          if (ins.length === 1) {
            const a = ins[0]
            tri(edge(a, out[0]), edge(a, out[1]), edge(a, out[2]))
          } else if (ins.length === 3) {
            const a = out[0]
            tri(edge(ins[0], a), edge(ins[1], a), edge(ins[2], a))
          } else if (ins.length === 2) {
            const [a, b] = ins
            const [c, d] = out
            const p1 = edge(a, c)
            const p2 = edge(a, d)
            const p3 = edge(b, d)
            const p4 = edge(b, c)
            tri(p1, p2, p3)
            tri(p1, p3, p4)
          }
        }
      }
  return { pos: new Float32Array(pos), nor: new Float32Array(nor) }
}

/** M puntos sorteados con probabilidad ∝ |ψ|², coloreados por el signo de ψ. */
export function nubeDeProbabilidad(
  g: Rejilla,
  M: number,
  cPos: { r: number; g: number; b: number },
  cNeg: { r: number; g: number; b: number },
) {
  const { f, N } = g
  const cum = new Float64Array(f.length)
  let t = 0
  for (let i = 0; i < f.length; i++) {
    t += f[i] * f[i]
    cum[i] = t
  }
  const pos = new Float32Array(M * 3)
  const col = new Float32Array(M * 3)
  const step = (2 * g.L) / (N - 1)
  for (let s = 0; s < M; s++) {
    const r = Math.random() * t
    let lo = 0
    let hi = f.length - 1
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (cum[mid] < r) lo = mid + 1
      else hi = mid
    }
    const i = lo % N
    const j = ((lo / N) | 0) % N
    const k = (lo / (N * N)) | 0
    pos[3 * s] = -g.L + (i + Math.random() - 0.5) * step
    pos[3 * s + 1] = -g.L + (j + Math.random() - 0.5) * step
    pos[3 * s + 2] = -g.L + (k + Math.random() - 0.5) * step
    const c = f[lo] >= 0 ? cPos : cNeg
    col[3 * s] = c.r
    col[3 * s + 1] = c.g
    col[3 * s + 2] = c.b
  }
  return { pos, col }
}
