/**
 * Álgebra lineal exacta con fracciones, con los pasos a la vista: eliminación
 * de Gauss–Jordan operación a operación, determinante, inversa, sistemas
 * (Rouché–Frobenius), núcleo e imagen, polinomio característico, autovalores
 * y vectores propios, diagonalización, forma de Jordan y LU. QR y SVD, que
 * necesitan raíces, van en decimales.
 */
import { divP, factorizarP, grado, principalP, r, rCero, rDiv, rProd, rResta, rSuma, type P, type R } from './cas/polinomios'
import { raicesPolinomio, jacobiSimetrica } from './matrices'
import { pot, q, MEDIO } from './cas/expr'
import { tex as texE } from './cas/tex'

export type MR = R[][]

export const R0 = r(0)
export const R1 = r(1)
export const rNeg = (a: R) => r(-a.n, a.d)
export const rIgual = (a: R, b: R) => a.n === b.n && a.d === b.d
export const rNum = (a: R) => Number(a.n) / Number(a.d)

/* ---------- lectura y escritura ---------- */

/** "3", "-2/5", "0.25", "1,5", "−7": lo que se puede escribir en una celda. */
export function leerR(t: string): R | null {
  const s = t.trim().replace(/−/g, '-').replace(',', '.').replace(/\s+/g, '')
  if (s === '') return R0
  let m = s.match(/^([+-]?\d+)\/([+-]?\d+)$/)
  if (m) return BigInt(m[2]) === 0n ? null : r(BigInt(m[1]), BigInt(m[2]))
  m = s.match(/^([+-]?)(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i)
  if (!m || (m[2] === '' && (m[3] ?? '') === '')) return null
  const dec = m[3] ?? ''
  let n = BigInt((m[2] || '0') + dec)
  let d = 10n ** BigInt(dec.length)
  const e = m[4] ? Number(m[4]) : 0
  if (Math.abs(e) > 30) return null
  if (e > 0) n *= 10n ** BigInt(e)
  else if (e < 0) d *= 10n ** BigInt(-e)
  return r(m[1] === '-' ? -n : n, d)
}

export function texR(a: R): string {
  if (a.d === 1n) return `${a.n}`
  return a.n < 0n ? `-\\frac{${-a.n}}{${a.d}}` : `\\frac{${a.n}}{${a.d}}`
}

/** Texto plano corto para una celda o una lectura. */
export function textoR(a: R): string {
  return a.d === 1n ? `${a.n}`.replace('-', '−') : `${a.n}/${a.d}`.replace('-', '−')
}

/** Matriz entre paréntesis; `barra` = índice de la columna tras la que va la raya vertical. */
/** Dentro de una matriz las fracciones van a tamaño de texto (\\dfrac) y las filas, más separadas. */
const texRM = (a: R) => (a.d === 1n ? `${a.n}` : a.n < 0n ? `-\\dfrac{${-a.n}}{${a.d}}` : `\\dfrac{${a.n}}{${a.d}}`)

export function texM(M: MR, barra?: number): string {
  const n = M[0]?.length ?? 0
  const cols = barra !== undefined && barra > 0 && barra < n ? 'c'.repeat(barra) + '|' + 'c'.repeat(n - barra) : 'c'.repeat(n)
  // con fracciones, aire entre filas para que no se pisen
  const salto = M.some((f) => f.some((v) => v.d !== 1n)) ? ' \\\\[10pt] ' : ' \\\\ '
  return `\\left(\\begin{array}{${cols}}${M.map((f) => f.map(texRM).join(' & ')).join(salto)}\\end{array}\\right)`
}

export const texMnum = (M: number[][], dec = 4) =>
  `\\left(\\begin{array}{${'c'.repeat(M[0]?.length ?? 0)}}${M.map((f) => f.map((v) => fmtNum(v, dec)).join(' & ')).join(' \\\\ ')}\\end{array}\\right)`

export function fmtNum(v: number, dec = 4): string {
  if (!Number.isFinite(v)) return '\\text{—}'
  const r0 = Math.abs(v) < 5 * 10 ** -(dec + 1) ? 0 : v
  return String(+r0.toFixed(dec)).replace('.', '{,}')
}

/** Coeficiente delante de una fila en una operación: 3F₂, −F₂, ½F₂… */
function coefFila(k: R, i: number) {
  const f = `F_{${i + 1}}`
  if (rIgual(k, R1)) return f
  if (rIgual(k, rNeg(R1))) return `-${f}`
  return `${k.d === 1n ? texR(k) : `\\left(${texR(k)}\\right)`}${f}`
}

/* ---------- operaciones básicas ---------- */

export const copia = (M: MR): MR => M.map((f) => f.slice())
export const identidadR = (n: number): MR => Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? R1 : R0)))
export const transpuestaR = (M: MR): MR => (M[0] ?? []).map((_, j) => M.map((f) => f[j]))
export const aNum = (M: MR) => M.map((f) => f.map(rNum))

export function mulR(A: MR, B: MR): MR {
  return A.map((f) => (B[0] ?? []).map((_, j) => f.reduce((acc, a, k) => rSuma(acc, rProd(a, B[k][j])), R0)))
}
export const sumaR = (A: MR, B: MR): MR => A.map((f, i) => f.map((a, j) => rSuma(a, B[i][j])))
export const trazaR = (A: MR) => A.reduce((acc, f, i) => rSuma(acc, f[i]), R0)
export const esCeroM = (M: MR) => M.every((f) => f.every(rCero))
export const igualM = (A: MR, B: MR) => A.length === B.length && A.every((f, i) => f.every((a, j) => rIgual(a, B[i][j])))

/* ---------- Gauss–Jordan con pasos ---------- */

export interface Paso {
  /** Operaciones hechas, en LaTeX: F_1 \leftrightarrow F_2, F_3 \to F_3 - 2F_1… */
  ops: string[]
  M: MR
  nota?: string
}

export interface Eliminacion {
  pasos: Paso[]
  R: MR
  pivotes: number[]
}

/**
 * Escalonada reducida por filas. Solo se buscan pivotes en las columnas antes
 * de `hasta` (en [A | b] o [A | I] la parte derecha no se pivota). Con
 * `reducida = false` se para en la escalonada (Gauss, sin hacer unos).
 */
export function gaussJordan(M0: MR, hasta = M0[0]?.length ?? 0, reducida = true): Eliminacion {
  const M = copia(M0)
  const m = M.length
  const pasos: Paso[] = []
  const pivotes: number[] = []
  let f = 0
  for (let c = 0; c < hasta && f < m; c++) {
    // un pivote ±1 ahorra fracciones: se prefiere si lo hay
    const candidatas = M.map((fila, i) => ({ i, v: fila[c] })).filter(({ i, v }) => i >= f && !rCero(v))
    if (!candidatas.length) continue
    const uno = candidatas.find(({ v }) => v.d === 1n && (v.n === 1n || v.n === -1n))
    const p = (uno ?? candidatas[0]).i
    const ops: string[] = []
    if (p !== f) {
      ;[M[f], M[p]] = [M[p], M[f]]
      ops.push(`F_{${f + 1}} \\leftrightarrow F_{${p + 1}}`)
    }
    if (reducida && !rIgual(M[f][c], R1)) {
      const inv = rDiv(R1, M[f][c])
      M[f] = M[f].map((v) => rProd(v, inv))
      ops.push(`F_{${f + 1}} \\to ${coefFila(inv, f)}`)
    }
    for (let i = reducida ? 0 : f + 1; i < m; i++) {
      if (i === f || rCero(M[i][c])) continue
      const k = rDiv(M[i][c], M[f][c])
      M[i] = M[i].map((v, j) => rResta(v, rProd(k, M[f][j])))
      ops.push(`F_{${i + 1}} \\to F_{${i + 1}} ${k.n > 0n ? '-' : '+'} ${coefFila(k.n > 0n ? k : rNeg(k), f)}`)
    }
    if (ops.length) pasos.push({ ops, M: copia(M) })
    pivotes.push(c)
    f++
  }
  return { pasos, R: M, pivotes }
}

export const rango = (M: MR) => gaussJordan(M).pivotes.length

/* ---------- determinante ---------- */

export interface Determinante {
  valor: R
  pasos: Paso[]
  /** Producto de la diagonal y el signo por los intercambios, en LaTeX. */
  cuenta: string
}

/** Por eliminación a triangular: cada intercambio cambia el signo; sumar múltiplos no cambia nada. */
export function determinante(A: MR): Determinante {
  const n = A.length
  const M = copia(A)
  const pasos: Paso[] = []
  let signo = 1
  for (let c = 0; c < n; c++) {
    let p = -1
    for (let i = c; i < n; i++) if (!rCero(M[i][c])) {
      p = i
      break
    }
    if (p < 0) {
      pasos.push({ ops: [], M: copia(M), nota: `la columna ${c + 1} no tiene pivote: el determinante es 0` })
      return { valor: R0, pasos, cuenta: '0' }
    }
    const ops: string[] = []
    if (p !== c) {
      ;[M[c], M[p]] = [M[p], M[c]]
      signo = -signo
      ops.push(`F_{${c + 1}} \\leftrightarrow F_{${p + 1}}\\ (\\text{cambia el signo})`)
    }
    for (let i = c + 1; i < n; i++) {
      if (rCero(M[i][c])) continue
      const k = rDiv(M[i][c], M[c][c])
      M[i] = M[i].map((v, j) => rResta(v, rProd(k, M[c][j])))
      ops.push(`F_{${i + 1}} \\to F_{${i + 1}} ${k.n > 0n ? '-' : '+'} ${coefFila(k.n > 0n ? k : rNeg(k), c)}`)
    }
    if (ops.length) pasos.push({ ops, M: copia(M) })
  }
  let v = signo < 0 ? rNeg(R1) : R1
  for (let i = 0; i < n; i++) v = rProd(v, M[i][i])
  const diag = M.map((f, i) => (f[i].n < 0n || f[i].d !== 1n ? `\\left(${texR(f[i])}\\right)` : texR(f[i]))).join('\\cdot ')
  return { valor: v, pasos, cuenta: `${signo < 0 ? '-' : ''}${diag} = ${texR(v)}` }
}

/* ---------- inversa ---------- */

export function inversa(A: MR): { inv: MR | null; pasos: Paso[] } {
  const n = A.length
  const I = identidadR(n)
  const aumentada = A.map((f, i) => [...f, ...I[i]])
  const e = gaussJordan(aumentada, n)
  if (e.pivotes.length < n) return { inv: null, pasos: e.pasos }
  return { inv: e.R.map((f) => f.slice(n)), pasos: e.pasos }
}

/* ---------- subespacios ---------- */

/** Base del núcleo a partir de la escalonada reducida: un vector por variable libre. */
export function nucleo(A: MR): MR {
  const n = A[0]?.length ?? 0
  const { R, pivotes } = gaussJordan(A)
  const libres = [...Array(n).keys()].filter((j) => !pivotes.includes(j))
  return libres.map((j) => {
    const v = Array.from({ length: n }, () => R0)
    v[j] = R1
    pivotes.forEach((c, i) => (v[c] = rNeg(R[i][j])))
    return v
  })
}

/** Columnas de A que forman base de la imagen (las de los pivotes). */
export function baseImagen(A: MR): { indices: number[]; vectores: MR } {
  const { pivotes } = gaussJordan(A)
  return { indices: pivotes, vectores: pivotes.map((c) => A.map((f) => f[c])) }
}

/* ---------- sistemas ---------- */

export interface Sistema {
  pasos: Paso[]
  R: MR
  rangoA: number
  rangoAb: number
  n: number
  tipo: 'compatible determinado' | 'compatible indeterminado' | 'incompatible'
  /** x = particular + Σ tᵢ·direccionesᵢ */
  particular: R[] | null
  direcciones: MR
  libres: number[]
}

export function sistema(A: MR, b: R[]): Sistema {
  const n = A[0]?.length ?? 0
  const Ab = A.map((f, i) => [...f, b[i]])
  const e = gaussJordan(Ab, n)
  const rangoA = e.pivotes.length
  // rango de [A | b]: ¿queda alguna fila 0 … 0 | c con c ≠ 0?
  const rangoAb = rangoA + (e.R.some((f) => f.slice(0, n).every(rCero) && !rCero(f[n])) ? 1 : 0)
  const libres = [...Array(n).keys()].filter((j) => !e.pivotes.includes(j))
  if (rangoAb > rangoA) return { pasos: e.pasos, R: e.R, rangoA, rangoAb, n, tipo: 'incompatible', particular: null, direcciones: [], libres }
  const particular = Array.from({ length: n }, () => R0)
  e.pivotes.forEach((c, i) => (particular[c] = e.R[i][n]))
  const direcciones = libres.map((j) => {
    const v = Array.from({ length: n }, () => R0)
    v[j] = R1
    e.pivotes.forEach((c, i) => (v[c] = rNeg(e.R[i][j])))
    return v
  })
  return {
    pasos: e.pasos, R: e.R, rangoA, rangoAb, n,
    tipo: rangoA === n ? 'compatible determinado' : 'compatible indeterminado',
    particular, direcciones, libres,
  }
}

/* ---------- polinomio característico y autovalores ---------- */

/** det(λI − A) por Faddeev–LeVerrier, exacto: coeficientes de menor a mayor grado. */
export function polinomioCaracteristico(A: MR): P {
  const n = A.length
  const c: R[] = Array.from({ length: n + 1 }, () => R0)
  c[n] = R1
  let M: MR = A.map((f) => f.map(() => R0))
  for (let k = 1; k <= n; k++) {
    // M_k = A·M_{k−1} + c_{n−k+1}·I ; c_{n−k} = −tr(A·M_k)/k
    const AM = mulR(A, M)
    M = AM.map((f, i) => f.map((v, j) => (i === j ? rSuma(v, c[n - k + 1]) : v)))
    c[n - k] = rNeg(rDiv(trazaR(mulR(A, M)), r(k)))
  }
  return c
}

export function texPolinomio(p: P, x = '\\lambda'): string {
  const partes: string[] = []
  for (let k = p.length - 1; k >= 0; k--) {
    const a = p[k]
    if (rCero(a)) continue
    const neg = a.n < 0n
    const abs = neg ? rNeg(a) : a
    const coef = k > 0 && rIgual(abs, R1) ? '' : texR(abs)
    const pot = k === 0 ? '' : k === 1 ? x : `${x}^{${k}}`
    partes.push(`${partes.length ? (neg ? ' - ' : ' + ') : neg ? '-' : ''}${coef}${pot}`)
  }
  return partes.join('') || '0'
}

export interface Autovalor {
  /** LaTeX del valor exacto (o decimal si no hay forma cerrada). */
  tex: string
  /** Valor racional, si lo es. */
  exacto: R | null
  re: number
  im: number
  algebraica: number
  geometrica: number | null
  /** Base del subespacio propio (exacta con valores racionales, decimal con reales irracionales). */
  vectores: MR | null
  vectoresNum: number[][] | null
}

function nucleoNumerico(M: number[][], tol = 1e-8): number[][] {
  // eliminación con pivote parcial y tolerancia; devuelve base normalizada
  const A = M.map((f) => f.slice())
  const m = A.length
  const n = A[0]?.length ?? 0
  const piv: number[] = []
  let f = 0
  const escala = Math.max(1, ...A.flat().map(Math.abs))
  for (let c = 0; c < n && f < m; c++) {
    let p = f
    for (let i = f + 1; i < m; i++) if (Math.abs(A[i][c]) > Math.abs(A[p][c])) p = i
    if (Math.abs(A[p][c]) < tol * escala) continue
    ;[A[f], A[p]] = [A[p], A[f]]
    const d = A[f][c]
    A[f] = A[f].map((v) => v / d)
    for (let i = 0; i < m; i++) {
      if (i === f) continue
      const k = A[i][c]
      if (k) A[i] = A[i].map((v, j) => v - k * A[f][j])
    }
    piv.push(c)
    f++
  }
  const libres = [...Array(n).keys()].filter((j) => !piv.includes(j))
  return libres.map((j) => {
    const v = Array.from({ length: n }, () => 0)
    v[j] = 1
    piv.forEach((c, i) => (v[c] = -A[i][j]))
    const nv = Math.hypot(...v)
    return v.map((x) => x / nv)
  })
}

/** Autovalores con multiplicidades: racionales exactos, cuadráticos con radicales, el resto en decimal. */
export function autovalores(A: MR): { p: P; valores: Autovalor[] } {
  const n = A.length
  const p = polinomioCaracteristico(A)
  const f = factorizarP(p)
  const valores: Autovalor[] = []
  const Anum = aNum(A)
  for (const { p: fac, m } of f.factores) {
    const g = grado(fac)
    if (g === 1) {
      // a·λ + b = 0
      const l = rDiv(rNeg(fac[0]), fac[1])
      const N = A.map((fila, i) => fila.map((v, j) => (i === j ? rResta(v, l) : v)))
      const base = nucleo(N)
      valores.push({ tex: texR(l), exacto: l, re: rNum(l), im: 0, algebraica: m, geometrica: base.length, vectores: base, vectoresNum: null })
    } else if (g === 2) {
      const [c, b, a] = fac
      const disc = rResta(rProd(b, b), rProd(r(4), rProd(a, c)))
      const centro = rDiv(rNeg(b), rProd(r(2), a))
      const dosA = rProd(r(2), a)
      const dn = rNum(disc)
      if (dn >= 0) {
        // −b/2a ± √disc/2a, con los radicales simplificados por el CAS
        const radical = texE(pot(q(disc.n * dosA.d * dosA.d, dosA.n * dosA.n * disc.d), MEDIO))
        for (const s of [-1, 1]) {
          const texto = rCero(centro) ? `${s < 0 ? '-' : ''}${radical}` : `${texR(centro)} ${s < 0 ? '-' : '+'} ${radical}`
          const re = rNum(centro) + (s * Math.sqrt(dn)) / Math.abs(rNum(dosA))
          const N = Anum.map((fila, i) => fila.map((v, j) => (i === j ? v - re : v)))
          const vs = nucleoNumerico(N)
          valores.push({ tex: texto, exacto: null, re, im: 0, algebraica: m, geometrica: vs.length, vectores: null, vectoresNum: vs })
        }
      } else {
        const imE = pot(q(-disc.n * dosA.d * dosA.d, dosA.n * dosA.n * disc.d), MEDIO)
        const imTex = texE(imE)
        const reTex = rCero(centro) ? '' : texR(centro)
        const im = Math.sqrt(-dn) / Math.abs(rNum(dosA))
        for (const s of [1, -1]) {
          const unidad = imTex === '1' ? 'i' : `${imTex}\\,i`
          valores.push({ tex: `${reTex}${reTex ? (s > 0 ? ' + ' : ' - ') : s > 0 ? '' : '-'}${unidad}`, exacto: null, re: rNum(centro), im: s * im, algebraica: m, geometrica: null, vectores: null, vectoresNum: null })
        }
      }
    } else {
      for (const [re, im] of raicesPolinomio(fac.map(rNum))) {
        const reale = Math.abs(im) < 1e-10
        let vs: number[][] | null = null
        if (reale) vs = nucleoNumerico(Anum.map((fila, i) => fila.map((v, j) => (i === j ? v - re : v))), 1e-7)
        valores.push({
          tex: reale ? `\\approx ${fmtNum(re, 6)}` : `\\approx ${fmtNum(re, 6)} ${im >= 0 ? '+' : '-'} ${fmtNum(Math.abs(im), 6)}\\,i`,
          exacto: null, re, im: reale ? 0 : im, algebraica: m, geometrica: vs?.length ?? null, vectores: null, vectoresNum: vs,
        })
      }
    }
  }
  valores.sort((a, b) => a.re - b.re || a.im - b.im)
  if (valores.reduce((s, v) => s + v.algebraica, 0) !== n) throw new Error('el polinomio característico no cuadra con el tamaño')
  return { p, valores }
}

export interface Diagonalizacion {
  sobreR: boolean
  motivo: string
  /** Si todos los autovalores son racionales: A = P·D·P⁻¹ exacto. */
  P: MR | null
  D: MR | null
  /** Forma de Jordan (bloques) si los autovalores son racionales. */
  jordan: Array<{ l: R; tamanos: number[] }> | null
}

function potenciaR(M: MR, k: number): MR {
  let X = identidadR(M.length)
  for (let i = 0; i < k; i++) X = mulR(X, M)
  return X
}

export function diagonalizar(A: MR, vals: Autovalor[]): Diagonalizacion {
  const n = A.length
  const complejos = vals.some((v) => v.im !== 0)
  const deficiente = vals.find((v) => v.geometrica !== null && v.geometrica < v.algebraica)
  const racionales = vals.every((v) => v.exacto)
  let jordan: Diagonalizacion['jordan'] = null
  if (racionales) {
    // nº de bloques de tamaño ≥ k para λ: rg(N^{k−1}) − rg(N^k), N = A − λI
    jordan = vals.map((v) => {
      const N = A.map((f, i) => f.map((x, j) => (i === j ? rResta(x, v.exacto!) : x)))
      const rg = [n]
      for (let k = 1; k <= v.algebraica; k++) rg.push(rango(potenciaR(N, k)))
      const alMenos = rg.slice(1).map((rk, k) => rg[k] - rk)
      const tamanos: number[] = []
      for (let k = 1; k <= alMenos.length; k++) {
        const exactamente = alMenos[k - 1] - (alMenos[k] ?? 0)
        for (let t = 0; t < exactamente; t++) tamanos.push(k)
      }
      return { l: v.exacto!, tamanos: tamanos.sort((a, b) => b - a) }
    })
  }
  if (complejos) return { sobreR: false, motivo: 'tiene autovalores complejos: no diagonaliza sobre ℝ (sí sobre ℂ si las multiplicidades cuadran)', P: null, D: null, jordan }
  if (deficiente)
    return { sobreR: false, motivo: `λ = ${deficiente.tex} tiene multiplicidad algebraica ${deficiente.algebraica} y geométrica ${deficiente.geometrica}`, P: null, D: null, jordan }
  if (!racionales) return { sobreR: true, motivo: 'todas las multiplicidades cuadran (autovalores reales, algunos irracionales)', P: null, D: null, jordan }
  const columnas: R[][] = []
  const diag: R[] = []
  for (const v of vals) for (const vec of v.vectores!) {
    columnas.push(vec)
    diag.push(v.exacto!)
  }
  const P = transpuestaR(columnas)
  const D = diag.map((l, i) => diag.map((_, j) => (i === j ? l : R0)))
  return { sobreR: true, motivo: 'la suma de las multiplicidades geométricas es n', P, D, jordan }
}

/* ---------- LU ---------- */

export interface LU {
  P: MR
  L: MR
  U: MR
  permuta: boolean
}

/** Doolittle exacto; si un pivote es 0 se permuta con una fila de debajo (PA = LU). */
export function lu(A: MR): LU | null {
  const n = A.length
  if ((A[0]?.length ?? 0) !== n) return null
  const U = copia(A)
  const L = identidadR(n)
  const perm = [...Array(n).keys()]
  let permuta = false
  for (let c = 0; c < n; c++) {
    let p = c
    while (p < n && rCero(U[p][c])) p++
    if (p === n) continue
    if (p !== c) {
      permuta = true
      ;[U[c], U[p]] = [U[p], U[c]]
      ;[perm[c], perm[p]] = [perm[p], perm[c]]
      for (let k = 0; k < c; k++) [L[c][k], L[p][k]] = [L[p][k], L[c][k]]
    }
    for (let i = c + 1; i < n; i++) {
      const k = rDiv(U[i][c], U[c][c])
      L[i][c] = k
      U[i] = U[i].map((v, j) => rResta(v, rProd(k, U[c][j])))
    }
  }
  const P = perm.map((pi) => Array.from({ length: n }, (_, j) => (j === pi ? R1 : R0)))
  return { P, L, U, permuta }
}

/* ---------- QR y SVD (decimales) ---------- */

export function qr(A: number[][]): { Q: number[][]; R: number[][] } | null {
  const m = A.length
  const n = A[0]?.length ?? 0
  const Q: number[][] = Array.from({ length: m }, () => Array(n).fill(0))
  const Rm: number[][] = Array.from({ length: n }, () => Array(n).fill(0))
  for (let j = 0; j < n; j++) {
    const v = A.map((f) => f[j])
    for (let k = 0; k < j; k++) {
      // Gram–Schmidt modificado
      const qk = Q.map((f) => f[k])
      const c = qk.reduce((s, x, i) => s + x * v[i], 0)
      Rm[k][j] = c
      for (let i = 0; i < m; i++) v[i] -= c * qk[i]
    }
    const nv = Math.hypot(...v)
    if (nv < 1e-12) return null
    Rm[j][j] = nv
    for (let i = 0; i < m; i++) Q[i][j] = v[i] / nv
  }
  return { Q, R: Rm }
}

export function svd(A: number[][]): { sigma: number[]; U: number[][]; V: number[][] } {
  const m = A.length
  const n = A[0]?.length ?? 0
  const AtA = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => A.reduce((s, f) => s + f[i] * f[j], 0)))
  const { valores, V } = jacobiSimetrica(AtA)
  const orden = valores.map((v, i) => [v, i] as const).sort((a, b) => b[0] - a[0])
  const sigma = orden.map(([v]) => Math.sqrt(Math.max(0, v)))
  const Vs = V.map((f) => orden.map(([, i]) => f[i]))
  const U: number[][] = Array.from({ length: m }, () => Array(n).fill(0))
  sigma.forEach((s, k) => {
    if (s < 1e-12) return
    for (let i = 0; i < m; i++) U[i][k] = A[i].reduce((acc, a, j) => acc + a * Vs[j][k], 0) / s
  })
  return { sigma, U, V: Vs }
}

export { divP, principalP, r }
