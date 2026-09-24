import { analizar, compilarNodo, tex, variablesDe, type FuncionUsuario, type Nodo } from './expresion'

/**
 * La vista algebraica de Gráficas: cada fila es texto libre y aquí se decide
 * qué es (función, curva implícita, inecuación, paramétrica, polar, punto o
 * deslizador), qué parámetros libres usa y cómo se evalúa.
 */

export interface Fila {
  src: string
  visible: boolean
}

export interface Param {
  v: number
  min: number
  max: number
  anim?: boolean
}

type F1 = (x: number) => number
type F2 = (x: number, y: number) => number

/** Una condición de inecuación ya normalizada: F > 0 (estricta) o F ≥ 0. */
export interface Condicion {
  F: F2
  estricta: boolean
}

export type Objeto = { tex: string | null } & (
  | { k: 'vacio' }
  | { k: 'error'; error: string }
  | { k: 'funcion'; nombre: string; f: F1 }
  | { k: 'funcionY'; f: F1 }
  | { k: 'implicita'; F: F2 }
  | { k: 'inecuacion'; condiciones: Condicion[] }
  | { k: 'parametrica'; X: F1; Y: F1; dom: [number, number] }
  | { k: 'polar'; r: F1; dom: [number, number] }
  | { k: 'punto'; nombre: string | null; x: number; y: number; libre: boolean }
  | { k: 'deslizador'; nombre: string; v: number }
)

export const TIPOS: Record<Objeto['k'], string> = {
  vacio: '',
  error: '',
  funcion: 'función',
  funcionY: 'función de y',
  implicita: 'curva implícita',
  inecuacion: 'región',
  parametrica: 'curva paramétrica',
  polar: 'curva polar',
  punto: 'punto',
  deslizador: 'deslizador',
}

/* ---------- troceado a nivel cero ---------- */

/** Parte por `sep` fuera de paréntesis. */
export function nivel0(s: string, sep: string): string[] {
  const out: string[] = []
  let prof = 0
  let ini = 0
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (c === '(') prof++
    else if (c === ')') prof--
    else if (prof === 0 && c === sep) {
      out.push(s.slice(ini, i))
      ini = i + 1
    }
  }
  out.push(s.slice(ini))
  return out
}

/** Posiciones de los `=` sueltos (no los de <=, >=, ==, !=) fuera de paréntesis. */
export function iguales(s: string): number[] {
  const out: number[] = []
  let prof = 0
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (c === '(') prof++
    else if (c === ')') prof--
    else if (c === '=' && prof === 0 && !'<>=!'.includes(s[i - 1] ?? '') && s[i + 1] !== '=') out.push(i)
  }
  return out
}

/** `(a, b)` con la coma en el primer nivel dentro del paréntesis exterior. */
export function tupla(s: string): string[] | null {
  const t = s.trim()
  if (!t.startsWith('(') || !t.endsWith(')')) return null
  let prof = 0
  for (let i = 0; i < t.length; i++) {
    if (t[i] === '(') prof++
    else if (t[i] === ')') prof--
    if (prof === 0 && i < t.length - 1) return null
  }
  const dentro = nivel0(t.slice(1, -1), ',')
  return dentro.length >= 2 ? dentro : null
}

const esComparacion = (n: Nodo) => n.t === 'cmp' || n.t === 'y'

function comparaciones(n: Nodo): Array<Extract<Nodo, { t: 'cmp' }>> {
  if (n.t === 'y') return [...comparaciones(n.a), ...comparaciones(n.b)]
  if (n.t === 'cmp') return [n]
  return []
}

const NOMBRE = /^[A-Za-z][A-Za-z0-9_]*$/
const NUMERO = /^\s*-?\s*(\d+(\.\d*)?|\.\d+)\s*$/
const AUTO = ['f', 'g', 'h', 'p', 'q', 'k', 'm', 'n', 'u', 'v', 'w']
const PUNTOS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
/** Variables que nunca se convierten en deslizador. */
const RESERVADAS = ['x', 'y']

/* ---------- primera pasada: la forma de cada fila ---------- */

interface Forma {
  k: Objeto['k']
  /** Trozos que se compilan, con las variables propias de cada uno. */
  trozos: Array<{ src: string; vars: string[] }>
  restr: string | null
  /** Variable de la restricción: x, t o theta. */
  varRestr: string
  nombre: string | null
  /** Solo implícitas: los dos lados, para componerlos con su igual. */
  lados?: [string, string]
  error?: string
}

function forma(src: string, deslizadores: Set<string>): Forma {
  const base = { trozos: [], restr: null, varRestr: 'x', nombre: null }
  const s = src.trim()
  if (!s) return { ...base, k: 'vacio' }
  const vars = (e: string, propias: string[]) => {
    try {
      return variablesDe(analizar(e, { variables: [...propias, ...deslizadores] }))
    } catch {
      return []
    }
  }

  let cuerpo = s
  let restr: string | null = null
  const partes = nivel0(s, ',')
  if (partes.length > 1) {
    const ultima = partes[partes.length - 1]
    let n: Nodo | null = null
    try {
      n = analizar(ultima)
    } catch {
      /* no es una restricción */
    }
    if (!n || !esComparacion(n)) return { ...base, k: 'error', error: 'sobra una coma (¿querías un punto entre paréntesis?)' }
    restr = ultima
    cuerpo = partes.slice(0, -1).join(',')
  }

  const eq = iguales(cuerpo)
  if (eq.length > 1) return { ...base, k: 'error', error: 'sobra un signo =' }

  if (eq.length === 1) {
    const izq = cuerpo.slice(0, eq[0]).trim()
    const der = cuerpo.slice(eq[0] + 1).trim()
    if (!izq || !der) return { ...base, k: 'error', error: 'falta un lado de la igualdad' }
    const def = izq.match(/^([A-Za-z][A-Za-z0-9_]*)\s*\(\s*([A-Za-zθ]+)\s*\)$/)
    if (def) {
      const v = def[2].toLowerCase().replace('θ', 'theta')
      return { ...base, k: 'funcion', nombre: def[1], trozos: [{ src: der, vars: [v] }], restr, varRestr: v }
    }
    const l = izq.toLowerCase()
    if (l === 'y' && !vars(der, ['x', 'y']).includes('y'))
      return { ...base, k: 'funcion', trozos: [{ src: der, vars: ['x'] }], restr }
    if (l === 'x' && !vars(der, ['x', 'y']).includes('x'))
      return { ...base, k: 'funcionY', trozos: [{ src: der, vars: ['y'] }], restr, varRestr: 'y' }
    if (l === 'r') {
      const vs = vars(der, ['x', 'y', 'theta'])
      if (!vs.includes('x') && !vs.includes('y'))
        return { ...base, k: 'polar', trozos: [{ src: der, vars: ['theta'] }], restr, varRestr: 'theta' }
    }
    if (NOMBRE.test(izq) && !RESERVADAS.includes(l)) {
      const t = tupla(der)
      if (t) return { ...base, k: 'punto', nombre: izq, trozos: t.map((e) => ({ src: e, vars: [] })), restr }
      if (NUMERO.test(der)) return { ...base, k: 'deslizador', nombre: izq, trozos: [{ src: der, vars: [] }] }
      return { ...base, k: 'funcion', nombre: izq, trozos: [{ src: der, vars: ['x'] }], restr }
    }
    return { ...base, k: 'implicita', trozos: [{ src: `(${izq})-(${der})`, vars: ['x', 'y'] }], restr, lados: [izq, der] }
  }

  const t = tupla(cuerpo)
  if (t) {
    if (t.length !== 2) return { ...base, k: 'error', error: 'un punto lleva dos coordenadas' }
    const usaT = t.some((e) => vars(e, ['t']).includes('t'))
    if (usaT) return { ...base, k: 'parametrica', trozos: t.map((e) => ({ src: e, vars: ['t'] })), restr, varRestr: 't' }
    return { ...base, k: 'punto', trozos: t.map((e) => ({ src: e, vars: [] })), restr }
  }

  let n: Nodo | null = null
  try {
    n = analizar(cuerpo, { variables: ['x', 'y', ...deslizadores] })
  } catch {
    /* el error sale al compilar */
  }
  if (n && esComparacion(n)) return { ...base, k: 'inecuacion', trozos: [{ src: cuerpo, vars: ['x', 'y'] }], restr }
  if (n && variablesDe(n).includes('y')) return { ...base, k: 'error', error: 'una curva en x e y necesita un = o una desigualdad' }
  return { ...base, k: 'funcion', trozos: [{ src: cuerpo, vars: ['x'] }], restr }
}

/* ---------- segunda pasada: parámetros ---------- */

export interface Analisis {
  objetos: Objeto[]
  /** Parámetros que usa la construcción, en orden de aparición. */
  parametros: string[]
  /** Deslizadores escritos a mano (`a = 2`): nombre → fila, para reescribirla al moverlo. */
  definidos: Record<string, number>
  funciones: Record<string, F1>
}

export function analizarFilas(filas: Fila[], params: Record<string, Param>): Analisis {
  // lo escrito en la fila manda sobre el valor guardado del deslizador
  const escritos = new Map<string, number>()
  const definidos: Record<string, number> = {}
  filas.forEach((f, i) => {
    const m = f.src.trim().match(/^([A-Za-z][A-Za-z0-9_]*)\s*=\s*(-?\s*(\d+(\.\d*)?|\.\d+))\s*$/)
    const n = m?.[1].toLowerCase()
    if (m && n && !RESERVADAS.includes(n) && n !== 'r' && !(n in definidos)) {
      escritos.set(n, Number(m[2].replace(/\s+/g, '')))
      definidos[n] = i
    }
  })
  const deslizadores = new Set(escritos.keys())
  const formas = filas.map((f) => forma(f.src, deslizadores))

  // nombres de función: los escritos y, para las anónimas, el primero libre de f, g, h…
  const usados = new Set(formas.filter((f) => f.k === 'funcion' && f.nombre).map((f) => f.nombre!.toLowerCase()))
  for (const f of formas) {
    if (f.k === 'funcion' && !f.nombre) {
      const libre = AUTO.find((n) => !usados.has(n) && !deslizadores.has(n))
      f.nombre = libre ?? `f${usados.size}`
      usados.add(f.nombre)
    }
  }
  const nombresFn = [...usados]

  const parametros: string[] = []
  for (const f of formas) {
    const trozos = f.restr ? [...f.trozos, { src: f.restr, vars: [f.varRestr] }] : f.trozos
    for (const t of trozos) {
      try {
        const n = analizar(t.src, { variables: [...t.vars, ...deslizadores], funciones: nombresFn })
        for (const v of variablesDe(n)) {
          if (!t.vars.includes(v) && !RESERVADAS.includes(v) && !nombresFn.includes(v) && !parametros.includes(v)) parametros.push(v)
        }
      } catch {
        /* se informa al compilar */
      }
    }
  }
  for (const d of deslizadores) if (!parametros.includes(d)) parametros.push(d)

  const valores = parametros.map((p) => escritos.get(p) ?? params[p]?.v ?? 1)
  const impl: Record<string, F1> = {}
  let profundidad = 0
  const usuario: Record<string, FuncionUsuario> = {}
  for (const n of nombresFn) {
    // una función que se llama a sí misma (f(x) = f(x) + 1) devuelve NaN en vez de colgar
    usuario[n] = (x) => {
      if (profundidad > 40) return NaN
      profundidad++
      try {
        return impl[n] ? impl[n](x) : NaN
      } finally {
        profundidad--
      }
    }
  }

  const compila = (src: string, vars: string[]) => {
    const n = analizar(src, { variables: [...vars, ...parametros], funciones: nombresFn })
    const raw = compilarNodo(n, [...vars, ...parametros], usuario)
    return { n, f: (...a: number[]) => raw(...a, ...valores) }
  }

  const objetos = formas.map((fm): Objeto => {
    if (fm.k === 'vacio') return { k: 'vacio', tex: null }
    if (fm.k === 'error') return { k: 'error', error: fm.error!, tex: null }
    try {
      const nodos = fm.trozos.map((t) => compila(t.src, t.vars))
      let mascara: ((v: number) => boolean) | null = null
      let dom: [number, number] | null = null
      if (fm.restr) {
        const r = compila(fm.restr, [fm.varRestr])
        mascara = (v) => r.f(v) !== 0
        dom = limites(r.n, fm.varRestr, (m) => compilarNodo(m, parametros, usuario)(...valores))
      }
      const conMascara = (f: F1): F1 => (mascara ? (x) => (mascara!(x) ? f(x) : NaN) : f)
      const texR = fm.restr ? `,\\; ${tex(analizar(fm.restr, { variables: [fm.varRestr, ...parametros] }))}` : ''
      const tx = (i: number) => tex(nodos[i].n)

      switch (fm.k) {
        case 'funcion': {
          const f = nodos[0].f
          const v = fm.varRestr
          impl[fm.nombre!.toLowerCase()] = conMascara((x) => f(x))
          return { k: 'funcion', nombre: fm.nombre!, f: impl[fm.nombre!.toLowerCase()], tex: `${fm.nombre}(${v === 'theta' ? '\\theta' : v}) = ${tx(0)}${texR}` }
        }
        case 'funcionY':
          return { k: 'funcionY', f: conMascara((y) => nodos[0].f(y)), tex: `x = ${tx(0)}${texR}` }
        case 'implicita': {
          const [izq, der] = fm.lados!
          const ctx = { variables: ['x', 'y', ...parametros], funciones: nombresFn }
          return { k: 'implicita', F: (x, y) => nodos[0].f(x, y), tex: `${tex(analizar(izq, ctx))} = ${tex(analizar(der, ctx))}${texR}` }
        }
        case 'inecuacion': {
          const condiciones = comparaciones(nodos[0].n).map((c): Condicion => {
            if (c.v === '==' || c.v === '!=') throw new Error('una región se escribe con <, >, ≤ o ≥')
            const vs = ['x', 'y', ...parametros]
            const a = compilarNodo(c.a, vs, usuario)
            const b = compilarNodo(c.b, vs, usuario)
            const menor = c.v === '<' || c.v === '<='
            return {
              F: (x, y) => (menor ? b(x, y, ...valores) - a(x, y, ...valores) : a(x, y, ...valores) - b(x, y, ...valores)),
              estricta: c.v === '<' || c.v === '>',
            }
          })
          return { k: 'inecuacion', condiciones, tex: `${tx(0)}${texR}` }
        }
        case 'parametrica': {
          const d = dom ?? [0, 2 * Math.PI]
          return { k: 'parametrica', X: conMascara((t) => nodos[0].f(t)), Y: conMascara((t) => nodos[1].f(t)), dom: finito(d, [0, 2 * Math.PI]), tex: `\\left(${tx(0)},\\; ${tx(1)}\\right)${texR || ',\\; 0 \\le t \\le 2\\pi'}` }
        }
        case 'polar': {
          const d = dom ?? [0, 2 * Math.PI]
          return { k: 'polar', r: conMascara((t) => nodos[0].f(t)), dom: finito(d, [0, 2 * Math.PI]), tex: `r = ${tx(0)}${texR}` }
        }
        case 'punto': {
          const x = nodos[0].f()
          const y = nodos[1].f()
          const libre = fm.trozos.every((t) => NUMERO.test(t.src))
          return { k: 'punto', nombre: fm.nombre, x, y, libre, tex: `${fm.nombre ? `${fm.nombre} = ` : ''}\\left(${tx(0)},\\; ${tx(1)}\\right)` }
        }
        case 'deslizador': {
          const v = nodos[0].f()
          return { k: 'deslizador', nombre: fm.nombre!, v, tex: `${tex(analizar(fm.nombre!, { variables: [fm.nombre!.toLowerCase()] }))} = ${tx(0)}` }
        }
      }
    } catch (e) {
      return { k: 'error', error: (e as Error).message, tex: null }
    }
    return { k: 'error', error: 'no se entiende', tex: null }
  })

  return { objetos, parametros, definidos, funciones: impl }
}

/** Saca [a, b] de una restricción como 0 < t < 2π o t ≥ 1. */
function limites(n: Nodo, v: string, valor: (m: Nodo) => number): [number, number] | null {
  let lo = -Infinity
  let hi = Infinity
  const esV = (m: Nodo) => m.t === 'var' && m.v === v
  const num = (m: Nodo) => (variablesDe(m).includes(v) ? NaN : valor(m))
  for (const c of comparaciones(n)) {
    const menor = c.v === '<' || c.v === '<='
    if (esV(c.b)) {
      const k = num(c.a)
      if (menor) lo = Math.max(lo, k)
      else hi = Math.min(hi, k)
    } else if (esV(c.a)) {
      const k = num(c.b)
      if (menor) hi = Math.min(hi, k)
      else lo = Math.max(lo, k)
    }
  }
  return lo === -Infinity && hi === Infinity ? null : [lo, hi]
}

/** Un dominio de curva tiene que ser finito: si un lado queda abierto, se cierra con el por defecto. */
function finito(d: [number, number], defecto: [number, number]): [number, number] {
  const a = Number.isFinite(d[0]) ? d[0] : Number.isFinite(d[1]) ? d[1] - (defecto[1] - defecto[0]) : defecto[0]
  const b = Number.isFinite(d[1]) ? d[1] : a + (defecto[1] - defecto[0])
  return [a, b]
}

/** Siguiente nombre de punto libre: A, B, C… */
export function nombrePunto(filas: Fila[]): string {
  const usados = new Set(filas.map((f) => f.src.trim().match(/^([A-Z][A-Za-z0-9_]*)\s*=/)?.[1]).filter(Boolean))
  return PUNTOS.split('').find((c) => !usados.has(c)) ?? `P${filas.length}`
}

/* ---------- puntos notables ---------- */

export const derivada = (f: F1, x: number, h = 1e-5) => (f(x + h) - f(x - h)) / (2 * h)
export const segunda = (f: F1, x: number, h = 1e-3) => (f(x + h) - 2 * f(x) + f(x - h)) / (h * h)

/** Simpson sobre [a, b]. */
export function integral(f: F1, a: number, b: number, n = 2000) {
  if (b === a) return 0
  const m = n % 2 ? n + 1 : n
  const h = (b - a) / m
  let s = f(a) + f(b)
  for (let i = 1; i < m; i++) s += f(a + i * h) * (i % 2 ? 4 : 2)
  return (s * h) / 3
}

/** Cambios de signo en [a, b], afinados por bisección. Un salto enorme es un polo, no un cero. */
export function ceros(f: F1, a: number, b: number, n = 600) {
  const out: number[] = []
  const guarda = (x: number) => {
    if (!out.some((y) => Math.abs(y - x) < (b - a) / (4 * n))) out.push(x)
  }
  let prev = f(a)
  if (prev === 0) guarda(a)
  // una meseta que empieza antes de a no es una raíz nueva en cada muestra
  for (let i = 1; i <= n; i++) {
    const x = a + ((b - a) * i) / n
    const v = f(x)
    // una muestra que cae justo en el cero no cambia de signo: hay que mirarla aparte
    if (v === 0) {
      // una meseta de ceros (floor x en [0, 1)) cuenta una vez, por donde empieza
      if (prev !== 0) guarda(x)
      prev = v
      continue
    }
    if (Number.isFinite(prev) && Number.isFinite(v) && prev * v < 0 && Math.abs(v - prev) < 1e6) {
      let lo = a + ((b - a) * (i - 1)) / n
      let hi = x
      for (let k = 0; k < 60; k++) {
        const m = (lo + hi) / 2
        if (f(lo) * f(m) <= 0) hi = m
        else lo = m
      }
      const r = (lo + hi) / 2
      // tras bisecar, un polo (tan x en π/2) deja |f| enorme: no es un cero
      if (Math.abs(f(r)) < 1e-6 * Math.max(1, Math.abs(prev), Math.abs(v))) guarda(r)
    }
    prev = v
  }
  return out.sort((x, y) => x - y)
}

/** f en x, o su valor límite si x es un punto evitable (sin x / x en 0). */
export function valorOLimite(f: F1, x: number): number {
  const v = f(x)
  if (Number.isFinite(v)) return v
  const h = 1e-6 * Math.max(1, Math.abs(x))
  const [i, d] = [f(x - h), f(x + h)]
  return Number.isFinite(i) && Number.isFinite(d) && Math.abs(i - d) < 1e-4 * Math.max(1, Math.abs(d)) ? (i + d) / 2 : NaN
}

/** Cambio de signo de verdad a los dos lados de x, por encima del ruido de las diferencias finitas. */
function cambiaDeSigno(g: F1, x: number, paso: number, ruido: number) {
  const [i, d] = [g(x - paso), g(x + paso)]
  return Number.isFinite(i) && Number.isFinite(d) && i * d < 0 && Math.abs(i) > ruido && Math.abs(d) > ruido
}

export const extremos = (f: F1, a: number, b: number) => {
  const paso = (b - a) / 1600
  return ceros((x) => derivada(f, x), a, b, 800)
    .filter((x) => cambiaDeSigno((t) => derivada(f, t), x, paso, 1e-9))
    .map((x) => {
      const i = derivada(f, x - paso)
      return { x, y: valorOLimite(f, x), tipo: i < 0 ? 'mín' : 'máx' }
    })
}

export const inflexiones = (f: F1, a: number, b: number) => {
  const paso = (b - a) / 1600
  // f″ por diferencias finitas tiene ruido ~ ε|f|/h²: por debajo de eso no hay curvatura que valga
  return ceros((x) => segunda(f, x), a, b, 800)
    .filter((x) => cambiaDeSigno((t) => segunda(f, t), x, paso, 1e-6 * (1 + Math.abs(f(x)))))
    .map((x) => ({ x, y: valorOLimite(f, x) }))
}

export const cortes = (f: F1, g: F1, a: number, b: number) => ceros((x) => f(x) - g(x), a, b).map((x) => ({ x, y: f(x) }))

export interface Asintotas {
  verticales: number[]
  /** y = m·x + b hacia +∞, −∞ o los dos (m = 0: horizontal). */
  oblicuas: Array<{ m: number; b: number; lado: '+' | '-' | '±' }>
}

/** |f| crece sin cota al acercarse a x por el lado `signo` (también despacio, como ln). */
function explota(f: F1, x: number, signo: 1 | -1): boolean {
  const esc = Math.max(1, Math.abs(x))
  const v = [1e-4, 1e-8, 1e-12].map((d) => Math.abs(f(x + signo * d * esc)))
  if (v.some((w) => w === Infinity)) return true
  return v.every(Number.isFinite) && v[1] > 1.3 * v[0] && v[2] > 1.3 * v[1] && v[2] > 10
}

const redondea = (v: number) => (Math.abs(v - Math.round(v)) < 1e-7 ? Math.round(v) : +v.toFixed(8))

export function asintotas(f: F1, a: number, b: number): Asintotas {
  // verticales: donde 1/f se anula y f se escapa
  const inv = (x: number) => 1 / f(x)
  const verticales: number[] = []
  const n = 1200
  const h = (b - a) / n
  for (let i = 1; i < n; i++) {
    const x0 = a + (i - 1) * h
    const x1 = a + i * h
    const x2 = a + (i + 1) * h
    const [g0, g1, g2] = [Math.abs(inv(x0)), Math.abs(inv(x1)), Math.abs(inv(x2))]
    if (!(g1 <= g0 && g1 <= g2) || !Number.isFinite(g0) || !Number.isFinite(g2)) continue
    // mínimo local de |1/f|: se afina por sección dorada
    let lo = x0
    let hi = x2
    for (let k = 0; k < 80; k++) {
      const m1 = lo + (hi - lo) * 0.382
      const m2 = lo + (hi - lo) * 0.618
      if (Math.abs(inv(m1)) < Math.abs(inv(m2))) hi = m2
      else lo = m1
    }
    const x = (lo + hi) / 2
    const cerca = Math.min(Math.abs(inv(x)), Math.abs(inv(lo)), Math.abs(inv(hi)))
    const polo = (cerca < 1e-7 || !Number.isFinite(f(x))) && Math.abs(f(x - 1e-4)) > 1e3
    // ln|x| en 0: |1/f| baja muy despacio, pero |f| sigue creciendo
    const lento = explota(f, x, 1) || explota(f, x, -1)
    if ((polo || lento) && !verticales.some((v) => Math.abs(v - x) < 2 * h)) verticales.push(redondea(x))
  }
  // en el borde del dominio (ln x, 1/√x en 0): donde f pasa de no estar definida a estarlo
  for (let i = 1; i <= n; i++) {
    const [x0, x1] = [a + (i - 1) * h, a + i * h]
    const [d0, d1] = [Number.isFinite(f(x0)), Number.isFinite(f(x1))]
    if (d0 === d1) continue
    let [lo, hi] = [x0, x1]
    for (let k = 0; k < 70; k++) {
      const m = (lo + hi) / 2
      if (Number.isFinite(f(m)) === d0) lo = m
      else hi = m
    }
    const borde = redondea(d0 ? lo : hi)
    if (explota(f, borde, d0 ? -1 : 1) && !verticales.some((v) => Math.abs(v - borde) < 2 * h)) verticales.push(borde)
  }
  verticales.sort((p, q) => p - q)

  // oblicuas y horizontales: pendiente y ordenada estables muy lejos
  const oblicuas: Asintotas['oblicuas'] = []
  for (const s of [1, -1] as const) {
    // más lejos, la resta y − m·x pierde las cifras de b
    const xs = [1e3, 1e4, 1e5].map((x) => s * x)
    const ys = xs.map(f)
    if (!ys.every(Number.isFinite)) continue
    const m1 = (ys[1] - ys[0]) / (xs[1] - xs[0])
    const m2 = (ys[2] - ys[1]) / (xs[2] - xs[1])
    if (Math.abs(m1 - m2) > 1e-4 * Math.max(1, Math.abs(m2))) continue
    const m = redondea(Math.abs(m2) < 1e-6 ? 0 : m2)
    const b1 = ys[1] - m * xs[1]
    const b2 = ys[2] - m * xs[2]
    if (Math.abs(b1 - b2) > 1e-2 * Math.max(1, Math.abs(b2))) continue
    // Richardson: si b(x) = b∞ + c/x, dos muestras bastan para quitar el término c/x
    const b = (xs[2] * b2 - xs[1] * b1) / (xs[2] - xs[1])
    // si f es esa misma recta (|x|, x + 2 con un hueco), no es una asíntota: es la función
    // (se mira más cerca: muy lejos eˣ ya es 0 en coma flotante y parecería la recta misma)
    const cerca = [10, 20, 50].map((x) => s * x)
    if (cerca.every((x) => Math.abs(f(x) - (m * x + b)) <= 1e-12 * Math.max(Math.abs(f(x)), Math.abs(m * x + b)))) continue
    const asin = { m, b: redondea(b), lado: s > 0 ? ('+' as '+' | '-' | '±') : ('-' as '+' | '-' | '±') }
    const igual = oblicuas.find((o) => Math.abs(o.m - asin.m) < 1e-6 && Math.abs(o.b - asin.b) < 1e-4)
    if (igual) igual.lado = '±'
    else oblicuas.push(asin)
  }
  return { verticales, oblicuas }
}
