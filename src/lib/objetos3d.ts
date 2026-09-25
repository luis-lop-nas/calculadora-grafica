import { analizar, compilarNodo, tex, variablesDe, type Nodo } from './expresion'
import { iguales, nivel0, tupla, type Param } from './objetos2d'

/**
 * La vista algebraica del espacio: cada fila es una superficie implícita
 * (F(x, y, z) = G), z = f(x, y), un punto, una curva o superficie paramétrica,
 * o una orden (recta, plano, esfera, sólidos, revolución, corte de dos
 * superficies). Las letras libres se vuelven deslizadores, como en el plano.
 */

export type V3 = [number, number, number]
type F3 = (x: number, y: number, z: number) => number

export type Forma = 'cubo' | 'prisma' | 'piramide' | 'cono' | 'cilindro' | 'tetraedro' | 'octaedro' | 'dodecaedro' | 'icosaedro'

export type Objeto3 = { tex: string | null } & (
  | { k: 'vacio' }
  | { k: 'error'; error: string }
  /** F(x, y, z) = 0; `esfera` añade volumen y área. */
  | { k: 'implicita'; F: F3; medidas?: Medidas; plano?: { n: V3; d: number } }
  | { k: 'punto'; nombre: string | null; p: V3; libre: boolean }
  | { k: 'curva'; f: (t: number) => V3; dom: [number, number] }
  | { k: 'param'; f: (u: number, v: number) => V3; du: [number, number]; dv: [number, number] }
  | { k: 'linea'; tipo: 'recta' | 'segmento' | 'vector'; a: V3; b: V3 }
  | { k: 'solido'; forma: Forma; c: V3; a: number; h: number; n: number; medidas: Medidas }
  | { k: 'corte'; i: number; j: number }
  /** Distancias, ángulos y módulos: el valor, y lo que se dibuja para verlo. */
  | { k: 'medida'; v: number; unidad: '' | '°'; texto: string; en: V3; seg?: [V3, V3] }
  /** Base de vectores con origen común (Gram–Schmidt). */
  | { k: 'base'; o: V3; vs: V3[] }
)

export interface Medidas {
  volumen: number
  area: number
}

export const TIPOS3: Record<Objeto3['k'], string> = {
  vacio: '', error: '', implicita: 'superficie', punto: 'punto', curva: 'curva', param: 'superficie paramétrica',
  linea: 'recta', solido: 'sólido', corte: 'curva de corte', medida: 'medida', base: 'base ortonormal',
}

const RESERVADAS = ['x', 'y', 'z', 't', 'u', 'v']
const DOS_PI = 2 * Math.PI

export interface Analisis3 {
  objetos: Objeto3[]
  parametros: string[]
}

const tau = (n: number) => (2 * Math.PI) / n

/** Volumen y área de cada sólido; `a` es la arista (poliedros), el lado o el radio. */
export function medidasSolido(forma: Forma, a: number, h: number, n: number): Medidas {
  switch (forma) {
    case 'cubo':
      return { volumen: a ** 3, area: 6 * a * a }
    case 'cilindro':
      return { volumen: Math.PI * a * a * h, area: 2 * Math.PI * a * (a + h) }
    case 'cono':
      return { volumen: (Math.PI * a * a * h) / 3, area: Math.PI * a * (a + Math.hypot(a, h)) }
    case 'prisma': {
      const base = (n * a * a * Math.sin(tau(n))) / 2
      return { volumen: base * h, area: 2 * base + n * 2 * a * Math.sin(Math.PI / n) * h }
    }
    case 'piramide': {
      const base = (n * a * a * Math.sin(tau(n))) / 2
      const apotema = a * Math.cos(Math.PI / n)
      return { volumen: (base * h) / 3, area: base + (n * 2 * a * Math.sin(Math.PI / n) * Math.hypot(h, apotema)) / 2 }
    }
    case 'tetraedro':
      return { volumen: a ** 3 / (6 * Math.SQRT2), area: Math.sqrt(3) * a * a }
    case 'octaedro':
      return { volumen: (Math.SQRT2 / 3) * a ** 3, area: 2 * Math.sqrt(3) * a * a }
    case 'dodecaedro':
      return { volumen: ((15 + 7 * Math.sqrt(5)) / 4) * a ** 3, area: 3 * Math.sqrt(25 + 10 * Math.sqrt(5)) * a * a }
    case 'icosaedro':
      return { volumen: ((5 * (3 + Math.sqrt(5))) / 12) * a ** 3, area: 5 * Math.sqrt(3) * a * a }
  }
}

/** Radio de la esfera circunscrita de cada poliedro regular de arista a (lo que pide three.js). */
export function circunradio(forma: Forma, a: number) {
  switch (forma) {
    case 'tetraedro':
      return a * Math.sqrt(3 / 8)
    case 'octaedro':
      return a / Math.SQRT2
    case 'dodecaedro':
      return (a * Math.sqrt(3) * (1 + Math.sqrt(5))) / 4
    case 'icosaedro':
      return (a * Math.sqrt(10 + 2 * Math.sqrt(5))) / 4
    default:
      return a
  }
}

const COMANDOS = new Set([
  'recta', 'segmento', 'vector', 'plano', 'esfera', 'cubo', 'prisma', 'piramide', 'cono', 'cilindro', 'tetraedro', 'octaedro', 'dodecaedro', 'icosaedro', 'revolucion', 'corte', 'interseccion',
  'proy', 'proyeccion', 'pie', 'perp', 'dist', 'distancia', 'norma', 'modulo', 'angulo', 'gram', 'simetrico', 'escalar', 'vectorial',
])
/** Órdenes cuyos argumentos son objetos de otras filas (o números de fila), no expresiones. */
const DE_OBJETOS = new Set(['proy', 'proyeccion', 'pie', 'perp', 'dist', 'distancia', 'norma', 'modulo', 'angulo', 'gram', 'simetrico', 'escalar', 'vectorial'])

/* ---------- geometría vectorial ---------- */

const sub3 = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const add3 = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const mul3 = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k]
const dot3 = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross3 = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const len3 = (a: V3) => Math.hypot(a[0], a[1], a[2])

/** Lo que una fila es, geométricamente, para las órdenes de proyecciones y medidas. */
export type Geo = { t: 'punto'; p: V3 } | { t: 'linea'; tipo: 'recta' | 'segmento' | 'vector'; a: V3; d: V3 } | { t: 'plano'; n: V3; d: number }

/** Pie de la perpendicular desde p a la recta o al plano. */
export function pie3(p: V3, g: Extract<Geo, { t: 'linea' | 'plano' }>): V3 {
  if (g.t === 'linea') return add3(g.a, mul3(g.d, dot3(sub3(p, g.a), g.d) / dot3(g.d, g.d)))
  return sub3(p, mul3(g.n, (dot3(g.n, p) - g.d) / dot3(g.n, g.n)))
}

/** Puntos más cercanos de dos rectas (la perpendicular común si se cruzan). */
function cercanosRectas(a1: V3, d1: V3, a2: V3, d2: V3): [V3, V3] {
  const w = sub3(a1, a2)
  const a = dot3(d1, d1)
  const b = dot3(d1, d2)
  const c = dot3(d2, d2)
  const d = dot3(d1, w)
  const e = dot3(d2, w)
  const den = a * c - b * b
  // paralelas: cualquier punto de la primera y su pie en la segunda
  if (Math.abs(den) < 1e-12 * a * c) return [a1, add3(a2, mul3(d2, e / c))]
  const s = (b * e - c * d) / den
  const t = (a * e - b * d) / den
  return [add3(a1, mul3(d1, s)), add3(a2, mul3(d2, t))]
}

/** Distancia entre dos objetos y los dos puntos que la realizan. */
export function distancia3(A: Geo, B: Geo): { v: number; seg: [V3, V3] } {
  const mk = (p: V3, q: V3) => ({ v: len3(sub3(p, q)), seg: [p, q] as [V3, V3] })
  if (A.t === 'punto' && B.t === 'punto') return mk(A.p, B.p)
  if (A.t === 'punto' && B.t !== 'punto') return mk(A.p, pie3(A.p, B))
  if (B.t === 'punto' && A.t !== 'punto') return mk(pie3(B.p, A), B.p)
  if (A.t === 'linea' && B.t === 'linea') {
    const [p, q] = cercanosRectas(A.a, A.d, B.a, B.d)
    return mk(p, q)
  }
  if (A.t === 'linea' && B.t === 'plano') {
    // si la recta corta al plano, la distancia es 0
    return Math.abs(dot3(A.d, B.n)) > 1e-12 * len3(A.d) * len3(B.n) ? mk(A.a, A.a) : mk(A.a, pie3(A.a, B))
  }
  if (A.t === 'plano' && B.t === 'linea') {
    const r = distancia3(B, A)
    return { v: r.v, seg: [r.seg[1], r.seg[0]] }
  }
  if (A.t === 'plano' && B.t === 'plano') {
    if (len3(cross3(A.n, B.n)) > 1e-9 * len3(A.n) * len3(B.n)) return { v: 0, seg: [[0, 0, 0], [0, 0, 0]] }
    const p = mul3(A.n, A.d / dot3(A.n, A.n))
    return mk(p, pie3(p, B))
  }
  return { v: NaN, seg: [[0, 0, 0], [0, 0, 0]] }
}

/** Ángulo (grados) entre vectores (0–180°), rectas (0–90°), recta y plano, o dos planos. */
export function angulo3(A: Geo, B: Geo): number {
  const dir = (g: Geo): V3 => (g.t === 'punto' ? g.p : g.t === 'linea' ? g.d : g.n)
  const u = dir(A)
  const v = dir(B)
  const c = dot3(u, v) / (len3(u) * len3(v))
  const g = (Math.acos(Math.max(-1, Math.min(1, c))) * 180) / Math.PI
  const esVector = (x: Geo) => x.t === 'punto' || (x.t === 'linea' && x.tipo === 'vector')
  const agudo = Math.min(g, 180 - g)
  // recta–plano: el complementario del que forman la dirección y la normal
  if ((A.t === 'plano') !== (B.t === 'plano')) return 90 - agudo
  if (esVector(A) && esVector(B)) return g
  return agudo
}

/** Base ortonormal por Gram–Schmidt (se saltan los vectores que ya dependen de los anteriores). */
export function gramSchmidt3(vs: V3[]): V3[] {
  const out: V3[] = []
  for (const v of vs) {
    let w = v
    for (const e of out) w = sub3(w, mul3(e, dot3(w, e)))
    const n = len3(w)
    if (n > 1e-10 * Math.max(1, len3(v))) out.push(mul3(w, 1 / n))
  }
  return out
}

/** ¿F(x, y, z) = 0 es un plano n·x = d? Se mira si es afín en puntos cualesquiera. */
function comoPlano(F: F3): { n: V3; d: number } | null {
  const f0 = F(0, 0, 0)
  const n: V3 = [F(1, 0, 0) - f0, F(0, 1, 0) - f0, F(0, 0, 1) - f0]
  if (!n.every(Number.isFinite) || len3(n) < 1e-12) return null
  const pruebas: V3[] = [[0.7, -1.3, 2.1], [-2.2, 0.4, -0.9], [3.1, 2.7, -1.6]]
  for (const p of pruebas) if (Math.abs(F(p[0], p[1], p[2]) - (f0 + dot3(n, p))) > 1e-9 * (1 + Math.abs(f0) + len3(n) * len3(p))) return null
  return { n, d: -f0 }
}
const sinAcentos = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function analizarFilas3(filas: string[], params: Record<string, Param>): Analisis3 {
  // primera pasada: nombres de punto y letras libres
  const puntos = new Map<string, number>()
  filas.forEach((f, i) => {
    const m = f.trim().match(/^([A-Za-z][A-Za-z0-9_]*)\s*=\s*\(/)
    // los nombres de punto se comparan tal cual: A es un punto y a puede ser un deslizador
    if (m) puntos.set(m[1], i)
    // r = recta(A, B), P = proy(A, 2)…: también son nombres de objetos
    const c = f.trim().match(/^([A-Za-z][A-Za-z0-9_]*)\s*=\s*([A-Za-zÁÉÍÓÚáéíóú]+)\s*\(/)
    if (c && COMANDOS.has(sinAcentos(c[2]))) puntos.set(c[1], i)
  })
  const parametros: string[] = []
  const anota = (src: string) => {
    try {
      for (const v of variablesDe(analizar(src, { variables: RESERVADAS }))) {
        if (!RESERVADAS.includes(v) && !parametros.includes(v)) parametros.push(v)
      }
    } catch {
      /* se informa al compilar */
    }
  }
  for (const f of filas) {
    const t = f.trim().replace(/^[A-Za-z][A-Za-z0-9_]*\s*=\s*(?=[A-Za-zÁÉÍÓÚáéíóú]+\s*\()/, '')
    if (!t) continue
    const cmd = t.match(/^([A-Za-zÁÉÍÓÚáéíóú]+)\s*\((.*)\)\s*$/s)
    if (cmd && COMANDOS.has(sinAcentos(cmd[1]))) {
      if (sinAcentos(cmd[1]) === 'corte' || sinAcentos(cmd[1]) === 'interseccion' || DE_OBJETOS.has(sinAcentos(cmd[1]))) continue
      for (const a of nivel0(cmd[2], ',')) {
        const tp = tupla(a)
        for (const e of tp ?? [a]) if (!puntos.has(e.trim()) && !/^[xyz]$/i.test(e.trim())) anota(e)
      }
      continue
    }
    const partes = nivel0(t.replace(/^[A-Za-z][A-Za-z0-9_]*\s*=\s*(?=\()/, ''), ',')
    for (const p of partes) for (const lado of p.split(/<=|>=|<|>|=/)) {
      const tp = tupla(lado)
      for (const e of tp ?? [lado]) if (e.trim()) anota(e)
    }
  }
  const valores = parametros.map((p) => params[p]?.v ?? 1)
  const ctxVars = (propias: string[]) => [...propias, ...parametros]
  const compila = (src: string, propias: string[]) => {
    const n = analizar(src, { variables: ctxVars(propias) })
    const f = compilarNodo(n, ctxVars(propias))
    return { n, f: (...a: number[]) => f(...a, ...valores) }
  }
  const num = (src: string) => compila(src, []).f()

  const objetos: Objeto3[] = []
  const punto = (src: string): V3 => {
    const t = src.trim()
    const i = puntos.get(t)
    if (i !== undefined) {
      const o = objetos[i]
      if (o?.k !== 'punto') throw new Error(`${t} no es un punto (o va después)`)
      return o.p
    }
    const tp = tupla(t)
    if (!tp || tp.length !== 3) throw new Error(`${t} no es un punto (x, y, z)`)
    return tp.map(num) as V3
  }

  /** Un argumento de las órdenes de medidas: nombre de fila, número de fila o punto (x, y, z). */
  const geo = (src: string): Geo => {
    const t = src.trim()
    let o: Objeto3 | undefined
    const i = puntos.get(t)
    if (i !== undefined) o = objetos[i]
    else if (/^\d+$/.test(t)) o = objetos[Number(t) - 1]
    else return { t: 'punto', p: punto(t) }
    if (!o) throw new Error(`${t} no existe (o va después)`)
    if (o.k === 'punto') return { t: 'punto', p: o.p }
    if (o.k === 'linea') return { t: 'linea', tipo: o.tipo, a: o.a, d: sub3(o.b, o.a) }
    if (o.k === 'implicita' && o.plano) return { t: 'plano', n: o.plano.n, d: o.plano.d }
    throw new Error(`${t}: aquí va un punto, un vector, una recta o un plano`)
  }

  filas.forEach((src) => {
    objetos.push(fila(src))
  })

  function fila(src: string): Objeto3 {
    const t = src.trim()
    if (!t) return { k: 'vacio', tex: null }
    try {
      const cmd = t.match(/^([A-Za-zÁÉÍÓÚáéíóú]+)\s*\((.*)\)\s*$/s)
      if (cmd && COMANDOS.has(sinAcentos(cmd[1]))) return orden(sinAcentos(cmd[1]), nivel0(cmd[2], ',').map((a) => a.trim()))
      // con nombre: r = recta(A, B)
      const cmdN = t.match(/^([A-Za-z][A-Za-z0-9_]*)\s*=\s*([A-Za-zÁÉÍÓÚáéíóú]+)\s*\((.*)\)\s*$/s)
      if (cmdN && COMANDOS.has(sinAcentos(cmdN[2]))) {
        const o = orden(sinAcentos(cmdN[2]), nivel0(cmdN[3], ',').map((a) => a.trim()))
        if (o.k === 'punto') return { ...o, nombre: cmdN[1], tex: `${cmdN[1]} = ${o.tex ?? ''}` }
        return { ...o, tex: o.tex ? `${cmdN[1]}:\ ${o.tex}` : o.tex }
      }

      // A = (x, y, z)
      const nombrado = t.match(/^([A-Za-z][A-Za-z0-9_]*)\s*=\s*(\(.*\))$/s)
      const cuerpoPunto = nombrado ? nombrado[2] : t
      const tp = tupla(cuerpoPunto)
      if (tp && tp.length === 3 && !t.includes('),')) {
        const usa = new Set(tp.flatMap((e) => variablesDe(analizar(e, { variables: ctxVars(RESERVADAS) }))))
        if (usa.has('u') || usa.has('v')) return parametrica(tp, [])
        if (usa.has('t')) return curva(tp, [])
        const p = tp.map(num) as V3
        const libre = tp.every((e) => /^\s*-?\s*(\d+(\.\d*)?|\.\d+)\s*$/.test(e))
        return { k: 'punto', nombre: nombrado?.[1] ?? null, p, libre, tex: `${nombrado ? `${nombrado[1]} = ` : ''}\\left(${tp.map((e) => tex(compila(e, []).n)).join(',\\,')}\\right)` }
      }

      // (…), restricciones
      const partes = nivel0(t, ',')
      const tpC = tupla(partes[0])
      if (tpC && tpC.length === 3) {
        const restr = partes.slice(1)
        const usa = new Set(tpC.flatMap((e) => variablesDe(analizar(e, { variables: ctxVars(RESERVADAS) }))))
        return usa.has('u') || usa.has('v') ? parametrica(tpC, restr) : curva(tpC, restr)
      }

      const eq = iguales(t)
      if (eq.length > 1) throw new Error('sobra un signo =')
      if (eq.length === 1) {
        const izq = t.slice(0, eq[0])
        const der = t.slice(eq[0] + 1)
        const a = compila(izq, ['x', 'y', 'z'])
        const b = compila(der, ['x', 'y', 'z'])
        const F: F3 = (x, y, z) => a.f(x, y, z) - b.f(x, y, z)
        return { k: 'implicita', F, plano: comoPlano(F) ?? undefined, tex: `${tex(a.n)} = ${tex(b.n)}` }
      }
      // una expresión suelta es z = f(x, y)
      const f = compila(t, ['x', 'y'])
      if (variablesDe(f.n).includes('z')) throw new Error('falta un = (una superficie en x, y, z es una ecuación)')
      return { k: 'implicita', F: (x, y, z) => z - f.f(x, y), tex: `z = ${tex(f.n)}` }
    } catch (e) {
      return { k: 'error', error: (e as Error).message, tex: null }
    }
  }

  /** [a, b] de las restricciones `0 < t < 2pi` para la variable v. */
  function dominio(restr: string[], v: string, defecto: [number, number]): [number, number] {
    let [lo, hi] = defecto
    for (const r of restr) {
      const n = analizar(r, { variables: ctxVars([v]) })
      const cmps: Array<Extract<Nodo, { t: 'cmp' }>> = []
      const junta = (m: Nodo): void => {
        if (m.t === 'y') {
          junta(m.a)
          junta(m.b)
        } else if (m.t === 'cmp') cmps.push(m)
      }
      junta(n)
      for (const c of cmps) {
        const esV = (m: Nodo) => m.t === 'var' && m.v === v
        const valor = (m: Nodo) => compilarNodo(m, parametros)(...valores)
        const menor = c.v === '<' || c.v === '<='
        // a < v pone el mínimo; v < b, el máximo
        if (esV(c.b)) {
          if (menor) lo = valor(c.a)
          else hi = valor(c.a)
        } else if (esV(c.a)) {
          if (menor) hi = valor(c.b)
          else lo = valor(c.b)
        }
      }
    }
    return [lo, hi]
  }

  function curva(tp: string[], restr: string[]): Objeto3 {
    const fs = tp.map((e) => compila(e, ['t']))
    return {
      k: 'curva',
      f: (s) => fs.map((q) => q.f(s)) as V3,
      dom: dominio(restr, 't', [0, DOS_PI]),
      tex: `\\left(${fs.map((q) => tex(q.n)).join(',\\,')}\\right)${restr.length ? '' : ',\\; 0 \\le t \\le 2\\pi'}`,
    }
  }

  function parametrica(tp: string[], restr: string[]): Objeto3 {
    const fs = tp.map((e) => compila(e, ['u', 'v']))
    return {
      k: 'param',
      f: (a, b) => fs.map((q) => q.f(a, b)) as V3,
      du: dominio(restr, 'u', [0, DOS_PI]),
      dv: dominio(restr, 'v', [0, DOS_PI]),
      tex: `\\left(${fs.map((q) => tex(q.n)).join(',\\,')}\\right)`,
    }
  }

  function orden(nombre: string, a: string[]): Objeto3 {
    const pide = (n: number, uso: string) => {
      if (a.length < n) throw new Error(`${nombre}(${uso})`)
    }
    switch (nombre) {
      case 'recta':
      case 'segmento':
      case 'vector': {
        pide(2, 'P, Q')
        const [p, q] = [punto(a[0]), punto(a[1])]
        return { k: 'linea', tipo: nombre, a: p, b: q, tex: `\\operatorname{${nombre}}(${a[0]},\\,${a[1]})` }
      }
      case 'plano': {
        pide(3, 'A, B, C')
        const [A, B, C] = a.map(punto)
        const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]]
        const v = [C[0] - A[0], C[1] - A[1], C[2] - A[2]]
        const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
        if (Math.hypot(...n) < 1e-12) throw new Error('los tres puntos están alineados')
        const d = n[0] * A[0] + n[1] * A[1] + n[2] * A[2]
        const f2 = (x: number) => +x.toFixed(3)
        return { k: 'implicita', F: (x, y, z) => n[0] * x + n[1] * y + n[2] * z - d, plano: { n: n as V3, d }, tex: `${f2(n[0])}x + ${f2(n[1])}y + ${f2(n[2])}z = ${f2(d)}`.replace(/\+ -/g, '- ') }
      }
      case 'esfera': {
        pide(2, 'centro, radio')
        const c = punto(a[0])
        const r = num(a[1])
        if (!(r > 0)) throw new Error('el radio tiene que ser positivo')
        return {
          k: 'implicita',
          F: (x, y, z) => (x - c[0]) ** 2 + (y - c[1]) ** 2 + (z - c[2]) ** 2 - r * r,
          medidas: { volumen: (4 / 3) * Math.PI * r ** 3, area: 4 * Math.PI * r * r },
          tex: `\\operatorname{esfera}\\left(${a[0]},\\,${a[1]}\\right)`,
        }
      }
      case 'cubo':
      case 'tetraedro':
      case 'octaedro':
      case 'dodecaedro':
      case 'icosaedro': {
        pide(2, 'centro, arista')
        const c = punto(a[0])
        const l = num(a[1])
        if (!(l > 0)) throw new Error('la arista tiene que ser positiva')
        return { k: 'solido', forma: nombre, c, a: l, h: 0, n: 0, medidas: medidasSolido(nombre, l, 0, 0), tex: `\\operatorname{${nombre}}\\left(${a[0]},\\,${a[1]}\\right)` }
      }
      case 'cono':
      case 'cilindro': {
        pide(3, 'centro de la base, radio, altura')
        const c = punto(a[0])
        const [r, h] = [num(a[1]), num(a[2])]
        if (!(r > 0) || !(h > 0)) throw new Error('radio y altura positivos')
        return { k: 'solido', forma: nombre, c, a: r, h, n: 64, medidas: medidasSolido(nombre, r, h, 0), tex: `\\operatorname{${nombre}}\\left(${a.join(',\\,')}\\right)` }
      }
      case 'prisma':
      case 'piramide': {
        pide(4, 'centro de la base, lados, radio, altura')
        const c = punto(a[0])
        const [n, r, h] = [Math.round(num(a[1])), num(a[2]), num(a[3])]
        if (!(n >= 3) || !(r > 0) || !(h > 0)) throw new Error('al menos 3 lados, radio y altura positivos')
        return { k: 'solido', forma: nombre, c, a: r, h, n, medidas: medidasSolido(nombre, r, h, n), tex: `\\operatorname{${nombre}}\\left(${a.join(',\\,')}\\right)` }
      }
      case 'revolucion': {
        // revolucion(f(x), a, b): y = f(x) girando alrededor del eje x
        pide(3, 'f(x), a, b')
        const f = compila(a[0], ['x'])
        const [lo, hi] = [num(a[1]), num(a[2])]
        const alrededorZ = (a[3] ?? '').trim().toLowerCase() === 'z'
        return {
          k: 'param',
          f: alrededorZ ? (r, v) => [r * Math.cos(v), r * Math.sin(v), f.f(r)] : (x, v) => [x, f.f(x) * Math.cos(v), f.f(x) * Math.sin(v)],
          du: [lo, hi],
          dv: [0, DOS_PI],
          tex: `${alrededorZ ? 'z' : 'y'} = ${tex(f.n)}\\ \\text{girando alrededor de } ${alrededorZ ? 'z' : 'x'}`,
        }
      }
      case 'proy':
      case 'proyeccion':
      case 'pie':
      case 'perp': {
        pide(2, 'objeto, recta o plano')
        const [X, Y] = [geo(a[0]), geo(a[1])]
        const tx = `\\operatorname{${nombre}}\\left(${a[0]},\\,${a[1]}\\right)`
        const vec = X.t === 'linea' && X.tipo === 'vector'
        // dos puntos sueltos: se leen como vectores desde el origen
        const comoVec = vec || (X.t === 'punto' && Y.t === 'punto')
        if (comoVec) {
          const o: V3 = X.t === 'linea' ? X.a : [0, 0, 0]
          const w = X.t === 'linea' ? X.d : (X as Extract<Geo, { t: 'punto' }>).p
          let par: V3
          if (Y.t === 'plano') par = sub3(w, mul3(Y.n, dot3(w, Y.n) / dot3(Y.n, Y.n)))
          else {
            const d = Y.t === 'linea' ? Y.d : Y.p
            par = mul3(d, dot3(w, d) / dot3(d, d))
          }
          // la parte perpendicular sale de la punta de la proyección: w = proyección + perpendicular
          if (nombre === 'perp') return { k: 'linea', tipo: 'vector', a: add3(o, par), b: add3(o, w), tex: tx }
          return { k: 'linea', tipo: 'vector', a: o, b: add3(o, par), tex: tx }
        }
        if (Y.t === 'punto') throw new Error('se proyecta sobre una recta o un plano')
        if (nombre === 'perp') throw new Error('perp(v, w): la parte de v perpendicular a w; v tiene que ser un vector')
        if (X.t === 'punto') return { k: 'punto', nombre: null, p: pie3(X.p, Y), libre: false, tex: tx }
        if (X.t === 'linea') {
          const b = add3(X.a, X.d)
          const [pa, pb] = [pie3(X.a, Y), pie3(b, Y)]
          if (len3(sub3(pa, pb)) < 1e-12) return { k: 'punto', nombre: null, p: pa, libre: false, tex: tx }
          return { k: 'linea', tipo: X.tipo, a: pa, b: pb, tex: tx }
        }
        throw new Error('un plano no se proyecta')
      }
      case 'simetrico': {
        pide(2, 'P, punto, recta o plano')
        const X = geo(a[0])
        const Y = geo(a[1])
        if (X.t !== 'punto') throw new Error('simetrico(P, …): P tiene que ser un punto')
        const c = Y.t === 'punto' ? Y.p : pie3(X.p, Y)
        return { k: 'punto', nombre: null, p: sub3(mul3(c, 2), X.p), libre: false, tex: `\\operatorname{simétrico}\\left(${a[0]},\\,${a[1]}\\right)` }
      }
      case 'dist':
      case 'distancia': {
        pide(2, 'A, B')
        const r = distancia3(geo(a[0]), geo(a[1]))
        const en = mul3(add3(r.seg[0], r.seg[1]), 0.5)
        return { k: 'medida', v: r.v, unidad: '', texto: `d(${a[0]}, ${a[1]})`, en, seg: r.v > 1e-12 ? r.seg : undefined, tex: `d\\left(${a[0]},\\,${a[1]}\\right)` }
      }
      case 'norma':
      case 'modulo': {
        pide(1, 'v')
        const X = geo(a[0])
        if (X.t === 'plano') throw new Error('norma(v): un vector, un segmento o un punto')
        const o: V3 = X.t === 'linea' ? X.a : [0, 0, 0]
        const w = X.t === 'linea' ? X.d : X.p
        return { k: 'medida', v: len3(w), unidad: '', texto: `‖${a[0]}‖`, en: add3(o, mul3(w, 0.5)), seg: [o, add3(o, w)], tex: `\\left\\lVert ${a[0]}\\right\\rVert` }
      }
      case 'angulo': {
        pide(2, 'a, b')
        const [X, Y] = [geo(a[0]), geo(a[1])]
        const donde = X.t === 'linea' ? X.a : X.t === 'punto' ? [0, 0, 0] as V3 : mul3(X.n, X.d / dot3(X.n, X.n))
        return { k: 'medida', v: angulo3(X, Y), unidad: '°', texto: `∠(${a[0]}, ${a[1]})`, en: donde, tex: `\\angle\\left(${a[0]},\\,${a[1]}\\right)` }
      }
      case 'escalar': {
        pide(2, 'v, w')
        const [X, Y] = [geo(a[0]), geo(a[1])]
        const d = (g: Geo): V3 => (g.t === 'punto' ? g.p : g.t === 'linea' ? g.d : g.n)
        const o: V3 = X.t === 'linea' ? X.a : [0, 0, 0]
        return { k: 'medida', v: dot3(d(X), d(Y)), unidad: '', texto: `${a[0]} · ${a[1]}`, en: o, tex: `${a[0]}\\cdot ${a[1]}` }
      }
      case 'vectorial': {
        pide(2, 'v, w')
        const [X, Y] = [geo(a[0]), geo(a[1])]
        const d = (g: Geo): V3 => (g.t === 'punto' ? g.p : g.t === 'linea' ? g.d : g.n)
        const o: V3 = X.t === 'linea' ? X.a : [0, 0, 0]
        return { k: 'linea', tipo: 'vector', a: o, b: add3(o, cross3(d(X), d(Y))), tex: `${a[0]}\\times ${a[1]}` }
      }
      case 'gram': {
        pide(2, 'v₁, v₂[, v₃]')
        const gs = a.map(geo)
        const o: V3 = gs[0].t === 'linea' ? gs[0].a : [0, 0, 0]
        const vs = gs.map((g) => (g.t === 'punto' ? g.p : g.t === 'linea' ? g.d : g.n))
        const base = gramSchmidt3(vs)
        return { k: 'base', o, vs: base, tex: `\\operatorname{GS}\\left(${a.join(',\\,')}\\right)` }
      }
      case 'corte':
      case 'interseccion': {
        pide(2, 'fila, fila')
        const [i, j] = a.map((x) => Number(x) - 1)
        if (!Number.isInteger(i) || !Number.isInteger(j)) throw new Error('corte(1, 2): números de fila')
        return { k: 'corte', i, j, tex: `S_{${i + 1}} \\cap S_{${j + 1}}` }
      }
    }
    throw new Error(`orden desconocida: ${nombre}`)
  }

  return { objetos, parametros }
}

/** Recorta la recta P + s·(Q − P) a la caja [−L, L]³: [s₀, s₁] o null. */
export function recortarACaja(a: V3, b: V3, L: number): [number, number] | null {
  let lo = -Infinity
  let hi = Infinity
  for (let k = 0; k < 3; k++) {
    const d = b[k] - a[k]
    if (Math.abs(d) < 1e-12) {
      if (Math.abs(a[k]) > L) return null
      continue
    }
    const s1 = (-L - a[k]) / d
    const s2 = (L - a[k]) / d
    lo = Math.max(lo, Math.min(s1, s2))
    hi = Math.min(hi, Math.max(s1, s2))
  }
  return lo <= hi ? [lo, hi] : null
}

/**
 * Curva donde se cortan dos superficies: sobre los triángulos de la primera se
 * busca dónde cambia de signo la segunda. Devuelve pares de puntos (segmentos).
 */
export function cortarMalla(pos: Float32Array, G: F3): Float32Array {
  const out: number[] = []
  for (let t = 0; t < pos.length; t += 9) {
    const P = [0, 1, 2].map((k) => [pos[t + 3 * k], pos[t + 3 * k + 1], pos[t + 3 * k + 2]])
    const g = P.map((p) => G(p[0], p[1], p[2]))
    const cortes: number[][] = []
    for (const [i, j] of [[0, 1], [1, 2], [2, 0]]) {
      if ((g[i] < 0) !== (g[j] < 0) && Number.isFinite(g[i]) && Number.isFinite(g[j])) {
        const s = g[i] / (g[i] - g[j])
        cortes.push([0, 1, 2].map((c) => P[i][c] + s * (P[j][c] - P[i][c])))
      }
    }
    if (cortes.length === 2) out.push(...cortes[0], ...cortes[1])
  }
  return new Float32Array(out)
}
