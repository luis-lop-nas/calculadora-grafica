/**
 * Sistemas lineales invariantes descritos por su función de transferencia G(s) = N(s)/D(s),
 * con los polinomios como listas de coeficientes de menor a mayor grado.
 */
import { raicesPolinomio } from './matrices'
import { rk4 } from './numerico'

export type Poli = number[]
export interface FT {
  num: Poli
  den: Poli
}

export const recortarP = (p: Poli): Poli => {
  const q = [...p]
  while (q.length > 1 && Math.abs(q[q.length - 1]) === 0) q.pop()
  return q
}

export function mulP(a: Poli, b: Poli): Poli {
  const out = new Array(a.length + b.length - 1).fill(0)
  for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) out[i + j] += a[i] * b[j]
  return recortarP(out)
}

export function sumP(a: Poli, b: Poli): Poli {
  const out = new Array(Math.max(a.length, b.length)).fill(0)
  for (let i = 0; i < a.length; i++) out[i] += a[i]
  for (let i = 0; i < b.length; i++) out[i] += b[i]
  return recortarP(out)
}

/** P(z) en z = re + i·im (Horner complejo). */
export function evalC(p: Poli, re: number, im: number): [number, number] {
  let pr = 0
  let pi = 0
  for (let k = p.length - 1; k >= 0; k--) {
    const t = pr * re - pi * im + p[k]
    pi = pr * im + pi * re
    pr = t
  }
  return [pr, pi]
}

/** G(z) complejo. */
export function evalFT(g: FT, re: number, im: number): [number, number] {
  const [nr, ni] = evalC(g.num, re, im)
  const [dr, di] = evalC(g.den, re, im)
  const m = dr * dr + di * di
  return [(nr * dr + ni * di) / m, (ni * dr - nr * di) / m]
}

/** Realimentación unitaria negativa: T = L/(1 + L). */
export const lazoCerrado = (L: FT): FT => ({ num: L.num, den: sumP(L.den, L.num) })

export const polos = (g: FT) => (g.den.length > 1 ? raicesPolinomio(g.den) : [])
export const ceros = (g: FT) => (g.num.length > 1 ? raicesPolinomio(g.num) : [])

/**
 * Respuesta temporal por espacio de estados en forma canónica controlable, integrada con RK4.
 * `entrada` = 'escalon' (u = 1) o 'impulso' (x(0) = B, u = 0; la parte D·δ no se dibuja).
 */
export function respuesta(g: FT, tMax: number, muestras: number, entrada: 'escalon' | 'impulso' = 'escalon'): Array<[number, number]> {
  const n = g.den.length - 1
  if (n < 1) {
    const k = g.num[0] / g.den[0]
    return Array.from({ length: muestras + 1 }, (_, i) => [(tMax * i) / muestras, entrada === 'escalon' ? k : 0])
  }
  if (g.num.length - 1 > n) throw new Error('G(s) no es propia: más ceros que polos')
  const an = g.den[n]
  const a = g.den.map((v) => v / an)
  const b = Array.from({ length: n + 1 }, (_, i) => (g.num[i] ?? 0) / an)
  const D = b[n]
  const c = Array.from({ length: n }, (_, i) => b[i] - D * a[i])
  const u = entrada === 'escalon' ? 1 : 0
  const campo = (_t: number, x: number[]) => {
    const d = x.slice(1)
    let ult = u
    for (let i = 0; i < n; i++) ult -= a[i] * x[i]
    d.push(ult)
    return d
  }
  // paso interno limitado por el polo más rápido para que RK4 sea estable y preciso
  const rapido = Math.max(1e-9, ...polos(g).map(([re, im]) => Math.hypot(re, im)))
  const dt = tMax / muestras
  const sub = Math.max(1, Math.ceil(dt / (0.05 / rapido)))
  const h = dt / sub
  let x = new Array(n).fill(0)
  if (entrada === 'impulso') x[n - 1] = 1
  const salida = (xx: number[]) => xx.reduce((acc, v, i) => acc + c[i] * v, 0) + D * u
  const out: Array<[number, number]> = [[0, salida(x)]]
  let t = 0
  for (let i = 0; i < muestras; i++) {
    for (let k = 0; k < sub; k++) {
      x = rk4(campo, t, x, h)
      t += h
    }
    out.push([(i + 1) * dt, salida(x)])
  }
  return out
}

export interface Metricas {
  final: number
  sobreoscilacion: number
  tPico: number
  tSubida: number
  tEstablecimiento: number
}

/** Métricas de la respuesta al escalón, con el valor final teórico G(0) (si el sistema es estable). */
export function metricas(y: Array<[number, number]>, final: number): Metricas {
  let pico = -Infinity
  let tPico = 0
  for (const [t, v] of y) {
    if (v * Math.sign(final || 1) > pico) {
      pico = v * Math.sign(final || 1)
      tPico = t
    }
  }
  const af = Math.abs(final)
  const cruce = (nivel: number) => {
    for (let i = 1; i < y.length; i++) {
      const a = y[i - 1][1] * Math.sign(final || 1)
      const b = y[i][1] * Math.sign(final || 1)
      if (a < nivel && b >= nivel) return y[i - 1][0] + ((nivel - a) / (b - a)) * (y[i][0] - y[i - 1][0])
    }
    return NaN
  }
  let tEst = 0
  for (let i = y.length - 1; i >= 0; i--) {
    if (Math.abs(y[i][1] - final) > 0.02 * af) {
      tEst = y[Math.min(i + 1, y.length - 1)][0]
      break
    }
  }
  return {
    final,
    sobreoscilacion: af > 0 ? Math.max(0, (100 * (pico - af)) / af) : NaN,
    tPico,
    tSubida: cruce(0.9 * af) - cruce(0.1 * af),
    tEstablecimiento: tEst,
  }
}

/* ── Bode ────────────────────────────────── */

export interface PuntoBode {
  w: number
  mag: number
  fase: number
}

/**
 * Bode con la fase continua: se suman los argumentos de cada factor (iω − raíz), cada uno continuo
 * en ω, en vez de desenrollar el argumento total.
 */
export function bode(g: FT, ws: number[]): PuntoBode[] {
  const zs = ceros(g)
  const ps = polos(g)
  const k = g.num[g.num.length - 1] / g.den[g.den.length - 1]
  const fase0 = k < 0 ? 180 : 0
  return ws.map((w) => {
    const [re, im] = evalFT(g, 0, w)
    let f = fase0
    for (const [a, b] of zs) f += (Math.atan2(w - b, -a) * 180) / Math.PI
    for (const [a, b] of ps) f -= (Math.atan2(w - b, -a) * 180) / Math.PI
    return { w, mag: 20 * Math.log10(Math.hypot(re, im)), fase: f }
  })
}

/** Asíntotas de módulo: cada raíz r ≠ 0 cuenta 20·log(max(ω, |r|)); las del origen, 20·log ω. */
export function asintotaModulo(g: FT, w: number): number {
  const zs = ceros(g)
  const ps = polos(g)
  const k = Math.abs(g.num[g.num.length - 1] / g.den[g.den.length - 1])
  const f = ([a, b]: [number, number]) => {
    const r = Math.hypot(a, b)
    return 20 * Math.log10(r < 1e-12 ? w : Math.max(w, r))
  }
  return 20 * Math.log10(k) + zs.reduce((s, z) => s + f(z), 0) - ps.reduce((s, p) => s + f(p), 0)
}

export const logEspacio = (a: number, b: number, n: number) => Array.from({ length: n }, (_, i) => a * (b / a) ** (i / (n - 1)))

/** Bisección de f en [a, b] en escala logarítmica. */
function biseccionLog(f: (w: number) => number, a: number, b: number) {
  let fa = f(a)
  for (let i = 0; i < 100; i++) {
    const m = Math.sqrt(a * b)
    const fm = f(m)
    if (Math.sign(fm) === Math.sign(fa)) {
      a = m
      fa = fm
    } else b = m
    if (b / a - 1 < 1e-14) break
  }
  return Math.sqrt(a * b)
}

export interface Margenes {
  /** frecuencia de cruce de ganancia (|L| = 1) y margen de fase en grados */
  wc: number | null
  mf: number | null
  /** frecuencia de cruce de fase (fase = −180°) y margen de ganancia en dB */
  w180: number | null
  mg: number | null
}

export function margenes(L: FT, w0 = 1e-4, w1 = 1e4): Margenes {
  const ws = logEspacio(w0, w1, 2000)
  const b = bode(L, ws)
  let wc: number | null = null
  let w180: number | null = null
  const fase = (w: number) => bode(L, [w])[0].fase
  for (let i = 1; i < b.length && wc === null; i++) {
    if (Math.sign(b[i - 1].mag) !== Math.sign(b[i].mag) && b[i - 1].mag > b[i].mag) wc = biseccionLog((w) => bode(L, [w])[0].mag, b[i - 1].w, b[i].w)
  }
  // cruce de fase: la fase continua atraviesa algún −180° + 360°·k
  const tramo = (f: number) => Math.floor((f + 180) / 360)
  for (let i = 1; i < b.length && w180 === null; i++) {
    const k0 = tramo(b[i - 1].fase)
    const k1 = tramo(b[i].fase)
    if (k0 !== k1) {
      const obj = -180 + 360 * Math.max(k0, k1)
      w180 = biseccionLog((w) => fase(w) - obj, b[i - 1].w, b[i].w)
    }
  }
  return {
    wc,
    mf: wc === null ? null : 180 + fase(wc),
    w180,
    mg: w180 === null ? null : -bode(L, [w180])[0].mag,
  }
}

/* ── Nyquist ────────────────────────────────── */

/**
 * Criterio de Nyquist con el contorno s = δ + iω (δ > 0 diminuto: los polos del eje imaginario
 * quedan fuera, como con la muesca clásica a la derecha). N = vueltas de L alrededor de −1 en
 * sentido horario; P = polos de L con Re > 0; Z = N + P son los polos inestables en lazo cerrado.
 */
export function nyquist(L: FT): { N: number; P: number; Z: number; camino: Array<[number, number]> } {
  const ps = polos(L)
  const escala = Math.max(1, ...ps.map(([a, b]) => Math.hypot(a, b)))
  const delta = 1e-7 * escala
  const pos = logEspacio(1e-10 * escala, 1e6 * escala, 6000)
  const ws = [...pos.map((w) => -w).reverse(), 0, ...pos]
  let vuelta = 0
  let prev: number | null = null
  const camino: Array<[number, number]> = []
  for (const w of ws) {
    const [re, im] = evalFT(L, delta, w)
    camino.push([re, im])
    const a = Math.atan2(im, re + 1)
    if (prev !== null) {
      let d = a - prev
      while (d > Math.PI) d -= 2 * Math.PI
      while (d < -Math.PI) d += 2 * Math.PI
      vuelta += d
    }
    prev = a
  }
  const N = Math.round(-vuelta / (2 * Math.PI))
  const P = ps.filter(([a]) => a > 1e-9 * escala).length
  return { N, P, Z: N + P, camino }
}

/* ── Lugar de las raíces ────────────────────────────────── */

/** Raíces de D + k·N para cada k, emparejadas con las del k anterior para seguir cada rama. */
export function lugarRaices(G: FT, ks: number[]): Array<Array<[number, number]>> {
  let previas = polos(G)
  const n = previas.length
  const ramas: Array<Array<[number, number]>> = previas.map((p) => [p])
  for (const k of ks) {
    const r = raicesPolinomio(sumP(G.den, G.num.map((v) => v * k)))
    if (r.length !== n) continue
    const libres = [...r]
    const nuevas: Array<[number, number]> = []
    for (const p of previas) {
      let mejor = 0
      let d = Infinity
      libres.forEach((q, j) => {
        const dd = Math.hypot(q[0] - p[0], q[1] - p[1])
        if (dd < d) {
          d = dd
          mejor = j
        }
      })
      nuevas.push(libres.splice(mejor, 1)[0])
    }
    nuevas.forEach((q, i) => ramas[i].push(q))
    previas = nuevas
  }
  return ramas
}

/** Asíntotas del lugar: centroide σₐ = (Σp − Σz)/(n − m) y ángulos (2q + 1)·180°/(n − m). */
export function asintotasLugar(G: FT): { centroide: number; angulos: number[] } | null {
  const ps = polos(G)
  const zs = ceros(G)
  const d = ps.length - zs.length
  if (d <= 0) return null
  const centroide = (ps.reduce((s, p) => s + p[0], 0) - zs.reduce((s, z) => s + z[0], 0)) / d
  return { centroide, angulos: Array.from({ length: d }, (_, q) => ((2 * q + 1) * 180) / d) }
}

/* ── Routh–Hurwitz ────────────────────────────────── */

/**
 * Tabla de Routh del polinomio (coeficientes de menor a mayor grado). Un pivote nulo se
 * sustituye por ε; una fila entera nula, por la derivada del polinomio auxiliar.
 * Devuelve la tabla y el número de cambios de signo de la primera columna (= raíces con Re > 0).
 */
export function routh(p0: Poli): { tabla: number[][]; cambios: number; especial: string | null } {
  const p = recortarP(p0)
  const n = p.length - 1
  const desc = [...p].reverse()
  const ancho = Math.ceil((n + 1) / 2)
  const fila = (k: number) => Array.from({ length: ancho }, (_, j) => desc[k + 2 * j] ?? 0)
  const tabla: number[][] = [fila(0), fila(1)]
  const escala = Math.max(...p.map(Math.abs))
  const eps = 1e-9 * escala
  let especial: string | null = null
  for (let i = 2; i <= n; i++) {
    const a = tabla[i - 2]
    const b = tabla[i - 1]
    if (b.every((v) => Math.abs(v) < 1e-12 * escala)) {
      // fila de ceros: derivada del polinomio auxiliar de la fila anterior (grado n − i + 2)
      const g = n - i + 2
      for (let j = 0; j < ancho; j++) b[j] = a[j] * (g - 2 * j)
      especial ??= 'fila de ceros: raíces simétricas respecto al origen'
    }
    if (Math.abs(b[0]) < 1e-12 * escala) {
      b[0] = eps
      especial ??= 'pivote nulo sustituido por ε'
    }
    const nueva = Array.from({ length: ancho }, (_, j) => (b[0] * (a[j + 1] ?? 0) - a[0] * (b[j + 1] ?? 0)) / b[0])
    tabla.push(nueva)
  }
  const col = tabla.map((f) => f[0])
  let cambios = 0
  for (let i = 1; i < col.length; i++) if (Math.sign(col[i]) !== Math.sign(col[i - 1]) && col[i] !== 0 && col[i - 1] !== 0) cambios++
  return { tabla: tabla.slice(0, n + 1), cambios, especial }
}
