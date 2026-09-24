/**
 * Reloj propio de un módulo: avanza solo mientras está en marcha, así pausar
 * no pierde la fase y cambiar un control no reinicia la animación.
 */
export function crearReloj(velocidad = 1) {
  let t = 0
  let ultimo: number | null = null
  return {
    get t() {
      return t
    },
    reiniciar() {
      t = 0
      ultimo = null
    },
    /** `pared` es el tiempo del bucle en segundos. */
    avanzar(pared: number, activo: boolean, vel = velocidad) {
      if (ultimo === null) ultimo = pared
      const dt = Math.min(0.05, pared - ultimo)
      ultimo = pared
      if (activo) t += dt * vel
      return t
    },
  }
}
