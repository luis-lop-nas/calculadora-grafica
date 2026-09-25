/** Lee una variable CSS del tema activo. */
export function varCss(nombre: string): string {
  if (!nombre.startsWith('--')) return nombre
  return getComputedStyle(document.documentElement).getPropertyValue(nombre).trim()
}

/** Se suscribe a los cambios de tema (preferencia del sistema o data-theme). */
export function alCambiarTema(cb: () => void): () => void {
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  mq.addEventListener('change', cb)
  const obs = new MutationObserver(cb)
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  return () => {
    mq.removeEventListener('change', cb)
    obs.disconnect()
  }
}

/** Rueda de color de fase: arg ∈ (−π, π] → css hsl. */
export function fase(arg: number): string {
  const h = (((arg / (2 * Math.PI)) % 1) + 1) % 1
  return `hsl(${(h * 360).toFixed(1)} 75% 55%)`
}

/** Divergente para superficies con signo: −1 → negativo, +1 → positivo. */
export function divergente(u: number): [number, number, number] {
  const t = Math.max(-1, Math.min(1, u))
  // naranja (+) ← gris → azul (−), en sRGB aproximado
  const pos: [number, number, number] = [0.96, 0.6, 0.31]
  const neg: [number, number, number] = [0.35, 0.63, 1.0]
  const mid: [number, number, number] = [0.55, 0.58, 0.66]
  const [a, b] = t >= 0 ? [mid, pos] : [mid, neg]
  const k = Math.abs(t)
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]
}

export type Color3 = [number, number, number]

const rampa = (paradas: Color3[]) => (u: number): Color3 => {
  const t = Math.max(0, Math.min(1, u)) * (paradas.length - 1)
  const i = Math.min(paradas.length - 2, Math.floor(t))
  const k = t - i
  const a = paradas[i]
  const b = paradas[i + 1]
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]
}

/** Secuencial perceptualmente uniforme (tipo viridis): sirve para magnitudes y alturas. */
export const altura = rampa([
  [0.267, 0.005, 0.329], [0.229, 0.322, 0.545], [0.127, 0.567, 0.551],
  [0.369, 0.789, 0.383], [0.993, 0.906, 0.144],
])

/** El arcoíris clásico de los libros: menos honesto, pero es el que se reconoce. */
export const arcoiris = rampa([
  [0.13, 0.13, 0.65], [0.0, 0.55, 0.95], [0.1, 0.85, 0.6],
  [0.95, 0.9, 0.2], [0.95, 0.5, 0.1], [0.7, 0.1, 0.1],
])

/** Cuerpo negro: frío oscuro, caliente claro. Para temperaturas se lee solo. */
export const fuego = rampa([
  [0.05, 0.03, 0.12], [0.45, 0.06, 0.32], [0.80, 0.24, 0.20],
  [0.96, 0.55, 0.10], [0.99, 0.87, 0.55],
])

export type NombreMapa = 'altura' | 'arcoiris' | 'divergente' | 'fuego'

export function mapa(nombre: NombreMapa): (u: number) => Color3 {
  if (nombre === 'arcoiris') return arcoiris
  if (nombre === 'divergente') return (u) => divergente(2 * u - 1)
  if (nombre === 'fuego') return fuego
  return altura
}
