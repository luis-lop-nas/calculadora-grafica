/**
 * Relatividad especial en 1+1 dimensiones con c = 1: sucesos (t, x), transformaciones de Lorentz
 * y lo que se deduce de ellas.
 */

export type Suceso = [number, number]

export const gamma = (b: number) => 1 / Math.sqrt(1 - b * b)

/** Coordenadas en el sistema S′ que se mueve a velocidad β respecto de S. */
export function boost(b: number, [t, x]: Suceso): Suceso {
  const g = gamma(b)
  return [g * (t - b * x), g * (x - b * t)]
}

/** s² = Δt² − Δx² (positivo: temporal; negativo: espacial; cero: luz). */
export const intervalo = (a: Suceso, c: Suceso) => (c[0] - a[0]) ** 2 - (c[1] - a[1]) ** 2

export function clase(s2: number, escala = 1): 'temporal' | 'espacial' | 'luz' {
  if (Math.abs(s2) < 1e-9 * Math.max(1, escala)) return 'luz'
  return s2 > 0 ? 'temporal' : 'espacial'
}

/** Composición de velocidades colineales: u = (u′ + v)/(1 + u′v). */
export const componer = (u: number, v: number) => (u + v) / (1 + u * v)

export const rapidez = (b: number) => Math.atanh(b)

/** Factor Doppler longitudinal para una fuente que se aleja con β: f_rec/f_emi = 1/D. */
export const doppler = (b: number) => Math.sqrt((1 + b) / (1 - b))

/** Viaje de ida y vuelta a distancia L con velocidad β. */
export function gemelos(b: number, L: number) {
  const T = (2 * L) / b
  const tau = T / gamma(b)
  return {
    T,
    tau,
    /** tiempo de casa que el viajero considera simultáneo con el giro, antes y después */
    antes: T / 2 - b * L,
    despues: T / 2 + b * L,
  }
}
