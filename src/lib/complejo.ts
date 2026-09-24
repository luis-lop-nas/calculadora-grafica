export type C = [number, number]

export const c = (re: number, im = 0): C => [re, im]
export const suma = (a: C, b: C): C => [a[0] + b[0], a[1] + b[1]]
export const resta = (a: C, b: C): C => [a[0] - b[0], a[1] - b[1]]
export const mul = (a: C, b: C): C => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]]
export const div = (a: C, b: C): C => {
  const d = b[0] * b[0] + b[1] * b[1]
  return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]
}
export const abs2 = (a: C) => a[0] * a[0] + a[1] * a[1]
export const abs = (a: C) => Math.hypot(a[0], a[1])
export const arg = (a: C) => Math.atan2(a[1], a[0])
export const exp = (a: C): C => {
  const r = Math.exp(a[0])
  return [r * Math.cos(a[1]), r * Math.sin(a[1])]
}
export const sqrt = (a: C): C => {
  const r = Math.sqrt(abs(a))
  const t = arg(a) / 2
  return [r * Math.cos(t), r * Math.sin(t)]
}
export const cos = (a: C): C => [Math.cos(a[0]) * Math.cosh(a[1]), -Math.sin(a[0]) * Math.sinh(a[1])]
export const sin = (a: C): C => [Math.sin(a[0]) * Math.cosh(a[1]), Math.cos(a[0]) * Math.sinh(a[1])]

/** Resuelve M z = b por eliminación gaussiana con pivoteo parcial. */
export function resolver(M: C[][], b: C[]): C[] {
  const n = b.length
  if (M.length !== n || M.some((fila) => fila.length !== n)) throw new Error('sistema complejo mal dimensionado')
  const A = M.map((f, i) => [...f.map((v) => [...v] as C), [...b[i]] as C])
  for (let col = 0; col < n; col++) {
    let mejor = col
    for (let i = col; i < n; i++) if (abs(A[i][col]) > abs(A[mejor][col])) mejor = i
    ;[A[col], A[mejor]] = [A[mejor], A[col]]
    const p = A[col][col]
    if (abs(p) < 1e-14) throw new Error('sistema complejo singular o incompatible')
    for (let j = col; j <= n; j++) A[col][j] = div(A[col][j], p)
    for (let i = 0; i < n; i++) {
      if (i === col) continue
      const f = A[i][col]
      if (abs(f) < 1e-15) continue
      for (let j = col; j <= n; j++) A[i][j] = resta(A[i][j], mul(f, A[col][j]))
    }
  }
  return A.map((f) => f[n])
}
