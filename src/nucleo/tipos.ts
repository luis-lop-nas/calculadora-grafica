import type { ReactNode } from 'react'
import type { Escena3D } from '../render/escena3d'
import type { Pintor2D } from '../render/pintor2d'
import type { Dimensional } from '../lib/dimensiones'

export type Area = 'funciones' | 'geometria' | 'cuantica' | 'edp' | 'edo' | 'campos' | 'algebra'
  | 'senales' | 'mecanica' | 'fisica' | 'estadistica' | 'numerico'

/** Nombre corto para las pestañas; el largo solo aparece donde hay sitio. */
export const AREAS_CORTAS: Record<Area, string> = {
  funciones: 'Funciones',
  geometria: 'Geometría',
  cuantica: 'Cuántica',
  edp: 'EDP',
  edo: 'EDO',
  campos: 'Cálculo vectorial',
  algebra: 'Álgebra',
  senales: 'Señales',
  mecanica: 'Mecánica',
  fisica: 'Física',
  estadistica: 'Estadística',
  numerico: 'Numérico',
}

export const AREAS: Record<Area, string> = {
  funciones: 'Funciones, cálculo simbólico y variable compleja',
  geometria: 'Geometría con regla y compás, y en el espacio',
  cuantica: 'Mecánica cuántica',
  edp: 'Ecuaciones en derivadas parciales',
  edo: 'Ecuaciones diferenciales ordinarias',
  campos: 'Cálculo en varias variables y vectorial',
  algebra: 'Álgebra lineal, estructuras y análisis funcional',
  senales: 'Señales y sistemas',
  mecanica: 'Mecánica clásica y relatividad',
  fisica: 'Electromagnetismo, ondas, óptica, termodinámica y unidades',
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
   * ⌥ (con Mayús, por el eje dominante y a escalones de 0,5). `superficie`: sigue al ratón sobre las mallas de `e.agarre`, y si
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
  /** En 2D, Mayús; en 3D, ⌥ (subir o bajar en vertical: Mayús ahí es alinear a ejes y escalones). */
  mayus: boolean
}

/**
 * Un objeto entero que se selecciona con un clic, se mueve con ⌘ + arrastrar y
 * se gira con R. Las funciones reciben el estado de cuando empezó el gesto y
 * devuelven el parche completo desde ahí, así que no acumulan error.
 */
export interface ObjetoMovible<S> {
  nombre: string
  /** Caja del objeto tal como se ve (coordenadas de física); para acertar el clic y dibujar su marco. */
  caja: (s: S) => { min: number[]; max: number[] } | null
  /** Centro de giro y punto que sigue al ratón al moverlo. */
  centro: (s: S) => number[]
  /** Desplazar lo que se ve un vector d. */
  trasladar: (d: number[], s: S) => Partial<S>
  /** Girar un ángulo (radianes) alrededor del eje dado, que pasa por el centro. */
  girar: (eje: 'x' | 'y' | 'z', angulo: number, s: S) => Partial<S>
}

export interface Interaccion<S> {
  asas: (s: S) => Asa[]
  mover: (id: string, t: Toque, s: S) => Partial<S> | void
  /** Doble clic en un hueco. En 3D el punto cae sobre el plano z = `suelo`. */
  anadir?: (t: Toque, s: S) => Partial<S> | void
  /** Doble clic sobre un asa, o Supr con el ratón encima. */
  quitar?: (id: string, s: S) => Partial<S> | void
  suelo?: number
  /** Solo 3D: objeto que se puede seleccionar, mover y girar entero. */
  objeto?: ObjetoMovible<S>
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
  /** Barra de editor al pie del lienzo (Construir, Editar, Borrar): ver `nucleo/editor.tsx`. */
  barra?: (p: PropsPanel<S>) => ReactNode
}

/** Vista de documento: el módulo pinta HTML en vez de un lienzo. */
export interface VistaHTML<S> {
  tipo: 'html'
  clave?: string
  Componente: (props: { s: S }) => ReactNode
}

export type Vista<S> = Vista3D<S> | Vista2D<S> | VistaHTML<S>

/** Una capa: algo que se dibuja y se puede nombrar, esconder o quitar desde el menú. */
export interface Capa<S> {
  id: string
  nombre: string
  /** Variable CSS (`--accent`) o color CSS. */
  color?: string
  /** Si se puede esconder, si está a la vista; sin `alternar` es solo informativa. */
  visible?: boolean
  alternar?: (s: S) => Partial<S>
  quitar?: (s: S) => Partial<S>
  /** Texto corto al lado del nombre: coordenadas, ecuación… */
  detalle?: string
}

/** Entrada de menú declarada por un módulo: acción, casilla, opción de radio o submenú. */
export interface EntradaMenu<S> {
  t: string
  tipo?: 'accion' | 'casilla' | 'radio'
  /** Marcada (casillas y radios). */
  activo?: boolean
  desactivado?: boolean
  hacer?: (s: S) => Partial<S> | void
  hijos?: EntradaMenu<S>[]
}

export interface MenuModulo<S> {
  /** Objeto ▸ Añadir */
  anadir?: EntradaMenu<S>[]
  /** Módulo ▸ Ejemplos */
  ejemplos?: EntradaMenu<S>[]
  /** Módulo ▸ (sección del módulo abierto) */
  acciones?: EntradaMenu<S>[]
}

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
  /** Magnitudes con su dimensión y las ecuaciones del módulo comprobadas término a término. */
  dimensiones?: (s: S) => Dimensional | null
  /** Refresca el panel ~10 veces por segundo (lecturas que dependen del tiempo). */
  lecturasVivas?: boolean
  leyenda?: (s: S) => ReactNode
  /** Lo que se dibuja, con nombre y color: el menú Capas de la app de Mac (mostrar, ocultar, solo esta, eliminar). */
  capas?: (s: S) => Capa<S>[]
  /** Entradas propias para la barra de menús: Objeto ▸ Añadir, Módulo ▸ Ejemplos y acciones del módulo. */
  menu?: (s: S) => MenuModulo<S>
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
