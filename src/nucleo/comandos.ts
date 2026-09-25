import type { EntradaMenu } from './tipos'
import type { EntradaSerie } from './escritorio'

/** Identidad semántica: reordenar o insertar entradas no cambia la orden enviada por Electron. */
const identificador = (e: EntradaMenu<any>, ruta: string[]) => e.id ?? ruta.map(encodeURIComponent).join('/')
export function serializarEntradas(es: EntradaMenu<any>[] | undefined, ruta: string[] = []): EntradaSerie[] {
  return (es ?? []).map(e => {
    const aqui = [...ruta,e.t]
    return {id:identificador(e,aqui),t:e.t,tipo:e.tipo??'accion',activo:!!e.activo,desactivado:!!e.desactivado,atajo:e.atajo,...(e.hijos?{hijos:serializarEntradas(e.hijos,aqui)}:{})}
  })
}
export function buscarComando(es: EntradaMenu<any>[], id: string, ruta: string[] = []): EntradaMenu<any> | undefined {
  for (const e of es) {
    if (e.desactivado) continue
    const aqui=[...ruta,e.t]
    if (identificador(e,aqui)===id) return e
    if (e.hijos) {const encontrado=buscarComando(e.hijos,id,aqui);if(encontrado)return encontrado}
  }
}
