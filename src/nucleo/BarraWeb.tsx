import { useEffect, useRef, useState } from 'react'
import type { OrdenPaleta } from './Ordenes'

interface Rama {t:string;orden?:OrdenPaleta;hijos:Map<string,Rama>}
/** La barra web se construye con las mismas órdenes que la paleta. */
export function BarraWeb({ordenes}:{ordenes:OrdenPaleta[]}) {
  const [abierto,setAbierto]=useState('')
  const ref=useRef<HTMLElement>(null)
  const raiz=new Map<string,Rama>()
  for(const o of ordenes){let nivel=raiz;for(const t of o.camino){if(!nivel.has(t))nivel.set(t,{t,hijos:new Map()});const r=nivel.get(t)!;if(t===o.camino.at(-1))r.orden=o;nivel=r.hijos}}
  useEffect(()=>{const cerrar=(e:PointerEvent)=>{if(!ref.current?.contains(e.target as Node))setAbierto('')};document.addEventListener('pointerdown',cerrar);return()=>document.removeEventListener('pointerdown',cerrar)},[])
  const contenido=(ramas:Map<string,Rama>)=><ul>{[...ramas.values()].map(r=><li key={r.t}>{r.hijos.size?<details><summary>{r.t}</summary>{contenido(r.hijos)}</details>:<button disabled={r.orden?.desactivado} onClick={()=>{setAbierto('');r.orden?.hacer()}}>{r.orden?.activo?'✓ ':''}{r.t}</button>}</li>)}</ul>
  const nombres=['Archivo','Edición','Objeto','Herramientas','Escena','Vista','Animación','Módulo','Ventana','Ayuda','Calculadora']
  return <nav ref={ref} className="barra-web" aria-label="Menús de la aplicación" onKeyDown={e=>{if(e.key==='Escape'){setAbierto('');(e.target as HTMLElement).closest('.barra-web-grupo')?.querySelector('button')?.focus()}}}>{nombres.filter(n=>raiz.has(n)).map(n=><div key={n} className="barra-web-grupo"><button aria-expanded={abierto===n} onClick={()=>setAbierto(abierto===n?'':n)}>{n}</button>{abierto===n&&<div className="barra-web-desplegable">{contenido(raiz.get(n)!.hijos)}</div>}</div>)}</nav>
}
