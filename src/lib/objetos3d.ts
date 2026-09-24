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
  | { k: 'implicita'; F: F3; medidas?: Medidas }
  | { k: 'punto'; nombre: string | null; p: V3; libre: boolean }
  | { k: 'curva'; f: (t: number) => V3; dom: [number, number] }
  | { k: 'param'; f: (u: number, v: number) => V3; du: [number, number]; dv: [number, number] }
  | { k: 'linea'; tipo: 'recta' | 'segmento' | 'vector'; a: V3; b: V3 }
  | { k: 'solido'; forma: Forma; c: V3; a: number; h: number; n: number; medidas: Medidas }
  | { k: 'corte'; i: number; j: number }
)

export interface Medidas {
  volumen: number
  area: number
}

export const TIPOS3: Record<Objeto3['k'], string> = {
  vacio: '', error: '', implicita: 'superficie', punto: 'punto', curva: 'curva', param: 'superficie paramétrica',
  linea: 'recta', solido: 'sólido', corte: 'curva de corte',
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

const COMANDOS = new Set(['recta', 'segmento', 'vector', 'plano', 'esfera', 'cubo', 'prisma', 'piramide', 'cono', 'cilindro', 'tetraedro', 'octaedro', 'dodecaedro', 'icosaedro', 'revolucion', 'corte', 'interseccion'])
const sinAcentos = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function analizarFilas3(filas: string[], params: Record<string, Param>): Analisis3 {
  // primera pasada: nombres de punto y letras libres
  const puntos = new Map<string, number>()
  filas.forEach((f, i) => {
    const m = f.trim().match(/^([A-Za-z][A-Za-z0-9_]*)\s*=\s*\(/)
    // los nombres de punto se comparan tal cual: A es un punto y a puede ser un deslizador
    if (m) puntos.set(m[1], i)
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
    const t = f.trim()
    if (!t) continue
    const cmd = t.match(/^([A-Za-zÁÉÍÓÚáéíóú]+)\s*\((.*)\)\s*$/s)
    if (cmd && COMANDOS.has(sinAcentos(cmd[1]))) {
      if (sinAcentos(cmd[1]) === 'corte' || sinAcentos(cmd[1]) === 'interseccion') continue
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

  filas.forEach((src) => {
    objetos.push(fila(src))
  })

  function fila(src: string): Objeto3 {
    const t = src.trim()
    if (!t) return { k: 'vacio', tex: null }
    try {
      const cmd = t.match(/^([A-Za-zÁÉÍÓÚáéíóú]+)\s*\((.*)\)\s*$/s)
      if (cmd && COMANDOS.has(sinAcentos(cmd[1]))) return orden(sinAcentos(cmd[1]), nivel0(cmd[2], ',').map((a) => a.trim()))

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
        return { k: 'implicita', F: (x, y, z) => a.f(x, y, z) - b.f(x, y, z), tex: `${tex(a.n)} = ${tex(b.n)}` }
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
        return { k: 'implicita', F: (x, y, z) => n[0] * x + n[1] * y + n[2] * z - d, tex: `${f2(n[0])}x + ${f2(n[1])}y + ${f2(n[2])}z = ${f2(d)}`.replace(/\+ -/g, '- ') }
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
