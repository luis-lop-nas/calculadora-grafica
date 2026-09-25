import { compilar } from './expresion'
import { integral } from './objetos2d'
import { inversa, leerR, mulR, texM } from './matrizExacta'
import { numeroHerramienta as num, numeroFuente, norma, type Herramienta, type ResultadoHerramienta } from './herramientas'

const c=(id:string,texto:string,inicial:string)=>({id,texto,inicial})
const f=c('f','Expresión f','sin(x)'),a=c('a','Desde a','-pi'),b=c('b','Hasta b','pi')
const v=c('v','Vector v (componentes con ;)','1;0'),w=c('w','Vector w (componentes con ;)','0;1')
const h=(id:string,grupo:string,nombre:string,campos:Herramienta['campos'],ayuda?:string):Herramienta=>({id:`extra.${id}`,grupo,nombre,campos,ayuda})
export const HERRAMIENTAS_COMPLEMENTARIAS:Herramienta[]=[
  ...['signo','recorrido','continuidad'].map((id,i)=>h(id,'Estudio de la función',['Signo en un intervalo…','Recorrido observado…','Examinar continuidad…'][i],[f,a,b],'Muestreo numérico en el intervalo; no demuestra propiedades globales ni descarta singularidades entre muestras.')),
  h('periodo','Estudio de la función','Comprobar periodo candidato…',[f,a,b,c('periodo','Periodo T','2*pi')],'Contrasta f(x+T) y f(x) en 2001 puntos. No demuestra periodicidad ni determina el periodo mínimo.'),
  h('angulo','Construcción y medida','Ángulo entre vectores…',[v,w]),
  h('ponderada','Normas y métricas','Distancia euclídea ponderada…',[v,w,c('pesos','Pesos positivos','1;2')]),
  h('proyeccion','Normas y métricas','Proyección funcional sobre g…',[f,c('g','Expresión g','x'),a,b]),
  h('bola','Normas y métricas','Bola unidad de la norma p (2D)…',[c('p','Orden p ≥ 1 (o inf)','2')]),
  h('base','Coordenadas y representación','Cambiar base de un vector…',[c('base','Columnas de la base de destino; filas con salto de línea','1;1\n0;1'),v],'El vector de entrada usa coordenadas cartesianas. Resuelve B·c=v con aritmética racional exacta.'),
]
const vector=(t:string)=>t.split(';').map(num)
const salida=(metodo:string,filas:Array<[string,string]>,fuente?:string):ResultadoHerramienta=>({metodo,filas,fuente})
export function calcularComplementaria(id:string,c:Record<string,string>):ResultadoHerramienta|undefined {
  if(!id.startsWith('extra.'))return
  if(id==='extra.base') {
    const B=c.base.trim().split('\n').map(r=>r.split(';').map(x=>{const q=leerR(x.trim());if(!q)throw new Error('La base necesita coeficientes racionales');return q}))
    const v=c.v.split(';').map(x=>{const q=leerR(x.trim());if(!q)throw new Error('Vector racional requerido');return [q]})
    if(!B.length||B.length>8||B.some(r=>r.length!==B.length)||v.length!==B.length)throw new Error('Base cuadrada y vector de la misma dimensión (máximo 8)')
    const inv=inversa(B).inv;if(!inv)throw new Error('Los vectores no forman una base: son dependientes')
    return {metodo:'Cambio de base exacto: B·c=v',tex:texM(mulR(inv,v))}
  }
  if(id==='extra.bola') {
    const p=c.p==='inf'?Infinity:num(c.p)
    if(p<1)throw new Error('Se necesita p ≥ 1')
    const puntos:Array<[number,number]>=Array.from({length:257},(_,i)=>{const a=2*Math.PI*i/256,u=[Math.cos(a),Math.sin(a)],n=norma(u,p);return [u[0]/n,u[1]/n]})
    return {metodo:'Frontera de la bola unidad en R²',puntos,fuente:p===Infinity?'max(abs(x),abs(y))=1':`abs(x)^(${numeroFuente(p)})+abs(y)^(${numeroFuente(p)})=1`}
  }
  if(id==='extra.angulo'||id==='extra.ponderada') {
    const v=vector(c.v),w=vector(c.w)
    if(v.length!==w.length||!v.length)throw new Error('Vectores de igual dimensión')
    if(id==='extra.angulo') {
      const n=norma(v,2),m=norma(w,2);if(!n||!m)throw new Error('El vector cero no define un ángulo')
      const a=Math.acos(Math.max(-1,Math.min(1,v.reduce((t,x,i)=>t+(x/n)*(w[i]/m),0))))
      return salida('Ángulo euclídeo principal',[['Radianes',String(a)],['Grados',String(a*180/Math.PI)]])
    }
    const pesos=vector(c.pesos)
    if(pesos.length!==v.length||pesos.some(p=>p<=0))throw new Error('Un peso estrictamente positivo por componente')
    const distancia=norma(v.map((x,i)=>(x-w[i])*Math.sqrt(pesos[i])),2)
    if(!Number.isFinite(distancia))throw new Error('Resultado fuera de rango numérico')
    return salida('Métrica diagonal definida positiva',[['Distancia',String(distancia)]])
  }
  const F=compilar(c.f,['x']),a=num(c.a),b=num(c.b)
  if(!(a<b))throw new Error('Se necesita a < b')
  if(id==='extra.proyeccion') {
    const G=compilar(c.g,['x'])
    const int=(f:(x:number)=>number)=>integral(x=>{const y=f(x);if(!Number.isFinite(y))throw new Error('Integrando no finito');return y},a,b,4000)
    const norma2=int(x=>G(x)**2)
    if(norma2<=0||!Number.isFinite(norma2))throw new Error('g debe tener norma L² finita y no nula')
    const coef=int(x=>F(x)*G(x))/norma2
    if(!Number.isFinite(coef))throw new Error('Coeficiente no finito')
    return salida(`Proyección L² por cuadratura en [${a},${b}]`,[['Coeficiente',String(coef)]],`(${numeroFuente(coef)})*(${c.g})`)
  }
  const muestras=Array.from({length:2001},(_,i)=>{const x=a+(b-a)*i/2000;return {x,y:F(x)}})
  const validas=muestras.filter(p=>Number.isFinite(p.y))
  if(id==='extra.periodo') {
    const T=num(c.periodo);if(T<=0)throw new Error('Periodo positivo requerido')
    let max=0
    for(const {x,y} of muestras){const z=F(x+T);if(!Number.isFinite(y)||!Number.isFinite(z))throw new Error('El dominio no cubre todos los puntos comparados');max=Math.max(max,Math.abs(z-y)/(1+Math.abs(y)+Math.abs(z)))}
    return salida('Comparación de 2001 muestras; no prueba periodicidad global',[['Error relativo máximo',String(max)],['Compatibilidad con T',max<1e-8?'Compatible en las muestras':'No compatible en las muestras']])
  }
  if(id==='extra.recorrido') {
    if(!validas.length)throw new Error('No hay muestras reales finitas')
    const minimo=validas.reduce((a,b)=>a.y<b.y?a:b),maximo=validas.reduce((a,b)=>a.y>b.y?a:b)
    return salida('Extremos observados en 2001 muestras; no son cotas garantizadas',[['Mínimo observado',`${minimo.y} en x=${minimo.x}`],['Máximo observado',`${maximo.y} en x=${maximo.x}`],['Muestras fuera del dominio',String(muestras.length-validas.length)]])
  }
  if(id==='extra.continuidad') {
    const saltos=muestras.slice(1).filter((p,i)=>Number.isFinite(p.y)&&Number.isFinite(muestras[i].y)&&Math.abs(p.y-muestras[i].y)>1+Math.abs(p.y+muestras[i].y))
    return salida('Diagnóstico por muestreo; la ausencia de incidencias no demuestra continuidad',[['Muestras no finitas',String(muestras.length-validas.length)],['Saltos candidatos',saltos.slice(0,30).map(p=>String(p.x)).join('; ')||'Ninguno detectado']])
  }
  const signo=(y:number)=>!Number.isFinite(y)?'Fuera del dominio':y>0?'Positivo':y<0?'Negativo':'Cero observado'
  const rangos:Array<[string,string]>=[]
  let inicio=0
  for(let i=1;i<=muestras.length;i++)if(i===muestras.length||signo(muestras[i].y)!==signo(muestras[inicio].y)){rangos.push([signo(muestras[inicio].y),`[${muestras[inicio].x}, ${muestras[i-1].x}]`]);inicio=i}
  return salida('Signo de muestras consecutivas; los extremos son abscisas muestreadas',rangos)
}
