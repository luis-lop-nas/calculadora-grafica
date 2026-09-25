import type { Pintor2D } from './pintor2d'

/** Caché por lienzo: cargar una imagen vuelve a invalidar el dibujo quieto. */
export function decoracionEscena(invalidar:()=>void) {
  let origen='',imagen:HTMLImageElement|null=null
  return {
    fondo(g:Pintor2D) {
      const i=g.escena.imagen
      if(!i) {origen='';imagen=null;return}
      if(i.datos!==origen) {
        origen=i.datos;imagen=new Image();imagen.onload=invalidar;imagen.src=origen
      }
      if(!imagen?.complete || !imagen.naturalWidth || g.escena.logX || g.escena.logY)return
      const ctx=g.ctx;ctx.save();ctx.globalAlpha=i.opacidad
      ctx.drawImage(imagen,g.X(i.x),g.Y(i.y+i.alto),g.X(i.x+i.ancho)-g.X(i.x),g.Y(i.y)-g.Y(i.y+i.alto));ctx.restore()
    },
    guias(g:Pintor2D) {
      const {x,y}=g.ventana
      for(const guia of g.escena.guias)g.curva(guia.eje==='x'?[[guia.valor,y[0]],[guia.valor,y[1]]]:[[x[0],guia.valor],[x[1],guia.valor]],g.color('--aux'),1,true)
      for(const t of g.escena.textos)g.texto(t.texto,t.x,t.y,g.color('--ink'))
    },
  }
}
