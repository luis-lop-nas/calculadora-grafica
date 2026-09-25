/**
 * Análisis dimensional: una dimensión es el vector de exponentes de las siete magnitudes
 * básicas del SI. Se multiplican sumando exponentes; una suma o una igualdad solo tiene
 * sentido si todos sus términos tienen la misma dimensión, y los argumentos de sin, exp o
 * ln tienen que ser adimensionales. Así se comprueba la homogeneidad de una fórmula escrita.
 */
import { desdeNodo, type E } from './cas/expr'
import { tex } from './cas/tex'
import { analizar } from './expresion'

/** Exponentes de L, M, T, I, Θ, N, J (longitud, masa, tiempo, corriente, temperatura, cantidad, intensidad luminosa). */
export type Dim = [number, number, number, number, number, number, number]

export const BASES = ['L', 'M', 'T', 'I', 'Θ', 'N', 'J'] as const
const UNIDADES_BASE = ['m', 'kg', 's', 'A', 'K', 'mol', 'cd']

export const ADIM: Dim = [0, 0, 0, 0, 0, 0, 0]
const base = (i: number, e = 1): Dim => ADIM.map((_, k) => (k === i ? e : 0)) as Dim

export const mul = (a: Dim, b: Dim): Dim => a.map((x, i) => x + b[i]) as Dim
export const div = (a: Dim, b: Dim): Dim => a.map((x, i) => x - b[i]) as Dim
export const pot = (a: Dim, k: number): Dim => a.map((x) => x * k) as Dim
export const igual = (a: Dim, b: Dim) => a.every((x, i) => Math.abs(x - b[i]) < 1e-12)
export const esAdim = (a: Dim) => igual(a, ADIM)

/** Producto de dimensiones con potencias: d(L, 1, T, -2) = L·T⁻². */
export function d(...partes: Array<Dim | number>): Dim {
  let out = ADIM
  for (let i = 0; i < partes.length; i++) {
    const p = partes[i]
    if (typeof p === 'number') continue
    const k = typeof partes[i + 1] === 'number' ? (partes[i + 1] as number) : 1
    out = mul(out, pot(p, k))
  }
  return out
}

export const L = base(0)
export const M = base(1)
export const T = base(2)
export const I = base(3)
export const TEMP = base(4)
export const N = base(5)

/* ---------- magnitudes habituales ---------- */

export const DIM = {
  adim: ADIM,
  longitud: L,
  masa: M,
  tiempo: T,
  area: d(L, 2),
  volumen: d(L, 3),
  velocidad: d(L, 1, T, -1),
  aceleracion: d(L, 1, T, -2),
  frecuencia: d(T, -1),
  fuerza: d(M, 1, L, 1, T, -2),
  energia: d(M, 1, L, 2, T, -2),
  potencia: d(M, 1, L, 2, T, -3),
  momento: d(M, 1, L, 1, T, -1),
  momentoAngular: d(M, 1, L, 2, T, -1),
  inercia: d(M, 1, L, 2),
  rigidez: d(M, 1, T, -2),
  amortiguamiento: d(M, 1, T, -1),
  presion: d(M, 1, L, -1, T, -2),
  densidad: d(M, 1, L, -3),
  carga: d(I, 1, T, 1),
  corriente: I,
  potencial: d(M, 1, L, 2, T, -3, I, -1),
  campoE: d(M, 1, L, 1, T, -3, I, -1),
  campoB: d(M, 1, T, -2, I, -1),
  resistencia: d(M, 1, L, 2, T, -3, I, -2),
  inductancia: d(M, 1, L, 2, T, -2, I, -2),
  capacidad: d(M, -1, L, -2, T, 4, I, 2),
  epsilon0: d(M, -1, L, -3, T, 4, I, 2),
  mu0: d(M, 1, L, 1, T, -2, I, -2),
  temperatura: TEMP,
  cantidad: N,
  R: d(M, 1, L, 2, T, -2, TEMP, -1, N, -1),
  entropia: d(M, 1, L, 2, T, -2, TEMP, -1),
  accion: d(M, 1, L, 2, T, -1),
  numeroOnda: d(L, -1),
  G: d(M, -1, L, 3, T, -2),
} satisfies Record<string, Dim>

/** Unidades derivadas con nombre propio, para reconocer una dimensión. */
const CON_NOMBRE: Array<{ u: string; dim: Dim }> = [
  { u: 'N', dim: DIM.fuerza },
  { u: 'J', dim: DIM.energia },
  { u: 'W', dim: DIM.potencia },
  { u: 'Pa', dim: DIM.presion },
  { u: 's⁻¹ (Hz)', dim: DIM.frecuencia },
  { u: 'C', dim: DIM.carga },
  { u: 'V', dim: DIM.potencial },
  { u: 'Ω', dim: DIM.resistencia },
  { u: 'F', dim: DIM.capacidad },
  { u: 'H', dim: DIM.inductancia },
  { u: 'T', dim: DIM.campoB },
  { u: 'V/m', dim: DIM.campoE },
  { u: 'N/m', dim: DIM.rigidez },
  { u: 'J·s', dim: DIM.accion },
  { u: 'kg·m²', dim: DIM.inercia },
  { u: 'J/K', dim: DIM.entropia },
  { u: 'J/(mol·K)', dim: DIM.R },
]

const SUP: Record<string, string> = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '/': 'ᐟ', '.': '·' }
const sup = (k: number) => {
  if (k === 1) return ''
  const t = Number.isInteger(k) ? String(k) : k === 0.5 ? '1/2' : k === -0.5 ? '-1/2' : k === 1.5 ? '3/2' : k === -1.5 ? '-3/2' : String(+k.toFixed(3))
  return [...t].map((c) => SUP[c] ?? c).join('')
}

/** Texto como «M·L²·T⁻²»; 1 si es adimensional. */
export function texto(a: Dim): string {
  // orden de costumbre: M L T I Θ N J
  const orden = [1, 0, 2, 3, 4, 5, 6]
  const t = orden.filter((i) => Math.abs(a[i]) > 1e-12).map((i) => `${BASES[i]}${sup(a[i])}`)
  return t.length ? t.join('·') : '1'
}

/** TeX como \mathsf{M\,L^{2}\,T^{-2}}. */
export function texDim(a: Dim): string {
  const orden = [1, 0, 2, 3, 4, 5, 6]
  const nombre = ['\\mathsf{L}', '\\mathsf{M}', '\\mathsf{T}', '\\mathsf{I}', '\\Theta', '\\mathsf{N}', '\\mathsf{J}']
  const t = orden.filter((i) => Math.abs(a[i]) > 1e-12).map((i) => (a[i] === 1 ? nombre[i] : `${nombre[i]}^{${Number.isInteger(a[i]) ? a[i] : a[i] === 0.5 ? '1/2' : a[i] === -0.5 ? '-1/2' : a[i].toFixed(2)}}`))
  return t.length ? t.join('\\,') : '1'
}

/** Unidad SI: con nombre propio si la tiene, si no con las básicas (kg·m·s⁻²). */
export function unidadSI(a: Dim): string {
  if (esAdim(a)) return '—'
  const nombrada = CON_NOMBRE.find((c) => igual(c.dim, a))
  if (nombrada) return nombrada.u
  const orden = [1, 0, 2, 3, 4, 5, 6]
  return orden
    .filter((i) => Math.abs(a[i]) > 1e-12)
    .map((i) => `${UNIDADES_BASE[i]}${sup(a[i])}`)
    .join('·')
}

/**
 * «M L^2 T^-2», «L/T», «1» → dimensión. Para que se puedan corregir las supuestas a mano.
 */
export function leerDim(src: string): Dim | null {
  const t = src.trim()
  if (!t || t === '1' || /^adim/i.test(t)) return ADIM
  let out = ADIM
  let signo = 1
  for (const trozo of t.split(/(\/)|\s+|·|\*/).filter((x) => x !== undefined && x !== '')) {
    if (trozo === '/') {
      signo = -1
      continue
    }
    const m = trozo.match(/^(L|M|T|I|Θ|Th|N|J)(?:\^?\(?(-?\d+(?:[./]\d+)?)\)?)?$/)
    if (!m) return null
    const i = ['L', 'M', 'T', 'I', 'Θ', 'N', 'J'].indexOf(m[1] === 'Th' ? 'Θ' : m[1])
    let k = 1
    if (m[2]) k = m[2].includes('/') ? Number(m[2].split('/')[0]) / Number(m[2].split('/')[1]) : Number(m[2])
    out = mul(out, pot(base(i), signo * k))
  }
  return out
}

/* ---------- homogeneidad de una expresión ---------- */

export type Dims = Record<string, Dim>

export interface Termino {
  tex: string
  dim: Dim | null
  error?: string
  /** Un número suelto: vale con la dimensión de los demás términos. */
  constante?: boolean
}

/** Los números sueltos toman la dimensión del resto de la ecuación. */
function constantes(ts: Termino[]) {
  const otra = ts.find((t) => !t.constante && t.dim)?.dim
  if (otra) for (const t of ts) if (t.constante) t.dim = otra
}

/** Dimensión de una expresión del CAS, o el primer motivo por el que no la tiene. */
export function dimension(e: E, dims: Dims): { dim: Dim } | { error: string } {
  switch (e.t) {
    case 'q':
    case 'f':
      return { dim: ADIM }
    case 's':
      if (e.v === 'pi' || e.v === 'e') return { dim: ADIM }
      if (e.v in dims) return { dim: dims[e.v] }
      return { error: `no sé la dimensión de ${e.v}` }
    case '+': {
      let comun: Dim | null = null
      // un número suelto en una suma es una constante en unidades SI: toma la dimensión de los demás
      for (const t of e.a) {
        if (t.t === 'q' || t.t === 'f') continue
        const r = dimension(t, dims)
        if ('error' in r) return r
        if (comun && !igual(comun, r.dim)) return { error: `se suman ${texto(comun)} y ${texto(r.dim)}` }
        comun = r.dim
      }
      return { dim: comun ?? ADIM }
    }
    case '*': {
      let out = ADIM
      for (const f of e.a) {
        const r = dimension(f, dims)
        if ('error' in r) return r
        out = mul(out, r.dim)
      }
      return { dim: out }
    }
    case '^': {
      const b = dimension(e.b, dims)
      if ('error' in b) return b
      const x = dimension(e.e, dims)
      if ('error' in x) return x
      if (!esAdim(x.dim)) return { error: `el exponente tiene dimensiones (${texto(x.dim)})` }
      if (esAdim(b.dim)) return { dim: ADIM }
      const k = e.e.t === 'q' ? Number(e.e.n) / Number(e.e.d) : e.e.t === 'f' ? e.e.v : NaN
      if (!Number.isFinite(k)) return { error: 'una magnitud con dimensiones elevada a algo que no es un número' }
      return { dim: pot(b.dim, k) }
    }
    case 'fn': {
      const args = e.a.map((a) => dimension(a, dims))
      const mal = args.find((a) => 'error' in a)
      if (mal) return mal
      const ds = args.map((a) => (a as { dim: Dim }).dim)
      if (e.v === 'abs') return { dim: ds[0] }
      if (e.v === 'sqrt') return { dim: pot(ds[0], 0.5) }
      if (ds.some((x) => !esAdim(x))) return { error: `${e.v}(…) necesita un argumento adimensional, y tiene ${texto(ds.find((x) => !esAdim(x))!)}` }
      return { dim: ADIM }
    }
  }
}

export interface Ecuacion {
  nombre: string
  tex: string
  terminos: Termino[]
  /** Dimensión común si es homogénea; null si no. */
  dim: Dim | null
  error?: string
}

const GRIEGAS = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'varepsilon', 'zeta', 'eta', 'theta', 'kappa', 'lambda', 'mu', 'nu', 'xi', 'rho', 'sigma', 'tau', 'phi', 'varphi', 'chi', 'psi', 'omega', 'Gamma', 'Delta', 'Theta', 'Lambda', 'Phi', 'Psi', 'Omega', 'hbar']

/** Nombre de variable a TeX: v0y → v_{0y}, epsilon0 → \varepsilon_{0}, Ec → E_{c}, omega → \omega. */
export function texNombre(k: string): string {
  const g = [...GRIEGAS].sort((a, b) => b.length - a.length).find((x) => k.startsWith(x))
  const gr = (x: string) => (x === 'epsilon' ? '\\varepsilon' : x === 'hbar' ? '\\hbar' : `\\${x}`)
  if (g) return k.length === g.length ? gr(g) : `${gr(g)}_{${k.slice(g.length)}}`
  return k.length === 1 ? k : `${k[0]}_{${k.slice(1)}}`
}

/**
 * El analizador pasa todo a minúsculas (E sería el número e): cada símbolo se cambia por un
 * alias interno antes de leer y se devuelve con su TeX al escribir.
 */
function conAlias(src: string, dims: Dims) {
  const claves = Object.keys(dims).sort((a, b) => b.length - a.length)
  const alias = new Map<string, string>()
  claves.forEach((k, i) => alias.set(k, `zq${String.fromCharCode(97 + Math.floor(i / 26))}${String.fromCharCode(97 + (i % 26))}`))
  let t = src
  for (const k of claves) t = t.replace(new RegExp(`(?<![A-Za-z0-9_])${k}(?![A-Za-z0-9_])`, 'g'), alias.get(k)!)
  const dimsA: Dims = {}
  for (const [k, a] of alias) dimsA[a] = dims[k]
  const volver = (x: string) => {
    let r = x
    for (const [k, a] of alias) r = r.replaceAll(`\\mathrm{${a}}`, `{${texNombre(k)}}`)
    return r
  }
  return { t, dimsA, volver }
}

const leer = (src: string, dims: Dims): E => desdeNodo(analizar(src, { variables: Object.keys(dims) }), { funciones: {}, valores: {} })

/**
 * «E = 1/2*m*v^2 + m*g*h» → cada término con su dimensión y si la igualdad es homogénea. Los
 * nombres de `dims` se leen enteros y respetando mayúsculas (v0, epsilon0, Ec…).
 */
export function ecuacion(nombre: string, src: string, dims: Dims, texto_?: string): Ecuacion {
  const { t: fuente, dimsA, volver } = conAlias(src, dims)
  try {
    const lados = fuente.split('=')
    const partes = lados.map((l) => leer(l, dimsA))
    const terminos: Termino[] = []
    for (const p of partes) {
      const ts = p.t === '+' ? p.a : [p]
      for (const t of ts) {
        const r = dimension(t, dimsA)
        terminos.push({ tex: volver(tex(t)), dim: 'error' in r ? null : r.dim, error: 'error' in r ? volverError(r.error, dims, dimsA) : undefined })
      }
    }
    const texTodo = texto_ ?? partes.map((p) => volver(tex(p))).join(' = ')
    constantes(terminos)
    const conDim = terminos.filter((t) => t.dim)
    const mal = terminos.find((t) => t.error)
    if (mal) return { nombre, tex: texTodo, terminos, dim: null, error: mal.error }
    const d0 = conDim[0]?.dim ?? ADIM
    const distinta = conDim.find((t) => !igual(t.dim!, d0))
    if (distinta) return { nombre, tex: texTodo, terminos, dim: null, error: `no es homogénea: ${texto(d0)} frente a ${texto(distinta.dim!)}` }
    return { nombre, tex: texTodo, terminos, dim: d0 }
  } catch (e) {
    return { nombre, tex: src, terminos: [], dim: null, error: (e as Error).message }
  }
}

/** Lo mismo con una expresión que ya es del CAS (sus símbolos son las claves de `dims`): todos sus sumandos, y si igualan a `igualA`. */
export function ecuacionE(nombre: string, e: E, dims: Dims, texE: (x: E) => string = tex, igualA = ''): Ecuacion {
  const ts = e.t === '+' ? e.a : [e]
  const terminos: Termino[] = ts.map((t) => {
    const r = dimension(t, dims)
    return { tex: texE(t), dim: 'error' in r ? null : r.dim, error: 'error' in r ? r.error : undefined, constante: t.t === 'q' || t.t === 'f' }
  })
  const texTodo = `${texE(e)}${igualA}`
  constantes(terminos)
  const mal = terminos.find((t) => t.error)
  if (mal) return { nombre, tex: texTodo, terminos, dim: null, error: mal.error }
  const d0 = terminos[0]?.dim ?? ADIM
  const distinta = terminos.find((t) => !igual(t.dim!, d0))
  if (distinta) return { nombre, tex: texTodo, terminos, dim: null, error: `no es homogénea: ${texto(d0)} frente a ${texto(distinta.dim!)}` }
  return { nombre, tex: texTodo, terminos, dim: d0 }
}

function volverError(err: string, dims: Dims, dimsA: Dims): string {
  const inv = Object.keys(dims).sort((a, b) => b.length - a.length)
  let r = err
  const alias = Object.keys(dimsA)
  inv.forEach((k, i) => (r = r.replaceAll(alias[i], k)))
  return r
}

/* ---------- lo que un módulo declara ---------- */

export interface Magnitud {
  /** Símbolo en TeX. */
  simbolo: string
  nombre: string
  dim: Dim
  /** Valor actual con su unidad, si tiene sentido darlo. */
  valor?: string
}

export interface Dimensional {
  magnitudes: Magnitud[]
  ecuaciones: Ecuacion[]
  /** Aviso corto: unidades naturales del módulo, supuestos… */
  nota?: string
}

/** Atajo para declarar magnitudes: [símbolo TeX, nombre, dimensión, valor?]. */
export const mags = (...filas: Array<[string, string, Dim, string?]>): Magnitud[] => filas.map(([simbolo, nombre, dim, valor]) => ({ simbolo, nombre, dim, valor }))
