import type { ResultadoHerramienta } from '../lib/herramientas'
import { Formula, Lecturas } from './controles'
import { CabeceraPanel } from './CabeceraPanel'

export interface CalculoGuardado {
  id: string
  herramienta: string
  nombre: string
  campos: Record<string,string>
  r: ResultadoHerramienta
}
export function leerResultados(s:any):CalculoGuardado[] {
  if(!Array.isArray(s?._resultados))return []
  return s._resultados.filter((v:any)=>v && typeof v.id==='string' && typeof v.herramienta==='string' && typeof v.nombre==='string' && v.campos && typeof v.campos==='object' && Object.values(v.campos).every(x=>typeof x==='string') && v.r && typeof v.r.metodo==='string')
    .slice(-20).map((v:CalculoGuardado)=>({...v,r:{metodo:v.r.metodo,tex:typeof v.r.tex==='string'?v.r.tex:undefined,fuente:typeof v.r.fuente==='string'?v.r.fuente:undefined,filas:Array.isArray(v.r.filas)?v.r.filas.filter(r=>Array.isArray(r)&&r.length===2&&r.every(c=>typeof c==='string')).slice(0,2000):undefined}}))
}
export function PanelResultados({resultados,cerrar,borrar,abrirCAS,acoplado,alternar}:{resultados:CalculoGuardado[];cerrar:()=>void;borrar:(id:string)=>void;abrirCAS:(fuente:string)=>void;acoplado:boolean;alternar:()=>void}) {
  return <section className="inspector" aria-label="Resultados y pasos"><CabeceraPanel titulo="Resultados y pasos" cerrar={cerrar} cierre="Cerrar resultados" acoplado={acoplado} alternar={alternar}/>
    {!resultados.length&&<p>Los cálculos de Herramientas aparecerán aquí y se guardarán en el documento.</p>}
    {[...resultados].reverse().map((v,i)=><details key={v.id} open={i===0}><summary>{v.nombre}</summary><dl>{Object.entries(v.campos).map(([k,t])=><div key={k}><dt>{k}</dt><dd><code>{t}</code></dd></div>)}</dl>
      <p>{v.r.metodo}</p>{v.r.tex&&<Formula tex={[v.r.tex]}/>}{v.r.filas&&<Lecturas filas={v.r.filas}/>}
      {v.r.fuente&&!v.r.tex&&<pre>{v.r.fuente}</pre>}
      <div className="fila-botones"><button onClick={()=>navigator.clipboard?.writeText(v.r.tex||v.r.fuente||v.r.filas?.map(r=>r.join('\t')).join('\n')||'')}>Copiar</button>{v.r.fuente&&<button onClick={()=>abrirCAS(v.r.fuente!)}>Abrir en CAS</button>}<button onClick={()=>borrar(v.id)}>Eliminar resultado</button></div>
    </details>)}
  </section>
}
