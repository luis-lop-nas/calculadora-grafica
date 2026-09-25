/**
 * Lo que la app de Mac (Electron) expone en `window.escritorio`. En el navegador no existe:
 * todo lo que lo use tiene que seguir funcionando sin él.
 */
import type { PrefsVista } from './vista'

export type Orden =
  | 'modulo'
  | 'paso'
  | 'buscar'
  | 'abrir'
  | 'guardar'
  | 'guardarComo'
  | 'png'
  | 'csv'
  | 'json'
  | 'comparar'
  | 'giro'
  | 'deshacer'
  | 'rehacer'
  | 'restablecer'
  /** dato: 'latex' | 'lecturas' | 'imagen' */
  | 'copiar'
  /** dato: Partial<PrefsVista> */
  | 'prefs'
  /** dato: { orden: 'punto', modo } | { orden: 'encuadrar' } | { orden: 'acercar', factor } */
  | 'vista'
  /** dato: { disposicion } | { enlazar } | 'copiarAenB' */
  | 'cmp'
  | 'atajos'
  /** dato: { grupo: 'anadir' | 'ejemplos' | 'acciones' | 'herramientas', ruta: number[] } */
  | 'menuModulo'
  /** Ayuda ▸ Buscar orden… */
  | 'ordenes'
  /** dato: { id?: string, op: 'alternar' | 'quitar' | 'solo' | 'todas' | 'ninguna' } */
  | 'capa'
  /** dato: { pausado } | { velocidad } | 'paso' | 'reiniciar' */
  | 'animacion'
  /** dato: { op: 'mover' | 'girar', eje: 0 | 1 | 2, valor } */
  | 'transformar'
  | 'grabar'

export interface EstadoMenu {
  id: string
  comparar: boolean
  giro: boolean
  es3D: boolean
  hayLienzo: boolean
  hayLecturas: boolean
  modificado: boolean
  tipo: '2d' | '3d' | 'html'
  hayFormula: boolean
  puedeDeshacer: boolean
  puedeRehacer: boolean
  prefs: PrefsVista
  disposicion: 'lado' | 'encima'
  enlazar: boolean
  /** B es el mismo módulo que A: tiene sentido «Copiar A en B». */
  mismoModulo: boolean
  /** Nombre corto del módulo que se está editando (cabecera de su sección en el menú). */
  nombreModulo: string
  capas: CapaMenu[]
  /** Hay algo que se mueve solo (animar, animada o `jugando`). */
  animado: boolean
  pausado: boolean
  velocidad: number
  grabando: boolean
  /** El módulo tiene una figura que se mueve y gira entera (Objeto ▸ Transformar). */
  transformable: boolean
  menu: { anadir: EntradaSerie[]; ejemplos: EntradaSerie[]; acciones: EntradaSerie[]; herramientas: EntradaSerie[] }
}

/** Capa lista para el proceso principal: sin funciones, con el color ya resuelto (#rrggbb). */
export interface CapaMenu {
  id: string
  nombre: string
  color: string | null
  visible: boolean | null
  alternable: boolean
  quitable: boolean
  detalle?: string
}

export interface EntradaSerie {
  t: string
  tipo: 'accion' | 'casilla' | 'radio'
  activo: boolean
  desactivado: boolean
  hijos?: EntradaSerie[]
}

export interface ModuloMenu {
  id: string
  area: string
  nombreArea: string
  nombre: string
}

interface Escritorio {
  listo: (modulos: ModuloMenu[]) => Promise<unknown | null>
  estado: (estado: EstadoMenu) => void
  guardar: (contenido: string, como: boolean, nombre: string) => Promise<string | null>
  alOrden: (fn: (orden: Orden, dato: unknown) => void) => () => void
  /** Clic derecho en un lienzo: el proceso principal saca el menú contextual. */
  contextual?: () => void
}

export const escritorio = (window as unknown as { escritorio?: Escritorio }).escritorio
