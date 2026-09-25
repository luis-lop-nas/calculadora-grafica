import { calcularHerramienta, HERRAMIENTAS_CALCULO, numeroFuente } from '../lib/herramientas'
import { analizarFilas } from '../lib/objetos2d'

/** Fija los deslizadores a sus valores actuales antes de llevar una expresión al motor. */
export function fuenteParaHerramienta(s:any,src:string):string {
  const valores:Record<string,number>={}
  if(s.params && Array.isArray(s.filas))for(const k of analizarFilas(s.filas,s.params).parametros)valores[k]=1
  for(const [k,p] of Object.entries(s.params??{}))if(Number.isFinite((p as any)?.v))valores[k]=(p as any).v
  for(const fila of s.filas??[]) {
    const m=typeof fila.src==='string' ? /^\s*([a-zA-Z]\w*)\s*=\s*(-?\s*(?:\d+(?:\.\d*)?|\.\d+))\s*$/.exec(fila.src) : null
    if(m)valores[m[1]]=Number(m[2].replace(/\s/g,''))
  }
  const f=src.replace(/^\s*(?:[a-z]\(x\)|y)\s*:?=\s*/i,'')
  return f.replace(/\b[A-Za-z]\w*\b/g,k=>!['x','y','z','t','pi','e'].includes(k)&&k in valores?`(${numeroFuente(valores[k])})`:k)
}

export interface Dependencia { objeto: string; origen: string; operacion: string; campos: Record<string,string> }
export function leerDependencias(s:any): Dependencia[] {
  if (!Array.isArray(s?._derivados)) return []
  return s._derivados.filter((d:any)=>d && typeof d.objeto==='string' && typeof d.origen==='string' && HERRAMIENTAS_CALCULO.some(h=>h.id===d.operacion) && d.campos && typeof d.campos==='object' && Object.values(d.campos).every(v=>typeof v==='string')).slice(0,100)
}

/** Una definición editada explícitamente deja de ser una salida automática. */
export function desvincularEdiciones(antes:any, despues:any):any {
  if(!Array.isArray(antes.filas)||!Array.isArray(despues.filas))return despues
  const anteriores=new Map<string,string>(antes.filas.map((f:any)=>[f._id,f.src]))
  const editados=new Set(despues.filas.filter((f:any)=>anteriores.has(f._id)&&anteriores.get(f._id)!==f.src).map((f:any)=>f._id))
  return editados.size ? {...despues,_derivados:leerDependencias(despues).filter(d=>!editados.has(d.objeto))} : despues
}
/** Recalcula en orden de dependencia; no deja resultados antiguos cuando el origen deja de ser válido. */
export function actualizarDerivados(s:any): any {
  const deps=leerDependencias(s)
  if (!deps.length || !Array.isArray(s.filas)) return s
  const filas=s.filas.map((f:any)=>({...f})), mapa=new Map<string,any>(filas.map((f:any)=>[f._id,f]))
  const resueltos=new Set<string>(), enCurso=new Set<string>()
  const resolver=(id:string):void=>{
    if(resueltos.has(id))return
    if(enCurso.has(id))throw new Error('Dependencia circular')
    const d=deps.find(d=>d.objeto===id)
    if(!d)return
    enCurso.add(id)
    const salida=mapa.get(id)
    if(salida) {
      try {
        resolver(d.origen)
        const origen=mapa.get(d.origen)
        if(!origen || origen.src==='indefinido')throw new Error('Objeto de origen eliminado o no definido')
        const f=fuenteParaHerramienta({...s,filas},origen.src)
        const r=calcularHerramienta(d.operacion,{...d.campos,f})
        if(!r.fuente)throw new Error('La operación no produce una expresión')
        salida.src=r.fuente
      } catch {salida.src='indefinido'}
    }
    enCurso.delete(id);resueltos.add(id)
  }
  deps.forEach(d=>resolver(d.objeto))
  return {...s,filas}
}
