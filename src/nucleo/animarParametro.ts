import { useEffect, useRef } from 'react'
import type { ModuloAny } from './tipos'
import { relojLienzo } from './vista'

export interface AnimacionParametro { parametro:string;desde:number;hasta:number;duracion:number;modo:'una vez'|'bucle'|'ida y vuelta';activa:boolean }
export function leerAnimacion(s:any):AnimacionParametro|null {
  const a=s?._animacion
  return a && typeof a.parametro==='string' && [a.desde,a.hasta,a.duracion].every(Number.isFinite) && a.desde<a.hasta && a.duracion>=0.1 && ['una vez','bucle','ida y vuelta'].includes(a.modo) && typeof a.activa==='boolean' ? a : null
}
export function valorAnimado(a:AnimacionParametro,t:number):number {
  let u=Math.max(0,t)/a.duracion
  if(a.modo==='una vez')u=Math.min(1,u)
  else if(a.modo==='bucle')u%=1
  else {u%=2;if(u>1)u=2-u}
  return a.desde+(a.hasta-a.desde)*u
}
export function useAnimacionParametro(m:ModuloAny,s:any,set:(p:any)=>void,visible=true) {
  const ref=useRef({m,s,set});ref.current={m,s,set}
  const a=leerAnimacion(s),firma=JSON.stringify(a)
  useEffect(()=>{
    if(!a?.activa || !visible)return
    const reloj=relojLienzo()
    let frame=0,prev=performance.now(),ultimo=-1
    const avanzar=(ahora:number)=>{
      const dt=Math.min(0.1,(ahora-prev)/1000);prev=ahora
      const {t}=reloj(dt)
      if(t!==ultimo && (ultimo<0 || Math.abs(t-ultimo)>=1/30)) {
        ultimo=t
        const {m,s,set}=ref.current
        const p=m.parametrosAnimables?.(s).find(p=>p.id===a.parametro)
        if(p) set({...p.poner(valorAnimado(a,t),s),...(a.modo==='una vez' && t>=a.duracion ? {_animacion:{...a,activa:false}} : {})})
      }
      frame=requestAnimationFrame(avanzar)
    }
    frame=requestAnimationFrame(avanzar)
    return()=>cancelAnimationFrame(frame)
  },[m.id,firma,visible])
}
