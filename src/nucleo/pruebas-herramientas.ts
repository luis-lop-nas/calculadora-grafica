import assert from 'node:assert/strict'
import { calcularHerramienta as calcular, HERRAMIENTAS_CALCULO, norma } from '../lib/herramientas'
import { compilar } from '../lib/expresion'
import { leerEscena, parcheEscena, ajustarPunto } from './escena'
import { conIdentidad, objetosModulo, ejecutarObjetos } from './objetos'
import { actualizarDerivados, fuenteParaHerramienta } from './derivados'
import { leerCSV } from './archivos'
import { validarPrefs } from './vista'
import { menuObjetos, menuSeleccion } from './menuObjetos'
import { serializarEntradas, buscarComando } from './comandos'
import { valorAnimado } from './animarParametro'

const casi = (a:number,b:number) => assert.ok(Math.abs(a-b)<1e-6,`${a} ≠ ${b}`)
const evaluar = (id:string,c:Record<string,string>, x:number) => compilar(calcular(id,c).fuente!,['x'])(x)
casi(evaluar('calculo.derivada',{f:'x^3',n:'2'},2),12)
casi(evaluar('calculo.primitiva',{f:'2*x'},3),9)
casi(evaluar('calculo.tangente',{f:'x^2',x0:'2'},3),8)
casi(evaluar('calculo.normal',{f:'x^2',x0:'1'},3),0)
assert.equal(calcular('calculo.normal',{f:'x^2',x0:'0'}).fuente,'x=0')
assert.throws(()=>calcular('calculo.tangente',{f:'abs(x)',x0:'0'}))
casi(evaluar('calculo.normal',{f:'x/10000000000000',x0:'0'},1)/1e13,-1)
casi(Number(calcular('extra.angulo',{v:'1;0',w:'0;1'}).filas![1][1]),90)
assert.throws(()=>calcular('extra.ponderada',{v:'0;0',w:'1;1',pesos:'1;-1'}))
assert.throws(()=>calcular('extra.base',{base:'1;2\n2;4',v:'1;2'}))
casi(evaluar('familia.composicion',{f:'x^2',g:'x+1'},2),9)
casi(evaluar('familia.transformar',{f:'x^2',a:'2',b:'3',h:'1',k:'4'},2),22)
casi(evaluar('datos.ajuste',{datos:'0;1\n1;3\n2;5'},4),9)
casi(evaluar('datos.interpolar',{datos:'0;0\n1;1\n2;4'},3),9)
assert.throws(()=>calcular('datos.interpolar',{datos:'1;2\n1;3'}))
assert.throws(()=>calcular('norma.normalizar',{v:'0;0',p:'2'}))
assert.throws(()=>calcular('norma.hiperbolica',{v:'1;0',w:'0;0'}))
casi(norma([3,4],2),5)
casi(norma([3,4],Infinity),4)
assert.throws(()=>norma([1,2],0.5))
assert.match(calcular('coordenadas.convertir',{v:'1;0;0',desde:'cartesianas',hasta:'esféricas'}).filas![0][1],/1; 0; 1.570/)
assert.throws(()=>calcular('coordenadas.convertir',{v:'1;0;1',desde:'cartesianas',hasta:'polares'}))
assert.equal(calcular('matriz.determinante',{matriz:'1;2\n3;4'}).tex,'-2')
assert.throws(()=>calcular('matriz.inversa',{matriz:'1;2\n2;4'}))
const bis=calcular('numerico.biseccion',{f:'x^2-2',a:'0',b:'2',tol:'1e-8'})
assert.match(bis.metodo,/Convergencia/)
assert.throws(()=>calcular('numerico.biseccion',{f:'x^2+1',a:'-1',b:'1',tol:'0.01'}))
assert.match(calcular('numerico.biseccion',{f:'1/x',a:'-1',b:'2',tol:'1e-8'}).metodo,/Sin convergencia/)
assert.throws(()=>calcular('calculo.taylor',{f:'sin(x)',x0:'0',n:'1000'}))
const esc=leerEscena(parcheEscena({}, {sistema:'polar',vista:{ejes:true,nombres:true,rejilla:true,planos:false,ajustar:true,paso:1}}))
const p=ajustarPunto([0.9,0.9],esc)
casi(Math.hypot(...p),1)
casi(Math.atan2(p[1],p[0]),Math.PI/3)
assert.equal(leerEscena({_escena:{razon:-2,pasoAngular:0,vista:{paso:NaN},sistema:'error'}}).razon,1)
assert.equal(leerEscena(parcheEscena({}, {logX:true,sistema:'polar'})).sistema,'cartesiano')
const original=conIdentidad({filas:[{src:'x',visible:true},{src:'x^2',visible:true}]})
const segundo=original.filas[1]._id
assert.equal(conIdentidad({filas:original.filas.slice(1)}).filas[0]._id,segundo)
assert.notEqual(conIdentidad({filas:[original.filas[0],original.filas[0]]}).filas[0]._id, conIdentidad({filas:[original.filas[0],original.filas[0]]}).filas[1]._id)
const modulo:any={id:'prueba',capas:(s:any)=>s.filas.map((f:any,i:number)=>({id:f._id,nombre:f.src,quitar:(t:any)=>({filas:t.filas.filter((_:any,j:number)=>j!==i)})}))}
const objetos=objetosModulo(modulo,original)
assert.deepEqual(ejecutarObjetos(original,objetos,objetos.map(o=>o.id),'eliminar').filas,[])
const vinculado={filas:[{_id:'a',src:'x^2'},{_id:'b',src:'viejo'},{_id:'c',src:'viejo'}],_derivados:[{objeto:'c',origen:'b',operacion:'calculo.derivada',campos:{f:'viejo',n:'1'}},{objeto:'b',origen:'a',operacion:'calculo.derivada',campos:{f:'viejo',n:'1'}}]}
const recalculado=actualizarDerivados(vinculado)
casi(compilar(recalculado.filas[1].src,['x'])(3),6)
casi(compilar(recalculado.filas[2].src,['x'])(3),2)
assert.equal(actualizarDerivados({...vinculado,filas:vinculado.filas.slice(1)}).filas[0].src,'indefinido')
assert.equal(actualizarDerivados({...vinculado,_derivados:[{...vinculado._derivados[0],origen:'c'}]}).filas[2].src,'indefinido')
const editado=objetosModulo(modulo,recalculado)[1].editar!(recalculado,'x^3')
assert.equal(editado._derivados.length,1)
assert.equal(editado._derivados[0].objeto,'c')
assert.equal(fuenteParaHerramienta({params:{a:{v:3}},filas:[]},'f(x)=a*x'),'(3)*x')
const parametrico=actualizarDerivados({filas:[{_id:'a',src:'k*x'},{_id:'b',src:''}],params:{k:{v:4}},_derivados:[{objeto:'b',origen:'a',operacion:'calculo.tangente',campos:{f:'k*x',x0:'2'}}]})
casi(compilar(parametrico.filas[1].src,['x'])(3),12)
assert.deepEqual(leerCSV('\ufeffx,y\r\n"a,b","c""d"\r\n"uno\ndos",2'),[['x','y'],['a,b','c"d'],['uno\ndos','2']])
assert.throws(()=>leerCSV('"sin cierre'))
assert.equal(validarPrefs({paso:-2,tema:'inventado'}).paso,0.5)
assert.equal(validarPrefs({paso:1,tema:'inventado'}).tema,'sistema')
const comandos=[{t:'B',id:'b',hacer:()=>{}},{t:'A',id:'a',hacer:()=>{}}]
assert.equal(buscarComando([...comandos].reverse(),serializarEntradas(comandos)[0].id!)?.t,'B')
assert.equal(buscarComando([{t:'Padre',desactivado:true,hijos:comandos}],'a'),undefined)
let elegidos:string[]=[]
const contexto={s:recalculado,objetos:objetosModulo(modulo,recalculado),seleccion:['c'],elegir:(ids:string[])=>{elegidos=ids},propiedades:()=>{},ordenar:true}
buscarComando(menuSeleccion(contexto),'seleccion.origenes')!.hacer!(recalculado)
assert.deepEqual(elegidos,['a','b','c'])
assert.ok(buscarComando(menuObjetos(contexto),'objeto.independiente'))
const anim={parametro:'a',desde:-2,hasta:4,duracion:2,modo:'ida y vuelta' as const,activa:true}
casi(valorAnimado(anim,0),-2);casi(valorAnimado(anim,2),4);casi(valorAnimado(anim,3),1);casi(valorAnimado(anim,4),-2)
for(const h of HERRAMIENTAS_CALCULO) {
  const c=Object.fromEntries(h.campos.map(c=>[c.id,c.inicial]))
  if(h.id==='numerico.biseccion') Object.assign(c,{f:'x^2-2',a:'0',b:'2'})
  if(h.id==='calculo.limite') c.x0='0'
  const r=calcular(h.id,c)
  assert.ok(r.metodo,h.id)
}
console.log(`Herramientas: ${HERRAMIENTAS_CALCULO.length} operaciones con parámetros iniciales y casos límite verificados`)
