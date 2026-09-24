/**
 * Electrostática de cargas puntuales en el plano z = 0 (campo de Coulomb en 3D, k = 1/(4πε₀) = 1):
 * potencial, campo, líneas de campo, flujo por una esfera y el método de las imágenes.
 */
import { gauss20 } from './especiales'

export interface Carga {
  q: number
  x: number
  y: number
}

export type Conductor = 'ninguno' | 'plano' | 'esfera'

/**
 * Cargas imagen de un conductor a tierra: el semiespacio x < 0 (imagen −q en (−x, y)) o la esfera
 * de radio R en el origen (imagen −qR/a en R²/a, en la misma dirección).
 */
export function imagenes(cargas: Carga[], conductor: Conductor, R: number): Carga[] {
  if (conductor === 'plano') return cargas.map((c) => ({ q: -c.q, x: -c.x, y: c.y }))
  if (conductor === 'esfera')
    return cargas.map((c) => {
      const a = Math.hypot(c.x, c.y)
      const k = (R * R) / (a * a)
      return { q: (-c.q * R) / a, x: c.x * k, y: c.y * k }
    })
  return []
}

/** ¿Está el punto dentro del conductor (donde el campo físico es nulo)? */
export function dentro(conductor: Conductor, R: number, x: number, y: number, z = 0): boolean {
  if (conductor === 'plano') return x < 0
  if (conductor === 'esfera') return x * x + y * y + z * z < R * R
  return false
}

export function potencial(cargas: Carga[], x: number, y: number, z = 0): number {
  let v = 0
  for (const c of cargas) v += c.q / Math.sqrt((x - c.x) ** 2 + (y - c.y) ** 2 + z * z)
  return v
}

export function campo(cargas: Carga[], x: number, y: number, z = 0): [number, number, number] {
  let ex = 0
  let ey = 0
  let ez = 0
  for (const c of cargas) {
    const dx = x - c.x
    const dy = y - c.y
    const r2 = dx * dx + dy * dy + z * z
    const k = c.q / (r2 * Math.sqrt(r2))
    ex += k * dx
    ey += k * dy
    ez += k * z
  }
  return [ex, ey, ez]
}

/** Flujo de E por la esfera de centro (cx, cy, 0) y radio ρ, integrado en θ y φ. Gauss: 4π q_enc. */
export function flujoEsfera(cargas: Carga[], cx: number, cy: number, rho: number, tramos = 24): number {
  return gauss20(
    (th) =>
      gauss20(
        (ph) => {
          const n = [Math.sin(th) * Math.cos(ph), Math.sin(th) * Math.sin(ph), Math.cos(th)]
          const E = campo(cargas, cx + rho * n[0], cy + rho * n[1], rho * n[2])
          return (E[0] * n[0] + E[1] * n[1] + E[2] * n[2]) * rho * rho * Math.sin(th)
        },
        0,
        2 * Math.PI,
        tramos,
      ),
    0,
    Math.PI,
    tramos,
  )
}

export function momentoDipolar(cargas: Carga[]): [number, number] {
  return [cargas.reduce((a, c) => a + c.q * c.x, 0), cargas.reduce((a, c) => a + c.q * c.y, 0)]
}

export interface Linea {
  pts: Array<[number, number]>
  /** índice de la carga donde acaba, o −1 si sale del marco o entra en el conductor */
  fin: number
}

/**
 * Línea de campo en el plano desde (x0, y0), siguiendo E (sentido = 1) o −E (sentido = −1).
 * RK4 sobre la dirección unitaria, con paso que se encoge cerca de las cargas.
 */
export function lineaDeCampo(
  cargas: Carga[],
  x0: number,
  y0: number,
  sentido: 1 | -1,
  marco: { x: [number, number]; y: [number, number] },
  paraEn: (x: number, y: number) => boolean = () => false,
  maxPasos = 4000,
): Linea {
  const dir = (x: number, y: number): [number, number] => {
    const [ex, ey] = campo(cargas, x, y)
    const n = Math.hypot(ex, ey)
    return n > 0 ? [(sentido * ex) / n, (sentido * ey) / n] : [0, 0]
  }
  const ancho = Math.max(marco.x[1] - marco.x[0], marco.y[1] - marco.y[0])
  const pts: Array<[number, number]> = [[x0, y0]]
  let x = x0
  let y = y0
  for (let i = 0; i < maxPasos; i++) {
    let dmin = Infinity
    for (const c of cargas) dmin = Math.min(dmin, Math.hypot(x - c.x, y - c.y))
    const h = Math.min(0.008 * ancho, Math.max(0.0005 * ancho, 0.12 * dmin))
    const k1 = dir(x, y)
    const k2 = dir(x + (h / 2) * k1[0], y + (h / 2) * k1[1])
    const k3 = dir(x + (h / 2) * k2[0], y + (h / 2) * k2[1])
    const k4 = dir(x + h * k3[0], y + h * k3[1])
    x += (h / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0])
    y += (h / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1])
    pts.push([x, y])
    for (let j = 0; j < cargas.length; j++) {
      const c = cargas[j]
      if (Math.sign(c.q) === -sentido && Math.hypot(x - c.x, y - c.y) < 0.006 * ancho) {
        pts.push([c.x, c.y])
        return { pts, fin: j }
      }
    }
    if (paraEn(x, y)) return { pts, fin: -1 }
    const m = 0.25 * ancho
    if (x < marco.x[0] - m || x > marco.x[1] + m || y < marco.y[0] - m || y > marco.y[1] + m) return { pts, fin: -1 }
  }
  return { pts, fin: -1 }
}
