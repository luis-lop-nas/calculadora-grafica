import type { Pintor2D } from './pintor2d'
import type { Asa } from '../nucleo/tipos'
import { idDeAsa } from '../nucleo/objetos'

export class Rastros2D {
  private puntos = new Map<string, Array<{x:number;y:number;t:number}>>()
  private firma = ''
  private tiempo = 0
  pintar(g:Pintor2D,asas:Asa[],s:any,t:number) {
    const config=g.escena.rastros,firma=JSON.stringify(config)
    if(firma!==this.firma||t<this.tiempo)this.puntos.clear()
    this.firma=firma;this.tiempo=t
    for(const a of asas) {
      if(!config.ids.includes(idDeAsa(s,a.id))||!a.p.slice(0,2).every(Number.isFinite))continue
      const puntos=(this.puntos.get(a.id)??[]).filter(p=>t-p.t<=config.segundos)
      const ultimo=puntos.at(-1),[x,y]=a.p
      if(!ultimo||Math.hypot(x-ultimo.x,y-ultimo.y)>1e-8)puntos.push({x,y,t})
      if(puntos.length>600)puntos.splice(0,puntos.length-600)
      this.puntos.set(a.id,puntos)
      g.ctx.save()
      for(const p of puntos){g.ctx.globalAlpha=0.6*Math.max(0,1-(t-p.t)/config.segundos);g.punto(p.x,p.y,g.color('--aux'),2)}
      g.ctx.restore()
    }
  }
}
