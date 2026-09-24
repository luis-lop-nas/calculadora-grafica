/**
 * Lo que la app de Mac (Electron) expone en `window.escritorio`. En el navegador no existe:
 * todo lo que lo use tiene que seguir funcionando sin él.
 */
export type Orden = 'modulo' | 'paso' | 'buscar' | 'abrir' | 'guardar' | 'guardarComo' | 'png' | 'csv' | 'comparar' | 'giro'

export interface EstadoMenu {
  id: string
  comparar: boolean
  giro: boolean
  es3D: boolean
  hayLienzo: boolean
  hayLecturas: boolean
  modificado: boolean
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
