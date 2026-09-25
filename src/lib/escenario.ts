/**
 * Escenarios de cinemática en 2D: piezas fijas (edificios, rampas, muros, árboles…) y
 * móviles que se mueven con un tipo de movimiento dado (MRU, MRUA, MCU) o libres bajo la
 * gravedad, con rozamiento del aire, rebotes contra las piezas y deslizamiento con
 * rozamiento sobre suelos, azoteas y rampas. Sin DOM: se prueba en `npm run mate`.
 *
 * Unidades SI: metros, segundos, kilogramos; los ángulos que ve el usuario en grados.
 */

export type TipoPieza = 'edificio' | 'muro' | 'rampa' | 'plataforma' | 'arbol' | 'farola' | 'suelo'

export interface Pieza {
  id: string
  tipo: TipoPieza
  /** Borde izquierdo. */
  x: number
  ancho: number
  /** Altura (en la plataforma, la de su cara de arriba). */
  alto: number
  /** Rozamiento con lo que se apoya encima: estático y dinámico. */
  muE: number
  muD: number
  /** Rampa: el lado alto está a la derecha. */
  derecha?: boolean
  /** Árboles y farolas: si false, son decorado y se atraviesan. */
  solido?: boolean
  /** Suelo: nombre del material (asfalto, hielo…). */
  material?: string
}

export type TipoMovil = 'pelota' | 'piedra' | 'coche' | 'bloque' | 'disco'
export type Movimiento = 'libre' | 'mru' | 'mrua' | 'mcu'

export interface Movil {
  id: string
  tipo: TipoMovil
  nombre: string
  m: number
  /** Radio (o media anchura) para dibujarlo y chocar. */
  r: number
  movimiento: Movimiento
  /** Posición inicial (en el MCU, el centro de la circunferencia). */
  x0: number
  y0: number
  /** Rapidez inicial y dirección en grados desde +x. */
  v0: number
  ang: number
  /** MRUA: aceleración con signo en la dirección de v₀ (negativa = frena). */
  a: number
  /** MRUA: al frenar se queda parado en vez de dar la vuelta. */
  parar: boolean
  /** MRUA: añadir el rozamiento del suelo (−μ g). */
  rozar: boolean
  /** MCU: radio, ω₀ (rad/s), α (rad/s²) y fase inicial (grados). */
  R: number
  w0: number
  alfa: number
  fase: number
}

export type Aire = 'no' | 'lineal' | 'cuadratico'

export interface Escena {
  g: number
  aire: Aire
  /** Lineal: F = −b v (b en kg/s). Cuadrático: F = −c |v| v (c en kg/m). */
  kAire: number
  /** Coeficiente de restitución de los choques. */
  e: number
  /** Rozamiento del suelo general. */
  muE: number
  muD: number
  tMax: number
  piezas: Pieza[]
  moviles: Movil[]
}

/** Tramo de contorno sólido: el sólido queda a la derecha de a→b; la normal (izquierda) apunta fuera. */
export interface Tramo {
  a: [number, number]
  b: [number, number]
  /** Tangente unitaria, normal unitaria y longitud. */
  t: [number, number]
  n: [number, number]
  L: number
  muE: number
  muD: number
  pieza: string | null
}

export interface Muestra {
  t: number
  x: number
  y: number
  vx: number
  vy: number
  ax: number
  ay: number
  /** Distancia recorrida. */
  s: number
}

export interface Suceso {
  t: number
  x: number
  y: number
  tipo: 'altura-max' | 'impacto' | 'apoyo' | 'parada' | 'despegue' | 'encuentro' | 'vuelta'
  texto: string
  /** Rapidez antes del choque (impactos). */
  v?: number
}

export interface Recorrido {
  id: string
  muestras: Muestra[]
  sucesos: Suceso[]
  /** Momento en que se queda quieto para siempre, si ocurre. */
  quieto: number | null
}

export interface Simulacion {
  tramos: Tramo[]
  recorridos: Recorrido[]
  /** Hasta dónde tiene sentido reproducir. */
  tFin: number
  encuentros: Suceso[]
}

/** Número con coma decimal para los textos. */
const coma = (v: number, d = 2) => v.toFixed(d).replace('.', ',')

/* ---------------------------------------------------------------- piezas */

const ALTO_LOSA = 0.4
const ANCHO_TRONCO = 0.4

/** Rectángulo o triángulo que ocupa la pieza en planta (para cortar el suelo). */
function huella(p: Pieza): [number, number] | null {
  if (p.tipo === 'edificio' || p.tipo === 'muro' || p.tipo === 'rampa') return [p.x, p.x + p.ancho]
  if ((p.tipo === 'arbol' || p.tipo === 'farola') && p.solido) {
    const c = p.x + p.ancho / 2
    return [c - ANCHO_TRONCO / 2, c + ANCHO_TRONCO / 2]
  }
  return null
}

function tramo(a: [number, number], b: [number, number], muE: number, muD: number, pieza: string | null): Tramo | null {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const L = Math.hypot(dx, dy)
  if (L < 1e-9) return null
  const t: [number, number] = [dx / L, dy / L]
  return { a, b, t, n: [-t[1], t[0]], L, muE, muD, pieza }
}

/** Contorno de un rectángulo [x0,x1]×[y0,y1], con el sólido dentro; `base` incluye la cara de abajo. */
function caja(x0: number, x1: number, y0: number, y1: number, p: Pieza, base: boolean): Array<Tramo | null> {
  const out = [
    tramo([x0, y0], [x0, y1], p.muE, p.muD, p.id),
    tramo([x0, y1], [x1, y1], p.muE, p.muD, p.id),
    tramo([x1, y1], [x1, y0], p.muE, p.muD, p.id),
  ]
  if (base) out.push(tramo([x1, y0], [x0, y0], p.muE, p.muD, p.id))
  return out
}

const LEJOS = 1e5

/** Todos los tramos sólidos del escenario: el suelo (cortado bajo las piezas) y el contorno de cada pieza. */
export function tramosDe(esc: Escena): Tramo[] {
  const out: Array<Tramo | null> = []
  // suelo: cortes en los bordes de huellas y de tramos de material
  const huellas = esc.piezas.map(huella).filter((h): h is [number, number] => !!h)
  const suelos = esc.piezas.filter((p) => p.tipo === 'suelo')
  const cortes = new Set<number>([-LEJOS, LEJOS])
  for (const [a, b] of huellas) cortes.add(a).add(b)
  for (const p of suelos) cortes.add(p.x).add(p.x + p.ancho)
  const xs = [...cortes].sort((a, b) => a - b)
  for (let i = 0; i + 1 < xs.length; i++) {
    const a = xs[i]
    const b = xs[i + 1]
    const c = (a + b) / 2
    if (huellas.some(([h0, h1]) => c > h0 && c < h1)) continue
    const mat = [...suelos].reverse().find((p) => c > p.x && c < p.x + p.ancho)
    out.push(tramo([a, 0], [b, 0], mat?.muE ?? esc.muE, mat?.muD ?? esc.muD, mat?.id ?? null))
  }
  for (const p of esc.piezas) {
    const x0 = p.x
    const x1 = p.x + p.ancho
    const h = Math.max(0.05, p.alto)
    if (p.tipo === 'edificio' || p.tipo === 'muro') out.push(...caja(x0, x1, 0, h, p, false))
    else if (p.tipo === 'plataforma') out.push(...caja(x0, x1, h - ALTO_LOSA, h, p, true))
    else if (p.tipo === 'rampa') {
      if (p.derecha !== false) {
        out.push(tramo([x0, 0], [x1, h], p.muE, p.muD, p.id), tramo([x1, h], [x1, 0], p.muE, p.muD, p.id))
      } else {
        out.push(tramo([x0, 0], [x0, h], p.muE, p.muD, p.id), tramo([x0, h], [x1, 0], p.muE, p.muD, p.id))
      }
    } else if ((p.tipo === 'arbol' || p.tipo === 'farola') && p.solido) {
      const [a, b] = huella(p)!
      out.push(...caja(a, b, 0, h, p, false))
    }
  }
  return out.filter((t): t is Tramo => !!t)
}

/** Altura de la superficie más alta bajo x que queda por debajo de `y` (para dejar caer o colocar cosas). */
export function superficieBajo(tramos: Tramo[], x: number, y = Infinity): number {
  let mejor = 0
  for (const s of tramos) {
    if (s.n[1] <= 0.2) continue
    const [xa, xb] = s.a[0] < s.b[0] ? [s.a[0], s.b[0]] : [s.b[0], s.a[0]]
    if (x < xa || x > xb) continue
    const u = (x - s.a[0]) / (s.b[0] - s.a[0])
    const h = s.a[1] + u * (s.b[1] - s.a[1])
    if (h <= y + 1e-9 && h > mejor) mejor = h
  }
  return mejor
}

/* ---------------------------------------------------------------- movimiento libre */

type Estado4 = [number, number, number, number]

function aceleracionAire(esc: Escena, m: number, vx: number, vy: number): [number, number] {
  if (esc.aire === 'no' || esc.kAire <= 0 || m <= 0) return [0, 0]
  if (esc.aire === 'lineal') return [(-esc.kAire * vx) / m, (-esc.kAire * vy) / m]
  const v = Math.hypot(vx, vy)
  return [(-esc.kAire * v * vx) / m, (-esc.kAire * v * vy) / m]
}

function derivAire(esc: Escena, m: number, y: Estado4): Estado4 {
  const [ax, ay] = aceleracionAire(esc, m, y[2], y[3])
  return [y[2], y[3], ax, ay - esc.g]
}

function rk4(f: (y: Estado4) => Estado4, y: Estado4, h: number): Estado4 {
  const k1 = f(y)
  const y2 = y.map((v, i) => v + (h / 2) * k1[i]) as Estado4
  const k2 = f(y2)
  const y3 = y.map((v, i) => v + (h / 2) * k2[i]) as Estado4
  const k3 = f(y3)
  const y4 = y.map((v, i) => v + h * k3[i]) as Estado4
  const k4 = f(y4)
  return y.map((v, i) => v + (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i])) as Estado4
}

/** Distancia con signo del borde del cuerpo a la recta del tramo, y posición a lo largo de él. */
function hueco(s: Tramo, x: number, y: number, r: number) {
  const px = x - s.a[0]
  const py = y - s.a[1]
  return { d: px * s.n[0] + py * s.n[1] - r, u: px * s.t[0] + py * s.t[1] }
}

/** Primer tramo con el que choca al ir de y0 a y1 (en el aire), si alguno. */
function choque(tramos: Tramo[], r: number, y0: Estado4, y1: Estado4, excluir: number): number {
  let mejor = -1
  let dMejor = Infinity
  for (let i = 0; i < tramos.length; i++) {
    if (i === excluir) continue
    const s = tramos[i]
    const h0 = hueco(s, y0[0], y0[1], r)
    const h1 = hueco(s, y1[0], y1[1], r)
    if (!(h0.d >= -1e-9 && h1.d < 0)) continue
    const vn = y1[2] * s.n[0] + y1[3] * s.n[1]
    if (vn >= 0) continue
    // el cruce de la recta tiene que caer dentro del tramo
    const k = h0.d / (h0.d - h1.d)
    const u = h0.u + k * (h1.u - h0.u)
    if (u < -1e-6 || u > s.L + 1e-6) continue
    if (h0.d < dMejor) {
      dMejor = h0.d
      mejor = i
    }
  }
  return mejor
}

/** Tramos que empiezan o acaban justo donde acaba otro, para seguir rodando por uno de ellos. */
function vecinos(tramos: Tramo[], i: number, alFinal: boolean): Array<{ j: number; desdeA: boolean }> {
  const s = tramos[i]
  const P = alFinal ? s.b : s.a
  const out: Array<{ j: number; desdeA: boolean }> = []
  for (let j = 0; j < tramos.length; j++) {
    if (j === i) continue
    const q = tramos[j]
    if (Math.hypot(q.a[0] - P[0], q.a[1] - P[1]) < 1e-6) out.push({ j, desdeA: true })
    else if (Math.hypot(q.b[0] - P[0], q.b[1] - P[1]) < 1e-6) out.push({ j, desdeA: false })
  }
  return out
}

const PASO = 1 / 600
const CADA = 6 // una muestra cada 0,01 s
const V_PEGA = 1 // por debajo de esta velocidad normal (botes de menos de 5 cm), tras chocar se queda apoyado
const V_QUIETO = 1e-3

/**
 * Integra un móvil libre: en el aire con RK4 y detección de choques por bisección; apoyado
 * sobre un tramo, en una dimensión a lo largo de él con gravedad, rozamiento y aire.
 */
function simularLibre(esc: Escena, mv: Movil, tramos: Tramo[]): Recorrido {
  const m = mv.m
  const r = mv.r
  const rad = (mv.ang * Math.PI) / 180
  let y: Estado4 = [mv.x0, mv.y0, mv.v0 * Math.cos(rad), mv.v0 * Math.sin(rad)]
  // apoyo: índice del tramo y posición u y velocidad w a lo largo de él
  let apoyo = -1
  let u = 0
  let w = 0
  const muestras: Muestra[] = []
  const sucesos: Suceso[] = []
  let recorrido = 0
  let quieto: number | null = null
  const f = (z: Estado4) => derivAire(esc, m, z)

  // ¿empieza apoyado? (sobre algo y sin velocidad hacia fuera)
  for (let i = 0; i < tramos.length; i++) {
    const s = tramos[i]
    const h = hueco(s, y[0], y[1], r)
    if (Math.abs(h.d) < 0.02 && h.u >= 0 && h.u <= s.L && s.n[1] > 0.2 && y[2] * s.n[0] + y[3] * s.n[1] <= 1e-9) {
      apoyo = i
      u = h.u
      w = y[2] * s.t[0] + y[3] * s.t[1]
      break
    }
  }

  const posApoyo = (): [number, number] => {
    const s = tramos[apoyo]
    return [s.a[0] + u * s.t[0] + r * s.n[0], s.a[1] + u * s.t[1] + r * s.n[1]]
  }
  /** Aceleración a lo largo del tramo; null si el rozamiento estático lo sujeta. */
  const acelApoyo = (ww: number): number | null => {
    const s = tramos[apoyo]
    const gt = -esc.g * s.t[1]
    const N = esc.g * s.n[1] // por unidad de masa
    const [axA, ayA] = aceleracionAire(esc, m, ww * s.t[0], ww * s.t[1])
    const aireT = axA * s.t[0] + ayA * s.t[1]
    if (Math.abs(ww) < V_QUIETO) {
      if (Math.abs(gt) <= s.muE * N) return null
      return gt - Math.sign(gt) * s.muD * N
    }
    return gt - Math.sign(ww) * s.muD * N + aireT
  }
  let acel: [number, number] = [0, -esc.g]

  let t = 0
  let paso = 0
  let vyPrevia = y[3]
  const muestra = () => {
    let x: number, yy: number, vx: number, vy: number
    if (apoyo >= 0) {
      ;[x, yy] = posApoyo()
      const s = tramos[apoyo]
      vx = w * s.t[0]
      vy = w * s.t[1]
    } else [x, yy, vx, vy] = y
    muestras.push({ t, x, y: yy, vx, vy, ax: acel[0], ay: acel[1], s: recorrido })
  }
  muestra()

  const nPasos = Math.ceil(esc.tMax / PASO)
  let choques = 0
  // tramo del que acaba de salir volando: no se choca con él hasta separarse
  let ignora = -1
  while (paso < nPasos) {
    const h = (paso + 1) * PASO - t
    if (h < 1e-12 || choques > 50) {
      // paso agotado (o demasiados choques seguidos en el mismo paso: se da por hecho)
      t = (paso + 1) * PASO
      paso++
      choques = 0
      if (paso % CADA === 0) muestra()
      continue
    }
    if (apoyo >= 0) {
      const s = tramos[apoyo]
      const a0 = acelApoyo(w)
      if (a0 === null) {
        // sujeto por el rozamiento estático
        if (quieto === null) {
          quieto = t
          const [px, py] = posApoyo()
          if (t > 0) sucesos.push({ t, x: px, y: py, tipo: 'parada', texto: 'se para' })
        }
        w = 0
        acel = [0, 0]
      } else {
        quieto = null
        // RK4 en 1D con el sentido del rozamiento fijado al del principio del paso
        const sg = Math.abs(w) < V_QUIETO ? -Math.sign(a0) : Math.sign(w)
        const N = esc.g * s.n[1]
        const g1 = (z: number) => {
          const [axA, ayA] = aceleracionAire(esc, m, z * s.t[0], z * s.t[1])
          return -esc.g * s.t[1] - sg * s.muD * N + axA * s.t[0] + ayA * s.t[1]
        }
        const k1u = w
        const k1w = g1(w)
        let du: number
        let wn: number
        if (s.muD > 0 && Math.abs(w) >= V_QUIETO && Math.sign(w + h * k1w) !== Math.sign(w)) {
          // el rozamiento lo para dentro de este paso: se para justo en v = 0
          const tPara = Math.abs(w / k1w)
          du = 0.5 * w * tPara
          wn = 0
        } else {
          const k2u = w + (h / 2) * k1w
          const k2w = g1(w + (h / 2) * k1w)
          const k3u = w + (h / 2) * k2w
          const k3w = g1(w + (h / 2) * k2w)
          const k4u = w + h * k3w
          const k4w = g1(w + h * k3w)
          wn = w + (h / 6) * (k1w + 2 * k2w + 2 * k3w + k4w)
          du = (h / 6) * (k1u + 2 * k2u + 2 * k3u + k4u)
        }
        u += du
        recorrido += Math.abs(du)
        w = wn
        acel = [k1w * s.t[0], k1w * s.t[1]]
        // salirse por un extremo: seguir por el tramo vecino, chocar con él o salir volando
        if (u < 0 || u > s.L) {
          const alFinal = u > s.L
          const dir: [number, number] = [s.t[0] * Math.sign(w || 1), s.t[1] * Math.sign(w || 1)]
          const P = alFinal ? s.b : s.a
          // de los tramos que salen de la junta, el que menos tuerce el camino
          let mejor: { j: number; desdeA: boolean; giro: number; hacia: number } | null = null
          for (const v of vecinos(tramos, apoyo, alFinal)) {
            const q = tramos[v.j]
            const dq: [number, number] = v.desdeA ? q.t : [-q.t[0], -q.t[1]]
            const giro = Math.acos(Math.max(-1, Math.min(1, dir[0] * dq[0] + dir[1] * dq[1])))
            // > 0: cóncavo (el camino sube hacia el lado libre)
            const hacia = dq[0] * s.n[0] + dq[1] * s.n[1]
            if (!mejor || giro < mejor.giro) mejor = { ...v, giro, hacia }
          }
          let hecho = false
          if (mejor) {
            const q = tramos[mejor.j]
            if (mejor.hacia > 1e-9 && mejor.giro > Math.PI / 3) {
              // pared: rebota y sigue en el mismo tramo
              u = alFinal ? s.L - (u - s.L) : -u
              const antes = Math.abs(w)
              w = -esc.e * w
              sucesos.push({ t, x: P[0], y: P[1], tipo: 'impacto', texto: `choca con una pared a ${coma(antes, 2)} m/s`, v: antes })
              hecho = true
            } else if (q.n[1] > 0.05 && (mejor.hacia > 1e-9 || mejor.giro < (25 * Math.PI) / 180)) {
              // junta suave: pasa al vecino conservando la rapidez
              const sobra = alFinal ? u - s.L : -u
              const rap = Math.abs(w)
              apoyo = mejor.j
              u = mejor.desdeA ? sobra : q.L - sobra
              w = mejor.desdeA ? rap : -rap
              hecho = true
            }
          }
          if (!hecho) {
            // sale volando desde el borde
            const [px, py] = [P[0] + r * s.n[0], P[1] + r * s.n[1]]
            y = [px, py, w * s.t[0], w * s.t[1]]
            sucesos.push({ t, x: px, y: py, tipo: 'despegue', texto: 'se sale por el borde' })
            ignora = apoyo
            apoyo = -1
            vyPrevia = y[3]
          }
        }
      }
    } else {
      let y1 = rk4(f, y, h)
      if (ignora >= 0) {
        const hh = hueco(tramos[ignora], y1[0], y1[1], r)
        if (hh.d > 1e-3 || hh.u < -r || hh.u > tramos[ignora].L + r) ignora = -1
      }
      const i = choque(tramos, r, y, y1, ignora)
      let hUsado = h
      if (i >= 0) {
        // bisección del instante del choque
        const s = tramos[i]
        let lo = 0
        let hi = h
        for (let k = 0; k < 40; k++) {
          const mid = (lo + hi) / 2
          const ym = rk4(f, y, mid)
          if (hueco(s, ym[0], ym[1], r).d >= 0) lo = mid
          else hi = mid
        }
        hUsado = lo
        y1 = rk4(f, y, lo)
        const vn = y1[2] * s.n[0] + y1[3] * s.n[1]
        const vt = y1[2] * s.t[0] + y1[3] * s.t[1]
        const rapidez = Math.hypot(y1[2], y1[3])
        const vn2 = -esc.e * vn
        // rozamiento durante el choque: impulso tangencial limitado por μ·(1+e)|vn|
        const frena = Math.min(Math.abs(vt), s.muD * (1 + esc.e) * Math.abs(vn))
        const vt2 = vt - Math.sign(vt) * frena
        sucesos.push({ t: t + lo, x: y1[0], y: y1[1], tipo: 'impacto', texto: `choca a ${coma(rapidez, 2)} m/s`, v: rapidez })
        if (vn2 < V_PEGA && s.n[1] > 0.2) {
          apoyo = i
          const hh = hueco(s, y1[0], y1[1], r)
          u = Math.max(0, Math.min(s.L, hh.u))
          w = vt2
          sucesos.push({ t: t + lo, x: y1[0], y: y1[1], tipo: 'apoyo', texto: 'queda apoyado y desliza' })
        } else {
          y1 = [y1[0] + 1e-9 * s.n[0], y1[1] + 1e-9 * s.n[1], vt2 * s.t[0] + vn2 * s.n[0], vt2 * s.t[1] + vn2 * s.n[1]]
        }
      }
      recorrido += Math.hypot(y1[0] - y[0], y1[1] - y[1])
      if (apoyo < 0) {
        const d = f(y1)
        acel = [d[2], d[3]]
        if (vyPrevia > 0 && y1[3] <= 0 && i < 0) sucesos.push({ t: t + hUsado, x: y1[0], y: y1[1], tipo: 'altura-max', texto: `altura máxima ${coma(y1[1], 2)} m` })
        vyPrevia = y1[3]
      }
      y = y1
      // el trozo que queda del paso tras el choque se come en el siguiente
      if (i >= 0) {
        t += hUsado
        choques++
        continue
      }
    }
    t = (paso + 1) * PASO
    paso++
    choques = 0
    if (paso % CADA === 0) muestra()
  }
  if (muestras[muestras.length - 1].t < t) muestra()
  return { id: mv.id, muestras, sucesos, quieto }
}

/* ---------------------------------------------------------------- movimientos dados */

/** Aceleración efectiva del MRUA: la dada más el rozamiento del suelo si se pide. */
export function aceleracionMrua(esc: Escena, mv: Movil): number {
  return mv.a - (mv.rozar ? esc.muD * esc.g * Math.sign(mv.v0 || 1) : 0)
}

/** Estado analítico de un MRU/MRUA/MCU en el instante t. */
export function estadoDado(esc: Escena, mv: Movil, t: number): Muestra {
  if (mv.movimiento === 'mcu') {
    const f0 = (mv.fase * Math.PI) / 180
    const phi = f0 + mv.w0 * t + 0.5 * mv.alfa * t * t
    const w = mv.w0 + mv.alfa * t
    const c = Math.cos(phi)
    const s = Math.sin(phi)
    const x = mv.x0 + mv.R * c
    const y = mv.y0 + mv.R * s
    const vx = -mv.R * w * s
    const vy = mv.R * w * c
    // a = −ω²R r̂ + αR θ̂
    const ax = -w * w * mv.R * c - mv.alfa * mv.R * s
    const ay = -w * w * mv.R * s + mv.alfa * mv.R * c
    const arco = mv.R * Math.abs(mv.alfa === 0 ? mv.w0 * t : distanciaAngular(mv.w0, mv.alfa, t))
    return { t, x, y, vx, vy, ax, ay, s: arco }
  }
  const rad = (mv.ang * Math.PI) / 180
  const dx = Math.cos(rad)
  const dy = Math.sin(rad)
  const a = mv.movimiento === 'mrua' ? aceleracionMrua(esc, mv) : 0
  let tt = t
  let aa = a
  // al frenar hasta pararse: v = v₀ + a t se anula en t* = −v₀/a
  if (mv.movimiento === 'mrua' && mv.parar && a * mv.v0 < 0) {
    const tPara = -mv.v0 / a
    if (t >= tPara) {
      tt = tPara
      aa = 0
    }
  }
  const v = mv.v0 + a * tt
  const d = mv.v0 * tt + 0.5 * a * tt * tt
  // distancia recorrida: si da la vuelta, lo que avanzó hasta pararse más lo que retrocede
  const tVuelta = a * mv.v0 < 0 ? -mv.v0 / a : Infinity
  const recorrido = tt > tVuelta ? Math.abs((mv.v0 * mv.v0) / (2 * a)) + Math.abs(0.5 * a * (tt - tVuelta) ** 2) : Math.abs(d)
  const vv = tt === t ? v : 0
  return { t, x: mv.x0 + d * dx, y: mv.y0 + d * dy, vx: vv * dx, vy: vv * dy, ax: aa * dx, ay: aa * dy, s: recorrido }
}

function distanciaAngular(w0: number, alfa: number, t: number) {
  // ∫|ω| dt, con ω = ω₀ + α t que puede cambiar de signo
  const tc = -w0 / alfa
  const th = (a: number, b: number) => w0 * (b - a) + 0.5 * alfa * (b * b - a * a)
  if (tc > 0 && tc < t) return Math.abs(th(0, tc)) + Math.abs(th(tc, t))
  return Math.abs(th(0, t))
}

function simularDado(esc: Escena, mv: Movil): Recorrido {
  const muestras: Muestra[] = []
  const sucesos: Suceso[] = []
  const n = Math.ceil(esc.tMax / (PASO * CADA))
  let quieto: number | null = null
  for (let k = 0; k <= n; k++) {
    const t = Math.min(esc.tMax, k * PASO * CADA)
    muestras.push(estadoDado(esc, mv, t))
  }
  if (mv.movimiento === 'mrua') {
    const a = aceleracionMrua(esc, mv)
    if (a * mv.v0 < 0) {
      const tp = -mv.v0 / a
      if (tp <= esc.tMax) {
        const e = estadoDado(esc, mv, tp)
        sucesos.push({ t: tp, x: e.x, y: e.y, tipo: 'parada', texto: mv.parar ? `se para tras ${coma(e.s, 2)} m` : 'v = 0: da la vuelta' })
        if (mv.parar) quieto = tp
      }
    }
  }
  if (mv.movimiento === 'mcu' && (mv.w0 !== 0 || mv.alfa !== 0)) {
    // cada vuelta completa
    for (let k = 1; k < 200; k++) {
      const tk = tiempoAngulo(mv.w0, mv.alfa, 2 * Math.PI * k)
      if (tk === null || tk > esc.tMax) break
      const e = estadoDado(esc, mv, tk)
      sucesos.push({ t: tk, x: e.x, y: e.y, tipo: 'vuelta', texto: `vuelta ${k}` })
    }
  }
  return { id: mv.id, muestras, sucesos, quieto }
}

/** Primer t > 0 con |θ(t) − θ₀| = Δ, para ω₀ y α dados. */
export function tiempoAngulo(w0: number, alfa: number, delta: number): number | null {
  if (alfa === 0) return w0 === 0 ? null : delta / Math.abs(w0)
  // ½α t² + ω₀ t = ±Δ: la raíz positiva más pequeña
  const raices: number[] = []
  for (const sg of [1, -1]) {
    const D = w0 * w0 + 2 * alfa * sg * delta
    if (D < 0) continue
    for (const q of [(-w0 + Math.sqrt(D)) / alfa, (-w0 - Math.sqrt(D)) / alfa]) if (q > 1e-12) raices.push(q)
  }
  return raices.length ? Math.min(...raices) : null
}

/* ---------------------------------------------------------------- todo junto */

/** Estado en el instante t por interpolación lineal entre muestras. */
export function estadoEnT(rec: Recorrido, t: number): Muestra {
  const ms = rec.muestras
  if (t <= ms[0].t) return ms[0]
  if (t >= ms[ms.length - 1].t) return ms[ms.length - 1]
  let lo = 0
  let hi = ms.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (ms[mid].t <= t) lo = mid
    else hi = mid
  }
  const a = ms[lo]
  const b = ms[hi]
  const k = (t - a.t) / (b.t - a.t || 1)
  const l = (p: number, q: number) => p + k * (q - p)
  return { t, x: l(a.x, b.x), y: l(a.y, b.y), vx: l(a.vx, b.vx), vy: l(a.vy, b.vy), ax: l(a.ax, b.ax), ay: l(a.ay, b.ay), s: l(a.s, b.s) }
}

export function simular(esc: Escena): Simulacion {
  const tramos = tramosDe(esc)
  const recorridos = esc.moviles.map((mv) => (mv.movimiento === 'libre' ? simularLibre(esc, mv, tramos) : simularDado(esc, mv)))
  // encuentros entre parejas: la primera vez que se tocan
  const encuentros: Suceso[] = []
  for (let i = 0; i < esc.moviles.length; i++)
    for (let j = i + 1; j < esc.moviles.length; j++) {
      const A = recorridos[i].muestras
      const B = recorridos[j].muestras
      const R = esc.moviles[i].r + esc.moviles[j].r
      const n = Math.min(A.length, B.length)
      const dist = (k: number) => Math.hypot(A[k].x - B[k].x, A[k].y - B[k].y) - R
      if (dist(0) <= 0) continue
      for (let k = 1; k < n; k++) {
        if (dist(k) > 0) continue
        // afinar entre k−1 y k
        const d0 = dist(k - 1)
        const d1 = dist(k)
        const f = d0 / (d0 - d1)
        const t = A[k - 1].t + f * (A[k].t - A[k - 1].t)
        const ea = estadoEnT(recorridos[i], t)
        encuentros.push({ t, x: ea.x, y: ea.y, tipo: 'encuentro', texto: `${esc.moviles[i].nombre} y ${esc.moviles[j].nombre} se encuentran` })
        break
      }
    }
  // se reproduce hasta que todo esté quieto (con un respiro), o hasta tMax
  const quietos = recorridos.map((r) => r.quieto)
  const tFin = recorridos.length && quietos.every((q) => q !== null) ? Math.min(esc.tMax, Math.max(...(quietos as number[])) + 0.5) : esc.tMax
  return { tramos, recorridos, tFin, encuentros }
}

/** Energías de una muestra: cinética, potencial gravitatoria (cero en el suelo) y total. */
export function energias(m: number, g: number, e: Muestra) {
  const Ec = 0.5 * m * (e.vx * e.vx + e.vy * e.vy)
  const Ep = m * g * e.y
  return { Ec, Ep, E: Ec + Ep }
}
