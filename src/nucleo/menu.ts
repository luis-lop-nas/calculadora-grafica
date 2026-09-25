import type { Capa, EntradaMenu } from './tipos'

/**
 * Atajos para declarar `capas` y `menu` en los módulos. Las funciones `hacer` se evalúan
 * con el estado del momento del clic: el menú se recalcula entonces.
 */

export const accion = <S>(t: string, hacer: (s: S) => Partial<S> | void, desactivado = false): EntradaMenu<S> => ({ t, hacer, desactivado })

export const casilla = <S>(t: string, activo: boolean, poner: (v: boolean) => Partial<S>): EntradaMenu<S> => ({
  t,
  tipo: 'casilla',
  activo,
  hacer: () => poner(!activo),
})

export const radios = <S, V>(t: string, opciones: ReadonlyArray<{ v: V; t: string }>, actual: V, poner: (v: V) => Partial<S>): EntradaMenu<S> => ({
  t,
  hijos: opciones.map((o) => ({ t: o.t, tipo: 'radio', activo: o.v === actual, hacer: () => poner(o.v) })),
})

export const submenu = <S>(t: string, hijos: EntradaMenu<S>[]): EntradaMenu<S> => ({ t, hijos })

export const separador: EntradaMenu<any> = { t: '', tipo: 'separador' }

/** Capa ligada a una casilla booleana del estado (`verX`). */
export function capaVer<S>(s: S, clave: keyof S & string, nombre: string, color: string): Capa<S> {
  return {
    id: clave,
    nombre,
    color,
    visible: !!s[clave],
    alternar: (x) => ({ [clave]: !x[clave] }) as Partial<S>,
  }
}

/** Capa que siempre se dibuja: solo nombre y color. */
export const capaFija = <S>(id: string, nombre: string, color: string, detalle?: string): Capa<S> => ({ id, nombre, color, detalle })

/** Coordenadas cortas para el detalle de una capa. */
export const coords = (p: ArrayLike<number>) => `(${Array.from(p, (c) => String(Math.round(c * 100) / 100).replace('.', ',')).join('; ')})`
