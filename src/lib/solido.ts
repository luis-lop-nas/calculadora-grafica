/**
 * Sólido rígido: tensor de inercia de piezas simples (con Steiner), rotación libre de Euler
 * con su orientación, y la peonza simétrica pesada a partir de su lagrangiano.
 */
import { elipticaK } from './especiales'
import { jacobiSimetrica, raicesPolinomio, type Mat } from './matrices'
import { dormandPrince } from './numerico'
import { analizarLagrangiano, numerico, type Numerico, type Sistema } from './mecanica'

export type V3 = [number, number, number]
export type TipoPieza = 'caja' | 'cilindro' | 'esfera' | 'cascara' | 'varilla' | 'cono' | 'punto'
export type Eje = 'x' | 'y' | 'z'

export interface Pieza {
  tipo: TipoPieza
  m: number
  /** caja: a, b, c (lados en x, y, z); cilindro y cono: r, h; esfera: r; varilla: l */
  d: Record<string, number>
  eje: Eje
  /** posición del centro de masas de la pieza */
  en: V3
}

const DIMS: Record<TipoPieza, string[]> = {
  caja: ['a', 'b', 'c'],
  cilindro: ['r', 'h'],
  esfera: ['r'],
  cascara: ['r'],
  varilla: ['l'],
  cono: ['r', 'h'],
  punto: [],
}

/** «caja m=2 a=1 b=0.5 c=0.3 en (0.5, 0, 0)», una pieza por línea o separadas por «;». */
export function leerPiezas(src: string): Pieza[] {
  const out: Pieza[] = []
  for (const linea of src.split(/[;\n]/)) {
    const t = linea.trim().toLowerCase()
    if (!t) continue
    const tipo = t.split(/\s+/)[0] as TipoPieza
    if (!(tipo in DIMS)) throw new Error(`«${tipo}»: las piezas son ${Object.keys(DIMS).join(', ')}`)
    let resto = t.slice(tipo.length)
    let en: V3 = [0, 0, 0]
    const mEn = resto.match(/\ben\s*\(?\s*([^()]+?)\s*\)?\s*$/)
    if (mEn) {
      const xs = mEn[1].split(',').map((x) => Number(x.trim()))
      if (xs.length !== 3 || xs.some((x) => !Number.isFinite(x))) throw new Error(`«${linea.trim()}»: la posición se escribe en (x, y, z)`)
      en = xs as V3
      resto = resto.slice(0, mEn.index)
    }
    const d: Record<string, number> = {}
    let m = NaN
    let eje: Eje = 'z'
    for (const par of resto.trim().split(/\s+/).filter(Boolean)) {
      const kv = par.match(/^([a-z]+)=(.+)$/)
      if (!kv) throw new Error(`«${par}»: se escribe nombre=valor`)
      if (kv[1] === 'eje') {
        if (!['x', 'y', 'z'].includes(kv[2])) throw new Error('eje=x, eje=y o eje=z')
        eje = kv[2] as Eje
        continue
      }
      const v = Number(kv[2])
      if (!Number.isFinite(v) || v < 0) throw new Error(`«${par}»: tiene que ser un número no negativo`)
      if (kv[1] === 'm') m = v
      else if (DIMS[tipo].includes(kv[1])) d[kv[1]] = v
      else throw new Error(`«${kv[1]}» no es una medida de ${tipo} (${DIMS[tipo].join(', ') || 'solo m'})`)
    }
    if (!(m > 0)) throw new Error(`«${linea.trim()}»: falta la masa m=…`)
    const faltan = DIMS[tipo].filter((k) => !(k in d))
    if (faltan.length) throw new Error(`«${linea.trim()}»: falta ${faltan.join(', ')}`)
    out.push({ tipo, m, d, eje, en })
  }
  if (!out.length) throw new Error('escribe al menos una pieza')
  return out
}

const IDX: Record<Eje, number> = { x: 0, y: 1, z: 2 }

/** Momentos principales (en x, y, z) de la pieza respecto a su propio centro de masas. */
export function inerciaPropia(p: Pieza): V3 {
  const { m, d } = p
  let axial = 0
  let perp = 0
  switch (p.tipo) {
    case 'caja':
      return [(m * (d.b ** 2 + d.c ** 2)) / 12, (m * (d.a ** 2 + d.c ** 2)) / 12, (m * (d.a ** 2 + d.b ** 2)) / 12]
    case 'esfera':
      return [0.4 * m * d.r ** 2, 0.4 * m * d.r ** 2, 0.4 * m * d.r ** 2]
    case 'cascara':
      return [(2 / 3) * m * d.r ** 2, (2 / 3) * m * d.r ** 2, (2 / 3) * m * d.r ** 2]
    case 'punto':
      return [0, 0, 0]
    case 'cilindro':
      axial = (m * d.r ** 2) / 2
      perp = (m * (3 * d.r ** 2 + d.h ** 2)) / 12
      break
    case 'varilla':
      perp = (m * d.l ** 2) / 12
      break
    case 'cono':
      // respecto al centro de masas, que está a h/4 de la base
      axial = 0.3 * m * d.r ** 2
      perp = (3 / 20) * m * d.r ** 2 + (3 / 80) * m * d.h ** 2
      break
  }
  const out: V3 = [perp, perp, perp]
  out[IDX[p.eje]] = axial
  return out
}

/** I_O = I_cm + m (|d|² 𝟙 − d dᵀ) */
export function steiner(Icm: Mat, m: number, d: V3): Mat {
  const d2 = d[0] ** 2 + d[1] ** 2 + d[2] ** 2
  return Icm.map((f, i) => f.map((v, j) => v + m * ((i === j ? d2 : 0) - d[i] * d[j])))
}

export interface Tensor {
  masa: number
  cm: V3
  /** respecto al origen */
  IO: Mat
  /** respecto al centro de masas */
  Icm: Mat
  /** momentos principales (ascendentes) y ejes (columnas) respecto al centro de masas */
  principales: number[]
  ejes: Mat
}

export function tensor(piezas: Pieza[]): Tensor {
  const masa = piezas.reduce((a, p) => a + p.m, 0)
  const cm = [0, 1, 2].map((k) => piezas.reduce((a, p) => a + p.m * p.en[k], 0) / masa) as V3
  let IO: Mat = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
  for (const p of piezas) {
    const ip = inerciaPropia(p)
    const diag = [0, 1, 2].map((i) => [0, 1, 2].map((j) => (i === j ? ip[i] : 0)))
    const Ii = steiner(diag, p.m, p.en)
    IO = IO.map((f, i) => f.map((v, j) => v + Ii[i][j]))
  }
  // se vuelve al centro de masas con Steiner al revés
  const Icm = steiner(IO, -masa, cm)
  const { valores, V } = jacobiSimetrica(Icm)
  return { masa, cm, IO, Icm, principales: valores, ejes: V }
}

/* ── rotación libre: ecuaciones de Euler en el cuerpo + orientación R (cuerpo → espacio) ── */

/** y = (ω₁, ω₂, ω₃, R por filas); R′ = R [ω]×. */
export function campoEuler(I: V3) {
  return (_t: number, y: number[]): number[] => {
    const [w1, w2, w3] = y
    const R = y.slice(3)
    const out = [((I[1] - I[2]) * w2 * w3) / I[0], ((I[2] - I[0]) * w3 * w1) / I[1], ((I[0] - I[1]) * w1 * w2) / I[2]]
    for (let i = 0; i < 3; i++) {
      const a = R[3 * i]
      const b = R[3 * i + 1]
      const c = R[3 * i + 2]
      // fila i de R·[ω]×
      out.push(b * w3 - c * w2, c * w1 - a * w3, a * w2 - b * w1)
    }
    return out
  }
}

export function rotacionLibre(I: V3, w0: V3, tMax: number, tol = 1e-11) {
  return dormandPrince(campoEuler(I), 0, [...w0, 1, 0, 0, 0, 1, 0, 0, 0, 1], tMax, tol, 400000)
}

export function invariantesEuler(I: V3, y: number[]) {
  const w = y.slice(0, 3)
  const Lc = w.map((x, i) => I[i] * x)
  const R = y.slice(3)
  const L: V3 = [0, 1, 2].map((i) => R[3 * i] * Lc[0] + R[3 * i + 1] * Lc[1] + R[3 * i + 2] * Lc[2]) as V3
  const E = 0.5 * w.reduce((a, x, i) => a + I[i] * x * x, 0)
  return { E, L, L2: Lc.reduce((a, x) => a + x * x, 0) }
}

/**
 * Periodo de ω(t) en la rotación libre (Landau §37): las componentes son funciones elípticas de
 * Jacobi y la que va como sn tiene periodo 4K(k)/λ. Devuelve null si I no es asimétrico o
 * el movimiento es una rotación estacionaria.
 */
export function periodoEuler(I: V3, w: V3): number | null {
  const orden = [0, 1, 2].sort((a, b) => I[a] - I[b])
  const [I1, I2, I3] = orden.map((i) => I[i])
  if (I2 - I1 < 1e-12 * I3 || I3 - I2 < 1e-12 * I3) return null
  const ws = orden.map((i) => w[i])
  const E2 = ws.reduce((a, x, i) => a + [I1, I2, I3][i] * x * x, 0)
  const L2 = ws.reduce((a, x, i) => a + ([I1, I2, I3][i] * x) ** 2, 0)
  let lam: number
  let k2: number
  if (L2 > E2 * I2) {
    lam = Math.sqrt(((I3 - I2) * (L2 - E2 * I1)) / (I1 * I2 * I3))
    k2 = ((I2 - I1) * (E2 * I3 - L2)) / ((I3 - I2) * (L2 - E2 * I1))
  } else {
    lam = Math.sqrt(((I2 - I1) * (E2 * I3 - L2)) / (I1 * I2 * I3))
    k2 = ((I3 - I2) * (L2 - E2 * I1)) / ((I2 - I1) * (E2 * I3 - L2))
  }
  if (!(lam > 0) || !(k2 >= 0 && k2 < 1)) return null
  return (4 * elipticaK(Math.sqrt(k2))) / lam
}

/** Forma de una caja homogénea de masa 1 con esos momentos principales (lados a, b, c). */
export function cajaEquivalente(I: V3): V3 | null {
  const a2 = 6 * (I[1] + I[2] - I[0])
  const b2 = 6 * (I[0] + I[2] - I[1])
  const c2 = 6 * (I[0] + I[1] - I[2])
  if (a2 < 0 || b2 < 0 || c2 < 0) return null
  return [Math.sqrt(a2), Math.sqrt(b2), Math.sqrt(c2)]
}

/* ── peonza simétrica pesada: ángulos de Euler z-x-z, (θ, φ, ψ) ── */

export const L_PEONZA = "1/2*ia*(theta'^2 + phi'^2*sin(theta)^2) + 1/2*ic*(psi' + phi'*cos(theta))^2 - mgl*cos(theta)"

let peonzaSis: Sistema | null = null
export function sistemaPeonza(): Sistema {
  peonzaSis ??= analizarLagrangiano('theta, phi, psi', L_PEONZA, ['ia', 'ic', 'mgl'])
  return peonzaSis
}

export interface Peonza {
  ia: number
  ic: number
  mgl: number
  theta0: number
  phid0: number
  thetad0: number
  /** ω₃ = ψ̇ + φ̇ cos θ, constante del movimiento */
  w3: number
}

export function numericoPeonza(p: Peonza): Numerico {
  return numerico(sistemaPeonza(), { ia: p.ia, ic: p.ic, mgl: p.mgl })
}

export function estadoPeonza(p: Peonza): number[] {
  return [p.theta0, 0, 0, p.thetad0, p.phid0, p.w3 - p.phid0 * Math.cos(p.theta0)]
}

/**
 * φ̇ de la precesión uniforme (θ̇ = θ̈ = 0): I₁ cos θ φ̇² − I₃ω₃ φ̇ + mgl = 0; se da la raíz lenta.
 * null si el trompo gira demasiado despacio para precesionar sin cabecear.
 */
export function precesionUniforme(p: Pick<Peonza, 'ia' | 'ic' | 'mgl' | 'theta0' | 'w3'>): number | null {
  const a = p.ia * Math.cos(p.theta0)
  const b = -p.ic * p.w3
  const c = p.mgl
  if (Math.abs(a) < 1e-14) return -c / b
  const disc = b * b - 4 * a * c
  if (disc < 0) return null
  // forma estable de la raíz pequeña
  const q = -0.5 * (b + Math.sign(b || 1) * Math.sqrt(disc))
  return c / q
}

/**
 * Puntos de retorno de la nutación: con u = cos θ, u̇² = f(u) = (1 − u²)(α − βu) − (b − au)²,
 * cúbica cuyas dos raíces en [−1, 1] acotan θ.
 */
export function retornos(p: Peonza): [number, number] | null {
  const pPsi = p.ic * p.w3
  const u0 = Math.cos(p.theta0)
  const s2 = 1 - u0 * u0
  const pPhi = p.ia * p.phid0 * s2 + pPsi * u0
  const E = 0.5 * p.ia * (p.thetad0 ** 2 + p.phid0 ** 2 * s2) + 0.5 * p.ic * p.w3 ** 2 + p.mgl * u0
  const a = pPsi / p.ia
  const b = pPhi / p.ia
  const al = (2 * E - p.ic * p.w3 ** 2) / p.ia
  const be = (2 * p.mgl) / p.ia
  const raices = raicesPolinomio([al - b * b, 2 * a * b - be, -al - a * a, be])
  const us = raices.filter(([re, im]) => Math.abs(im) < 1e-7 && re >= -1 - 1e-9 && re <= 1 + 1e-9).map(([re]) => Math.min(1, Math.max(-1, re))).sort((x, y) => x - y)
  if (us.length < 2) return null
  // el movimiento vive entre las dos raíces que encierran u₀
  let lo = -1
  let hi = 1
  for (const u of us) {
    if (u <= u0 + 1e-9) lo = Math.max(lo, u)
    if (u >= u0 - 1e-9) hi = Math.min(hi, u)
  }
  return [Math.acos(hi), Math.acos(lo)]
}

/** Matriz de rotación z-x-z: R = Rz(φ) Rx(θ) Rz(ψ). La columna 3 es el eje de la peonza. */
export function rotacionEuler(theta: number, phi: number, psi: number): Mat {
  const [cf, sf, ct, st, cp, sp] = [Math.cos(phi), Math.sin(phi), Math.cos(theta), Math.sin(theta), Math.cos(psi), Math.sin(psi)]
  return [
    [cf * cp - sf * ct * sp, -cf * sp - sf * ct * cp, sf * st],
    [sf * cp + cf * ct * sp, -sf * sp + cf * ct * cp, -cf * st],
    [st * sp, st * cp, ct],
  ]
}
