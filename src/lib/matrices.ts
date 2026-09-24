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
  // diagonal: el autovector de λ = a es e₁ y el de λ = d, e₂
  const v: Vec = Math.abs(b) > 1e-9 ? [b, l - a] : Math.abs(c) > 1e-9 ? [l - d, c] : Math.abs(l - a) <= Math.abs(l - d) ? [1, 0] : [0, 1]
  const n = norma(v) || 1
  return [v[0] / n, v[1] / n]
}

/**
 * Clasificación del punto de equilibrio de x' = A x. `tol` es lo que se considera
 * cero: con un jacobiano de diferencias finitas en un equilibrio hallado
 * numéricamente conviene más holgura que con una matriz escrita a mano.
 */
export function clasificar(A: Mat, tol = 1e-9): { nombre: string; estable: 'estable' | 'inestable' | 'neutro' } {
  const t = traza(A)
  const d = det(A)
  const disc = t * t - 4 * d
  const escala = Math.max(1, ...A.flat().map(Math.abs))
  const [tolD, tolT] = [tol * escala * escala, tol * escala]
  if (Math.abs(d) < tolD) {
    if (t > tolT) return { nombre: 'degenerado inestable (λ = 0 y λ > 0)', estable: 'inestable' }
    if (t < -tolT) return { nombre: 'degenerado estable (λ = 0 y λ < 0)', estable: 'estable' }
    const tam = A.reduce((s, f) => s + f.reduce((q, v) => q + v * v, 0), 0)
    return tam < 1e-18
      ? { nombre: 'equilibrio completamente neutro', estable: 'neutro' }
      : { nombre: 'degenerado inestable (bloque nilpotente)', estable: 'inestable' }
  }
  if (d < 0) return { nombre: 'punto de silla', estable: 'inestable' }
  if (disc < 0) {
    if (Math.abs(t) < tolT) return { nombre: 'centro', estable: 'neutro' }
    return t < 0
      ? { nombre: 'foco estable (espiral)', estable: 'estable' }
      : { nombre: 'foco inestable (espiral)', estable: 'inestable' }
  }
  if (Math.abs(disc) < tolD)
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

/* ── Añadidas para el temario de grado ─────────────────────────────── */

/** Resuelve A x = b por Gauss con pivoteo parcial. null si es singular. */
export function resolverLineal(A: Mat, b: Vec): Vec | null {
  const n = A.length
  const M = A.map((f, i) => [...f, b[i]])
  for (let c = 0; c < n; c++) {
    let p = c
    for (let i = c + 1; i < n; i++) if (Math.abs(M[i][c]) > Math.abs(M[p][c])) p = i
    if (Math.abs(M[p][c]) < 1e-300) return null
    ;[M[c], M[p]] = [M[p], M[c]]
    for (let i = c + 1; i < n; i++) {
      const f = M[i][c] / M[c][c]
      if (f !== 0) for (let j = c; j <= n; j++) M[i][j] -= f * M[c][j]
    }
  }
  const x = new Array(n).fill(0)
  for (let i = n - 1; i >= 0; i--) {
    let s = M[i][n]
    for (let j = i + 1; j < n; j++) s -= M[i][j] * x[j]
    x[i] = s / M[i][i]
  }
  return x
}

export const identidad = (n: number): Mat => Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)))

/**
 * Autovalores y autovectores de una matriz simétrica por Jacobi cíclico.
 * Devuelve los valores en orden creciente y los vectores como columnas de `V` (ortonormales).
 */
export function jacobiSimetrica(A0: Mat): { valores: number[]; V: Mat } {
  const n = A0.length
  const A = A0.map((f) => [...f])
  const V = identidad(n)
  for (let barrido = 0; barrido < 100; barrido++) {
    let fuera = 0
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) fuera += A[p][q] ** 2
    if (fuera < 1e-30) break
    for (let p = 0; p < n; p++)
      for (let q = p + 1; q < n; q++) {
        if (Math.abs(A[p][q]) < 1e-300) continue
        const th = (A[q][q] - A[p][p]) / (2 * A[p][q])
        const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1))
        const c = 1 / Math.sqrt(t * t + 1)
        const s = t * c
        for (let k = 0; k < n; k++) {
          const akp = A[k][p]
          const akq = A[k][q]
          A[k][p] = c * akp - s * akq
          A[k][q] = s * akp + c * akq
        }
        for (let k = 0; k < n; k++) {
          const apk = A[p][k]
          const aqk = A[q][k]
          A[p][k] = c * apk - s * aqk
          A[q][k] = s * apk + c * aqk
        }
        for (let k = 0; k < n; k++) {
          const vkp = V[k][p]
          const vkq = V[k][q]
          V[k][p] = c * vkp - s * vkq
          V[k][q] = s * vkp + c * vkq
        }
      }
  }
  const orden = A.map((f, i) => [f[i], i] as const).sort((a, b) => a[0] - b[0])
  return { valores: orden.map((o) => o[0]), V: V.map((f) => orden.map((o) => f[o[1]])) }
}

/** Factor de Cholesky L (triangular inferior) de una simétrica definida positiva; null si no lo es. */
export function cholesky(A: Mat): Mat | null {
  const n = A.length
  const L: Mat = Array.from({ length: n }, () => new Array(n).fill(0))
  for (let i = 0; i < n; i++)
    for (let j = 0; j <= i; j++) {
      let s = A[i][j]
      for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k]
      if (i === j) {
        if (s <= 0) return null
        L[i][i] = Math.sqrt(s)
      } else L[i][j] = s / L[j][j]
    }
  return L
}

/**
 * Problema generalizado K v = λ M v con K simétrica y M simétrica definida positiva
 * (modos normales: λ = ω²). Los vectores salen M-ortonormales (vᵀ M v = 1), como columnas.
 */
export function autoGeneralizado(K: Mat, M: Mat): { valores: number[]; V: Mat } | null {
  const L = cholesky(M)
  if (!L) return null
  const n = K.length
  // Linv por sustitución hacia delante
  const Li: Mat = identidad(n)
  for (let c = 0; c < n; c++)
    for (let i = 0; i < n; i++) {
      let s = Li[i][c]
      for (let k = 0; k < i; k++) s -= L[i][k] * Li[k][c]
      Li[i][c] = s / L[i][i]
    }
  const C = mul(mul(Li, K), transpuesta(Li))
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) C[i][j] = C[j][i] = (C[i][j] + C[j][i]) / 2
  const { valores, V } = jacobiSimetrica(C)
  return { valores, V: mul(transpuesta(Li), V) }
}

/**
 * Autovalores de una tridiagonal simétrica (diagonal d, subdiagonal e de largo n−1) por
 * sucesiones de Sturm y bisección: los `cuantos` más bajos, en orden creciente.
 */
export function autovaloresTridiagonal(d: ArrayLike<number>, e: ArrayLike<number>, cuantos = d.length): number[] {
  const n = d.length
  let lo = Infinity
  let hi = -Infinity
  for (let i = 0; i < n; i++) {
    const r = (i > 0 ? Math.abs(e[i - 1]) : 0) + (i < n - 1 ? Math.abs(e[i]) : 0)
    lo = Math.min(lo, d[i] - r)
    hi = Math.max(hi, d[i] + r)
  }
  // número de autovalores menores que x
  const menores = (x: number) => {
    let c = 0
    let q = d[0] - x
    if (q < 0) c++
    for (let i = 1; i < n; i++) {
      q = d[i] - x - (e[i - 1] * e[i - 1]) / (q === 0 ? 1e-300 : q)
      if (q < 0) c++
    }
    return c
  }
  const out: number[] = []
  for (let k = 0; k < Math.min(cuantos, n); k++) {
    let a = lo
    let b = hi
    for (let it = 0; it < 200 && b - a > 1e-15 * Math.max(1, Math.abs(a) + Math.abs(b)); it++) {
      const m = (a + b) / 2
      if (menores(m) > k) b = m
      else a = m
    }
    out.push((a + b) / 2)
  }
  return out
}

/** Autovector de la tridiagonal para el autovalor l por iteración inversa (Thomas), normalizado a norma 1. */
export function autovectorTridiagonal(d: ArrayLike<number>, e: ArrayLike<number>, l: number): Float64Array {
  const n = d.length
  const desp = l + 1e-10 * Math.max(1, Math.abs(l))
  let v = new Float64Array(n).fill(1 / Math.sqrt(n))
  const cp = new Float64Array(n)
  const dp = new Float64Array(n)
  for (let it = 0; it < 4; it++) {
    const b0 = d[0] - desp
    cp[0] = n > 1 ? e[0] / b0 : 0
    dp[0] = v[0] / b0
    for (let i = 1; i < n; i++) {
      const den = d[i] - desp - e[i - 1] * cp[i - 1]
      const dd = den === 0 ? 1e-300 : den
      cp[i] = i < n - 1 ? e[i] / dd : 0
      dp[i] = (v[i] - e[i - 1] * dp[i - 1]) / dd
    }
    const x = new Float64Array(n)
    x[n - 1] = dp[n - 1]
    for (let i = n - 2; i >= 0; i--) x[i] = dp[i] - cp[i] * x[i + 1]
    let nn = 0
    for (let i = 0; i < n; i++) nn += x[i] * x[i]
    nn = Math.sqrt(nn)
    for (let i = 0; i < n; i++) x[i] /= nn
    v = x
  }
  return v
}

/**
 * Raíces complejas de c₀ + c₁x + … + cₙxⁿ por Aberth–Ehrlich, con pulido de Newton.
 * Devuelve pares [re, im].
 */
export function raicesPolinomio(c0: number[]): Array<[number, number]> {
  const c = [...c0]
  while (c.length > 1 && c[c.length - 1] === 0) c.pop()
  const ceros: Array<[number, number]> = []
  while (c.length > 1 && c[0] === 0) {
    c.shift()
    ceros.push([0, 0])
  }
  const n = c.length - 1
  if (n < 1) return ceros
  const a = c.map((v) => v / c[n])
  const ev = (zr: number, zi: number): [number, number, number, number] => {
    let pr = 1
    let pi = 0
    let dr = 0
    let di = 0
    for (let k = n - 1; k >= 0; k--) {
      const ndr = dr * zr - di * zi + pr
      const ndi = dr * zi + di * zr + pi
      dr = ndr
      di = ndi
      const npr = pr * zr - pi * zi + a[k]
      const npi = pr * zi + pi * zr
      pr = npr
      pi = npi
    }
    return [pr, pi, dr, di]
  }
  let R = 0
  for (let k = 0; k < n; k++) R = Math.max(R, Math.abs(a[k]))
  R = Math.min(1 + R, 2 * Math.max(...a.slice(0, n).map((v, k) => Math.abs(v) ** (1 / (n - k)))))
  const z: Array<[number, number]> = Array.from({ length: n }, (_, k) => {
    const t = (2 * Math.PI * k) / n + 0.4
    return [R * Math.cos(t), R * Math.sin(t)]
  })
  for (let it = 0; it < 800; it++) {
    let maxd = 0
    for (let k = 0; k < n; k++) {
      const [pr, pi, dr, di] = ev(z[k][0], z[k][1])
      if (pr === 0 && pi === 0) continue
      const m = dr * dr + di * di
      // w = p/p'
      const wr = (pr * dr + pi * di) / m
      const wi = (pi * dr - pr * di) / m
      let sr = 0
      let si = 0
      for (let j = 0; j < n; j++) {
        if (j === k) continue
        const xr = z[k][0] - z[j][0]
        const xi = z[k][1] - z[j][1]
        const q = xr * xr + xi * xi || 1e-300
        sr += xr / q
        si += -xi / q
      }
      // corrección = w / (1 − w·s)
      const denr = 1 - (wr * sr - wi * si)
      const deni = -(wr * si + wi * sr)
      const dq = denr * denr + deni * deni || 1e-300
      const cr = (wr * denr + wi * deni) / dq
      const ci = (wi * denr - wr * deni) / dq
      z[k][0] -= cr
      z[k][1] -= ci
      maxd = Math.max(maxd, Math.hypot(cr, ci) / Math.max(1, Math.hypot(z[k][0], z[k][1])))
    }
    if (maxd < 1e-15) break
  }
  // Una raíz de multiplicidad m sale de Aberth como un corro de m puntos con error ~ε^{1/m}.
  // Pero es raíz SIMPLE de p⁽ᵐ⁻¹⁾: se pule con Newton ahí y solo se acepta si p, p′, …, p⁽ᵐ⁻²⁾
  // también se anulan en ella; si no, eran raíces distintas y se dejan como estaban.
  const derivada = (co: number[]) => co.slice(1).map((v, i) => v * (i + 1))
  const evalC = (co: number[], zr: number, zi: number): [number, number] => {
    let pr = 0
    let pi = 0
    for (let k = co.length - 1; k >= 0; k--) {
      const t = pr * zr - pi * zi + co[k]
      pi = pr * zi + pi * zr
      pr = t
    }
    return [pr, pi]
  }
  const escalaEn = (co: number[], r: number) => co.reduce((s, v, k) => s + Math.abs(v) * r ** k, 0)
  const usado = new Array(n).fill(false)
  for (let k = 0; k < n; k++) {
    if (usado[k]) continue
    const esc = Math.max(1, Math.hypot(z[k][0], z[k][1]))
    const corro = [k]
    for (let j = k + 1; j < n; j++)
      if (!usado[j] && Math.hypot(z[j][0] - z[k][0], z[j][1] - z[k][1]) < 1e-3 * esc) corro.push(j)
    if (corro.length < 2) continue
    const m = corro.length
    const ders = [a]
    for (let j = 1; j < m; j++) ders.push(derivada(ders[j - 1]))
    let zr = corro.reduce((s, j) => s + z[j][0], 0) / m
    let zi = corro.reduce((s, j) => s + z[j][1], 0) / m
    const q = ders[m - 1]
    const dq = derivada(q)
    for (let it = 0; it < 60; it++) {
      const [vr, vi] = evalC(q, zr, zi)
      const [wr, wi] = evalC(dq, zr, zi)
      const mm = wr * wr + wi * wi
      if (mm === 0) break
      const cr = (vr * wr + vi * wi) / mm
      const ci = (vi * wr - vr * wi) / mm
      zr -= cr
      zi -= ci
      if (Math.hypot(cr, ci) < 1e-16 * Math.max(1, Math.hypot(zr, zi))) break
    }
    const rr = Math.hypot(zr, zi)
    const multiple = ders.slice(0, m - 1).every((co) => Math.hypot(...evalC(co, zr, zi)) <= 1e-9 * escalaEn(co, rr))
    if (!multiple) continue
    for (const j of corro) {
      z[j][0] = zr
      z[j][1] = zi
      usado[j] = true
    }
  }
  for (const r of z) {
    if (Math.abs(r[1]) < 1e-12 * Math.max(1, Math.abs(r[0]))) r[1] = 0
  }
  return [...ceros, ...z].sort((p, q) => p[0] - q[0] || p[1] - q[1])
}

/** Mínimos cuadrados min ‖Ax − b‖ por QR de Householder (sin ecuaciones normales, que elevan κ al cuadrado). */
export function minimosCuadrados(A0: Mat, b0: Vec): Vec | null {
  const m = A0.length
  const n = A0[0].length
  const A = A0.map((f) => [...f])
  const b = [...b0]
  for (let k = 0; k < n; k++) {
    let nr = 0
    for (let i = k; i < m; i++) nr += A[i][k] ** 2
    nr = Math.sqrt(nr)
    if (nr < 1e-300) return null
    const alfa = A[k][k] > 0 ? -nr : nr
    const v = new Array(m).fill(0)
    for (let i = k; i < m; i++) v[i] = A[i][k]
    v[k] -= alfa
    let vv = 0
    for (let i = k; i < m; i++) vv += v[i] * v[i]
    if (vv === 0) continue
    for (let j = k; j < n; j++) {
      let s = 0
      for (let i = k; i < m; i++) s += v[i] * A[i][j]
      s = (2 * s) / vv
      for (let i = k; i < m; i++) A[i][j] -= s * v[i]
    }
    let s = 0
    for (let i = k; i < m; i++) s += v[i] * b[i]
    s = (2 * s) / vv
    for (let i = k; i < m; i++) b[i] -= s * v[i]
  }
  const x = new Array(n).fill(0)
  for (let i = n - 1; i >= 0; i--) {
    let s = b[i]
    for (let j = i + 1; j < n; j++) s -= A[i][j] * x[j]
    if (Math.abs(A[i][i]) < 1e-300) return null
    x[i] = s / A[i][i]
  }
  return x
}
