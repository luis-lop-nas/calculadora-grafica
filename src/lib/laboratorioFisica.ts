/** Motor del editor de problemas: discos sin rotación, fuerzas, muelles y óptica 2D. */
export type TipoElemento = 'cuerpo'|'anclaje'|'superficie'|'fuerza'|'muelle'|'emisor'|'lente'|'espejo'|'interfaz'|'pantalla'
export interface ElementoFisico {
  id:string;tipo:TipoElemento;nombre:string;visible:boolean
  x:number;y:number;angulo:number;longitud:number
  masa:number;radio:number;vx:number;vy:number;fijo:boolean
  a:string;b:string;k:number;reposo:number;amortiguacion:number
  fx:number;fy:number;focal:number;n1:number;n2:number;rayos:number;apertura:number
}
export interface ProblemaNewton {elementos:ElementoFisico[];gx:number;gy:number;restitucion:number;friccion:number;duracion:number;choques:boolean}
export interface SimulacionNewton {ids:string[];paso:number;estados:Float64Array[];energia:number[];aviso?:string}
export const TIPOS_ELEMENTO:Record<TipoElemento,string>={cuerpo:'Cuerpo',anclaje:'Anclaje',superficie:'Superficie / rampa',fuerza:'Fuerza aplicada',muelle:'Muelle',emisor:'Emisor de rayos',lente:'Lente delgada',espejo:'Espejo plano',interfaz:'Interfaz refractante',pantalla:'Pantalla'}
export function crearElemento(tipo:TipoElemento,x=0,y=0,id:string=crypto.randomUUID()):ElementoFisico {
  return {id,tipo,nombre:TIPOS_ELEMENTO[tipo],visible:true,x,y,angulo:['lente','espejo','interfaz','pantalla'].includes(tipo)?90:0,longitud:tipo==='superficie'?8:4,masa:1,radio:0.35,vx:0,vy:0,fijo:false,a:'',b:'',k:10,reposo:2,amortiguacion:0,fx:2,fy:0,focal:3,n1:1,n2:1.5,rayos:5,apertura:15}
}
export const extremosElemento=(o:ElementoFisico):[[number,number],[number,number]]=>{const a=o.angulo*Math.PI/180,dx=o.longitud/2*Math.cos(a),dy=o.longitud/2*Math.sin(a);return [[o.x-dx,o.y-dy],[o.x+dx,o.y+dy]]}

export function validarProblema(p:ProblemaNewton) {
  if(!Number.isFinite(p.duracion)||p.duracion<=0||p.duracion>30)throw new Error('La duración debe estar entre 0 y 30 s')
  if(![p.gx,p.gy,p.restitucion,p.friccion].every(Number.isFinite)||p.restitucion<0||p.restitucion>1||p.friccion<0)throw new Error('Revisa gravedad, restitución (0–1) y fricción no negativa')
  if(p.elementos.length>60)throw new Error('Máximo 60 elementos por problema')
  if(new Set(p.elementos.map(o=>o.id)).size!==p.elementos.length)throw new Error('Hay identificadores de objetos repetidos')
  for(const o of p.elementos) {
    if(!(o.tipo in TIPOS_ELEMENTO)||Object.values(o).some(v=>typeof v==='number'&&!Number.isFinite(v)))throw new Error('Elemento no válido')
    if(o.masa<=0||o.radio<=0||o.longitud<=0||o.k<0||o.reposo<0||o.amortiguacion<0||o.n1<=0||o.n2<=0)throw new Error('Masas, radios, longitudes e índices positivos; rigidez y amortiguación no negativas')
    if(o.tipo==='fuerza'&&!p.elementos.some(x=>x.id===o.a&&x.tipo==='cuerpo'))throw new Error(`Asigna un cuerpo a «${o.nombre}»`)
    if(o.tipo==='muelle'&&(!o.a||!o.b||o.a===o.b||[o.a,o.b].some(id=>!p.elementos.some(x=>x.id===id&&(x.tipo==='cuerpo'||x.tipo==='anclaje')))))throw new Error(`Conecta los dos extremos de «${o.nombre}»`)
  }
}

export function simularNewton(p:ProblemaNewton,paso=1/240):SimulacionNewton {
  validarProblema(p)
  if(!Number.isFinite(paso)||paso<=0||paso>0.05||p.duracion/paso>100000)throw new Error('Paso de integración no válido')
  const cuerpos=p.elementos.filter(o=>o.tipo==='cuerpo'),indices=new Map(cuerpos.map((o,i)=>[o.id,i]))
  if(cuerpos.length>24)throw new Error('Máximo 24 cuerpos móviles o fijos')
  const muelles=p.elementos.filter(o=>o.tipo==='muelle'),fuerzas=p.elementos.filter(o=>o.tipo==='fuerza'),superficies=p.elementos.filter(o=>o.tipo==='superficie')
  const punto=(id:string,y:Float64Array)=>{const i=indices.get(id);if(i!==undefined)return [y[4*i],y[4*i+1],y[4*i+2],y[4*i+3]];const o=p.elementos.find(o=>o.id===id)!;return [o.x,o.y,0,0]}
  const campo=(y:Float64Array)=>{
    const d=new Float64Array(y.length)
    cuerpos.forEach((o,i)=>{if(!o.fijo){d[4*i]=y[4*i+2];d[4*i+1]=y[4*i+3];d[4*i+2]=p.gx;d[4*i+3]=p.gy}})
    const fuerza=(id:string,fx:number,fy:number)=>{const i=indices.get(id);if(i===undefined||cuerpos[i].fijo)return;d[4*i+2]+=fx/cuerpos[i].masa;d[4*i+3]+=fy/cuerpos[i].masa}
    for(const o of fuerzas)fuerza(o.a,o.fx,o.fy)
    for(const o of muelles){const a=punto(o.a,y),b=punto(o.b,y),dx=b[0]-a[0],dy=b[1]-a[1],l=Math.hypot(dx,dy);if(l<1e-12)continue;const v=((b[2]-a[2])*dx+(b[3]-a[3])*dy)/l,F=o.k*(l-o.reposo)+o.amortiguacion*v;fuerza(o.a,F*dx/l,F*dy/l);fuerza(o.b,-F*dx/l,-F*dy/l)}
    return d
  }
  const energia=(y:Float64Array)=>{
    let e=0
    cuerpos.forEach((o,i)=>{e+=o.masa*((y[4*i+2]**2+y[4*i+3]**2)/2-p.gx*y[4*i]-p.gy*y[4*i+1])})
    for(const o of muelles){const a=punto(o.a,y),b=punto(o.b,y);e+=o.k/2*(Math.hypot(a[0]-b[0],a[1]-b[1])-o.reposo)**2}
    return e
  }
  let y=Float64Array.from(cuerpos.flatMap(o=>[o.x,o.y,o.fijo?0:o.vx,o.fijo?0:o.vy]))
  const n=Math.ceil(p.duracion/paso),dt=p.duracion/n
  const salida:SimulacionNewton={ids:cuerpos.map(o=>o.id),paso:dt,estados:[y.slice()],energia:[energia(y)]}
  const desplazar=(k:Float64Array,h:number)=>y.map((v,i)=>v+h*k[i])
  for(let j=0;j<n;j++) {
    const k1=campo(y),k2=campo(desplazar(k1,dt/2)),k3=campo(desplazar(k2,dt/2)),k4=campo(desplazar(k3,dt))
    y=y.map((v,i)=>v+dt/6*(k1[i]+2*k2[i]+2*k3[i]+k4[i]))
    if(p.choques) {
      for(let i=0;i<cuerpos.length;i++) {
        const o=cuerpos[i];if(o.fijo)continue
        for(const pared of superficies) {
          const [a,b]=extremosElemento(pared),dx=b[0]-a[0],dy=b[1]-a[1],ll=dx*dx+dy*dy
          const u=Math.max(0,Math.min(1,((y[4*i]-a[0])*dx+(y[4*i+1]-a[1])*dy)/ll)),cx=a[0]+u*dx,cy=a[1]+u*dy
          let nx=y[4*i]-cx,ny=y[4*i+1]-cy,l=Math.hypot(nx,ny)
          if(l>=o.radio)continue
          if(l<1e-12){nx=-dy/Math.sqrt(ll);ny=dx/Math.sqrt(ll)}else {nx/=l;ny/=l}
          y[4*i]+=nx*(o.radio-l);y[4*i+1]+=ny*(o.radio-l)
          const vn=y[4*i+2]*nx+y[4*i+3]*ny
          if(vn<0){const impulso=-(1+p.restitucion)*vn;y[4*i+2]+=impulso*nx;y[4*i+3]+=impulso*ny;const vt=-y[4*i+2]*ny+y[4*i+3]*nx,fr=Math.sign(vt)*Math.min(Math.abs(vt),p.friccion*impulso);y[4*i+2]+=fr*ny;y[4*i+3]-=fr*nx}
        }
      }
      for(let i=0;i<cuerpos.length;i++)for(let j=i+1;j<cuerpos.length;j++) {
        const a=cuerpos[i],b=cuerpos[j],ma=a.fijo?0:1/a.masa,mb=b.fijo?0:1/b.masa;if(ma+mb===0)continue
        let nx=y[4*j]-y[4*i],ny=y[4*j+1]-y[4*i+1],l=Math.hypot(nx,ny),r=a.radio+b.radio
        if(l>=r)continue
        if(l<1e-12){nx=1;ny=0}else{nx/=l;ny/=l}
        const corr=(r-l)/(ma+mb);y[4*i]-=corr*ma*nx;y[4*i+1]-=corr*ma*ny;y[4*j]+=corr*mb*nx;y[4*j+1]+=corr*mb*ny
        const vn=(y[4*j+2]-y[4*i+2])*nx+(y[4*j+3]-y[4*i+3])*ny
        if(vn<0){const J=-(1+p.restitucion)*vn/(ma+mb);y[4*i+2]-=J*ma*nx;y[4*i+3]-=J*ma*ny;y[4*j+2]+=J*mb*nx;y[4*j+3]+=J*mb*ny}
      }
    }
    if(y.some(v=>!Number.isFinite(v)||Math.abs(v)>1e7)){salida.aviso='Integración detenida: valores fuera de rango. Reduce rigidez, velocidades o duración.';break}
    salida.estados.push(y.slice());salida.energia.push(energia(y))
  }
  return salida
}
export function estadoNewton(s:SimulacionNewton,t:number):Float64Array {
  const u=Math.max(0,Math.min(s.estados.length-1,t/s.paso)),i=Math.floor(u),j=Math.min(i+1,s.estados.length-1),f=u-i
  return s.estados[i].map((v,k)=>v+(s.estados[j][k]-v)*f)
}

export interface RayoTrazado {fuente:string;puntos:Array<[number,number]>;eventos:string[]}
export function trazarLaboratorio(elementos:ElementoFisico[]):RayoTrazado[] {
  const piezas=elementos.filter(o=>['emisor','lente','espejo','interfaz','pantalla'].includes(o.tipo))
  validarProblema({elementos:piezas,gx:0,gy:0,restitucion:0,friccion:0,duracion:1,choques:false})
  if(piezas.some(o=>o.tipo==='lente'&&Math.abs(o.focal)<1e-9))throw new Error('La focal debe tener magnitud de al menos 10⁻⁹ m')

  const opticos=elementos.filter(o=>['lente','espejo','interfaz','pantalla'].includes(o.tipo)),salida:RayoTrazado[]=[]
  for(const fuente of elementos.filter(o=>o.tipo==='emisor')) {
    const n=Math.max(1,Math.min(31,Math.round(fuente.rayos)))
    for(let i=0;i<n;i++) {
      const a=(fuente.angulo+(n===1?0:fuente.apertura*(i/(n-1)-0.5)))*Math.PI/180
      let x=fuente.x,y=fuente.y,dx=Math.cos(a),dy=Math.sin(a)
      const r:RayoTrazado={fuente:fuente.id,puntos:[[x,y]],eventos:[]}
      for(let rebote=0;rebote<16;rebote++) {
        let cerca:{o:ElementoFisico;t:number;u:number;ux:number;uy:number}|null=null
        for(const o of opticos){const a=o.angulo*Math.PI/180,ux=Math.cos(a),uy=Math.sin(a),den=dx*uy-dy*ux;if(Math.abs(den)<1e-10)continue;const vx=o.x-x,vy=o.y-y,t=(vx*uy-vy*ux)/den,u=(vx*dy-vy*dx)/den;if(t>1e-7&&Math.abs(u)<=o.longitud/2&&(!cerca||t<cerca.t))cerca={o,t,u,ux,uy}}
        if(!cerca){r.puntos.push([x+dx*40,y+dy*40]);break}
        const {o,t,ux,uy}=cerca;x+=t*dx;y+=t*dy;r.puntos.push([x,y]);r.eventos.push(o.nombre)
        if(o.tipo==='pantalla')break
        const nx=uy,ny=-ux,dn=dx*nx+dy*ny,dt=dx*ux+dy*uy,signo=Math.sign(dn)||1
        if(o.tipo==='espejo'){dx-=2*dn*nx;dy-=2*dn*ny}
        else if(o.tipo==='lente'){if(Math.abs(o.focal)<1e-9)throw new Error('Una lente no puede tener focal cero');const h=(x-o.x)*ux+(y-o.y)*uy,m=dt/Math.abs(dn)-h/o.focal,norma=Math.hypot(1,m);dx=(signo*nx+m*ux)/norma;dy=(signo*ny+m*uy)/norma}
        else {if(o.n1<=0||o.n2<=0)throw new Error('Índices de refracción positivos');const tangente=dt*(dn>0?o.n1/o.n2:o.n2/o.n1);if(Math.abs(tangente)>1){dx-=2*dn*nx;dy-=2*dn*ny;r.eventos.push('Reflexión total interna')}else{const normal=signo*Math.sqrt(Math.max(0,1-tangente*tangente));dx=normal*nx+tangente*ux;dy=normal*ny+tangente*uy}}
      }
      salida.push(r)
    }
  }
  return salida
}

/** Traduce una escena conservativa a L(q,q′); rechaza restricciones que no puede representar. */
export function lagrangeDeEscena(p:ProblemaNewton):{coords:string;L:string;params:string;ci:string;puntos:string} {
  validarProblema(p)
  const cuerpos=p.elementos.filter(o=>o.tipo==='cuerpo'&&!o.fijo)
  if(!cuerpos.length||cuerpos.length>2)throw new Error('La conversión admite uno o dos cuerpos móviles (hasta cuatro coordenadas).')
  if(p.elementos.some(o=>o.tipo==='muelle'&&o.amortiguacion>0))throw new Error('Retira la amortiguación para generar un lagrangiano conservativo.')
  if(p.choques&&(cuerpos.length>1||p.elementos.some(o=>o.tipo==='superficie')))throw new Error('Desactiva las colisiones para convertir la escena a Lagrange.')
  const n=(v:number)=>`(${String(v).replace(/e([+-]?\d+)/i,'*10^($1)')})`
  const qs=cuerpos.map((_,i)=>[i?'u':'x',i?'v':'y'])
  const pos=(id:string)=>{const i=cuerpos.findIndex(o=>o.id===id);if(i>=0)return qs[i];const o=p.elementos.find(o=>o.id===id)!;return [n(o.x),n(o.y)]}
  const terminos=cuerpos.map((o,i)=>{const [x,y]=qs[i];return `${n(o.masa)}/2*(${x}'^2+${y}'^2)+${n(o.masa*p.gx)}*${x}+${n(o.masa*p.gy)}*${y}`})
  for(const o of p.elementos){if(o.tipo==='fuerza'&&cuerpos.some(c=>c.id===o.a)){const [x,y]=pos(o.a);terminos.push(`${n(o.fx)}*${x}+${n(o.fy)}*${y}`)}if(o.tipo==='muelle'){const a=pos(o.a),b=pos(o.b),d=`((${b[0]}-${a[0]})^2+(${b[1]}-${a[1]})^2)`;terminos.push(`-${n(o.k)}/2*${o.reposo===0?d:`(sqrt(${d})-${n(o.reposo)})^2`}`)}}
  return {coords:qs.flat().join(', '),L:terminos.join('+'),params:'',ci:cuerpos.map((o,i)=>`${qs[i][0]}=${n(o.x)}, ${qs[i][1]}=${n(o.y)}, ${qs[i][0]}'=${n(o.vx)}, ${qs[i][1]}'=${n(o.vy)}`).join(', '),puntos:qs.map(q=>`(${q.join(',')})`).join('; ')}
}
