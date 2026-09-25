import { HERRAMIENTAS_COMPLEMENTARIAS, calcularComplementaria } from './herramientasComplementarias'
import { HERRAMIENTAS_AVANZADAS, calcularAvanzada } from './herramientasAvanzadas'
import { analizar, compilar } from './expresion'
import { desdeNodo, sustituir, s, type E } from './cas/expr'
import { derivarN } from './cas/derivar'
import { integrar } from './cas/integrar'
import { simplificar, desarrollar, factorizar } from './cas/algebra'
import { taylor, lado } from './cas/limites'
import { tex } from './cas/tex'
import { ejecutar } from './cas/cas'
import { asintotas, ceros, cortes, derivada, segunda, extremos, inflexiones, estudio, integral } from './objetos2d'
import { leerR, transpuestaR, determinante, inversa, rango, nucleo, baseImagen, gaussJordan, texM, texR, type MR } from './matrizExacta'

export interface CampoHerramienta { id: string; texto: string; inicial: string; opciones?: string[] }
export interface Herramienta { id: string; grupo: string; nombre: string; campos: CampoHerramienta[]; ayuda?: string }
export interface ResultadoHerramienta { metodo: string; tex?: string; filas?: Array<[string,string]>; fuente?: string; fuentes?: string[]; puntos?: Array<[number,number]> }
const campo = (id: string, texto: string, inicial: string, opciones?: string[]): CampoHerramienta => ({ id,texto,inicial,opciones })
const F = campo('f','Expresión f','x^2')
const G = campo('g','Expresión g','x')
const A = campo('a','Desde a','-5'), B = campo('b','Hasta b','5')
const X = campo('x0','Punto x₀','1'), N = campo('n','Orden / número de pasos','3')
const V = campo('v','Vector / punto (componentes separadas por ;)','1;2;3')
const W = campo('w','Segundo vector / punto','0;1;0')
const P = campo('p','Orden p de la norma (≥1, o inf)','2')
const datos = campo('datos','Puntos: una pareja x;y por línea','0;1\n1;3\n2;5')
const op = (id: string, grupo: string, nombre: string, campos: CampoHerramienta[], ayuda?: string): Herramienta => ({id,grupo,nombre,campos,ayuda})
export const HERRAMIENTAS_CALCULO: Herramienta[] = [
  ...HERRAMIENTAS_AVANZADAS,
  ...HERRAMIENTAS_COMPLEMENTARIAS,
  ...['completo','dominio','paridad','monotonia','concavidad','raices','extremos','inflexiones','asintotas'].map((id,i) => op(`analisis.${id}`,'Estudio de la función',['Estudio en un intervalo…','Dominio en un intervalo…','Paridad en un intervalo…','Monotonía…','Concavidad…','Raíces en un intervalo…','Extremos en un intervalo…','Inflexiones en un intervalo…','Asíntotas (estimación)…'][i],[F,A,B],'Análisis numérico por muestreo; no constituye una demostración global.')),
  op('analisis.tabla','Estudio de la función','Crear tabla de valores…',[F,A,B,N]),
  op('analisis.ejeY','Estudio de la función','Corte con el eje Y…',[F]),
  op('calculo.derivada','Derivación','Calcular derivada de orden n…',[F,N]),
  op('calculo.tangente','Derivación','Crear tangente…',[F,X]),
  op('calculo.normal','Derivación','Crear normal…',[F,X]),
  op('calculo.secante','Derivación','Crear secante…',[F,A,B]),
  op('calculo.implicita','Derivación','Derivada implícita dy/dx…',[campo('f','F(x,y) = 0','x^2+y^2-1')]),
  op('calculo.curvatura','Derivación','Curvatura en un punto…',[F,X]),
  op('calculo.primitiva','Integración','Calcular primitiva…',[F]),
  op('calculo.definida','Integración','Calcular integral definida…',[F,A,B]),
  op('calculo.media','Integración','Valor medio…',[F,A,B]),
  op('calculo.longitud','Integración','Longitud de arco…',[F,A,B]),
  op('calculo.revolucion','Integración','Volumen de revolución alrededor de X…',[F,A,B]),
  op('calculo.taylor','Límites y series','Calcular Taylor / Maclaurin…',[F,X,N]),
  op('calculo.limite','Límites y series','Calcular límite…',[F,campo('x0','Punto (o inf / -inf)','0')]),
  op('calculo.laterales','Límites y series','Límites laterales…',[F,X]),
  op('calculo.error','Límites y series','Error muestreado de Taylor…',[F,X,N,A,B]),
  op('construccion.cortes','Construcción y medida','Calcular intersecciones de funciones…',[F,G,A,B]),
  ...['simplificar','desarrollar','factorizar','resolver'].map(id => op(`algebra.${id}`,'Álgebra y ecuaciones',`${id[0].toUpperCase()+id.slice(1)}…`,[F])),
  op('algebra.sustituir','Álgebra y ecuaciones','Sustituir variable…',[F,campo('variable','Variable','x'),campo('g','Expresión sustituta','t+1')]),
  ...['transpuesta','determinante','inversa','rango','nucleo','imagen','gauss'].map((id,i) => op(`matriz.${id}`,'Vectores y matrices',['Transpuesta…','Determinante…','Inversa…','Rango…','Núcleo…','Base de la imagen…','Gauss-Jordan…'][i],[campo('matriz','Matriz: columnas con ; y filas con salto de línea','1;2\n3;4')])),
  op('vector.producto','Vectores y matrices','Producto escalar…',[V,W]),
  op('vector.cruz','Vectores y matrices','Producto vectorial…',[V,W]),
  op('vector.proyeccion','Vectores y matrices','Proyectar vector sobre otro…',[V,W]),
  op('coordenadas.convertir','Coordenadas y representación','Convertir coordenadas…',[V,campo('desde','Desde','cartesianas',['cartesianas','polares','cilíndricas','esféricas']),campo('hasta','Hasta','esféricas',['cartesianas','polares','cilíndricas','esféricas'])],'Ángulos en radianes. Cilíndricas: (r,θ,z). Esféricas: (ρ,θ,φ), φ desde +Z. Polares: (r,θ).'),
  op('norma.vector','Normas y métricas','Norma del vector…',[V,P]),
  op('norma.normalizar','Normas y métricas','Normalizar vector…',[V,P]),
  op('norma.distancia','Normas y métricas','Distancia con norma p…',[V,W,P]),
  op('norma.hiperbolica','Normas y métricas','Distancia en el disco de Poincaré…',[campo('v','Punto p en el disco unidad','0;0'),campo('w','Punto q en el disco unidad','0.5;0')]),
  op('norma.funcion','Normas y métricas','Normalizar función en L²[a,b]…',[F,A,B]),
  op('norma.producto','Normas y métricas','Producto escalar de funciones…',[F,G,A,B]),
  op('familia.composicion','Familias y operaciones con funciones','Componer f ∘ g…',[F,G]),
  op('familia.absoluto','Familias y operaciones con funciones','Valor absoluto de la función…',[F]),
  op('familia.transformar','Familias y operaciones con funciones','Trasladar / escalar función…',[F,campo('a','Escala vertical','1'),campo('b','Escala horizontal','1'),campo('h','Desplazamiento horizontal','0'),campo('k','Desplazamiento vertical','0')]),
  op('familia.barrido','Familias y operaciones con funciones','Crear familia de curvas…',[campo('f','Expresión f(x,k)','sin(k*x)'),A,B,N]),
  ...['gradiente','hessiana','tangente','direccional'].map((id,i) => op(`multi.${id}`,'Multivariable',['Calcular gradiente…','Calcular Hessiana…','Ecuación del plano tangente…','Derivada direccional…'][i],[campo('f','Expresión f(x,y)','x^2+y^2'),X,campo('y0','Punto y₀','1'),...(id==='direccional' ? [campo('v','Dirección (componentes x;y)','1;0')] : [])])),
  ...['divergencia','rotacional'].map(id => op(`campo.${id}`,'Multivariable',`${id==='divergencia'?'Divergencia':'Rotacional'} del campo…`,[campo('f','Componente X','y'),campo('g','Componente Y','-x'),campo('h','Componente Z','z')])),
  op('numerico.biseccion','Métodos numéricos y datos','Bisección paso a paso…',[campo('f','Expresión f','x^2-2'),campo('a','Desde a','0'),campo('b','Hasta b','2'),campo('tol','Tolerancia','1e-8')]),
  op('numerico.newton','Métodos numéricos y datos','Newton paso a paso…',[F,X,campo('tol','Tolerancia','1e-8')]),
  op('datos.ajuste','Métodos numéricos y datos','Ajuste lineal por mínimos cuadrados…',[datos]),
  op('datos.interpolar','Métodos numéricos y datos','Interpolación polinómica…',[datos]),
  op('datos.resumen','Métodos numéricos y datos','Resumen estadístico…',[campo('datos','Valores separados por ;','1;2;3;4;5')]),
]

export const numeroHerramienta = (t: string) => {
  const texto = t.trim().replace(',', '.')
  const n = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(texto) ? Number(texto) : compilar(texto, [])()
  if (!Number.isFinite(n)) throw new Error('Se necesita un número real finito')
  return n
}
export function fuenteExpresion(e: E): string {
  switch(e.t) {
    case 'q': return e.d===1n ? String(e.n) : `(${e.n}/${e.d})`
    case 'f': return numeroFuente(e.v)
    case 's': return e.v
    case '+': return `(${e.a.map(fuenteExpresion).join('+')})`
    case '*': return `(${e.a.map(fuenteExpresion).join('*')})`
    case '^': return `(${fuenteExpresion(e.b)})^(${fuenteExpresion(e.e)})`
    case 'fn': return `${e.v}(${e.a.map(fuenteExpresion).join(',')})`
  }
}
export const numeroFuente = (n: number) => String(n).replace(/e([+-]?\d+)/i, '*10^($1)')
const ast = (t: string) => desdeNodo(analizar(t), { funciones: {}, valores: {} })
const fmt = (n: number) => Number.isFinite(n) ? String(+n.toPrecision(12)) : String(n)
const simbolico = (e: E): ResultadoHerramienta => ({ metodo: 'Cálculo simbólico', tex: tex(e), fuente: fuenteExpresion(e) })
const vector = (t: string) => t.replace(/[()[\]]/g,'').split(';').map(numeroHerramienta)
const lista = (v: number[]) => `(${v.map(fmt).join('; ')})`
const filas = (r: Array<[string,string]>, metodo = 'Cálculo numérico'): ResultadoHerramienta => ({ metodo, filas: r })
const escalar = (titulo: string, n: number) => { if (!Number.isFinite(n)) throw new Error('El resultado no es finito o la operación no está definida'); return filas([[titulo,fmt(n)]]) }
export function norma(v: number[], p: number) {
  if (p < 1 || Number.isNaN(p)) throw new Error('La norma requiere p ≥ 1')
  const max = Math.max(...v.map(Math.abs))
  return !max || p === Infinity ? max : max * v.reduce((s,x) => s + (Math.abs(x)/max)**p,0)**(1/p)
}

export function calcularHerramienta(id: string, c: Record<string,string>): ResultadoHerramienta {
  const complementaria = calcularComplementaria(id,c)
  if(complementaria)return complementaria
  const avanzada = calcularAvanzada(id,c)
  if (avanzada) return avanzada
  const num = (k: string) => numeroHerramienta(c[k])
  const f = () => compilar(c.f,['x'])
  const iv = (): [number,number] => { const a=num('a'),b=num('b'); if (!(a<b)) throw new Error('Se necesita a < b'); return [a,b] }
  const orden = () => { const n=num('n'); if (!Number.isInteger(n)||n<0||n>1000) throw new Error('El orden debe ser entero entre 0 y 1000'); return n }
  const integrarN = (fn: (x:number)=>number, a:number,b:number) => integral(x => { const y=fn(x); if (!Number.isFinite(y)) throw new Error('Integrando no finito en el intervalo'); return y },a,b,4000)
  if (id.startsWith('matriz.')) {
    const A: MR = c.matriz.trim().split(/\n/).map(r => r.split(';').map(s => { const v=leerR(s.trim()); if (!v) throw new Error('Entrada racional no válida'); return v }))
    if (!A.length || A.length>12 || !A[0].length || A[0].length>12 || A.some(r=>r.length!==A[0].length)) throw new Error('Matriz rectangular, máximo 12×12')
    if (['matriz.determinante','matriz.inversa'].includes(id) && A.length!==A[0].length) throw new Error('Se necesita una matriz cuadrada')
    if (id==='matriz.rango') return escalar('Rango',rango(A))
    if (id==='matriz.determinante') return {metodo:'Aritmética racional exacta',tex:texR(determinante(A).valor)}
    const M = id==='matriz.transpuesta' ? transpuestaR(A) : id==='matriz.inversa' ? inversa(A).inv : id==='matriz.nucleo' ? nucleo(A) : id==='matriz.imagen' ? baseImagen(A).vectores : gaussJordan(A).R
    if (!M) throw new Error('La matriz no es invertible')
    return {metodo:'Aritmética racional exacta',tex:texM(M)}
  }
  if (id.startsWith('vector.') || id.startsWith('norma.') && !['norma.funcion','norma.producto'].includes(id)) {
    const v=vector(c.v), w=c.w ? vector(c.w) : v
    if (v.length!==w.length || !v.length) throw new Error('Los vectores deben tener la misma dimensión')
    const p=c.p?.trim()==='inf' ? Infinity : c.p ? num('p') : 2
    const producto=v.reduce((a,x,i)=>a+x*w[i],0)
    if(id==='norma.vector') return escalar('Norma',norma(v,p))
    if(id==='norma.distancia') return escalar('Distancia',norma(v.map((x,i)=>x-w[i]),p))
    if(id==='vector.producto') return escalar('Producto escalar',producto)
    if(id==='norma.hiperbolica') {
      const a=norma(v,2),b=norma(w,2)
      if(v.length!==2||a>=1||b>=1) throw new Error('Ambos puntos deben estar dentro del disco unidad')
      return escalar('Distancia hiperbólica',Math.acosh(1+2*norma(v.map((x,i)=>x-w[i]),2)**2/((1-a*a)*(1-b*b))))
    }
    let r:number[]
    if(id==='vector.cruz') { if(v.length!==3) throw new Error('El producto vectorial requiere dimensión 3'); r=[v[1]*w[2]-v[2]*w[1],v[2]*w[0]-v[0]*w[2],v[0]*w[1]-v[1]*w[0]] }
    else { const d=id==='norma.normalizar'?norma(v,p):norma(w,2)**2; if(d===0) throw new Error('El vector cero no admite esta operación'); r=id==='norma.normalizar'?v.map(x=>x/d):w.map(x=>x*producto/d) }
    return filas([['Vector',lista(r)]])
  }
  if(id==='coordenadas.convertir') {
    const v=vector(c.v), desde=c.desde,hasta=c.hasta
    const dimension=desde==='polares'?2:desde==='cartesianas'?v.length:3
    if(v.length!==dimension || ![2,3].includes(dimension)) throw new Error('Revisa el número de coordenadas')
    if(desde!=='cartesianas' && v[0]<0) throw new Error('El radio debe ser no negativo')
    let [x,y,z=0]=v
    if(desde==='polares'||desde==='cilíndricas') [x,y,z]=[v[0]*Math.cos(v[1]),v[0]*Math.sin(v[1]),v[2]??0]
    if(desde==='esféricas') { if(v[2]<0||v[2]>Math.PI) throw new Error('φ debe estar entre 0 y π'); [x,y,z]=[v[0]*Math.sin(v[2])*Math.cos(v[1]),v[0]*Math.sin(v[2])*Math.sin(v[1]),v[0]*Math.cos(v[2])] }
    if(hasta==='polares' && dimension===3 && Math.abs(z)>1e-12) throw new Error('Un punto fuera de z=0 no tiene representación polar 2D')
    const r=Math.hypot(x,y),rho=Math.hypot(x,y,z),a=r===0?0:Math.atan2(y,x)
    const out=hasta==='cartesianas'?(dimension===2?[x,y]:[x,y,z]):hasta==='polares'?[r,a]:hasta==='cilíndricas'?[r,a,z]:[rho,a,rho===0?0:Math.acos(Math.max(-1,Math.min(1,z/rho))) ]
    return filas([['Coordenadas',lista(out)],['Convención','Radianes; θ azimut, φ desde +Z'],...(r===0? [['Singularidad','Azimut indeterminado; se muestra 0 por convenio'] as [string,string]]:[])])
  }
  if(id.startsWith('datos.')) {
    if(id==='datos.resumen') { const v=c.datos.split(/[;\n]/).filter(x=>x.trim()).map(numeroHerramienta).sort((a,b)=>a-b); if(!v.length) throw new Error('Introduce datos'); const media=v.reduce((a,b)=>a+b,0)/v.length; return filas([['n',String(v.length)],['Media',fmt(media)],['Mediana',fmt((v[Math.floor((v.length-1)/2)]+v[Math.floor(v.length/2)])/2)],['Desviación poblacional',fmt(Math.sqrt(v.reduce((a,x)=>a+(x-media)**2,0)/v.length))]]) }
    const pts=c.datos.trim().split('\n').map(l=>vector(l))
    if(pts.length<2||pts.length>1000||pts.some(p=>p.length!==2)) throw new Error('Introduce entre 2 y 1000 parejas x;y')
    if(id==='datos.ajuste') { const mx=pts.reduce((s,p)=>s+p[0],0)/pts.length,my=pts.reduce((s,p)=>s+p[1],0)/pts.length; const xx=pts.reduce((s,p)=>s+(p[0]-mx)**2,0); if(xx===0) throw new Error('Las abscisas no pueden ser todas iguales'); const m=pts.reduce((s,p)=>s+(p[0]-mx)*(p[1]-my),0)/xx,b=my-m*mx; return {...filas([['Pendiente',fmt(m)],['Ordenada',fmt(b)],['Suma de residuos²',fmt(pts.reduce((s,p)=>s+(p[1]-m*p[0]-b)**2,0))]]),fuente:`(${numeroFuente(m)})*x+(${numeroFuente(b)})`} }
    if(pts.length>12||new Set(pts.map(p=>p[0])).size!==pts.length) throw new Error('Interpolación: máximo 12 puntos con abscisas distintas')
    const src=pts.map(([x,y],i)=>`(${numeroFuente(y)})*`+pts.filter((_,j)=>i!==j).map(([a])=>`((x-(${numeroFuente(a)}))/(${numeroFuente(x-a)}))`).join('*')).join('+')
    return {...simbolico(simplificar(ast(src))),metodo:'Interpolación de Lagrange; puede oscilar fuera de los datos'}
  }
  if(id.startsWith('algebra.')) {
    if(id==='algebra.resolver') { const r=ejecutar([`resolver(${c.f},x)`])[0]; if(r.error) throw new Error(r.error); return {metodo:r.nota||'Resolución mediante CAS',tex:r.salida||undefined} }
    const e=ast(c.f)
    if(id==='algebra.sustituir') { if(!/^[a-z]$/i.test(c.variable)) throw new Error('Usa una variable de una letra'); return simbolico(sustituir(e,s(c.variable),ast(c.g))) }
    return simbolico((id==='algebra.simplificar'?simplificar:id==='algebra.desarrollar'?desarrollar:factorizar)(e))
  }
  if(id.startsWith('campo.')) {
    const es=[ast(c.f),ast(c.g),ast(c.h)], d=(i:number,j:number)=>fuenteExpresion(derivarN(es[i],'xyz'[j],1))
    if(id==='campo.divergencia') return simbolico(simplificar(ast(`${d(0,0)}+${d(1,1)}+${d(2,2)}`)))
    return {metodo:'Derivación simbólica',tex:`\\left(${[`${d(2,1)}-${d(1,2)}`,`${d(0,2)}-${d(2,0)}`,`${d(1,0)}-${d(0,1)}`].map(t=>tex(simplificar(ast(t)))).join(',')}\\right)`}
  }
  if(id.startsWith('multi.')) {
    const e=ast(c.f),dx=derivarN(e,'x',1),dy=derivarN(e,'y',1)
    const ev=(e:E)=>compilar(fuenteExpresion(e),['x','y'])(num('x0'),num('y0'))
    if(id==='multi.gradiente') return {metodo:'Derivación simbólica',tex:`\\nabla f=(${tex(dx)},${tex(dy)})`,filas:[['En el punto',lista([ev(dx),ev(dy)])]]}
    if(id==='multi.hessiana') return {metodo:'Derivación simbólica',tex:`\\begin{pmatrix}${tex(derivarN(dx,'x',1))}&${tex(derivarN(dx,'y',1))}\\\\${tex(derivarN(dy,'x',1))}&${tex(derivarN(dy,'y',1))}\\end{pmatrix}`}
    if(id==='multi.direccional') { const v=vector(c.v),n=norma(v,2); if(v.length!==2||n===0) throw new Error('Dirección no nula de dimensión 2'); return escalar('Derivada direccional',(ev(dx)*v[0]+ev(dy)*v[1])/n) }
    const z=ev(e),a=ev(dx),b=ev(dy); if(![z,a,b].every(Number.isFinite)) throw new Error('Plano tangente no definido en ese punto')
    const fuente=`${numeroFuente(z)}+(${numeroFuente(a)})*(x-(${numeroFuente(num('x0'))}))+(${numeroFuente(b)})*(y-(${numeroFuente(num('y0'))}))`
    return {metodo:'Plano tangente',tex:`z=${tex(ast(fuente))}`,fuente}
  }
  if(id==='calculo.derivada') { const n=orden(); if(n>12) throw new Error('Orden máximo 12'); return simbolico(derivarN(ast(c.f),'x',n)) }
  if(id==='calculo.primitiva') { const e=integrar(ast(c.f),'x'); if(!e) throw new Error('No se encuentra una primitiva con los métodos disponibles'); return {...simbolico(e),tex:tex(e)+'+C',metodo:'Primitiva simbólica; al insertar se toma C=0'} }
  if(id==='calculo.implicita') { const e=ast(c.f); return simbolico(ast(`-(${fuenteExpresion(derivarN(e,'x',1))})/(${fuenteExpresion(derivarN(e,'y',1))})`)) }
  if(id==='calculo.definida'||id==='calculo.limite') { const src=id==='calculo.definida'?`integrar(${c.f},x,${c.a},${c.b})`:`limite(${c.f},x,${c.x0})`; const r=ejecutar([src])[0]; if(r.error) throw new Error(r.error); return {metodo:r.nota||'Resultado del CAS',tex:r.salida||undefined} }
  if(id==='calculo.taylor'||id==='calculo.error') { const n=orden(); if(n>20) throw new Error('Grado máximo 20'); const T=taylor(ast(c.f),'x',ast(c.x0),n); if(id==='calculo.taylor') return simbolico(T); const [a,b]=iv(),F=f(),g=compilar(fuenteExpresion(T),['x']); let max=0; for(let i=0;i<=2000;i++) {const x=a+(b-a)*i/2000;max=Math.max(max,Math.abs(F(x)-g(x)))} return {...escalar('Máximo error observado',max),metodo:'2001 muestras; no es una cota rigurosa del error'} }
  if(id.startsWith('familia.')) {
    if(id==='familia.composicion') return simbolico(sustituir(ast(c.f),s('x'),ast(c.g)))
    if(id==='familia.absoluto') return simbolico(ast(`abs(${c.f})`))
    if(id==='familia.transformar') {const e=sustituir(ast(c.f),s('x'),ast(`(${numeroFuente(num('b'))})*(x-(${numeroFuente(num('h'))}))`));return simbolico(ast(`(${numeroFuente(num('a'))})*(${fuenteExpresion(e)})+(${numeroFuente(num('k'))})`))}
    const [a,b]=iv(),n=orden();if(n<2||n>30)throw new Error('Entre 2 y 30 curvas')
    const expresiones:Array<[string,string]>=Array.from({length:n},(_,i)=>{const k=a+(b-a)*i/(n-1);return [`k=${fmt(k)}`,fuenteExpresion(sustituir(ast(c.f),s('k'),ast(numeroFuente(k))))]})
    return {...filas(expresiones,'Familia de expresiones, conservando x libre'),fuentes:expresiones.map(([,f])=>f)}
  }
  const F=f()
  if(id==='analisis.ejeY') return {...escalar('f(0)',F(0)),fuente:`(0,${numeroFuente(F(0))})`}
  if(id==='calculo.laterales') return filas([['Por la izquierda',String(lado(F,num('x0'),-1))],['Por la derecha',String(lado(F,num('x0'),1))]],'Estimación numérica lateral')
  if(['calculo.tangente','calculo.normal','calculo.secante'].includes(id)) {
    const x=id==='calculo.secante'?iv()[0]:num('x0'),y=F(x)
    let m=id==='calculo.secante'?(F(num('b'))-y)/(num('b')-x):derivada(F,x)
    let metodo='Recta con pendiente calculada numéricamente'
    if(id!=='calculo.secante') {
      const h=1e-6*Math.max(1,Math.abs(x)),izquierda=(y-F(x-h))/h,derecha=(F(x+h)-y)/h
      if(![izquierda,derecha].every(Number.isFinite)||Math.abs(izquierda-derecha)>0.001*(1+Math.min(Math.abs(izquierda),Math.abs(derecha))))throw new Error('Las pendientes laterales no coinciden; no hay una tangente diferenciable detectada en este punto')
      try {const exacta=compilar(fuenteExpresion(derivarN(ast(c.f),'x',1)),['x'])(x);if(Number.isFinite(exacta)){m=exacta;metodo='Pendiente obtenida de la derivada simbólica, evaluada en el punto'}} catch { /* se conserva la aproximación numérica */ }
    }
    if(![m,y].every(Number.isFinite)) throw new Error('La recta no está definida en ese punto')
    if(id==='calculo.normal'&&m===0) return {metodo:'Normal vertical',fuente:`x=${numeroFuente(x)}`,tex:`x=${x}`}
    if(id==='calculo.normal')m=-1/m
    if(!Number.isFinite(m))throw new Error('Pendiente fuera del rango numérico')
    return {...simbolico(ast(`(${numeroFuente(y)})+(${numeroFuente(m)})*(x-(${numeroFuente(x)}))`)),metodo}
  }
  if(id==='calculo.curvatura') {const x=num('x0');return escalar('Curvatura',Math.abs(segunda(F,x))/(1+derivada(F,x)**2)**1.5)}
  if(id.startsWith('numerico.')) {
    const tol=num('tol');if(tol<=0||tol>1)throw new Error('Tolerancia en (0,1]')
    let [a,b]=id==='numerico.biseccion'?iv():[0,0],x=id==='numerico.newton'?num('x0'):(a+b)/2
    if(id==='numerico.biseccion'&&(!Number.isFinite(F(a))||!Number.isFinite(F(b))||F(a)*F(b)>0))throw new Error('La bisección requiere valores finitos con signos opuestos en los extremos')
    const pasos:Array<[string,string]>=[]
    for(let i=0;i<100;i++) {
      const y=F(x);if(!Number.isFinite(y))throw new Error('Iteración fuera del dominio')
      pasos.push([String(i),`x=${fmt(x)}; f(x)=${fmt(y)}`])
      if(Math.abs(y)<=tol)return filas(pasos,'Convergencia por residuo |f(x)| ≤ tolerancia')
      if(id==='numerico.newton') {const d=derivada(F,x);if(!Number.isFinite(d)||Math.abs(d)<1e-14)throw new Error('Derivada nula o no finita; Newton no puede continuar');x-=y/d}
      else {if(F(a)*y<=0)b=x;else a=x;x=(a+b)/2}
    }
    return filas(pasos,'Sin convergencia certificada tras 100 iteraciones; comprueba continuidad y punto inicial')
  }
  const [a,b]=iv()
  if(id==='analisis.tabla') {const n=orden();if(n<2)throw new Error('Al menos 2 puntos');const puntos=Array.from({length:n},(_,i):[number,number]=>{const x=a+(b-a)*i/(n-1);return [x,F(x)]});return {...filas(puntos.map(([x,y])=>[fmt(x),fmt(y)])),puntos}}
  if(id==='norma.funcion'||id==='norma.producto') {
    if(id==='norma.producto') {const G=compilar(c.g,['x']);return escalar('Producto escalar',integrarN(x=>F(x)*G(x),a,b))}
    const n=Math.sqrt(integrarN(x=>F(x)**2,a,b));if(n===0||!Number.isFinite(n))throw new Error('No se puede normalizar una función de norma cero o no finita');return {metodo:`Norma L² numérica en [${a},${b}]: ${fmt(n)}`,fuente:`(${c.f})/(${numeroFuente(n)})`}
  }
  if(['calculo.media','calculo.longitud','calculo.revolucion'].includes(id)) return escalar('Resultado',id==='calculo.media'?integrarN(F,a,b)/(b-a):id==='calculo.longitud'?integrarN(x=>Math.hypot(1,derivada(F,x)),a,b):Math.PI*integrarN(x=>F(x)**2,a,b))
  if(id==='construccion.cortes') {const G=compilar(c.g,['x']);return filas(cortes(F,G,a,b).map(p=>[fmt(p.x),fmt(p.y)]),'Intersecciones numéricas en el intervalo')}
  const E=estudio(F,a,b)
  if(id.startsWith('analisis.')) {
    const items:Record<string,unknown>={dominio:E.dominio,paridad:E.paridad??'No detectada',monotonia:{crece:E.crece,decrece:E.decrece},concavidad:{convexa:E.convexa,concava:E.concava},raices:ceros(F,a,b),extremos:extremos(F,a,b),inflexiones:inflexiones(F,a,b),asintotas:asintotas(F,a,b)}
    const k=id.split('.')[1]
    return filas(Object.entries(k==='completo'?items:{[k]:items[k]}).map(([k,v])=>[k,JSON.stringify(v)]),`Estimación numérica en [${a}, ${b}]; pueden faltar singularidades o raíces no detectadas`)
  }
  throw new Error('Operación desconocida')
}
