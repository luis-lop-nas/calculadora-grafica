import type { ReactNode } from 'react'
import type { Escena3D } from '../render/escena3d'
import type { Pintor2D } from '../render/pintor2d'

export type Area = 'funciones' | 'geometria' | 'cuantica' | 'edp' | 'edo' | 'campos' | 'algebra'
  | 'senales' | 'mecanica' | 'fisica' | 'estadistica' | 'numerico'

/** Nombre corto para las pestañas; el largo solo aparece donde hay sitio. */
export const AREAS_CORTAS: Record<Area, string> = {
  funciones: 'Funciones',
  geometria: 'Geometría',
  cuantica: 'Cuántica',
  edp: 'EDP',
  edo: 'EDO',
  campos: 'Campos',
  algebra: 'Álgebra',
  senales: 'Señales',
  mecanica: 'Mecánica',
  fisica: 'Física',
  estadistica: 'Estadística',
  numerico: 'Numérico',
}

export const AREAS: Record<Area, string> = {
  funciones: 'Funciones y variable compleja',
  geometria: 'Geometría con regla y compás, y en el espacio',
  cuantica: 'Cuántica',
  edp: 'Ecuaciones en derivadas parciales',
  edo: 'Ecuaciones diferenciales ordinarias',
  campos: 'Campos y superficies',
  algebra: 'Álgebra y análisis funcional',
  senales: 'Señales y sistemas',
  mecanica: 'Mecánica y medios continuos',
  fisica: 'Electromagnetismo, óptica y térmica',
  estadistica: 'Probabilidad y estadística',
  numerico: 'Métodos numéricos',
}

/** Lo que el panel izquierdo recibe para pintar sus controles. */
export interface PropsPanel<S> {
  s: S
  set: (parche: Partial<S>) => void
}

/**
 * Algo que se agarra con el ratón: un punto o la punta de una flecha. El
 * armazón lo pinta, lo resalta y lo arrastra; el módulo solo dice dónde está y
 * qué pasa al moverlo.
 */
export interface Asa {
  id: string
  /** En 2D, coordenadas del mundo; en 3D, (x, y, z) de física. */
  p: number[]
  /** Variable CSS (`--pos`) o color literal. */
  color?: string
  /** Texto corto junto al asa. */
  nombre?: string
  /**
   * Solo 3D. `plano` (por defecto): se desliza en horizontal y en vertical con
   * Mayús. `superficie`: sigue al ratón sobre las mallas de `e.agarre`, y si
   * no hay ninguna debajo cae al plano.
   */
  sobre?: 'plano' | 'superficie'
  /** Solo 2D: el asa solo se mueve en ese eje. */
  eje?: 'x' | 'y'
}

/** Dónde ha soltado el ratón el asa; `uv` solo llega al caer sobre una malla de `superficie`. */
export interface Toque {
  p: number[]
  uv?: [number, number]
  mayus: boolean
}

export interface Interaccion<S> {
  asas: (s: S) => Asa[]
  mover: (id: string, t: Toque, s: S) => Partial<S> | void
  /** Doble clic en un hueco. En 3D el punto cae sobre el plano z = `suelo`. */
  anadir?: (t: Toque, s: S) => Partial<S> | void
  /** Doble clic sobre un asa, o Supr con el ratón encima. */
  quitar?: (id: string, s: S) => Partial<S> | void
  suelo?: number
  /** Frase para la pista del lienzo; si falta, se compone según lo que admita. */
  pista?: string
}

/** Vista 3D: `construir` se rehace al cambiar el estado, `animar` corre cada fotograma. */
export interface Vista3D<S> {
  tipo: '3d'
  /** Distingue vistas del mismo tipo dentro de un módulo: al cambiar, se remonta. */
  clave?: string
  /** Cámara inicial: azimut, cenit y radio. */
  camara?: { theta: number; phi: number; r: number }
  construir: (e: Escena3D, s: S) => void
  animar?: (e: Escena3D, s: S, t: number, dt: number) => void
  /** true si `construir` es caro y conviene enseñar «calculando…». */
  pesada?: boolean
  interaccion?: Interaccion<S>
}

/** Vista 2D sobre canvas con paneo y zoom en coordenadas del mundo. */
export interface Vista2D<S> {
  tipo: '2d'
  clave?: string
  /** Ventana inicial del mundo. */
  ventana?: { x: [number, number]; y: [number, number] }
  /** Si es false, el usuario no puede desplazar ni hacer zoom (ejes fijos). */
  navegable?: boolean
  dibujar: (g: Pintor2D, s: S, t: number) => void
  /** Si devuelve true, el módulo se redibuja cada fotograma. */
  animada?: (s: S) => boolean
  /** Clic sobre el lienzo, en coordenadas del mundo. */
  alPulsar?: (p: { x: number; y: number }, s: S) => Partial<S> | void
  interaccion?: Interaccion<S>
}

/** Vista de documento: el módulo pinta HTML en vez de un lienzo. */
export interface VistaHTML<S> {
  tipo: 'html'
  clave?: string
  Componente: (props: { s: S }) => ReactNode
}

export type Vista<S> = Vista3D<S> | Vista2D<S> | VistaHTML<S>

export interface Modulo<S> {
  id: string
  area: Area
  /** Título del panel; admite <i> para la cursiva serif del acento. */
  titulo: string
  /** Frase de una línea bajo el título. */
  entradilla: string
  /** Nombre completo: sale en la paleta de búsqueda. */
  resumen: string
  /** Nombre breve para la fila de módulos; si falta, se usa `resumen`. */
  corto?: string
  inicial: S
  Panel: (p: PropsPanel<S>) => ReactNode
  /** Fórmulas en LaTeX, una por bloque. */
  formula?: (s: S) => string[]
  /** Encabezado sobre las fórmulas: ['3d<sub>z²</sub>', 'orbital real'] */
  rotulo?: (s: S) => { nombre: string; apunte?: string }
  lecturas?: (s: S) => [string, string][]
  /** Refresca el panel ~10 veces por segundo (lecturas que dependen del tiempo). */
  lecturasVivas?: boolean
  leyenda?: (s: S) => ReactNode
  pista?: string
  /**
   * Parejas preparadas para el modo Comparar con el mismo módulo en los dos
   * lados: qué se cambia en A y en B (otra métrica, dominio frente a imagen…).
   */
  comparaciones?: Array<{ t: string; a?: Partial<S>; b: Partial<S> }>
  /** true si el Panel coloca él mismo `<Resultado />`; si no, va al final del panel. */
  resultadoEnPanel?: boolean
  /** Fija, o elegida por el estado cuando el módulo cambia de dimensión. */
  vista: Vista<S> | ((s: S) => Vista<S>)
}

// Se registran con el estado borrado: cada módulo es coherente consigo mismo.
export type ModuloAny = Modulo<any>

export function definir<S>(m: Modulo<S>): ModuloAny {
  return m as ModuloAny
}
