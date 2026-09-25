import { escaparHTML as esc } from '../nucleo/archivos'

/** Registra las primitivas Canvas como SVG. Los mapas de píxeles se incrustan como imágenes. */
export function contextoSVG(ctx: CanvasRenderingContext2D, ancho:number, alto:number) {
  const elementos:string[]=[],defs:string[]=[],pila:string[][]=[]
  let camino='', clips:string[]=[]
  const n=(x:number)=>Number.isFinite(x)?String(+x.toFixed(5)):'0'
  const punto=(x:number,y:number)=>{const p=ctx.getTransform().transformPoint({x,y});return `${n(p.x)} ${n(p.y)}`}
  const matriz=()=>{const m=ctx.getTransform();return `matrix(${[m.a,m.b,m.c,m.d,m.e,m.f].map(n).join(' ')})`}
  const envolver=(s:string)=>clips.reduce((s,id)=>`<g clip-path="url(#${id})">${s}</g>`,s)
  const estilo=(relleno:boolean)=>`fill="${relleno?esc(String(ctx.fillStyle)):'none'}" stroke="${relleno?'none':esc(String(ctx.strokeStyle))}" stroke-width="${n(ctx.lineWidth)}" stroke-linecap="${ctx.lineCap}" stroke-linejoin="${ctx.lineJoin}" opacity="${n(ctx.globalAlpha)}"${ctx.getLineDash().length?` stroke-dasharray="${ctx.getLineDash().map(n).join(' ')}"`:''}`
  const rect=(x:number,y:number,w:number,h:number)=>`M ${punto(x,y)} L ${punto(x+w,y)} L ${punto(x+w,y+h)} L ${punto(x,y+h)} Z`
  const registrar=(p:string,fill:boolean)=>{if(p)elementos.push(envolver(`<path d="${p}" ${estilo(fill)}/>`))}
  const metodos:Record<string,(...args:any[])=>void>={
    beginPath:()=>{camino=''},closePath:()=>{camino+=' Z '},
    moveTo:(x,y)=>{camino+=` M ${punto(x,y)}`},lineTo:(x,y)=>{camino+=` L ${punto(x,y)}`},
    bezierCurveTo:(a,b,c,d,x,y)=>{camino+=` C ${punto(a,b)} ${punto(c,d)} ${punto(x,y)}`},
    quadraticCurveTo:(a,b,x,y)=>{camino+=` Q ${punto(a,b)} ${punto(x,y)}`},
    rect:(x,y,w,h)=>{camino+=rect(x,y,w,h)},
    ellipse:(x,y,rx,ry,rot,a,b,ccw=false)=>{
      let delta=b-a
      if(!ccw&&delta>=Math.PI*2)delta=Math.PI*2
      else if(ccw&&delta<=-Math.PI*2)delta=-Math.PI*2
      else if(ccw&&delta>0)delta-=Math.PI*2
      else if(!ccw&&delta<0)delta+=Math.PI*2
      const pasos=Math.max(2,Math.ceil(Math.abs(delta)*32))
      for(let i=0;i<=pasos;i++){const t=a+delta*i/pasos,u=rx*Math.cos(t),v=ry*Math.sin(t);camino+=`${i||camino?' L ':' M '}${punto(x+u*Math.cos(rot)-v*Math.sin(rot),y+u*Math.sin(rot)+v*Math.cos(rot))}`}
    },
    arc:(x,y,r,a,b,ccw)=>metodos.ellipse(x,y,r,r,0,a,b,ccw),
    fill:()=>registrar(camino,true),stroke:()=>registrar(camino,false),
    fillRect:(x,y,w,h)=>registrar(rect(x,y,w,h),true),strokeRect:(x,y,w,h)=>registrar(rect(x,y,w,h),false),
    clearRect:(x,y,w,h)=>{if(x===0&&y===0&&w>=ancho&&h>=alto)elementos.length=0},
    save:()=>{pila.push([...clips])},restore:()=>{clips=pila.pop()??[]},
    clip:()=>{const id=`clip-${defs.length}`;defs.push(`<clipPath id="${id}"><path d="${camino}"/></clipPath>`);clips.push(id)},
    fillText:(texto,x,y)=>{
      const font=ctx.font.match(/(?:(italic|oblique)\s+)?(?:(bold|[1-9]00)\s+)?([\d.]+)px\s+(.+)/)
      const anchor=ctx.textAlign==='center'?'middle':['right','end'].includes(ctx.textAlign)?'end':'start'
      const baseline=ctx.textBaseline==='middle'?'central':['top','hanging'].includes(ctx.textBaseline)?'hanging':'auto'
      elementos.push(envolver(`<text x="${n(x)}" y="${n(y)}" transform="${matriz()}" text-anchor="${anchor}" dominant-baseline="${baseline}" font-family="${esc(font?.[4]??'sans-serif')}" font-size="${font?.[3]??12}" font-style="${font?.[1]??'normal'}" font-weight="${font?.[2]??'normal'}" fill="${esc(String(ctx.fillStyle))}" opacity="${n(ctx.globalAlpha)}">${esc(String(texto))}</text>`))
    },
    drawImage:(img,...a)=>{
      const temporal=document.createElement('canvas')
      const x=a.length===8?a[4]:a[0],y=a.length===8?a[5]:a[1]
      const w=a.length===8?a[6]:a.length===4?a[2]:img.width,h=a.length===8?a[7]:a.length===4?a[3]:img.height
      temporal.width=Math.max(1,Math.ceil(w));temporal.height=Math.max(1,Math.ceil(h))
      const c=temporal.getContext('2d')!
      if(a.length===8)c.drawImage(img,a[0],a[1],a[2],a[3],0,0,w,h)
      else c.drawImage(img,0,0,w,h)
      elementos.push(envolver(`<image href="${temporal.toDataURL()}" x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" transform="${matriz()}" opacity="${n(ctx.globalAlpha)}"/>`))
    },
  }
  const proxy=new Proxy(ctx,{get(target,key){const v=Reflect.get(target,key,target);if(typeof v!=='function')return v;return (...args:any[])=>{metodos[String(key)]?.(...args);return v.apply(target,args)}},set(target,key,value){Reflect.set(target,key,value,target);return true}})
  return {ctx:proxy,svg:()=>`<svg xmlns="http://www.w3.org/2000/svg" width="${ancho}" height="${alto}" viewBox="0 0 ${ancho} ${alto}"><defs>${defs.join('')}</defs>${elementos.join('')}</svg>`}
}
