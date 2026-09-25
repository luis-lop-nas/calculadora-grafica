import { nombreNuevo, tipoDeDef } from '../lib/geometria'
import { numeroHerramienta } from '../lib/herramientas'
import { analizarFilas, TIPOS } from '../lib/objetos2d'
import type { Capa, ModuloAny } from './tipos'

export interface PropiedadesObjeto {
  nombre?: string
  color?: string
  grosor?: number
  opacidad?: number
  discontinuo?: boolean
  bloqueado?: boolean
  grupo?: string
  orden?: number
  aisladoVisible?: boolean
}
export const CLAVE_OBJETOS = '_objetos'
export function propiedades(s: any, id: string): PropiedadesObjeto { return validarPropiedades(s?.[CLAVE_OBJETOS]?.[id]) }
export function validarPropiedades(p: any): PropiedadesObjeto {
  const r: PropiedadesObjeto = {}
  if (!p || typeof p !== 'object') return r
  if (typeof p.nombre === 'string') r.nombre = p.nombre.slice(0, 200)
  if (typeof p.grupo === 'string') r.grupo = p.grupo.slice(0, 200)
  if (Number.isFinite(p.orden)) r.orden = p.orden
  if (typeof p.color === 'string' && /^#[0-9a-f]{6}$/i.test(p.color)) r.color = p.color
  if (Number.isFinite(p.grosor) && p.grosor >= 0.25 && p.grosor <= 20) r.grosor = p.grosor
  if (Number.isFinite(p.opacidad) && p.opacidad >= 0 && p.opacidad <= 1) r.opacidad = p.opacidad
  for (const k of ['discontinuo', 'bloqueado', 'aisladoVisible'] as const) if (typeof p[k] === 'boolean') r[k] = p[k]
  return r
}
export function leerPropiedades(s: any): Record<string, PropiedadesObjeto> {
  const v = s?.[CLAVE_OBJETOS]
  return v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).map(([id, p]) => [id, validarPropiedades(p)])) : {}
}
export const ponerPropiedades = (s: any, ids: string[], p: PropiedadesObjeto) => ({
  [CLAVE_OBJETOS]: { ...leerPropiedades(s), ...Object.fromEntries(ids.map(id => [id, validarPropiedades({ ...propiedades(s, id), ...p })])) },
})

/** La identidad de una fila sobrevive al cambio de fórmula, al borrado de vecinas y al guardado. */
export function conIdentidad(s: any): any {
  if (!s || !Array.isArray(s.filas)) return s
  const vistos = new Set<string>()
  const filas = s.filas.map((f: any) => {
    if (!f || typeof f !== 'object' || typeof f.src !== 'string') return f
    const id = typeof f._id === 'string' && f._id && !vistos.has(f._id) ? f._id : `obj-${crypto.randomUUID()}`
    vistos.add(id)
    return id === f._id ? f : { ...f, _id: id }
  })
  return filas.every((f: any, i: number) => f === s.filas[i]) ? s : { ...s, filas }
}

export interface ObjetoEditable extends Capa<any> {
  tipo?: string
  fuente?: string
  editar?: (s: any, fuente: string) => any
  duplicar?: (s: any) => any
  seleccionar?: (s: any) => any
  estilo?: boolean
}

/** Adaptadores explícitos. Las capas informativas siguen siendo de solo lectura. */
export function objetosModulo(m: ModuloAny, s: any): ObjetoEditable[] {
  const capas: ObjetoEditable[] = (m.capas?.(s) ?? []).map(c => ({ ...c }))
  const analisis = m.id === 'grafica' ? analizarFilas(s.filas, s.params ?? {}) : null
  if (Array.isArray(s.filas)) s.filas.forEach((f: any, i: number) => {
    if (typeof f?.src !== 'string') return
    const id = f._id || `F${i}`
    let c = capas.find(c => c.id === id || c.id === `F${i}`)
    if (!c) { c = { id, nombre: f.src || 'Expresión vacía' }; capas.push(c) }
    c.id = id
    c.tipo = analisis ? TIPOS[analisis.objetos[i].k] || 'expresión' : 'expresión'
    c.quitar = t => {
      const capa = m.capas?.(t).find(c => c.id === id)
      return capa?.quitar ? capa.quitar(t) : { filas: t.filas.filter((g: any) => g._id !== id) }
    }
    c.fuente = f.src
    c.estilo = m.id === 'grafica'
    c.editar = (t, src) => ({ filas: t.filas.map((g: any) => g._id === id ? { ...g, src } : g), ...(Array.isArray(t._derivados) ? { _derivados: t._derivados.filter((d:any) => d.objeto !== id) } : {}) })
    c.duplicar = t => ({ filas: [...t.filas, { ...t.filas.find((g: any) => g._id === id), _id: `obj-${crypto.randomUUID()}` }] })
    c.seleccionar = t => 'activa' in t ? { activa: t.filas.findIndex((g: any) => g._id === id) } : undefined
  })
  if (m.id === 'laboratorio-fisica') for (const c of capas) {
    const o = s.elementos.find((o:any) => o.id === c.id)
    if (!o) continue
    c.tipo = o.tipo
    c.estilo = true
    c.seleccionar = () => ({ seleccionado: c.id })
    c.fuente = `${o.x}; ${o.y}`
    c.editar = (t, texto) => {
      const partes = texto.split(';'); if (partes.length !== 2) throw new Error('Introduce x; y')
      const [x,y] = partes.map(numeroHerramienta)
      return { elementos: t.elementos.map((p:any) => p.id === c.id ? {...p,x,y} : p), jugando:false, instante:0 }
    }
    c.duplicar = t => {
      if(t.elementos.length >= 60) return {}
      const original = t.elementos.find((x:any) => x.id === c.id), id = crypto.randomUUID()
      return { elementos: [...t.elementos, {...original,id,nombre:original.nombre+' copia',x:original.x+1}], seleccionado:id, jugando:false, instante:0 }
    }
  }
  if (m.id === 'geometria') for (const c of capas) {
    const o = s.objs.find((o:any) => o.id === c.id)
    if (!o) continue
    c.tipo = tipoDeDef(o.def)
    c.estilo = true
    c.duplicar = t => ({ objs: [...t.objs, { ...t.objs.find((x:any) => x.id === c.id), id: nombreNuevo(t.objs, tipoDeDef(o.def)) }] })
    if (o.def === 'libre') {
      c.fuente = `${o.x}; ${o.y}`
      c.editar = (t, texto) => { const partes = texto.split(';'); if (partes.length !== 2) throw new Error('Introduce x; y'); const [x,y] = partes.map(numeroHerramienta); return { objs: t.objs.map((p:any) => p.id === o.id ? {...p,x,y} : p) } }
    }
  }
  if (!Array.isArray(s.filas) && typeof s.expr === 'string') {
    capas.unshift({ id: 'expresion-principal', nombre: 'Expresión principal', fuente: s.expr, editar: (_t, expr) => ({ expr }) })
  }
  return capas.map(c => {
    const p = propiedades(s, c.id)
    return { ...c, nombre: p.nombre || c.nombre, color: p.color || c.color }
  })
}

/** Orden visual independiente del orden de evaluación de las construcciones. */
export function ordenarObjetos<T>(s: any, objetos: T[], id: (o: T, i: number) => string): T[] {
  return objetos.map((o,i) => ({o,i,orden:propiedades(s,id(o,i)).orden ?? i}))
    .sort((a,b) => a.orden-b.orden || a.i-b.i).map(x => x.o)
}

export function ejecutarObjetos(s: any, objetos: ObjetoEditable[], ids: string[], op: 'ocultar' | 'mostrar' | 'eliminar' | 'duplicar' | 'aislar'): any {
  let actual = s
  let parche = {}
  for (const c of objetos) {
    const elegido = ids.includes(c.id)
    let p: any
    if (op === 'aislar') { if (c.alternar && (c.visible !== false) !== elegido) p = c.alternar(actual) }
    else if (elegido) {
      if (op === 'eliminar') p = c.quitar?.(actual)
      if (op === 'duplicar') p = c.duplicar?.(actual)
      if (op === 'mostrar' && c.visible === false || op === 'ocultar' && c.visible !== false) p = c.alternar?.(actual)
    }
    if (p) { parche = { ...parche, ...p }; actual = { ...actual, ...p } }
  }
  return parche
}

export function idDeAsa(s:any,id:string):string {
  if (Array.isArray(s.filas)) {
    const i=/^[LPF]([0-9]+)$/.exec(id)?.[1]
    if(i!==undefined)return s.filas[+i]?._id??id
    if(id==='x0')return s.filas[s.activa??0]?._id??id
  }
  return id
}
