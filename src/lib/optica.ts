/**
 * Óptica ondulatoria: rendijas y redes (Fraunhofer), difracción de una abertura cualquiera por
 * FFT 2D, películas delgadas (Airy y matriz característica) y anillos del interferómetro de Michelson.
 */
import { besselJx, gauss20 } from './especiales'
import { fft2 } from './fft'

type C = [number, number]

const sinc = (x: number) => (Math.abs(x) < 1e-12 ? 1 - (Math.PI * x) ** 2 / 6 : Math.sin(Math.PI * x) / (Math.PI * x))

/**
 * Intensidad relativa de N rendijas de anchura a y periodo d (I(0) = 1), en función de s = sin θ:
 * sinc²(a s/λ) · [sin(Nπ d s/λ)/(N sin(π d s/λ))]².
 */
export function intensidadRendijas(N: number, a: number, d: number, lambda: number, s: number): number {
  const b = (Math.PI * d * s) / lambda
  const sb = Math.sin(b)
  const red = Math.abs(sb) < 1e-12 ? 1 : Math.sin(N * b) / (N * sb)
  return sinc((a * s) / lambda) ** 2 * red * red
}

/** Segundo método: la integral de Fraunhofer ∫ e^{−ik s x} dx sobre las aberturas, normalizada. */
export function intensidadNumerica(aberturas: Array<[number, number]>, lambda: number, s: number): number {
  const k = (2 * Math.PI) / lambda
  let re = 0
  let im = 0
  let ancho = 0
  for (const [x0, x1] of aberturas) {
    re += gauss20((x) => Math.cos(k * s * x), x0, x1, 4)
    im -= gauss20((x) => Math.sin(k * s * x), x0, x1, 4)
    ancho += x1 - x0
  }
  return (re * re + im * im) / (ancho * ancho)
}

export function rendijas(N: number, a: number, d: number): Array<[number, number]> {
  return Array.from({ length: N }, (_, j) => {
    const c = (j - (N - 1) / 2) * d
    return [c - a / 2, c + a / 2] as [number, number]
  })
}

/** Patrón de Airy de una abertura circular de diámetro D: [2 J₁(u)/u]², u = π D sin θ/λ. */
export function airy(u: number): number {
  if (Math.abs(u) < 1e-8) return 1
  const j = (2 * besselJx(1, u)) / u
  return j * j
}

/** Primer cero de J₁ (j₁,₁): el primer anillo oscuro está en sin θ = j₁,₁/π · λ/D = 1,21967 λ/D. */
export const J11 = 3.8317059702075125

/**
 * Fraunhofer 2D por FFT: |F{t(x, y)}|² con la frecuencia cero en el centro, normalizado a 1 en el
 * máximo. `t` es la transmitancia en una rejilla n×n (n potencia de 2).
 */
export function fraunhofer2D(t: Float64Array, n: number): Float64Array {
  const re = new Float64Array(t)
  const im = new Float64Array(n * n)
  fft2(re, im, n, n)
  const out = new Float64Array(n * n)
  const h = n / 2
  let max = 0
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const v = re[j * n + i] ** 2 + im[j * n + i] ** 2
      out[((j + h) % n) * n + ((i + h) % n)] = v
      if (v > max) max = v
    }
  if (max > 0) for (let k = 0; k < out.length; k++) out[k] /= max
  return out
}

/* ── películas delgadas, incidencia normal: aire n₀ | película n_f, espesor e | sustrato n_s ── */

const cmul = (x: C, y: C): C => [x[0] * y[0] - x[1] * y[1], x[0] * y[1] + x[1] * y[0]]
const cdiv = (x: C, y: C): C => {
  const d = y[0] * y[0] + y[1] * y[1]
  return [(x[0] * y[0] + x[1] * y[1]) / d, (x[1] * y[0] - x[0] * y[1]) / d]
}
const cexp = (f: number): C => [Math.cos(f), Math.sin(f)]

/** Suma de todas las reflexiones (fórmula de Airy): r = (r₁ + r₂e^{2iβ})/(1 + r₁r₂e^{2iβ}), β = 2π n_f e/λ. */
export function reflectanciaAiry(n0: number, nf: number, ns: number, e: number, lambda: number): number {
  const r1 = (n0 - nf) / (n0 + nf)
  const r2 = (nf - ns) / (nf + ns)
  const z = cexp((4 * Math.PI * nf * e) / lambda)
  const r = cdiv([r1 + r2 * z[0], r2 * z[1]], [1 + r1 * r2 * z[0], r1 * r2 * z[1]])
  return r[0] * r[0] + r[1] * r[1]
}

/** Segundo método: matriz característica de la capa, [B; C] = M [1; n_s], r = (n₀B − C)/(n₀B + C). */
export function reflectanciaMatriz(n0: number, nf: number, ns: number, e: number, lambda: number): number {
  const d = (2 * Math.PI * nf * e) / lambda
  const B: C = [Math.cos(d), (ns / nf) * Math.sin(d)]
  const Cc: C = [ns * Math.cos(d), nf * Math.sin(d)]
  const r = cdiv([n0 * B[0] - Cc[0], n0 * B[1] - Cc[1]], [n0 * B[0] + Cc[0], n0 * B[1] + Cc[1]])
  return r[0] * r[0] + r[1] * r[1]
}
export { cmul }

/** Color aproximado (sRGB) de una longitud de onda visible en nm, para pintar. */
export function colorLongitud(nm: number): [number, number, number] {
  let r = 0
  let g = 0
  let b = 0
  if (nm < 440) [r, g, b] = [-(nm - 440) / 60, 0, 1]
  else if (nm < 490) [r, g, b] = [0, (nm - 440) / 50, 1]
  else if (nm < 510) [r, g, b] = [0, 1, -(nm - 510) / 20]
  else if (nm < 580) [r, g, b] = [(nm - 510) / 70, 1, 0]
  else if (nm < 645) [r, g, b] = [1, -(nm - 645) / 65, 0]
  else [r, g, b] = [1, 0, 0]
  const f = nm < 420 ? 0.3 + (0.7 * (nm - 380)) / 40 : nm > 700 ? 0.3 + (0.7 * (780 - nm)) / 80 : 1
  return [Math.max(0, r * f), Math.max(0, g * f), Math.max(0, b * f)]
}

/* ── Michelson: espejos a diferencia de camino 2d; anillos cos²(2π d cos θ/λ) ── */

export const intensidadMichelson = (d: number, lambda: number, theta: number) => Math.cos((2 * Math.PI * d * Math.cos(theta)) / lambda) ** 2

/** Ángulos de los anillos oscuros: 2d cos θ = (m + ½)λ, de dentro afuera. */
export function anillosOscuros(d: number, lambda: number, thetaMax: number): number[] {
  const out: number[] = []
  const mMax = Math.floor((2 * d) / lambda - 0.5)
  for (let m = mMax; m >= 0; m--) {
    const c = ((m + 0.5) * lambda) / (2 * d)
    if (c > 1) continue
    const t = Math.acos(c)
    if (t > thetaMax) break
    out.push(t)
  }
  return out
}
