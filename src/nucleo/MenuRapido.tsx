import { useEffect, useRef, useState } from 'react'
import type { OrdenPaleta } from './Ordenes'

export interface AccionRapida { nombre:string;icono:string;orden?:OrdenPaleta;hijos?:OrdenPaleta[] }
export const claveOrden=(o:OrdenPaleta)=>o.camino.join(' › ')
export function leerFavoritos():string[]{try{const v=JSON.parse(localStorage.getItem('calculadora:favoritos')??'[]');return Array.isArray(v)?v.filter(x=>typeof x==='string').slice(0,30):[]}catch{return []}}
export function alternarFavorito(o:OrdenPaleta){const clave=claveOrden(o),actuales=leerFavoritos();try{localStorage.setItem('calculadora:favoritos',JSON.stringify(actuales.includes(clave)?actuales.filter(x=>x!==clave):[...actuales,clave].slice(-30)))}catch{}}
export function abrirMenuRapido(x=window.innerWidth/2,y=window.innerHeight/2){window.dispatchEvent(new CustomEvent('calculadora:menu-rapido',{detail:{x,y}}))}

export function MenuRapido({x,y,acciones,cerrar,buscar,nativo}:{x:number;y:number;acciones:AccionRapida[];cerrar:()=>void;buscar:()=>void;nativo?:()=>void}) {
  const [lista,setLista]=useState<OrdenPaleta[]|null>(null),[titulo,setTitulo]=useState('')
  const caja=useRef<HTMLDivElement>(null)
  useEffect(()=>{const antes=document.activeElement as HTMLElement|null;caja.current?.focus();return()=>{if(antes?.isConnected)antes.focus()}},[])
  const ejecutar=(o:OrdenPaleta)=>{if(o.desactivado)return;cerrar();setTimeout(o.hacer,0)}
  const elegir=(a:AccionRapida)=>{if(a.hijos){setLista(a.hijos);setTitulo(a.nombre)}else if(a.orden)ejecutar(a.orden)}
  const cx=Math.min(Math.max(x,220),Math.max(220,window.innerWidth-220)),cy=Math.min(Math.max(y,180),Math.max(180,window.innerHeight-180))
  return <div className="velo-menu-rapido" onPointerDown={cerrar} onContextMenu={e=>e.preventDefault()}><div ref={caja} tabIndex={-1} className={`menu-rapido${lista?' con-lista':''}`} role="dialog" aria-modal="true" aria-label="Edición rápida" style={{left:cx,top:cy}} onPointerDown={e=>e.stopPropagation()} onKeyDown={e=>{
    e.stopPropagation()
    if(e.key==='Tab'){
      const botones=Array.from(caja.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')??[])
      const i=botones.indexOf(document.activeElement as HTMLButtonElement)
      if(botones.length){e.preventDefault();botones[(i+(e.shiftKey?-1:1)+botones.length)%botones.length].focus()}
    }
    if(e.key==='Escape'){if(lista)setLista(null);else cerrar()}
    if(!lista&&/^[1-8]$/.test(e.key)){e.preventDefault();const a=acciones[Number(e.key)-1];if(a)elegir(a)}
  }}>
    {lista?<section className="rapido-lista"><header><button onClick={()=>setLista(null)} aria-label="Volver al menú radial">←</button><b>{titulo}</b><button onClick={cerrar} aria-label="Cerrar edición rápida">×</button></header>{!lista.length&&<p>Añade favoritos con la estrella de Buscar orden.</p>}{lista.map((o,i)=><button key={claveOrden(o)+i} disabled={o.desactivado} onClick={()=>ejecutar(o)}><small>{o.camino.slice(0,-1).join(' › ')}</small>{o.activo?'✓ ':''}{o.camino.at(-1)}</button>)}</section>:<>
      <div className="rapido-centro"><b>Edición rápida</b><small>Q · 1–8 · Esc</small><button onClick={()=>{cerrar();buscar()}}>Buscar orden</button>{nativo&&<button onClick={()=>{cerrar();nativo()}}>Menú nativo</button>}</div>
      {acciones.slice(0,8).map((a,i)=>{const angulo=(-90+i*45)*Math.PI/180;return <button key={a.nombre} className="rapido-sector" disabled={!a.hijos&&(!a.orden||a.orden.desactivado)} style={{left:Math.cos(angulo)*155,top:Math.sin(angulo)*125}} onClick={()=>elegir(a)}><span aria-hidden="true">{a.icono}</span><span>{a.nombre}</span><kbd>{i+1}</kbd></button>})}
    </>}
  </div></div>
}
