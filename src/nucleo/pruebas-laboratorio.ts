import assert from 'node:assert/strict'
import { crearElemento as pieza, simularNewton, estadoNewton, trazarLaboratorio, lagrangeDeEscena, type ProblemaNewton } from '../lib/laboratorioFisica'
const cerca=(a:number,b:number,tol=1e-7)=>assert.ok(Math.abs(a-b)<tol,`${a} ≠ ${b}`)
const base:ProblemaNewton={elementos:[],gx:0,gy:0,restitucion:1,friccion:0,duracion:2,choques:false}
const b={...pieza('cuerpo',0,4,'b'),vx:3}
const tiro={...base,gy:-9.81,elementos:[b]}
const original=JSON.stringify(tiro),caida=simularNewton(tiro),fin=estadoNewton(caida,2)
cerca(fin[0],6);cerca(fin[1],4-9.81*2);cerca(fin[3],-19.62)
cerca(caida.energia[0],caida.energia.at(-1)!,1e-8)
assert.equal(JSON.stringify(tiro),original)
assert.deepEqual(simularNewton(tiro),caida)
const f={...pieza('fuerza',0,0,'f'),a:b.id,fx:4,fy:0}
const acelerado=estadoNewton(simularNewton({...base,elementos:[{...b,masa:2,vx:0},f]}),2)
cerca(acelerado[0],4);cerca(acelerado[2],4)
const an=pieza('anclaje',0,0,'an'),mu={...pieza('muelle',0,0,'mu'),a:an.id,b:b.id,k:4,reposo:0}
const osc=simularNewton({...base,elementos:[an,{...b,x:1,y:0,vx:0},mu]})
cerca(estadoNewton(osc,2)[0],Math.cos(4),1e-8)
cerca(osc.energia[0],osc.energia.at(-1)!,1e-8)
const ch=estadoNewton(simularNewton({...base,choques:true,elementos:[{...b,x:-1,y:0,vx:1},{...b,id:'b2',x:1,y:0,vx:-1}]}),2)
cerca(ch[2],-1);cerca(ch[6],1);cerca(ch[2]+ch[6],0)
const fijo=estadoNewton(simularNewton({...base,elementos:[{...b,fijo:true,vx:90}],gy:-9.8}),2)
cerca(fijo[0],0);cerca(fijo[1],4);cerca(fijo[2],0)
const pared={...pieza('superficie',0,0,'pared'),longitud:10}
const rebote=simularNewton({...base,choques:true,gy:-9.81,restitucion:0,elementos:[{...b,vx:0},pared]})
assert.ok(rebote.estados.every(y=>y[1]>=b.radio-1e-8))
assert.throws(()=>simularNewton({...base,elementos:[mu,b]}),/Conecta/)
assert.throws(()=>simularNewton({...base,duracion:31}),/duración/)
assert.throws(()=>simularNewton({...base,elementos:[{...b,masa:0}]}),/Masas/)
assert.throws(()=>simularNewton(base,1e-9),/Paso/)
const luz={...pieza('emisor',-5,1,'luz'),rayos:1,apertura:0}
const espejo=pieza('espejo',0,0,'espejo'),ref=trazarLaboratorio([luz,espejo])[0]
cerca(ref.puntos[1][0],0);cerca(ref.puntos[1][1],1);assert.ok(ref.puntos[2][0]<0)
const lente={...pieza('lente',0,0,'lente'),focal:3},pantalla=pieza('pantalla',3,0,'pantalla')
const foco=trazarLaboratorio([luz,lente,pantalla])[0];cerca(foco.puntos[2][0],3);cerca(foco.puntos[2][1],0)
const inter={...pieza('interfaz',0,0,'inter'),longitud:20,n1:1,n2:1.5}
const snell=trazarLaboratorio([{...luz,y:0,angulo:30},inter])[0]
const u=snell.puntos[2][0]-snell.puntos[1][0],v=snell.puntos[2][1]-snell.puntos[1][1]
cerca(v/Math.hypot(u,v),1/3)
const tir=trazarLaboratorio([{...luz,x:1,y:0,angulo:130},inter])[0]
assert.ok(tir.eventos.includes('Reflexión total interna'))
assert.throws(()=>trazarLaboratorio([luz,{...lente,focal:0}]),/focal/)
console.log('Laboratorio: caída libre, fuerza/masa, energía, oscilador, choques, cuerpo fijo, suelo, validación, espejo, foco, Snell y reflexión total correctos')

const generado=lagrangeDeEscena(tiro)
const {analizarLagrangiano,numerico,leerValores,integrar,estadoEn,vel}=await import('../lib/mecanica')
const sis=analizarLagrangiano(generado.coords,generado.L,[]),ci=leerValores(generado.ci)
const num=numerico(sis,{}),tr=integrar(num,[...sis.coords.map(q=>ci[q]),...sis.coords.map(q=>ci[vel(q)])],2)
const y=estadoEn(tr,2);for(let i=0;i<4;i++)cerca(y[i],fin[i],1e-6)
assert.throws(()=>lagrangeDeEscena({...tiro,choques:true,elementos:[b,pared]}),/colisiones/)
assert.throws(()=>lagrangeDeEscena({...base,elementos:[b,an,{...mu,amortiguacion:1}]}),/amortiguación/)
console.log('Lagrange generado: misma trayectoria que Newton y restricciones disipativas comprobadas')
