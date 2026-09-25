import { definir, type PropsPanel } from '../../nucleo/tipos'
import { Grupo } from '../../nucleo/controles'
import { propiedades } from '../../nucleo/objetos'
import { ajustarPunto, leerEscena } from '../../nucleo/escena'
import { crearElemento, extremosElemento, simularNewton, estadoNewton, trazarLaboratorio, lagrangeDeEscena, TIPOS_ELEMENTO, type ElementoFisico, type TipoElemento, type ProblemaNewton } from '../../lib/laboratorioFisica'
import { calcular as calcularL, PRESETS, texM } from '../mecanica/lagrangiano'
import { estadoEn } from '../../lib/mecanica'
import type { Pintor2D } from '../../render/pintor2d'

export interface EstadoLaboratorio extends ProblemaNewton {
  modo:'newton'|'optica'|'lagrange'; herramienta:'seleccionar'|TipoElemento; seleccionado:string
  jugando:boolean; instante:number; vectores:boolean; trayectorias:boolean
  coords:string; L:string; params:string; ci:string; puntos:string
}
const cuerpo={...crearElemento('cuerpo',-5,3,'pelota'),vx:4,vy:6}
const suelo=crearElemento('superficie',0,-2,'suelo');suelo.longitud=24
export const INICIAL:EstadoLaboratorio={elementos:[cuerpo,suelo],gx:0,gy:-9.81,restitucion:0.7,friccion:0.15,duracion:6,choques:true,modo:'newton',herramienta:'seleccionar',seleccionado:'pelota',jugando:false,instante:0,vectores:true,trayectorias:true,coords:PRESETS[0].coords,L:PRESETS[0].L,params:PRESETS[0].params,ci:PRESETS[0].ci,puntos:PRESETS[0].puntos}
const OPTICOS:TipoElemento[]=['emisor','lente','espejo','interfaz','pantalla']
const MECANICOS:TipoElemento[]=['cuerpo','anclaje','superficie','fuerza','muelle']
const esOptico=(tipo:TipoElemento)=>OPTICOS.includes(tipo)
export function anadirElemento(s:EstadoLaboratorio,tipo:TipoElemento,x=0,y=0):Partial<EstadoLaboratorio>{
  if(s.elementos.length>=60)return {}
  const o=crearElemento(tipo,x,y),cs=s.elementos.filter(o=>o.tipo==='cuerpo'),an=s.elementos.filter(o=>o.tipo==='anclaje')
  if(tipo==='fuerza')o.a=cs[0]?.id??''
  if(tipo==='muelle'){o.a=an[0]?.id??cs[0]?.id??'';o.b=cs.find(c=>c.id!==o.a)?.id??''}
  return {elementos:[...s.elementos,o],seleccionado:o.id,modo:esOptico(tipo)?'optica':'newton',jugando:false,instante:0}
}
export function quitarElemento(s:EstadoLaboratorio,id:string):Partial<EstadoLaboratorio>{return {elementos:s.elementos.filter(o=>o.id!==id&&o.a!==id&&o.b!==id),seleccionado:'',jugando:false,instante:0}}
export function ejemplo(nombre:string):Partial<EstadoLaboratorio>{
  const base={...INICIAL,elementos:[] as ElementoFisico[],seleccionado:'',jugando:false,instante:0}
  if(nombre==='Vacío')return base
  if(nombre==='Tiro parabólico')return {...base,elementos:[{...cuerpo}, {...suelo}],choques:false,duracion:2}
  if(nombre==='Rampa'){const r={...suelo,id:'rampa',longitud:12,angulo:-20,y:0};return {...base,elementos:[{...cuerpo,x:-4,y:4,vx:0,vy:0},r],restitucion:0.05}}
  if(nombre==='Choque elástico')return {...base,gy:0,restitucion:1,friccion:0,elementos:[{...cuerpo,x:-3,y:0,vx:2,vy:0},{...cuerpo,id:'pelota-2',nombre:'Cuerpo 2',x:2,y:0,vx:0,vy:0}]}
  if(nombre==='Masa y muelle'){const a=crearElemento('anclaje',0,2,'anclaje'),c={...cuerpo,x:3,y:2,vx:0,vy:0},m={...crearElemento('muelle',0,0,'muelle'),a:a.id,b:c.id,k:4,reposo:2};return {...base,gy:0,elementos:[a,c,m]}}
  if(nombre==='Lente convergente')return {...base,modo:'optica',elementos:[{...crearElemento('emisor',-6,1,'luz'),rayos:1,apertura:0},crearElemento('lente',0,0,'lente'),crearElemento('pantalla',3,0,'pantalla')]}
  if(nombre==='Refracción')return {...base,modo:'optica',elementos:[{...crearElemento('emisor',-5,2,'luz'),angulo:-20,rayos:1},{...crearElemento('interfaz',0,0,'interfaz'),longitud:10}]}
  return {...base,modo:'lagrange'}
}
export const EJEMPLOS=['Vacío','Tiro parabólico','Rampa','Choque elástico','Masa y muelle','Lente convergente','Refracción','Péndulo de Lagrange']
function calcularSinCache(s:EstadoLaboratorio){try{
  if(s.modo!=='optica'&&(!Number.isFinite(s.duracion)||s.duracion<=0||s.duracion>30))throw new Error('La duración debe estar entre 0 y 30 s')
  if(s.modo==='lagrange')return {lagrange:calcularL({...s,tMax:s.duracion,vista:'animacion',velocidad:1})}
  if(s.modo==='optica')return {rayos:trazarLaboratorio(s.elementos)}
  return {newton:simularNewton(s)}
}catch(e){return {error:e instanceof Error?e.message:String(e)}}}
const cache=new Map<string,ReturnType<typeof calcularSinCache>>()
function calcular(s:EstadoLaboratorio){const clave=JSON.stringify([s.modo,s.elementos,s.gx,s.gy,s.restitucion,s.friccion,s.choques,s.duracion,s.coords,s.L,s.params,s.ci,s.puntos]);let c=cache.get(clave);if(!c){c=calcularSinCache(s);if(cache.size>=4)cache.delete(cache.keys().next().value!);cache.set(clave,c)}return c}
const tiempos=new WeakMap<object,number>()
const relojes=new WeakMap<Pintor2D,{jugando:boolean;instante:number;inicio:number;ultimo:number;clave:string}>()
function tiempo(g:Pintor2D,s:EstadoLaboratorio,t:number,limite=s.duracion){const clave=JSON.stringify([s.elementos,s.modo,s.duracion,s.L,s.ci]),prev=relojes.get(g);let r=prev;if(!r||r.jugando!==s.jugando||r.instante!==s.instante||r.clave!==clave||t<r.ultimo){r={jugando:s.jugando,instante:s.instante,inicio:t,ultimo:t,clave};relojes.set(g,r)}r.ultimo=t;const v=Math.min(limite,Math.max(0,s.instante+(s.jugando?t-r.inicio:0)));tiempos.set(s,v);return v}
function Numero({nombre,valor,cambiar,min,max}:{nombre:string;valor:number;cambiar:(v:number)=>void;min?:number;max?:number}){return <label className="lab-campo">{nombre}<input type="number" aria-label={nombre} value={valor} step="any" min={min} max={max} onChange={e=>{const v=e.target.valueAsNumber;if(Number.isFinite(v))cambiar(v)}}/></label>}
function conversion(s:EstadoLaboratorio){try{return {campos:lagrangeDeEscena(s)}}catch(e){return {error:(e as Error).message}}}
function Panel({s,set}:PropsPanel<EstadoLaboratorio>){
  const o=s.elementos.find(o=>o.id===s.seleccionado),c=calcular(s),conv=conversion(s)
  const cambiar=(p:Partial<EstadoLaboratorio>)=>set({...p,jugando:false,instante:0})
  const editar=(p:Partial<ElementoFisico>)=>o&&cambiar({elementos:s.elementos.map(x=>x.id===o.id?{...x,...p}:x)})
  const numero=(k:keyof ElementoFisico,t:string,min?:number,max?:number)=><Numero key={k} nombre={t} valor={o![k] as number} min={min} max={max} cambiar={v=>editar({[k]:v})}/>
  const enlace=(k:'a'|'b',t:string)=><label className="lab-campo">{t}<select aria-label={t} value={o![k]} onChange={e=>editar({[k]:e.target.value})}><option value="">Elegir…</option>{s.elementos.filter(x=>x.tipo==='cuerpo'||o!.tipo==='muelle'&&x.tipo==='anclaje').map(x=><option key={x.id} value={x.id}>{x.nombre}</option>)}</select></label>
  return <div className="laboratorio-panel">
    <Grupo titulo="Tu problema"><label className="lab-campo">Modelo<select aria-label="Modelo físico" value={s.modo} onChange={e=>cambiar({modo:e.target.value as EstadoLaboratorio['modo'],herramienta:'seleccionar'})}><option value="newton">Newton · cinemática y dinámica</option><option value="optica">Óptica geométrica</option><option value="lagrange">Lagrange · ecuaciones propias</option></select></label>
      <label className="lab-campo">Empezar con<select aria-label="Ejemplo de física" value="" onChange={e=>set(ejemplo(e.target.value))}><option value="" disabled>Elegir un ejemplo…</option>{EJEMPLOS.map(t=><option key={t}>{t}</option>)}</select></label>
    </Grupo>
    {s.modo!=='lagrange'&&<Grupo titulo="Construir"><p className="lab-ayuda">Elige una pieza y pulsa el lienzo. Arrastra sus puntos para colocarla; Q o clic derecho para editar.</p><div className="lab-piezas"><button aria-pressed={s.herramienta==='seleccionar'} onClick={()=>set({herramienta:'seleccionar'})}>↖ Seleccionar</button>{(s.modo==='optica'?OPTICOS:MECANICOS).map(tipo=><button key={tipo} aria-pressed={s.herramienta===tipo} onClick={()=>set({herramienta:tipo,jugando:false,instante:0})}>{TIPOS_ELEMENTO[tipo]}</button>)}</div>
    <label className="lab-campo">Objeto<select aria-label="Objeto físico" value={s.seleccionado} onChange={e=>set({seleccionado:e.target.value})}><option value="">Ninguno</option>{s.elementos.map(x=><option key={x.id} value={x.id}>{x.nombre}</option>)}</select></label>
    {o&&<fieldset><legend>{TIPOS_ELEMENTO[o.tipo]}</legend><label className="lab-campo">Nombre<input aria-label="Nombre físico" value={o.nombre} onChange={e=>editar({nombre:e.target.value})}/></label>
      {!['muelle','fuerza'].includes(o.tipo)&&<>{numero('x','Posición x (m)')}{numero('y','Posición y (m)')}</>}
      {o.tipo==='cuerpo'&&<>{numero('masa','Masa (kg)',0.001)}{numero('radio','Radio (m)',0.001)}{numero('vx','Velocidad x (m/s)')}{numero('vy','Velocidad y (m/s)')}<label><input type="checkbox" checked={o.fijo} onChange={e=>editar({fijo:e.target.checked})}/>Cuerpo fijo</label></>}
      {['superficie','lente','espejo','interfaz','pantalla'].includes(o.tipo)&&<>{numero('angulo','Orientación (°)')}{numero('longitud','Longitud (m)',0.001)}</>}
      {o.tipo==='fuerza'&&<>{enlace('a','Cuerpo al que se aplica')}{numero('fx','Fuerza x (N)')}{numero('fy','Fuerza y (N)')}</>}
      {o.tipo==='muelle'&&<>{enlace('a','Extremo A')}{enlace('b','Extremo B')}{numero('k','Rigidez (N/m)',0)}{numero('reposo','Longitud natural (m)',0)}{numero('amortiguacion','Amortiguación (N·s/m)',0)}</>}
      {o.tipo==='emisor'&&<>{numero('angulo','Dirección (°)')}{numero('rayos','Número de rayos',1,31)}{numero('apertura','Apertura (°)',0,180)}</>}
      {o.tipo==='lente'&&numero('focal','Distancia focal (m)')}
      {o.tipo==='interfaz'&&<>{numero('n1','Índice n₁',0.001)}{numero('n2','Índice n₂',0.001)}<p className="lab-ayuda">A 90°, n₁ corresponde al lado izquierdo y n₂ al derecho.</p></>}
      <div className="fila-botones"><button onClick={()=>set({elementos:[...s.elementos,{...o,id:crypto.randomUUID(),nombre:o.nombre+' copia',x:o.x+1}],jugando:false,instante:0})}>Duplicar pieza</button><button onClick={()=>set(quitarElemento(s,o.id))}>Eliminar pieza</button></div>
    </fieldset>}</Grupo>}
    {s.modo==='lagrange'&&<Grupo titulo="Definir L = T − V"><p className="lab-ayuda">Este modelo usa tus ecuaciones y las posiciones indicadas abajo. Las piezas de Newton quedan guardadas para volver a ellas.</p>{([['coords','Coordenadas'],['L','Lagrangiano'],['params','Parámetros'],['ci','Condiciones iniciales'],['puntos','Posiciones para dibujar']] as const).map(([k,t])=><label className="lab-campo" key={k}>{t}<textarea aria-label={t} value={s[k]} spellCheck={false} onChange={e=>cambiar({[k]:e.target.value})}/></label>)}<p className="lab-ayuda">Velocidades: theta′ se escribe theta'. Posiciones: (x, y); (x₂, y₂).</p></Grupo>}
    {s.modo==='newton'&&<Grupo titulo="Entorno"><button disabled={!conv.campos} title={conv.error} onClick={()=>cambiar({...conv.campos,modo:'lagrange'})}>Generar Lagrangiano de la escena</button>{conv.error&&<p className="lab-ayuda">Para generar L: {conv.error}</p>}<Numero nombre="Gravedad x (m/s²)" valor={s.gx} cambiar={gx=>cambiar({gx})}/><Numero nombre="Gravedad y (m/s²)" valor={s.gy} cambiar={gy=>cambiar({gy})}/><label><input type="checkbox" checked={s.choques} onChange={e=>cambiar({choques:e.target.checked})}/>Colisiones</label>{s.choques&&<><Numero nombre="Restitución" valor={s.restitucion} min={0} max={1} cambiar={restitucion=>cambiar({restitucion})}/><Numero nombre="Fricción con superficies" valor={s.friccion} min={0} cambiar={friccion=>cambiar({friccion})}/></>}<p className="lab-ayuda">Discos sin rotación; fuerzas constantes y muelles de Hooke. Contactos discretos: usa velocidades moderadas respecto al radio. Ocultar una pieza no la retira del cálculo.</p></Grupo>}
    {s.modo==='optica'?<p className="lab-ayuda">Rayos geométricos, espejos planos, Snell y lentes delgadas paraxiales. Sin difracción. Hasta 16 interacciones por rayo.</p>:<Grupo titulo="Simular"><Numero nombre="Duración (s)" valor={s.duracion} min={0.01} max={30} cambiar={duracion=>cambiar({duracion})}/><div className="fila-botones"><button onClick={()=>set({jugando:!s.jugando,instante:s.jugando?tiempos.get(s)??s.instante:s.instante>=s.duracion?0:s.instante,herramienta:'seleccionar'})}>{s.jugando?'Pausar simulación':'Reproducir simulación'}</button><button onClick={()=>set({jugando:false,instante:0})}>Volver al inicio</button></div><label className="lab-campo">Instante<input aria-label="Instante de simulación" type="range" min={0} max={Math.max(.01,s.duracion)} step={.01} value={s.instante} onChange={e=>set({instante:+e.target.value,jugando:false})}/></label><label><input type="checkbox" checked={s.trayectorias} onChange={e=>set({trayectorias:e.target.checked})}/>Trayectorias</label><label><input type="checkbox" checked={s.vectores} onChange={e=>set({vectores:e.target.checked})}/>Vectores de velocidad</label></Grupo>}
    {'error' in c&&<p role="alert">{c.error}</p>}{c.lagrange&&'error' in c.lagrange&&<p role="alert">{c.lagrange.error}</p>}
  </div>
}
function dibujar(g:Pintor2D,s:EstadoLaboratorio,reloj:number){
  g.ejes();const c=calcular(s),limite=c.newton?(c.newton.estados.length-1)*c.newton.paso:c.lagrange&&!('error' in c.lagrange)?c.lagrange.tr.t.at(-1)!:s.duracion,t=tiempo(g,s,reloj,limite),error=c.error||(c.lagrange&&'error' in c.lagrange?c.lagrange.error:undefined)
  if(error)g.texto(error,g.ventana.x[0]+.3,g.ventana.y[1]-.5,g.color('--neg'))
  if(c.lagrange&&!('error' in c.lagrange)){const l=c.lagrange,y=estadoEn(l.tr,t),ps=l.puntos.map(p=>p(y));g.curva([[0,0],...ps],g.color('--ink-soft'),2);ps.forEach((p,i)=>{if(s.trayectorias)g.curva(Array.from({length:180},(_,k)=>l.puntos[i](estadoEn(l.tr,t*k/179))),g.color('--pos'),1);g.punto(...p,g.color('--accent'),7);if(s.vectores){const ta=Math.max(0,t-.002),tb=Math.min(limite,t+.002);if(tb>ta){const a=l.puntos[i](estadoEn(l.tr,ta)),b=l.puntos[i](estadoEn(l.tr,tb));g.flecha(...p,(b[0]-a[0])/(tb-ta),(b[1]-a[1])/(tb-ta),g.color('--pos'))}}});return}
  if(s.modo==='lagrange')return
  const posiciones=new Map(s.elementos.map(o=>[o.id,[o.x,o.y] as [number,number]])),v=c.newton?estadoNewton(c.newton,t):null
  c.newton?.ids.forEach((id,i)=>posiciones.set(id,[v![4*i],v![4*i+1]]))
  for(const o of s.elementos){if(!o.visible||(s.modo==='optica')!==esOptico(o.tipo))continue;const p=propiedades(s,o.id),color=p.color||g.color(o.tipo==='cuerpo'?'--accent':'--ink-soft'),[x,y]=posiciones.get(o.id)!;g.ctx.save();g.ctx.globalAlpha=p.opacidad??1;if(p.discontinuo)g.ctx.setLineDash([6,4]);const grosor=p.grosor??2
    if(o.tipo==='cuerpo'){
      if(s.trayectorias&&c.newton){const i=c.newton.ids.indexOf(o.id),paso=Math.max(1,Math.floor(c.newton.estados.length/400));g.curva(c.newton.estados.filter((_,k)=>k%paso===0).map(v=>[v[4*i],v[4*i+1]]),g.color('--pos'),1)}
      const pts=Array.from({length:49},(_,k)=>[x+o.radio*Math.cos(k*Math.PI/24),y+o.radio*Math.sin(k*Math.PI/24)] as [number,number]);g.rellenar(pts,color,.2*(p.opacidad??1));g.curva(pts,color,grosor)
      if(s.vectores&&v&&c.newton){const i=c.newton.ids.indexOf(o.id);g.flecha(x,y,v[4*i+2],v[4*i+3],g.color('--pos'))}
    }else if(o.tipo==='anclaje')g.punto(x,y,color,6)
    else if(o.tipo==='fuerza'){const a=posiciones.get(o.a);if(a)g.flecha(...a,o.fx,o.fy,g.color('--neg'),grosor)}
    else if(o.tipo==='muelle'){const a=posiciones.get(o.a),b=posiciones.get(o.b);if(a&&b){const dx=b[0]-a[0],dy=b[1]-a[1],l=Math.hypot(dx,dy)||1;g.curva(Array.from({length:25},(_,i)=>{const u=i/24,w=i===0||i===24?0:(i%2?1:-1)*.13;return [a[0]+dx*u-w*dy/l,a[1]+dy*u+w*dx/l]}),color,grosor)}}
    else if(o.tipo==='emisor'){g.punto(x,y,color,6);g.flecha(x,y,Math.cos(o.angulo*Math.PI/180),Math.sin(o.angulo*Math.PI/180),color)}
    else {g.curva(extremosElemento(o),color,o.tipo==='lente'?4:grosor);if(o.tipo==='lente'){const a=o.angulo*Math.PI/180;for(const f of [-1,1])g.punto(x+f*o.focal*Math.sin(a),y-f*o.focal*Math.cos(a),g.color('--pos'),3)}}
    if(!['muelle','fuerza'].includes(o.tipo)&&(s.jugando||s.instante!==0||p.bloqueado))g.texto(p.nombre||o.nombre,x+.2,y+.4,color);g.ctx.restore()
  }
  for(const r of c.rayos??[])if(s.elementos.find(o=>o.id===r.fuente)?.visible)g.curva(r.puntos,'#d99a24',1.7)
}
export default definir<EstadoLaboratorio>({id:'laboratorio-fisica',area:'fisica',titulo:'Tu <i>laboratorio</i>',corto:'Laboratorio de física',resumen:'Laboratorio de física: construye problemas de cinemática, dinámica, óptica y Lagrange',entradilla:'Coloca piezas, define sus propiedades y recorre el problema en el tiempo.',inicial:INICIAL,Panel,lecturasVivas:true,seleccion:{actual:s=>s.seleccionado||null,poner:id=>({seleccionado:id??''})},
  lecturas:s=>{const c=calcular(s);return [['Modelo',s.modo==='newton'?'Newton 2D':s.modo==='optica'?'Óptica geométrica':'Euler–Lagrange'],['Tiempo',`${(tiempos.get(s)??s.instante).toFixed(2)} s`],...(c.error?[['Revisar',c.error] as [string,string]]:[]),...(c.lagrange&&!('error' in c.lagrange)&&c.lagrange.tr.parada?[['Aviso',c.lagrange.tr.parada] as [string,string]]:[]),...(c.newton?[['Energía mecánica inicial',`${c.newton.energia[0].toFixed(5)} J`] as [string,string],...(c.newton.aviso?[['Aviso',c.newton.aviso] as [string,string]]:[])]:[])]},
  formula:s=>{const c=calcular(s);return c.lagrange&&!('error'in c.lagrange)?c.lagrange.sis.EL.map(e=>`${texM(e)}=0`):s.modo==='newton'?[String.raw`m\ddot{\mathbf r}=m\mathbf g+\sum\mathbf F`]:[String.raw`n_1\sin\theta_1=n_2\sin\theta_2`]},
  capas:s=>s.elementos.map(o=>({id:o.id,nombre:o.nombre,visible:o.visible,alternar:t=>({elementos:t.elementos.map(x=>x.id===o.id?{...x,visible:!x.visible}:x)}),quitar:t=>quitarElemento(t,o.id)})),
  menu:s=>({anadir:Object.entries(TIPOS_ELEMENTO).map(([tipo,t])=>({t,desactivado:s.elementos.length>=60,hacer:st=>anadirElemento(st,tipo as TipoElemento)})),ejemplos:EJEMPLOS.map(t=>({t,hacer:()=>ejemplo(t)})),acciones:[{t:'Generar Lagrangiano de la escena',desactivado:!conversion(s).campos,hacer:st=>({...conversion(st).campos,modo:'lagrange',jugando:false,instante:0})},{t:'Modelo físico',hijos:([{v:'newton',t:'Newton 2D'},{v:'optica',t:'Óptica geométrica'},{v:'lagrange',t:'Lagrange'}] as const).map(({v,t})=>({t,tipo:'radio',activo:s.modo===v,hacer:()=>({modo:v,jugando:false,instante:0,herramienta:'seleccionar'})}))}],animacion:[{t:s.jugando?'Pausar simulación':'Reproducir simulación',desactivado:s.modo==='optica',hacer:st=>({jugando:!st.jugando,instante:st.jugando?tiempos.get(st)??st.instante:st.instante>=st.duracion?0:st.instante,herramienta:'seleccionar'})},{t:'Volver al inicio',hacer:()=>({jugando:false,instante:0})}]}),
  vista:{tipo:'2d',ventana:{x:[-10,12],y:[-5,9]},animada:s=>s.jugando,dibujar,
    objetoEn:(p,s)=>[...s.elementos].reverse().find(o=>o.visible&&Math.hypot(p.x-o.x,p.y-o.y)<Math.max(.5,o.tipo==='cuerpo'?o.radio:.5))?.id??null,
    alPulsar:(p,s)=>{if(s.modo==='lagrange')return;if(s.herramienta!=='seleccionar'){const e=leerEscena(s),q=e.vista.ajustar?ajustarPunto([p.x,p.y],e):[p.x,p.y];return anadirElemento(s,s.herramienta,q[0],q[1])}},
    interaccion:{asas:s=>s.jugando||s.instante!==0||s.modo==='lagrange'?[]:s.elementos.filter(o=>o.visible&&!['muelle','fuerza'].includes(o.tipo)&&(s.modo==='optica')===esOptico(o.tipo)&&!propiedades(s,o.id).bloqueado).map(o=>({id:o.id,p:[o.x,o.y],nombre:propiedades(s,o.id).nombre||o.nombre})),mover:(id,t,s)=>({elementos:s.elementos.map(o=>o.id===id?{...o,x:t.p[0],y:t.p[1]}:o),seleccionado:id,jugando:false,instante:0}),quitar:(id,s)=>quitarElemento(s,id),pista:'Elige una pieza y pulsa para colocarla · arrastra para mover · Q para editar'}},
})
