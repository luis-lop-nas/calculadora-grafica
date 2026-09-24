/**
 * Geometría con regla y compás: cada objeto guarda su definición (qué es y de
 * qué depende), no sus coordenadas. Se evalúa en orden, así que al mover un
 * punto libre todo lo que cuelga de él se recalcula.
 */

/** Forma uniforme para que el estado guardado se pueda validar campo a campo. */
export interface Obj {
  id: string
  def: string
  /** Ids de los padres, separados por comas. */
  args: string
  /** Punto libre: coordenadas. */
  x: number
  y: number
  /** Parámetro numérico: radio, ángulo, lados, factor, índice de la solución o posición t sobre un objeto. */
  v: number
  visible: boolean
}

export interface P {
  x: number
  y: number
}

export type TipoLinea = 'recta' | 'segmento' | 'semirrecta' | 'vector'

export type Valor =
  | { k: 'punto'; p: P }
  | { k: 'linea'; tipo: TipoLinea; a: P; b: P }
  | { k: 'circ'; c: P; r: number }
  | { k: 'arco'; c: P; r: number; a0: number; a1: number }
  /** A x² + B xy + C y² + D x + E y + F = 0 */
  | { k: 'conica'; q: number[] }
  | { k: 'poligono'; pts: P[] }
  | { k: 'medida'; v: number; unidad: '' | '°' | 'u²'; en: P; arco?: { c: P; a0: number; a1: number } }
  | { k: 'lugar'; pts: P[] }
  | { k: 'nada' }

const NADA: Valor = { k: 'nada' }
const EPS = 1e-10

/* ---------- vectores ---------- */

export const resta = (a: P, b: P): P => ({ x: a.x - b.x, y: a.y - b.y })
export const sumaP = (a: P, b: P): P => ({ x: a.x + b.x, y: a.y + b.y })
export const escala = (a: P, k: number): P => ({ x: a.x * k, y: a.y * k })
export const punto = (a: P, b: P) => a.x * b.x + a.y * b.y
export const cruz = (a: P, b: P) => a.x * b.y - a.y * b.x
export const norma = (a: P) => Math.hypot(a.x, a.y)
export const dist = (a: P, b: P) => norma(resta(a, b))
const unit = (a: P) => escala(a, 1 / (norma(a) || 1))
const perp = (a: P): P => ({ x: -a.y, y: a.x })
const angulo = (a: P) => Math.atan2(a.y, a.x)

/** Rango del parámetro t (p = a + t·(b − a)) según el tipo de línea. */
function rangoLinea(tipo: TipoLinea): [number, number] {
  return tipo === 'recta' ? [-Infinity, Infinity] : tipo === 'semirrecta' ? [0, Infinity] : [0, 1]
}

/* ---------- cónicas ---------- */

export function evalConica(q: number[], p: P) {
  const [A, B, C, D, E, F] = q
  return A * p.x * p.x + B * p.x * p.y + C * p.y * p.y + D * p.x + E * p.y + F
}

function conicaDeCirc(c: P, r: number): number[] {
  return [1, 0, 1, -2 * c.x, -2 * c.y, c.x * c.x + c.y * c.y - r * r]
}

/** Elipse o hipérbola por focos y un punto, a partir de su forma reducida girada. */
function conicaFocal(f1: P, f2: P, p: P, hiperbola: boolean): number[] | null {
  const c = escala(sumaP(f1, f2), 0.5)
  const cf = dist(f1, f2) / 2
  const a = hiperbola ? Math.abs(dist(p, f1) - dist(p, f2)) / 2 : (dist(p, f1) + dist(p, f2)) / 2
  const b2 = hiperbola ? cf * cf - a * a : a * a - cf * cf
  if (a < EPS || b2 <= EPS) return null
  const th = angulo(resta(f2, f1))
  const [co, si] = [Math.cos(th), Math.sin(th)]
  // u = (x−cx)cos + (y−cy)sin, v = −(x−cx)sin + (y−cy)cos; u²/a² ± v²/b² − 1
  const ka = 1 / (a * a)
  const kb = (hiperbola ? -1 : 1) / b2
  const A = ka * co * co + kb * si * si
  const B = 2 * co * si * (ka - kb)
  const C = ka * si * si + kb * co * co
  return trasladarConica([A, B, C, 0, 0, -1], c)
}

/** La cónica centrada en el origen movida al punto c. */
function trasladarConica(q: number[], c: P): number[] {
  const [A, B, C, D, E, F] = q
  return [
    A, B, C,
    D - 2 * A * c.x - B * c.y,
    E - 2 * C * c.y - B * c.x,
    F + A * c.x * c.x + B * c.x * c.y + C * c.y * c.y - D * c.x - E * c.y,
  ]
}

/** Parábola: |PF|² = distancia² a la directriz. */
function parabola(f: P, a: P, b: P): number[] | null {
  const n = unit(perp(resta(b, a)))
  if (norma(resta(b, a)) < EPS) return null
  const k = punto(n, a)
  // (x−fx)² + (y−fy)² − (nx x + ny y − k)²
  return [
    1 - n.x * n.x, -2 * n.x * n.y, 1 - n.y * n.y,
    -2 * f.x + 2 * k * n.x, -2 * f.y + 2 * k * n.y,
    f.x * f.x + f.y * f.y - k * k,
  ]
}

/** Cónica por cinco puntos: el núcleo de un sistema 5×6. */
function conica5(ps: P[]): number[] | null {
  const m = ps.map((p) => [p.x * p.x, p.x * p.y, p.y * p.y, p.x, p.y, 1])
  const piv: number[] = []
  let f = 0
  for (let c = 0; c < 6 && f < 5; c++) {
    let mejor = f
    for (let i = f; i < 5; i++) if (Math.abs(m[i][c]) > Math.abs(m[mejor][c])) mejor = i
    if (Math.abs(m[mejor][c]) < 1e-12) continue
    ;[m[f], m[mejor]] = [m[mejor], m[f]]
    for (let i = 0; i < 5; i++) {
      if (i === f) continue
      const k = m[i][c] / m[f][c]
      for (let j = 0; j < 6; j++) m[i][j] -= k * m[f][j]
    }
    piv.push(c)
    f++
  }
  const libre = [0, 1, 2, 3, 4, 5].find((c) => !piv.includes(c))
  if (libre === undefined) return null
  const q = new Array(6).fill(0)
  q[libre] = 1
  piv.forEach((c, i) => (q[c] = -m[i][libre] / m[i][c]))
  return q
}

/** Transformada de una cónica por un mapa afín p ↦ M·p + t, con Q′ = Tᵀ·Q·T y T el inverso. */
function transformarConica(q: number[], M: number[][], t: P): number[] {
  const [A, B, C, D, E, F] = q
  const Q = [
    [A, B / 2, D / 2],
    [B / 2, C, E / 2],
    [D / 2, E / 2, F],
  ]
  const det = M[0][0] * M[1][1] - M[0][1] * M[1][0]
  const inv = [
    [M[1][1] / det, -M[0][1] / det],
    [-M[1][0] / det, M[0][0] / det],
  ]
  const it = { x: -(inv[0][0] * t.x + inv[0][1] * t.y), y: -(inv[1][0] * t.x + inv[1][1] * t.y) }
  const T = [
    [inv[0][0], inv[0][1], it.x],
    [inv[1][0], inv[1][1], it.y],
    [0, 0, 1],
  ]
  const R = [0, 1, 2].map((i) => [0, 1, 2].map((j) => [0, 1, 2].reduce((s, k) => s + [0, 1, 2].reduce((u, l) => u + T[k][i] * Q[k][l] * T[l][j], 0), 0)))
  return [R[0][0], 2 * R[0][1], R[1][1], 2 * R[0][2], 2 * R[1][2], R[2][2]]
}

/* ---------- intersecciones ---------- */

function cortesLineaLinea(l: Extract<Valor, { k: 'linea' }>, m: Extract<Valor, { k: 'linea' }>): P[] {
  const d1 = resta(l.b, l.a)
  const d2 = resta(m.b, m.a)
  const den = cruz(d1, d2)
  if (Math.abs(den) < EPS) return []
  const w = resta(m.a, l.a)
  const t = cruz(w, d2) / den
  const u = cruz(w, d1) / den
  const [a1, b1] = rangoLinea(l.tipo)
  const [a2, b2] = rangoLinea(m.tipo)
  if (t < a1 - 1e-9 || t > b1 + 1e-9 || u < a2 - 1e-9 || u > b2 + 1e-9) return []
  return [sumaP(l.a, escala(d1, t))]
}

/** Cortes de una línea con una cónica: cuadrática en el parámetro t. */
function cortesLineaConica(l: Extract<Valor, { k: 'linea' }>, q: number[]): P[] {
  const d = resta(l.b, l.a)
  const f = (t: number) => evalConica(q, sumaP(l.a, escala(d, t)))
  // f(t) = α t² + β t + γ: se sacan los coeficientes evaluando
  const g = f(0)
  const f1 = f(1)
  const fm = f(-1)
  const a = (f1 + fm) / 2 - g
  const b = (f1 - fm) / 2
  let ts: number[]
  if (Math.abs(a) < 1e-12 * Math.max(1, Math.abs(b), Math.abs(g))) ts = Math.abs(b) < EPS ? [] : [-g / b]
  else {
    const disc = b * b - 4 * a * g
    if (disc < -1e-12) ts = []
    else {
      const r = Math.sqrt(Math.max(0, disc))
      ts = [(-b - r) / (2 * a), (-b + r) / (2 * a)].sort((x, y) => x - y)
    }
  }
  const [lo, hi] = rangoLinea(l.tipo)
  return ts.filter((t) => t >= lo - 1e-9 && t <= hi + 1e-9).map((t) => sumaP(l.a, escala(d, t)))
}

function cortesCircCirc(c1: P, r1: number, c2: P, r2: number): P[] {
  const d = dist(c1, c2)
  if (d < EPS || d > r1 + r2 + 1e-9 || d < Math.abs(r1 - r2) - 1e-9) return []
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d)
  const h = Math.sqrt(Math.max(0, r1 * r1 - a * a))
  const u = unit(resta(c2, c1))
  const m = sumaP(c1, escala(u, a))
  return [sumaP(m, escala(perp(u), -h)), sumaP(m, escala(perp(u), h))]
}

/** Circunferencia ∩ cónica: se recorre la circunferencia buscando cambios de signo. */
function cortesCircConica(c: P, r: number, q: number[]): P[] {
  const f = (t: number) => evalConica(q, { x: c.x + r * Math.cos(t), y: c.y + r * Math.sin(t) })
  const out: P[] = []
  const n = 720
  for (let i = 0; i < n; i++) {
    let lo = (2 * Math.PI * i) / n
    let hi = (2 * Math.PI * (i + 1)) / n
    if (f(lo) * f(hi) > 0) continue
    for (let k = 0; k < 60; k++) {
      const m = (lo + hi) / 2
      if (f(lo) * f(m) <= 0) hi = m
      else lo = m
    }
    const p = { x: c.x + r * Math.cos(lo), y: c.y + r * Math.sin(lo) }
    if (!out.some((o) => dist(o, p) < 1e-7)) out.push(p)
  }
  return out
}

const enArco = (v: Extract<Valor, { k: 'arco' }>, p: P) => {
  let a = angulo(resta(p, v.c)) - v.a0
  while (a < 0) a += 2 * Math.PI
  let span = v.a1 - v.a0
  while (span < 0) span += 2 * Math.PI
  return a <= span + 1e-9
}

export function cortes(a: Valor, b: Valor): P[] {
  if (a.k === 'linea' && b.k === 'linea') return cortesLineaLinea(a, b)
  if (a.k === 'linea' && (b.k === 'circ' || b.k === 'arco')) {
    const r = cortesLineaConica(a, conicaDeCirc(b.c, b.r))
    return b.k === 'arco' ? r.filter((p) => enArco(b, p)) : r
  }
  if ((a.k === 'circ' || a.k === 'arco') && b.k === 'linea') return cortes(b, a)
  if (a.k === 'linea' && b.k === 'conica') return cortesLineaConica(a, b.q)
  if (a.k === 'conica' && b.k === 'linea') return cortesLineaConica(b, a.q)
  if ((a.k === 'circ' || a.k === 'arco') && (b.k === 'circ' || b.k === 'arco')) {
    let r = cortesCircCirc(a.c, a.r, b.c, b.r)
    if (a.k === 'arco') r = r.filter((p) => enArco(a, p))
    if (b.k === 'arco') r = r.filter((p) => enArco(b, p))
    return r
  }
  if (a.k === 'circ' && b.k === 'conica') return cortesCircConica(a.c, a.r, b.q)
  if (a.k === 'conica' && b.k === 'circ') return cortesCircConica(b.c, b.r, a.q)
  if (a.k === 'poligono' || b.k === 'poligono') {
    const [pol, otro] = a.k === 'poligono' ? [a, b] : [b as Extract<Valor, { k: 'poligono' }>, a]
    return pol.pts.flatMap((p, i) => cortes({ k: 'linea', tipo: 'segmento', a: p, b: pol.pts[(i + 1) % pol.pts.length] }, otro))
  }
  return []
}

/* ---------- transformaciones ---------- */

type Mapa = (p: P) => P

function transformar(v: Valor, f: Mapa): Valor {
  const t = f({ x: 0, y: 0 })
  const ex = resta(f({ x: 1, y: 0 }), t)
  const ey = resta(f({ x: 0, y: 1 }), t)
  const M = [
    [ex.x, ey.x],
    [ex.y, ey.y],
  ]
  const det = M[0][0] * M[1][1] - M[0][1] * M[1][0]
  switch (v.k) {
    case 'punto':
      return { k: 'punto', p: f(v.p) }
    case 'linea':
      return { ...v, a: f(v.a), b: f(v.b) }
    case 'circ':
      return { k: 'circ', c: f(v.c), r: v.r * Math.sqrt(Math.abs(det)) }
    case 'arco': {
      const c = f(v.c)
      const p0 = f({ x: v.c.x + v.r * Math.cos(v.a0), y: v.c.y + v.r * Math.sin(v.a0) })
      const p1 = f({ x: v.c.x + v.r * Math.cos(v.a1), y: v.c.y + v.r * Math.sin(v.a1) })
      const [a0, a1] = [angulo(resta(p0, c)), angulo(resta(p1, c))]
      // una simetría invierte el sentido de giro
      return { k: 'arco', c, r: dist(p0, c), a0: det < 0 ? a1 : a0, a1: det < 0 ? a0 : a1 }
    }
    case 'conica':
      return { k: 'conica', q: transformarConica(v.q, M, t) }
    case 'poligono':
      return { k: 'poligono', pts: v.pts.map(f) }
    case 'lugar':
      return { k: 'lugar', pts: v.pts.map(f) }
    default:
      return NADA
  }
}

/* ---------- objetos sobre los que se puede poner un punto ---------- */

/** Punto de parámetro t sobre el objeto. */
export function sobre(v: Valor, t: number): P | null {
  switch (v.k) {
    case 'linea': {
      const [lo, hi] = rangoLinea(v.tipo)
      return sumaP(v.a, escala(resta(v.b, v.a), Math.min(hi, Math.max(lo, t))))
    }
    case 'circ':
      return { x: v.c.x + v.r * Math.cos(t), y: v.c.y + v.r * Math.sin(t) }
    case 'arco': {
      let span = v.a1 - v.a0
      while (span < 0) span += 2 * Math.PI
      const a = v.a0 + Math.min(1, Math.max(0, t)) * span
      return { x: v.c.x + v.r * Math.cos(a), y: v.c.y + v.r * Math.sin(a) }
    }
    case 'poligono': {
      const n = v.pts.length
      const u = ((t % n) + n) % n
      const i = Math.floor(u)
      return sumaP(v.pts[i], escala(resta(v.pts[(i + 1) % n], v.pts[i]), u - i))
    }
    default:
      return null
  }
}

/** Parámetro del punto del objeto más cercano a p (la inversa de `sobre`). */
export function proyectar(v: Valor, p: P): number {
  switch (v.k) {
    case 'linea': {
      const d = resta(v.b, v.a)
      const [lo, hi] = rangoLinea(v.tipo)
      return Math.min(hi, Math.max(lo, punto(resta(p, v.a), d) / (punto(d, d) || 1)))
    }
    case 'circ':
      return angulo(resta(p, v.c))
    case 'arco': {
      let a = angulo(resta(p, v.c)) - v.a0
      while (a < 0) a += 2 * Math.PI
      let span = v.a1 - v.a0
      while (span < 0) span += 2 * Math.PI
      return Math.min(1, a / span)
    }
    case 'poligono': {
      let mejor = 0
      let dmin = Infinity
      v.pts.forEach((a, i) => {
        const l: Valor = { k: 'linea', tipo: 'segmento', a, b: v.pts[(i + 1) % v.pts.length] }
        const t = proyectar(l, p)
        const d = dist(sobre(l, t)!, p)
        if (d < dmin) {
          dmin = d
          mejor = i + t
        }
      })
      return mejor
    }
    default:
      return 0
  }
}

/** Rango de t que recorre el objeto entero (para el lugar geométrico). */
function recorrido(v: Valor): [number, number] {
  if (v.k === 'circ') return [-Math.PI, Math.PI]
  if (v.k === 'poligono') return [0, v.pts.length]
  if (v.k === 'linea') return v.tipo === 'recta' ? [-8, 8] : v.tipo === 'semirrecta' ? [0, 16] : [0, 1]
  return [0, 1]
}

/** Distancia de p al objeto, para saber qué hay bajo el ratón. */
export function distancia(v: Valor, p: P): number {
  switch (v.k) {
    case 'punto':
      return dist(v.p, p)
    case 'linea':
    case 'arco':
    case 'poligono':
      if (v.k === 'poligono') {
        return Math.min(...v.pts.map((a, i) => distancia({ k: 'linea', tipo: 'segmento', a, b: v.pts[(i + 1) % v.pts.length] }, p)))
      }
      return dist(sobre(v, proyectar(v, p))!, p)
    case 'circ':
      return Math.abs(dist(v.c, p) - v.r)
    case 'conica': {
      // |F| / |∇F|: distancia a primer orden
      const [A, B, C, D, E] = v.q
      const gx = 2 * A * p.x + B * p.y + D
      const gy = B * p.x + 2 * C * p.y + E
      return Math.abs(evalConica(v.q, p)) / (Math.hypot(gx, gy) || 1)
    }
    case 'lugar':
      return Math.min(Infinity, ...v.pts.map((q) => dist(q, p)))
    case 'medida':
      return dist(v.en, p)
    default:
      return Infinity
  }
}

/* ---------- definiciones ---------- */

type Contexto = { vals: Map<string, Valor>; objs: Obj[]; indice: number }

const P_ = (v: Valor | undefined): P | null => (v?.k === 'punto' ? v.p : null)

function lineaDe(v: Valor | undefined): Extract<Valor, { k: 'linea' }> | null {
  return v?.k === 'linea' ? v : null
}

function circDe(v: Valor | undefined): { c: P; r: number } | null {
  return v?.k === 'circ' || v?.k === 'arco' ? v : null
}

function circ3(a: P, b: P, c: P): Valor {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y))
  if (Math.abs(d) < EPS) return NADA
  const sq = (p: P) => p.x * p.x + p.y * p.y
  const cx = (sq(a) * (b.y - c.y) + sq(b) * (c.y - a.y) + sq(c) * (a.y - b.y)) / d
  const cy = (sq(a) * (c.x - b.x) + sq(b) * (a.x - c.x) + sq(c) * (b.x - a.x)) / d
  const centro = { x: cx, y: cy }
  return { k: 'circ', c: centro, r: dist(centro, a) }
}

function area(pts: P[]) {
  let s = 0
  pts.forEach((p, i) => (s += cruz(p, pts[(i + 1) % pts.length])))
  return Math.abs(s) / 2
}

const centroide = (pts: P[]) => escala(pts.reduce(sumaP, { x: 0, y: 0 }), 1 / pts.length)

/** Mapa de cada transformación a partir de sus padres. */
function mapa(def: string, vs: Valor[], o: Obj): Mapa | null {
  switch (def) {
    case 'simetria_axial': {
      const l = lineaDe(vs[1])
      if (!l) return null
      const u = unit(resta(l.b, l.a))
      return (p) => {
        const w = resta(p, l.a)
        return sumaP(l.a, resta(escala(u, 2 * punto(w, u)), w))
      }
    }
    case 'simetria_central': {
      const c = P_(vs[1])
      return c ? (p) => resta(escala(c, 2), p) : null
    }
    case 'rotacion': {
      const c = P_(vs[1])
      if (!c) return null
      const a = (o.v * Math.PI) / 180
      const [co, si] = [Math.cos(a), Math.sin(a)]
      return (p) => {
        const w = resta(p, c)
        return { x: c.x + co * w.x - si * w.y, y: c.y + si * w.x + co * w.y }
      }
    }
    case 'traslacion': {
      const l = lineaDe(vs[1])
      if (!l) return null
      const d = resta(l.b, l.a)
      return (p) => sumaP(p, d)
    }
    case 'homotecia': {
      const c = P_(vs[1])
      return c ? (p) => sumaP(c, escala(resta(p, c), o.v)) : null
    }
    default:
      return null
  }
}

function calcular(o: Obj, ctx: Contexto): Valor {
  const ids = o.args ? o.args.split(',') : []
  const vs = ids.map((id) => ctx.vals.get(id) ?? NADA)
  if (vs.some((v) => v.k === 'nada')) return NADA
  const ps = vs.map(P_)
  const [A, B, C] = ps
  switch (o.def) {
    case 'libre':
      return { k: 'punto', p: { x: o.x, y: o.y } }
    case 'sobre': {
      const p = sobre(vs[0], o.v)
      return p ? { k: 'punto', p } : NADA
    }
    case 'medio':
      if (A && B) return { k: 'punto', p: escala(sumaP(A, B), 0.5) }
      if (vs[0].k === 'linea') return { k: 'punto', p: escala(sumaP(vs[0].a, vs[0].b), 0.5) }
      return NADA
    case 'interseccion': {
      const r = cortes(vs[0], vs[1])
      return r[o.v] ? { k: 'punto', p: r[o.v] } : NADA
    }
    case 'centro': {
      const c = circDe(vs[0])
      if (c) return { k: 'punto', p: c.c }
      if (vs[0].k === 'poligono') return { k: 'punto', p: centroide(vs[0].pts) }
      return NADA
    }
    case 'segmento':
    case 'recta':
    case 'semirrecta':
    case 'vector':
      if (!A || !B || dist(A, B) < EPS) return NADA
      return { k: 'linea', tipo: o.def, a: A, b: B }
    case 'perpendicular':
    case 'paralela': {
      const p = ps.find(Boolean)
      const l = vs.map(lineaDe).find(Boolean)
      if (!p || !l) return NADA
      const d = resta(l.b, l.a)
      return { k: 'linea', tipo: 'recta', a: p, b: sumaP(p, o.def === 'paralela' ? d : perp(d)) }
    }
    case 'mediatriz': {
      if (!A || !B || dist(A, B) < EPS) return NADA
      const m = escala(sumaP(A, B), 0.5)
      return { k: 'linea', tipo: 'recta', a: m, b: sumaP(m, perp(resta(B, A))) }
    }
    case 'bisectriz': {
      if (!A || !B || !C) return NADA
      const u = sumaP(unit(resta(A, B)), unit(resta(C, B)))
      const d = norma(u) < EPS ? perp(resta(A, B)) : u
      return { k: 'linea', tipo: 'recta', a: B, b: sumaP(B, d) }
    }
    case 'tangente': {
      const p = ps.find(Boolean)
      const c = vs.map(circDe).find(Boolean)
      if (!p || !c) return NADA
      const d = dist(p, c.c)
      if (d < c.r - 1e-9) return NADA
      if (Math.abs(d - c.r) < 1e-9) return o.v ? NADA : { k: 'linea', tipo: 'recta', a: p, b: sumaP(p, perp(resta(p, c.c))) }
      // los puntos de tangencia están en la circunferencia de diámetro PC
      const t = cortesCircCirc(c.c, c.r, escala(sumaP(p, c.c), 0.5), d / 2)[o.v]
      return t ? { k: 'linea', tipo: 'recta', a: p, b: t } : NADA
    }
    case 'poligono':
      return ps.every(Boolean) && ps.length >= 3 ? { k: 'poligono', pts: ps as P[] } : NADA
    case 'regular': {
      if (!A || !B) return NADA
      const n = Math.max(3, Math.round(o.v))
      // cada lado es el anterior girado 2π/n: el polígono sale en sentido antihorario
      const pts = [A, B]
      const [co, si] = [Math.cos((2 * Math.PI) / n), Math.sin((2 * Math.PI) / n)]
      let d = resta(B, A)
      for (let i = 2; i < n; i++) {
        d = { x: co * d.x - si * d.y, y: si * d.x + co * d.y }
        pts.push(sumaP(pts[i - 1], d))
      }
      return { k: 'poligono', pts }
    }
    case 'circ_cp':
      return A && B ? { k: 'circ', c: A, r: dist(A, B) } : NADA
    case 'circ_cr':
      return A && o.v > 0 ? { k: 'circ', c: A, r: o.v } : NADA
    case 'circ3':
      return A && B && C ? circ3(A, B, C) : NADA
    case 'compas':
      return A && B && C ? { k: 'circ', c: C, r: dist(A, B) } : NADA
    case 'arco':
      // centro, punto inicial, y el final solo da la dirección
      return A && B && C ? { k: 'arco', c: A, r: dist(A, B), a0: angulo(resta(B, A)), a1: angulo(resta(C, A)) } : NADA
    case 'semicirculo': {
      if (!A || !B) return NADA
      const c = escala(sumaP(A, B), 0.5)
      return { k: 'arco', c, r: dist(A, B) / 2, a0: angulo(resta(A, c)), a1: angulo(resta(B, c)) }
    }
    case 'elipse':
    case 'hiperbola': {
      const q = A && B && C ? conicaFocal(A, B, C, o.def === 'hiperbola') : null
      return q ? { k: 'conica', q } : NADA
    }
    case 'parabola': {
      const f = ps.find(Boolean)
      const l = vs.map(lineaDe).find(Boolean)
      const q = f && l ? parabola(f, l.a, l.b) : null
      return q ? { k: 'conica', q } : NADA
    }
    case 'conica5': {
      const q = ps.every(Boolean) && ps.length === 5 ? conica5(ps as P[]) : null
      return q ? { k: 'conica', q } : NADA
    }
    case 'angulo': {
      if (!A || !B || !C) return NADA
      // el ángulo convexo (≤ 180°), el de clase: si el giro antihorario de BA a BC pasa de π, se mide al revés
      let a0 = angulo(resta(A, B))
      let a1 = angulo(resta(C, B))
      while (a1 < a0) a1 += 2 * Math.PI
      if (a1 - a0 > Math.PI) {
        ;[a0, a1] = [a1, a0 + 2 * Math.PI]
      }
      const grados = ((a1 - a0) * 180) / Math.PI
      const mitad = (a0 + a1) / 2
      return { k: 'medida', v: grados, unidad: '°', en: sumaP(B, { x: Math.cos(mitad), y: Math.sin(mitad) }), arco: { c: B, a0, a1 } }
    }
    case 'distancia': {
      if (A && B) return { k: 'medida', v: dist(A, B), unidad: '', en: escala(sumaP(A, B), 0.5) }
      const p = ps.find(Boolean)
      const l = vs.map(lineaDe).find(Boolean)
      if (p && l) {
        const q = sobre(l, proyectar(l, p))!
        return { k: 'medida', v: dist(p, q), unidad: '', en: escala(sumaP(p, q), 0.5) }
      }
      if (vs[0].k === 'linea') return { k: 'medida', v: dist(vs[0].a, vs[0].b), unidad: '', en: escala(sumaP(vs[0].a, vs[0].b), 0.5) }
      return NADA
    }
    case 'area': {
      const v = vs[0]
      if (v.k === 'poligono') return { k: 'medida', v: area(v.pts), unidad: 'u²', en: centroide(v.pts) }
      if (v.k === 'circ') return { k: 'medida', v: Math.PI * v.r * v.r, unidad: 'u²', en: v.c }
      return NADA
    }
    case 'perimetro': {
      const v = vs[0]
      if (v.k === 'poligono') return { k: 'medida', v: v.pts.reduce((acc, p, i) => acc + dist(p, v.pts[(i + 1) % v.pts.length]), 0), unidad: '', en: centroide(v.pts) }
      if (v.k === 'circ') return { k: 'medida', v: 2 * Math.PI * v.r, unidad: '', en: sumaP(v.c, { x: 0, y: v.r }) }
      return NADA
    }
    case 'incirculo': {
      if (!A || !B || !C) return NADA
      // incentro = media de los vértices pesada por el lado opuesto; r = 2·área / perímetro
      const [a, b, c] = [dist(B, C), dist(C, A), dist(A, B)]
      const per = a + b + c
      const ar = area([A, B, C])
      if (ar < EPS) return NADA
      const centro = escala(sumaP(sumaP(escala(A, a), escala(B, b)), escala(C, c)), 1 / per)
      return { k: 'circ', c: centro, r: (2 * ar) / per }
    }
    case 'inversion': {
      const circ = circDe(vs[1])
      if (!A || !circ) return NADA
      const w = resta(A, circ.c)
      const d2 = punto(w, w)
      // el centro va al infinito
      if (d2 < EPS) return NADA
      return { k: 'punto', p: sumaP(circ.c, escala(w, (circ.r * circ.r) / d2)) }
    }
    case 'pendiente': {
      const l = lineaDe(vs[0])
      if (!l) return NADA
      const d = resta(l.b, l.a)
      return Math.abs(d.x) < EPS ? NADA : { k: 'medida', v: d.y / d.x, unidad: '', en: sumaP(l.a, escala(d, 0.5)) }
    }
    case 'lugar': {
      // Q depende de P, que corre sobre su objeto: se rehace la construcción para cada posición
      const [idQ, idP] = ids
      const objP = ctx.objs.find((x) => x.id === idP)
      if (!objP || objP.def !== 'sobre') return NADA
      const base = ctx.vals.get(objP.args)
      if (!base) return NADA
      const [lo, hi] = recorrido(base)
      const previos = ctx.objs.slice(0, ctx.indice)
      const pts: P[] = []
      for (let i = 0; i <= 400; i++) {
        const t = lo + ((hi - lo) * i) / 400
        const vals = evaluar(previos.map((x) => (x.id === idP ? { ...x, v: t } : x)))
        const q = P_(vals.get(idQ))
        if (q) pts.push(q)
        else pts.push({ x: NaN, y: NaN })
      }
      return { k: 'lugar', pts }
    }
    default: {
      const f = mapa(o.def, vs, o)
      return f ? transformar(vs[0], f) : NADA
    }
  }
}

export function evaluar(objs: Obj[]): Map<string, Valor> {
  const vals = new Map<string, Valor>()
  objs.forEach((o, indice) => {
    let v: Valor
    try {
      v = calcular(o, { vals, objs, indice })
    } catch {
      v = NADA
    }
    vals.set(o.id, v)
  })
  return vals
}

/** Todos los que dependen, directa o indirectamente, de `id` (él incluido). */
export function dependientes(objs: Obj[], id: string): Set<string> {
  const fuera = new Set([id])
  for (const o of objs) if (o.args.split(',').some((a) => fuera.has(a))) fuera.add(o.id)
  return fuera
}

/* ---------- herramientas ---------- */

export type Hueco = 'punto' | 'linea' | 'circ' | 'curva' | 'poligono' | 'superficie' | 'objeto' | 'vector' | 'cualquiera'

export interface Herramienta {
  nombre: string
  grupo: string
  def: string
  huecos: Hueco[]
  /** Si el orden de los clics importa (en las transformaciones, el objeto va primero). */
  ordenada?: boolean
  param?: { nombre: string; min: number; max: number; paso: number; defecto: number }
  /** Soluciones que crea a la vez (intersecciones, tangentes). */
  soluciones?: number
  pista: string
}

export const HERRAMIENTAS: Record<string, Herramienta> = {
  mover: { nombre: 'Mover', grupo: 'Mover', def: '', huecos: [], pista: 'Arrastra los puntos libres o los que van sobre un objeto' },
  punto: { nombre: 'Punto', grupo: 'Puntos', def: 'libre', huecos: ['punto'], pista: 'Pulsa en el plano, o sobre una línea o circunferencia para que el punto vaya sobre ella' },
  medio: { nombre: 'Punto medio', grupo: 'Puntos', def: 'medio', huecos: ['punto', 'punto'], pista: 'Dos puntos' },
  interseccion: { nombre: 'Intersección', grupo: 'Puntos', def: 'interseccion', huecos: ['curva', 'curva'], soluciones: 4, pista: 'Dos objetos' },
  centro: { nombre: 'Centro', grupo: 'Puntos', def: 'centro', huecos: ['superficie'], pista: 'Una circunferencia o un polígono (centroide)' },
  segmento: { nombre: 'Segmento', grupo: 'Rectas', def: 'segmento', huecos: ['punto', 'punto'], pista: 'Dos puntos' },
  recta: { nombre: 'Recta', grupo: 'Rectas', def: 'recta', huecos: ['punto', 'punto'], pista: 'Dos puntos' },
  semirrecta: { nombre: 'Semirrecta', grupo: 'Rectas', def: 'semirrecta', huecos: ['punto', 'punto'], ordenada: true, pista: 'Origen y un punto' },
  vector: { nombre: 'Vector', grupo: 'Rectas', def: 'vector', huecos: ['punto', 'punto'], ordenada: true, pista: 'Origen y extremo' },
  perpendicular: { nombre: 'Perpendicular', grupo: 'Rectas', def: 'perpendicular', huecos: ['punto', 'linea'], pista: 'Un punto y una recta' },
  paralela: { nombre: 'Paralela', grupo: 'Rectas', def: 'paralela', huecos: ['punto', 'linea'], pista: 'Un punto y una recta' },
  mediatriz: { nombre: 'Mediatriz', grupo: 'Rectas', def: 'mediatriz', huecos: ['punto', 'punto'], pista: 'Dos puntos' },
  bisectriz: { nombre: 'Bisectriz', grupo: 'Rectas', def: 'bisectriz', huecos: ['punto', 'punto', 'punto'], ordenada: true, pista: 'Tres puntos; el vértice es el segundo' },
  tangente: { nombre: 'Tangentes', grupo: 'Rectas', def: 'tangente', huecos: ['punto', 'circ'], soluciones: 2, pista: 'Un punto y una circunferencia' },
  poligono: { nombre: 'Polígono', grupo: 'Polígonos', def: 'poligono', huecos: ['punto'], pista: 'Vértices uno a uno; pulsa el primero para cerrar' },
  regular: {
    nombre: 'Polígono regular', grupo: 'Polígonos', def: 'regular', huecos: ['punto', 'punto'], ordenada: true,
    param: { nombre: 'Lados', min: 3, max: 12, paso: 1, defecto: 6 }, pista: 'Dos vértices consecutivos',
  },
  circ_cp: { nombre: 'Centro y punto', grupo: 'Circunferencias', def: 'circ_cp', huecos: ['punto', 'punto'], ordenada: true, pista: 'Centro y un punto de la circunferencia' },
  circ_cr: {
    nombre: 'Centro y radio', grupo: 'Circunferencias', def: 'circ_cr', huecos: ['punto'],
    param: { nombre: 'Radio', min: 0.1, max: 10, paso: 0.1, defecto: 2 }, pista: 'El centro',
  },
  circ3: { nombre: 'Por tres puntos', grupo: 'Circunferencias', def: 'circ3', huecos: ['punto', 'punto', 'punto'], pista: 'Tres puntos' },
  incirculo: { nombre: 'Inscrita en un triángulo', grupo: 'Circunferencias', def: 'incirculo', huecos: ['punto', 'punto', 'punto'], pista: 'Los tres vértices' },
  compas: { nombre: 'Compás', grupo: 'Circunferencias', def: 'compas', huecos: ['punto', 'punto', 'punto'], ordenada: true, pista: 'Dos puntos que dan el radio y luego el centro' },
  arco: { nombre: 'Arco', grupo: 'Circunferencias', def: 'arco', huecos: ['punto', 'punto', 'punto'], ordenada: true, pista: 'Centro, punto inicial y dirección final (antihorario)' },
  semicirculo: { nombre: 'Semicircunferencia', grupo: 'Circunferencias', def: 'semicirculo', huecos: ['punto', 'punto'], ordenada: true, pista: 'Los dos extremos' },
  elipse: { nombre: 'Elipse', grupo: 'Cónicas', def: 'elipse', huecos: ['punto', 'punto', 'punto'], ordenada: true, pista: 'Dos focos y un punto' },
  hiperbola: { nombre: 'Hipérbola', grupo: 'Cónicas', def: 'hiperbola', huecos: ['punto', 'punto', 'punto'], ordenada: true, pista: 'Dos focos y un punto' },
  parabola: { nombre: 'Parábola', grupo: 'Cónicas', def: 'parabola', huecos: ['punto', 'linea'], pista: 'Foco y directriz' },
  conica5: { nombre: 'Por cinco puntos', grupo: 'Cónicas', def: 'conica5', huecos: ['punto', 'punto', 'punto', 'punto', 'punto'], pista: 'Cinco puntos' },
  angulo: { nombre: 'Ángulo', grupo: 'Medidas', def: 'angulo', huecos: ['punto', 'punto', 'punto'], ordenada: true, pista: 'Tres puntos; el vértice es el segundo' },
  distancia: { nombre: 'Distancia', grupo: 'Medidas', def: 'distancia', huecos: ['punto', 'punto'], pista: 'Dos puntos' },
  area: { nombre: 'Área', grupo: 'Medidas', def: 'area', huecos: ['superficie'], pista: 'Un polígono o una circunferencia' },
  perimetro: { nombre: 'Perímetro', grupo: 'Medidas', def: 'perimetro', huecos: ['superficie'], pista: 'Un polígono o una circunferencia' },
  pendiente: { nombre: 'Pendiente', grupo: 'Medidas', def: 'pendiente', huecos: ['linea'], pista: 'Una recta' },
  simetria_axial: { nombre: 'Simetría axial', grupo: 'Transformar', def: 'simetria_axial', huecos: ['objeto', 'linea'], ordenada: true, pista: 'El objeto y luego el eje' },
  simetria_central: { nombre: 'Simetría central', grupo: 'Transformar', def: 'simetria_central', huecos: ['objeto', 'punto'], ordenada: true, pista: 'El objeto y luego el centro' },
  rotacion: {
    nombre: 'Rotación', grupo: 'Transformar', def: 'rotacion', huecos: ['objeto', 'punto'], ordenada: true,
    param: { nombre: 'Ángulo (°)', min: -180, max: 180, paso: 1, defecto: 90 }, pista: 'El objeto y luego el centro',
  },
  traslacion: { nombre: 'Traslación', grupo: 'Transformar', def: 'traslacion', huecos: ['objeto', 'vector'], ordenada: true, pista: 'El objeto y luego un vector' },
  homotecia: {
    nombre: 'Homotecia', grupo: 'Transformar', def: 'homotecia', huecos: ['objeto', 'punto'], ordenada: true,
    param: { nombre: 'Razón', min: -3, max: 3, paso: 0.1, defecto: 2 }, pista: 'El objeto y luego el centro',
  },
  inversion: { nombre: 'Inversión', grupo: 'Transformar', def: 'inversion', huecos: ['punto', 'circ'], ordenada: true, pista: 'El punto y luego la circunferencia de inversión' },
  lugar: { nombre: 'Lugar geométrico', grupo: 'Especiales', def: 'lugar', huecos: ['punto', 'punto'], ordenada: true, pista: 'El punto que deja rastro y luego el punto sobre un objeto que lo mueve' },
  borrar: { nombre: 'Borrar', grupo: 'Especiales', def: '', huecos: ['cualquiera'], pista: 'Pulsa un objeto: se va con todo lo que depende de él' },
}

export const GRUPOS = ['Mover', 'Puntos', 'Rectas', 'Polígonos', 'Circunferencias', 'Cónicas', 'Medidas', 'Transformar', 'Especiales']

/** ¿Encaja este valor en el hueco? */
export function encaja(h: Hueco, v: Valor): boolean {
  switch (h) {
    case 'punto':
      return v.k === 'punto'
    case 'linea':
      return v.k === 'linea'
    case 'vector':
      return v.k === 'linea' && (v.tipo === 'vector' || v.tipo === 'segmento')
    case 'circ':
      return v.k === 'circ' || v.k === 'arco'
    case 'curva':
      return v.k === 'linea' || v.k === 'circ' || v.k === 'arco' || v.k === 'conica' || v.k === 'poligono'
    case 'superficie':
      return v.k === 'poligono' || v.k === 'circ'
    case 'objeto':
      return v.k !== 'medida' && v.k !== 'nada'
    case 'cualquiera':
      return v.k !== 'nada'
    default:
      return false
  }
}

/* ---------- nombres y descripciones ---------- */

const MAYUS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const MINUS = 'abcdefghijklmnopqrstuvwxyz'
const GRIEGAS = 'αβγδεζηθκλμνξπρστφψω'

export function nombreNuevo(objs: Obj[], tipo: 'punto' | 'medida' | 'otro'): string {
  const usados = new Set(objs.map((o) => o.id))
  const letras = tipo === 'punto' ? MAYUS : tipo === 'medida' ? GRIEGAS : MINUS
  for (let vuelta = 0; ; vuelta++) {
    for (const l of letras) {
      const n = vuelta ? `${l}${vuelta}` : l
      if (!usados.has(n)) return n
    }
  }
}

export const tipoDeDef = (def: string): 'punto' | 'medida' | 'otro' =>
  ['libre', 'sobre', 'medio', 'interseccion', 'centro', 'inversion'].includes(def) ? 'punto' : ['angulo', 'distancia', 'area', 'pendiente', 'perimetro'].includes(def) ? 'medida' : 'otro'

const f2 = (v: number) => {
  const r = +v.toFixed(2)
  return Object.is(r, -0) ? '0' : String(r).replace('-', '−')
}

function termino(c: number, variable: string, primero: boolean): string {
  if (Math.abs(c) < 5e-4) return ''
  const signo = c < 0 ? (primero ? '−' : ' − ') : primero ? '' : ' + '
  const a = Math.abs(c)
  const coef = variable && Math.abs(a - 1) < 5e-4 ? '' : f2(a)
  return `${signo}${coef}${variable}`
}

export interface TipoConica {
  tipo: 'elipse' | 'circunferencia' | 'hipérbola' | 'parábola' | 'degenerada' | 'vacía'
  excentricidad: number | null
  centro: P | null
}

/**
 * Tipo de A x² + B xy + C y² + D x + E y + F = 0 por los invariantes: el signo de
 * B² − 4AC separa elipse, parábola e hipérbola; el determinante de la matriz
 * completa, las degeneradas. La excentricidad sale de la forma reducida.
 */
export function clasificarConica(q: number[]): TipoConica {
  const [A, B, C, D, E, F] = q
  const k = Math.max(...q.map(Math.abs)) || 1
  const disc = (B * B - 4 * A * C) / (k * k)
  const M = [[A, B / 2, D / 2], [B / 2, C, E / 2], [D / 2, E / 2, F]]
  const det3 =
    M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) - M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) + M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0])
  if (Math.abs(det3) / k ** 3 < 1e-9) return { tipo: 'degenerada', excentricidad: null, centro: null }
  if (Math.abs(disc) < 1e-9) return { tipo: 'parábola', excentricidad: 1, centro: null }
  // centro: gradiente nulo
  const den = 4 * A * C - B * B
  const centro = { x: (B * E - 2 * C * D) / den, y: (B * D - 2 * A * E) / den }
  const Fp = F + (D * centro.x + E * centro.y) / 2
  // autovalores de la parte cuadrática
  const t = A + C
  const r = Math.sqrt(((A - C) / 2) ** 2 + (B / 2) ** 2)
  const [l1, l2] = [t / 2 + r, t / 2 - r]
  if (disc < 0) {
    // λ₁X² + λ₂Y² = −F′: elipse si −F′ tiene el signo de los λ
    if (-Fp / l1 <= 0) return { tipo: 'vacía', excentricidad: null, centro }
    const [a2, b2] = [-Fp / Math.min(Math.abs(l1), Math.abs(l2)) * Math.sign(l1), -Fp / Math.max(Math.abs(l1), Math.abs(l2)) * Math.sign(l1)]
    const e = Math.sqrt(Math.max(0, 1 - b2 / a2))
    return { tipo: e < 1e-6 ? 'circunferencia' : 'elipse', excentricidad: e, centro }
  }
  // hipérbola: el eje real es el del λ con el signo de −F′
  const [real, imag] = -Fp / l1 > 0 ? [l1, l2] : [l2, l1]
  const e = Math.sqrt(1 + Math.abs(real / imag))
  return { tipo: 'hipérbola', excentricidad: e, centro }
}

/** Ecuación o coordenadas, como en la vista algebraica de GeoGebra. */
export function describir(v: Valor): string {
  switch (v.k) {
    case 'punto':
      return `(${f2(v.p.x)}, ${f2(v.p.y)})`
    case 'linea': {
      if (v.tipo === 'segmento') return `longitud ${f2(dist(v.a, v.b))}`
      if (v.tipo === 'vector') return `(${f2(v.b.x - v.a.x)}, ${f2(v.b.y - v.a.y)})`
      const d = resta(v.b, v.a)
      // a x + b y = c con a ≥ 0
      let [a, b] = [d.y, -d.x]
      let c = a * v.a.x + b * v.a.y
      const s = a < -EPS || (Math.abs(a) < EPS && b < 0) ? -1 : 1
      const k = Math.max(Math.abs(a), Math.abs(b))
      ;[a, b, c] = [(s * a) / k, (s * b) / k, (s * c) / k]
      const izq = termino(a, 'x', true) + termino(b, 'y', !termino(a, 'x', true))
      return `${izq} = ${f2(c)}`
    }
    case 'circ':
    case 'arco': {
      const x = v.c.x ? `(x ${v.c.x > 0 ? '−' : '+'} ${f2(Math.abs(v.c.x))})²` : 'x²'
      const y = v.c.y ? `(y ${v.c.y > 0 ? '−' : '+'} ${f2(Math.abs(v.c.y))})²` : 'y²'
      return v.k === 'arco' ? `arco de radio ${f2(v.r)}` : `${x} + ${y} = ${f2(v.r * v.r)}`
    }
    case 'conica': {
      const k = Math.max(...v.q.slice(0, 3).map(Math.abs)) || 1
      const q = v.q.map((c) => c / k)
      const partes = [termino(q[0], 'x²', true)]
      const vars = ['xy', 'y²', 'x', 'y', '']
      for (let i = 1; i < 6; i++) partes.push(termino(q[i], vars[i - 1], !partes.join('')))
      const c = clasificarConica(v.q)
      const extra = [c.tipo, c.excentricidad !== null && c.tipo !== 'circunferencia' ? `e = ${f2(c.excentricidad)}` : '', c.centro && c.tipo !== 'vacía' ? `centro (${f2(c.centro.x)}, ${f2(c.centro.y)})` : '']
      return `${partes.join('') || '0'} = 0 · ${extra.filter(Boolean).join(', ')}`
    }
    case 'poligono':
      return `área ${f2(area(v.pts))}`
    case 'medida':
      return `${f2(v.v)}${v.unidad}`
    case 'lugar':
      return 'lugar geométrico'
    default:
      return 'no definido'
  }
}
