import { useState } from 'react'

export interface SolicitudValores {
  titulo:string
  campos:Array<{id:string;texto:string;valor:string;opciones?:string[]}>
  aplicar:(valores:Record<string,string>)=>void
}
export function DialogoValores({solicitud,onCerrar}:{solicitud:SolicitudValores;onCerrar:()=>void}) {
  const [valores,setValores]=useState(()=>Object.fromEntries(solicitud.campos.map(c=>[c.id,c.valor])))
  const [error,setError]=useState('')
  return <div className="velo" onMouseDown={onCerrar}><form tabIndex={-1} className="hoja-atajos dialogo-herramienta" role="dialog" aria-modal="true" aria-label={solicitud.titulo} onMouseDown={e=>e.stopPropagation()} onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();onCerrar()}}} onSubmit={e=>{e.preventDefault();try{solicitud.aplicar(valores);onCerrar()}catch(e){setError(e instanceof Error?e.message:String(e))}}}>
    <div className="hoja-atajos-cabeza"><b>{solicitud.titulo}</b><button type="button" onClick={onCerrar}>×</button></div>
    <div className="dialogo-herramienta-cuerpo">{solicitud.campos.map((c,i)=><label key={c.id}>{c.texto}{c.opciones?<select autoFocus={i===0} value={valores[c.id]} onChange={e=>setValores(v=>({...v,[c.id]:e.target.value}))}>{c.opciones.map(o=><option key={o}>{o}</option>)}</select>:<input autoFocus={i===0} value={valores[c.id]} onChange={e=>setValores(v=>({...v,[c.id]:e.target.value}))} />}</label>)}{error&&<p role="alert">{error}</p>}<button type="submit">Aplicar</button></div>
  </form></div>
}
