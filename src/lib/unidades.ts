export type Dimension = [number, number, number, number, number]

export interface Unidad {
  id: string
  nombre: string
  simbolo: string
  dimension: Dimension
  escala: number
  desplazamiento?: number
}

const L: Dimension = [1, 0, 0, 0, 0]
const M: Dimension = [0, 1, 0, 0, 0]
const T: Dimension = [0, 0, 1, 0, 0]
const V: Dimension = [1, 0, -1, 0, 0]
const F: Dimension = [1, 1, -2, 0, 0]
const E: Dimension = [2, 1, -2, 0, 0]
const P: Dimension = [-1, 1, -2, 0, 0]
const TEMP: Dimension = [0, 0, 0, 0, 1]

export const UNIDADES: Unidad[] = [
  { id: 'm', nombre: 'metro', simbolo: 'm', dimension: L, escala: 1 },
  { id: 'km', nombre: 'kilómetro', simbolo: 'km', dimension: L, escala: 1000 },
  { id: 'cm', nombre: 'centímetro', simbolo: 'cm', dimension: L, escala: 0.01 },
  { id: 'mm', nombre: 'milímetro', simbolo: 'mm', dimension: L, escala: 0.001 },
  { id: 'in', nombre: 'pulgada', simbolo: 'in', dimension: L, escala: 0.0254 },
  { id: 'kg', nombre: 'kilogramo', simbolo: 'kg', dimension: M, escala: 1 },
  { id: 'g', nombre: 'gramo', simbolo: 'g', dimension: M, escala: 0.001 },
  { id: 'mg', nombre: 'miligramo', simbolo: 'mg', dimension: M, escala: 1e-6 },
  { id: 's', nombre: 'segundo', simbolo: 's', dimension: T, escala: 1 },
  { id: 'min', nombre: 'minuto', simbolo: 'min', dimension: T, escala: 60 },
  { id: 'h', nombre: 'hora', simbolo: 'h', dimension: T, escala: 3600 },
  { id: 'kmh', nombre: 'kilómetro por hora', simbolo: 'km/h', dimension: V, escala: 1000 / 3600 },
  { id: 'ms', nombre: 'metro por segundo', simbolo: 'm/s', dimension: V, escala: 1 },
  { id: 'N', nombre: 'newton', simbolo: 'N', dimension: F, escala: 1 },
  { id: 'dyn', nombre: 'dina', simbolo: 'dyn', dimension: F, escala: 1e-5 },
  { id: 'J', nombre: 'julio', simbolo: 'J', dimension: E, escala: 1 },
  { id: 'kWh', nombre: 'kilovatio hora', simbolo: 'kWh', dimension: E, escala: 3.6e6 },
  { id: 'Pa', nombre: 'pascal', simbolo: 'Pa', dimension: P, escala: 1 },
  { id: 'bar', nombre: 'bar', simbolo: 'bar', dimension: P, escala: 1e5 },
  { id: 'K', nombre: 'kelvin', simbolo: 'K', dimension: TEMP, escala: 1 },
  { id: 'C', nombre: 'grado Celsius', simbolo: '°C', dimension: TEMP, escala: 1, desplazamiento: 273.15 },
  { id: 'Fahr', nombre: 'grado Fahrenheit', simbolo: '°F', dimension: TEMP, escala: 5 / 9, desplazamiento: 459.67 },
]

export function unidad(id: string) {
  const encontrada = UNIDADES.find((u) => u.id === id)
  if (!encontrada) throw new Error(`unidad desconocida: ${id}`)
  return encontrada
}

export function mismaDimension(a: Unidad, b: Unidad) {
  return a.dimension.every((v, i) => v === b.dimension[i])
}

export function convertir(valor: number, desdeId: string, hastaId: string) {
  const desde = unidad(desdeId)
  const hasta = unidad(hastaId)
  if (!mismaDimension(desde, hasta)) throw new Error(`${desde.simbolo} y ${hasta.simbolo} no miden la misma magnitud`)
  const base = (valor + (desde.desplazamiento ?? 0)) * desde.escala
  return base / hasta.escala - (hasta.desplazamiento ?? 0)
}

export function unidadesDe(dimension: Dimension) {
  return UNIDADES.filter((u) => u.dimension.every((v, i) => v === dimension[i]))
}

export function formato(valor: number) {
  if (!Number.isFinite(valor)) return 'no definido'
  if (Math.abs(valor) >= 1e6 || (Math.abs(valor) > 0 && Math.abs(valor) < 1e-4)) return valor.toExponential(6)
  return valor.toLocaleString('es-ES', { maximumFractionDigits: 8 })
}
