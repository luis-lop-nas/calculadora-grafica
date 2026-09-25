import type { Herramienta, ResultadoHerramienta } from './herramientas'
import { analizar, compilar } from './expresion'
import { desdeNodo, sustituir, s, type E } from './cas/expr'
import { derivarN } from './cas/derivar'
import { tex } from './cas/tex'
import { resolverEdo, leerCondiciones, particular } from './cas/edo'
import { laplace, laplaceInversa, leerExpr } from './cas/laplace'
import { convertir, UNIDADES } from './unidades'
import { integral, derivada, segunda, sumaRiemann } from './objetos2d'
import { aNum, autovalores, diagonalizar, leerR, lu, qr, svd, sistema, texM, texMnum, mulR, type MR } from './matrizExacta'

const c=(id:string,texto:string,inicial:string,opciones?:string[])=>({id,texto,inicial,opciones})
const F=c('f','Expresión','sin(x)'),A=c('a','Desde a','0'),B=c('b','Hasta b','pi')
const M=c('matriz','Matriz A: columnas con ; y filas con salto de línea','2;1\n1;2')
const crear=(id:string,grupo:string,nombre:string,campos:Herramienta['campos'],ayuda?:string):Herramienta=>({id,grupo,nombre,campos,ayuda})
export const HERRAMIENTAS_AVANZADAS:Herramienta[]=[
  crear('av.unidades','Coordenadas y representación','Convertir unidades…',[c('valor','Valor','1'),c('desde','Unidad de origen','m',UNIDADES.map(u=>u.id)),c('hasta','Unidad de destino','cm',UNIDADES.map(u=>u.id))]),
  crear('av.ecuacionPolar','Coordenadas y representación','Reescribir F(x,y) en polares…',[c('f','Expresión F(x,y)','x^2+y^2-1')],'Sustituye x=r cos(t), y=r sin(t). La ecuación original F=0 se conserva.'),
  crear('av.ecuacionCilindrica','Coordenadas y representación','Reescribir F(x,y,z) en cilíndricas…',[c('f','Expresión F(x,y,z)','x^2+y^2-z')],'Coordenadas (r,t,z), con t en radianes.'),
  crear('av.ecuacionEsferica','Coordenadas y representación','Reescribir F(x,y,z) en esféricas…',[c('f','Expresión F(x,y,z)','x^2+y^2+z^2-1')],'Coordenadas (r,t,v): t azimut y v ángulo desde +Z, ambos en radianes.'),
  crear('av.jacobiano','Coordenadas y representación','Jacobiano de un cambio 3D…',[c('f','x(u,v,w)','u*cos(v)'),c('g','y(u,v,w)','u*sin(v)'),c('h','z(u,v,w)','w')]),
  ...['lu','qr','svd','autovalores','diagonalizar'].map((id,i)=>crear(`av.${id}`,'Vectores y matrices',['Factorización LU…','Factorización QR…','Valores singulares SVD…','Autovalores y autovectores…','Diagonalizar…'][i],[M])),
  crear('av.productoM','Vectores y matrices','Producto de matrices…',[M,c('matrizB','Matriz B','1;0\n0;1')]),
  crear('av.sistema','Vectores y matrices','Resolver A·x=b…',[M,c('b','Vector b (separado por ;)','1;0')]),
  crear('av.osculador','Derivación','Círculo osculador…',[c('f','f(x)','x^2'),c('x0','Punto x₀','0')]),
  crear('av.area','Integración','Calcular área entre curvas…',[F,c('g','Segunda curva','0'),A,B]),
  crear('av.riemann','Integración','Calcular suma de Riemann…',[F,A,B,c('n','Número de particiones','50'),c('metodo','Método','medio',['izquierda','derecha','medio','trapecio'])]),
  crear('av.inversa','Familias y operaciones con funciones','Representar relación inversa…',[c('f','f(x)','x^2')],'Intercambia x e y. La relación puede tener varias ramas: no se afirma que sea una función inversa global.'),
  crear('av.edo','Ecuaciones diferenciales y señales','Resolver EDO con condiciones…',[c('f','Ecuación diferencial',"y'=y"),c('condiciones','Condiciones iniciales (opcional)','y(0)=1')]),
  crear('av.laplace','Ecuaciones diferenciales y señales','Transformada de Laplace…',[c('f','f(t)','sin(t)')]),
  crear('av.laplaceInversa','Ecuaciones diferenciales y señales','Transformada inversa de Laplace…',[c('f','F(s)','1/(s^2+1)')]),
  crear('av.fourier','Ecuaciones diferenciales y señales','Serie de Fourier de una función…',[F,c('a','Inicio de un periodo','-pi'),c('b','Fin del periodo','pi'),c('n','Número de armónicos','5')]),
  crear('av.convolucion','Ecuaciones diferenciales y señales','Convolución en un instante…',[F,c('g','g(x)','exp(-x^2)'),A,B,c('x0','Instante','0')],'Integra f(τ)g(t−τ) en el intervalo elegido; fuera del intervalo no se integra.'),
  crear('av.linea','Multivariable','Integral de línea de un campo…',[c('f','Componente Fx(x,y,z)','-y'),c('g','Componente Fy(x,y,z)','x'),c('h','Componente Fz(x,y,z)','0'),c('cx','Curva x(t)','cos(t)'),c('cy','Curva y(t)','sin(t)'),c('cz','Curva z(t)','0'),A,c('b','Hasta b','2*pi')]),
]
const ast=(t:string)=>desdeNodo(analizar(t),{funciones:{},valores:{}})
const fuente=(e:E):string=>e.t==='q'?`(${e.n}/${e.d})`:e.t==='f'?String(e.v).replace(/e([+-]?\d+)/i,'*10^($1)'):e.t==='s'?e.v:e.t==='+'||e.t==='*'?`(${e.a.map(fuente).join(e.t)})`:e.t==='^'?`(${fuente(e.b)})^(${fuente(e.e)})`:`${e.v}(${e.a.map(fuente).join(',')})`
const num=(t:string)=>{const v=compilar(t,[])();if(!Number.isFinite(v))throw new Error('Parámetro no finito');return v}
const matriz=(t:string):MR=>{const m=t.trim().split('\n').map(l=>l.split(';').map(t=>{const r=leerR(t.trim());if(!r)throw new Error('Entrada racional no válida');return r}));if(!m.length||m.length>8||m[0].length>8||m.some(r=>r.length!==m[0].length))throw new Error('Matriz rectangular de hasta 8×8');return m}
const resultado=(e:E):ResultadoHerramienta=>({metodo:'Cálculo simbólico',tex:tex(e),fuente:fuente(e)})

export function calcularAvanzada(id:string,c:Record<string,string>):ResultadoHerramienta|undefined {
  if(!id.startsWith('av.'))return
  if(id==='av.unidades')return {metodo:'Conversión dimensional',filas:[['Resultado',String(convertir(num(c.valor),c.desde,c.hasta))+' '+c.hasta]]}
  if(id.startsWith('av.ecuacion')) {
    let e=ast(c.f)
    // Variables temporales evitan que una sustitución vuelva a sustituir sus propios resultados.
    for(const k of ['x','y','z'])e=sustituir(e,s(k),s(`origen_${k}`))
    const formulas=id==='av.ecuacionEsferica'?['r*sin(v)*cos(t)','r*sin(v)*sin(t)','r*cos(v)']:['r*cos(t)','r*sin(t)','z']
    for(let i=0;i<3;i++)e=sustituir(e,s(`origen_${'xyz'[i]}`),ast(formulas[i]))
    return {...resultado(e),metodo:'Expresión en las coordenadas indicadas; conservar F=0',fuente:undefined}
  }
  if(id==='av.jacobiano') {
    const es=[c.f,c.g,c.h].map(ast),J=es.map(e=>['u','v','w'].map(v=>derivarN(e,v,1)))
    const d=ast(`${fuente(J[0][0])}*(${fuente(J[1][1])}*${fuente(J[2][2])}-${fuente(J[1][2])}*${fuente(J[2][1])})-${fuente(J[0][1])}*(${fuente(J[1][0])}*${fuente(J[2][2])}-${fuente(J[1][2])}*${fuente(J[2][0])})+${fuente(J[0][2])}*(${fuente(J[1][0])}*${fuente(J[2][1])}-${fuente(J[1][1])}*${fuente(J[2][0])})`)
    return {metodo:'Derivación simbólica del cambio',tex:`J=\\begin{pmatrix}${J.map(r=>r.map(tex).join('&')).join('\\\\')}\\end{pmatrix},\\quad\\det J=${tex(d)}`}
  }
  if(c.matriz) {
    const A=matriz(c.matriz)
    if(['av.lu','av.autovalores','av.diagonalizar'].includes(id)&&A.length!==A[0].length)throw new Error('Se necesita una matriz cuadrada')
    if(id==='av.productoM'){const B=matriz(c.matrizB);if(A[0].length!==B.length)throw new Error('Dimensiones incompatibles');return {metodo:'Producto exacto',tex:texM(mulR(A,B))}}
    if(id==='av.lu'){const r=lu(A);if(!r)throw new Error('No se obtuvo LU');return {metodo:'PA=LU, con pivoteo',tex:`P=${texM(r.P)},L=${texM(r.L)},U=${texM(r.U)}`}}
    if(id==='av.qr'){const r=qr(aNum(A));if(!r)throw new Error('No se obtuvo QR; revisa el rango');return {metodo:'QR numérica',tex:`Q=${texMnum(r.Q)},R=${texMnum(r.R)}`}}
    if(id==='av.svd'){const r=svd(aNum(A));return {metodo:'Descomposición numérica',tex:`U=${texMnum(r.U)},\\sigma=(${r.sigma.join(',')}),V=${texMnum(r.V)}`}}
    if(id==='av.sistema'){const b=c.b.split(';').map(t=>leerR(t.trim()));if(b.length!==A.length||b.some(x=>!x))throw new Error('b debe tener una componente por fila');const r=sistema(A,b as NonNullable<typeof b[number]>[]);return {metodo:'Sistema lineal exacto',filas:Object.entries(r).filter(([k])=>k!=='pasos').map(([k,v])=>[k,JSON.stringify(v,(_k,v)=>typeof v==='bigint'?String(v):v)])}}
    const r=autovalores(A)
    if(id==='av.diagonalizar'){const d=diagonalizar(A,r.valores);if(!d.P||!d.D)throw new Error(d.motivo||'No se obtuvo diagonalización real');return {metodo:d.motivo||'Diagonalización',tex:`P=${texM(d.P)},D=${texM(d.D)}`}}
    return {metodo:'Autovalores y autovectores',filas:r.valores.map((v,i)=>[String(i+1),JSON.stringify(v,(_k,v)=>typeof v==='bigint'?String(v):v)])}
  }
  if(id==='av.edo') {
    const sol=resolverEdo(c.f)
    if(c.condiciones.trim()){const p=particular(sol,leerCondiciones(c.condiciones));if(!p)throw new Error('No se pudieron aplicar las condiciones');if(p.y)return {...resultado(p.y),metodo:sol.metodo,filas:sol.pasos.map(p=>[p.t,p.tex||''])};if(p.phi)return {metodo:sol.metodo,tex:tex(p.phi)+'=0'}}
    const e=sol.explicita||sol.implicita||sol.homogenea
    if(!e)throw new Error('No se encontró una solución con los métodos disponibles')
    return {...resultado(e),fuente:undefined,metodo:sol.metodo+(sol.verificada?' · verificada por sustitución':''),tex:sol.implicita?`${tex(e)}=C_1`:`y=${tex(e)}`,filas:sol.pasos.map(p=>[p.t,p.tex||''])}
  }
  if(id==='av.laplace'||id==='av.laplaceInversa'){const r=id==='av.laplace'?laplace(leerExpr(c.f,'t')):laplaceInversa(leerExpr(c.f,'s'));return {...resultado(r.resultado),metodo:r.aproximada?'Aproximación':'Transformada simbólica',filas:r.pasos.map(p=>[p.t,p.tex||'']),fuente:undefined}}
  if(id==='av.inversa')return {...resultado(sustituir(ast(c.f),s('x'),s('y'))),fuente:`x=${fuente(sustituir(ast(c.f),s('x'),s('y')))}`,metodo:'Relación inversa; puede no ser una función'}
  const f=id==='av.linea'?(_:number)=>0:compilar(c.f,['x'])
  if(id==='av.osculador') {const x=num(c.x0),y=f(x),d=derivada(f,x),dd=segunda(f,x);if(!Number.isFinite(dd)||Math.abs(dd)<1e-12)throw new Error('No hay círculo osculador finito con curvatura nula');const cx=x-d*(1+d*d)/dd,cy=y+(1+d*d)/dd,r=(1+d*d)**1.5/Math.abs(dd);return {metodo:'Curvatura numérica',fuente:`(x-(${cx}))^2+(y-(${cy}))^2=${r*r}`,filas:[['Centro',`${cx}; ${cy}`],['Radio',String(r)]]}}
  const a=num(c.a),b=num(c.b);if(!(a<b))throw new Error('Se necesita a < b')
  const integ=(f:(x:number)=>number)=>integral(x=>{const y=f(x);if(!Number.isFinite(y))throw new Error('Integrando no finito');return y},a,b,4000)
  if(id==='av.fourier') {const n=num(c.n);if(!Number.isInteger(n)||n<1||n>40)throw new Error('Entre 1 y 40 armónicos');const T=b-a,w=2*Math.PI/T,a0=2/T*integ(f);let fuente=String(a0/2);const filas:Array<[string,string]>=[['a₀',String(a0)]];for(let k=1;k<=n;k++){const ak=2/T*integ(x=>f(x)*Math.cos(k*w*x)),bk=2/T*integ(x=>f(x)*Math.sin(k*w*x));filas.push([`a${k}; b${k}`,`${ak}; ${bk}`]);fuente+=`+(${ak})*cos(${k*w}*x)+(${bk})*sin(${k*w}*x)`}return {metodo:'Coeficientes por cuadratura; extensión periódica del intervalo',filas,fuente:fuente.replace(/(\d)e([+-]?\d+)/gi,'$1*10^($2)')}}
  let valor:number
  if(id==='av.linea'){const curve=[c.cx,c.cy,c.cz].map(t=>compilar(t,['t'])),F=[c.f,c.g,c.h].map(t=>compilar(t,['x','y','z']));valor=integ(t=>{const p=curve.map(f=>f(t));return F.reduce((s,f,i)=>s+f(...p)*derivada(curve[i],t),0)})}
  else if(id==='av.riemann'){const n=num(c.n);if(!Number.isInteger(n)||n<1||n>10000)throw new Error('Entre 1 y 10000 particiones');if(!['izquierda','derecha','medio','trapecio'].includes(c.metodo))throw new Error('Método no válido');valor=sumaRiemann(f,a,b,n,c.metodo as 'medio')}
  else {const g=compilar(c.g,['x']);valor=integ(x=>id==='av.area'?Math.abs(f(x)-g(x)):f(x)*g(num(c.x0)-x))}
  if(!Number.isFinite(valor))throw new Error('Resultado no finito')
  return {metodo:'Cuadratura numérica en el intervalo especificado',filas:[['Resultado',String(valor)]]}
}
