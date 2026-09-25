import { createContext } from 'react'

/**
 * Preferencias de vista comunes a todos los módulos (menú Vista): qué superposiciones se
 * dibujan, la proyección, el ajuste a la rejilla y el tema. Se guardan aparte del estado de
 * los módulos: son de quien usa la app, no del documento.
 */
export interface PrefsVista {
  ejes: boolean
  nombres: boolean
  rejilla: boolean
  /** Rejilla en los tres planos coordenados (el botón «Planos» del lienzo 3D). */
  planos: boolean
  ortografica: boolean
  /** Las asas caen siempre en la rejilla, no solo con Mayús. */
  ajustar: boolean
  paso: number
  leyenda: boolean
  formula: boolean
  lecturas: boolean
  /** Solo el lienzo, sin el panel de la izquierda. */
  presentacion: boolean
  tema: 'sistema' | 'claro' | 'oscuro'
}

export const PREFS_INICIALES: PrefsVista = {
  ejes: true,
  nombres: true,
  rejilla: true,
  planos: false,
  ortografica: false,
  ajustar: false,
  paso: 0.5,
  leyenda: true,
  formula: true,
  lecturas: true,
  presentacion: false,
  tema: 'sistema',
}

const CLAVE = 'calculadora:vista'

export function validarPrefs(g: unknown): PrefsVista {
  const p = { ...PREFS_INICIALES }
  if (!g || typeof g !== 'object') return p
  for (const k of Object.keys(p) as Array<keyof PrefsVista>) {
    const v = (g as Record<string, unknown>)[k]
    if (k === 'tema') { if (v === 'sistema' || v === 'claro' || v === 'oscuro') p.tema = v }
    else if (k === 'paso') { if (typeof v === 'number' && Number.isFinite(v) && v > 0) p.paso = v }
    else if (typeof v === 'boolean') p[k] = v
  }
  return p
}

export function leerPrefs(): PrefsVista {
  try {
    const g = JSON.parse(localStorage.getItem(CLAVE) ?? '{}')
    return validarPrefs(g)
  } catch {
    return { ...PREFS_INICIALES }
  }
}

export function guardarPrefs(p: PrefsVista) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(p))
  } catch {
    /* sin almacenamiento: se pierden al cerrar */
  }
}

export const ContextoVista = createContext<{ prefs: PrefsVista; cambiar: (p: Partial<PrefsVista>) => void }>({
  prefs: PREFS_INICIALES,
  cambiar: () => {},
})

/** Órdenes puntuales a los lienzos: no son estado, se ejecutan una vez. */
export type OrdenVista =
  | { orden: 'svg'; lado: 'A' | 'B'; fn: (svg: string) => void }
  | { orden: 'punto'; modo: '3d' | 'x' | 'y' | 'z' | 'iso' }
  | { orden: 'encuadrar' }
  | { orden: 'acercar'; factor: number }
  /** Entrega el canvas recién pintado (para copiarlo o exportarlo). */
  | { orden: 'captura'; lado: 'A' | 'B'; fn: (canvas: HTMLCanvasElement) => void }
  /** Pone una ventana del mundo (Escena ▸ Vistas guardadas) en el lienzo 2D de ese lado. */
  | { orden: 'ventana'; lado: 'A' | 'B'; x: [number, number]; y: [number, number] }
  /** Entrega la ventana que se está viendo (para guardarla o editarla). */
  | { orden: 'leerVentana'; lado: 'A' | 'B'; fn: (v: { x: [number, number]; y: [number, number] }) => void }

const bus = new EventTarget()

export function ordenVista(o: OrdenVista) {
  bus.dispatchEvent(new CustomEvent('orden', { detail: o }))
}

export function alOrdenVista(fn: (o: OrdenVista) => void): () => void {
  const oyente = (ev: Event) => fn((ev as CustomEvent<OrdenVista>).detail)
  bus.addEventListener('orden', oyente)
  return () => bus.removeEventListener('orden', oyente)
}

/**
 * Reloj común de las animaciones (menú Animación): cada lienzo acumula su propio tiempo con el
 * dt real multiplicado por `velocidad`, o 0 en pausa. `pasos` y `reinicios` son contadores: cada
 * lienzo compara con el último que vio y avanza un fotograma o vuelve a t = 0.
 */
export const animacion = { pausado: false, velocidad: 1, pasos: 0, reinicios: 0 }

/**
 * Barra espaciadora mantenida: mientras `pulsado`, arrastrar en cualquier lienzo desplaza la vista.
 * Los lienzos marcan `usado` al arrastrar; si al soltar no se usó, el toque reproduce o para.
 */
export const espacio = { pulsado: false, usado: false }

/** Paso de un fotograma, en segundos de animación. */
export const PASO_ANIMACION = 1 / 30

export function relojLienzo() {
  let t = 0
  let pasos = animacion.pasos
  let reinicios = animacion.reinicios
  return (dtReal: number) => {
    if (animacion.reinicios !== reinicios) {
      reinicios = animacion.reinicios
      t = 0
    }
    let dt = animacion.pausado ? 0 : dtReal * animacion.velocidad
    if (animacion.pasos !== pasos) {
      dt += (animacion.pasos - pasos) * PASO_ANIMACION
      pasos = animacion.pasos
    }
    t += dt
    return { t, dt }
  }
}
