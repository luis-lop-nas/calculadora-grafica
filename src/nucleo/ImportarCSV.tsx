import { useState } from 'react'
import { leerCSV } from './archivos'
import { numeroHerramienta } from '../lib/herramientas'

export function ImportarCSV({onCerrar,onImportar}:{onCerrar:()=>void;onImportar:(puntos:Array<[number,number]>)=>void}) {
  const [texto,setTexto]=useState(''),[separador,setSeparador]=useState(','),[cabecera,setCabecera]=useState(true)
  const [x,setX]=useState(0),[y,setY]=useState(1),[error,setError]=useState('')
  let filas:string[][]=[];let fallo=''
  try {filas=leerCSV(texto,separador)} catch(e){fallo=String(e)}
  const columnas=filas[0]?.length??0
  return <div className="velo" onMouseDown={onCerrar}><form className="hoja-atajos dialogo-herramienta" role="dialog" aria-label="Importar datos CSV" aria-modal="true" onMouseDown={e=>e.stopPropagation()} onKeyDown={e=>{if(e.key==='Escape')onCerrar()}} onSubmit={e=>{
    e.preventDefault();try {
      if(fallo)throw new Error(fallo)
      const datos=filas.slice(cabecera?1:0)
      if(!datos.length||datos.length>1000)throw new Error('Introduce entre 1 y 1000 puntos')
      const puntos=datos.map((r,i):[number,number]=>{try {return [numeroHerramienta(r[x]??''),numeroHerramienta(r[y]??'')]}catch{throw new Error(`Valores no válidos en la fila ${i+1+(cabecera?1:0)}`)}})
      onImportar(puntos)
    } catch(e){setError(e instanceof Error?e.message:String(e))}
  }}><div className="hoja-atajos-cabeza"><b>Importar datos en Gráficas</b><button type="button" onClick={onCerrar}>×</button></div>
    <div className="dialogo-herramienta-cuerpo">
      <input aria-label="Archivo CSV" type="file" accept=".csv,.tsv,text/csv,text/tab-separated-values" onChange={async e=>{const f=e.target.files?.[0];if(!f)return;if(f.size>5_000_000){setError('Archivo demasiado grande (máximo 5 MB)');return}setTexto(await f.text());setError('')}} />
      <label>Separador<select value={separador} onChange={e=>setSeparador(e.target.value)}><option value=",">Coma</option><option value=";">Punto y coma</option><option value={'\t'}>Tabulador</option></select></label>
      <label><input type="checkbox" checked={cabecera} onChange={e=>setCabecera(e.target.checked)} />Primera fila con nombres</label>
      {(['X','Y'] as const).map((t,i)=><label key={t}>Columna {t}<select value={i?y:x} onChange={e=>(i?setY:setX)(+e.target.value)}>{Array.from({length:columnas},(_,k)=><option key={k} value={k}>{cabecera?filas[0][k]:k+1}</option>)}</select></label>)}
      <table><tbody>{filas.slice(0,6).map((r,i)=><tr key={i}>{r.map((c,j)=><td key={j}>{c}</td>)}</tr>)}</tbody></table>
      {(error||fallo)&&<p role="alert">{error||fallo}</p>}<button type="submit" disabled={!filas.length||!!fallo}>Añadir puntos a Gráficas</button>
    </div>
  </form></div>
}
