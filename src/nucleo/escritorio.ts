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
}

export const escritorio = (window as unknown as { escritorio?: Escritorio }).escritorio
