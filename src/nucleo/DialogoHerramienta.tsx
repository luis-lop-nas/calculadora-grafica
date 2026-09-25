import { useState } from 'react'
import { calcularHerramienta, numeroFuente, type Herramienta, type ResultadoHerramienta } from '../lib/herramientas'
import { Formula } from './controles'

export function DialogoHerramienta({ herramienta, fuente, iniciales, onCerrar, onInsertar, onInsertarLista, onResultado }: {
  herramienta: Herramienta; fuente?: string; iniciales?: Record<string,string>; onCerrar: () => void;
  onInsertar?: (fuente: string) => void; onResultado: (r: ResultadoHerramienta, campos: Record<string,string>) => void
  onInsertarLista?: (fuentes:string[]) => void
}) {
  const [campos, setCampos] = useState<Record<string,string>>(() => Object.fromEntries(herramienta.campos.map(c => [c.id,iniciales?.[c.id] ?? (c.id==='f' && fuente ? fuente.replace(/^\s*(?:[a-z]\(x\)|y)\s*:?=\s*/i,'') : c.inicial)])))
  const [resultado,setResultado] = useState<ResultadoHerramienta|null>(null)
  const [error,setError] = useState('')
  return <div className="velo" onMouseDown={onCerrar}>
    <form className="hoja-atajos dialogo-herramienta" role="dialog" aria-modal="true" aria-label={herramienta.nombre} onMouseDown={e=>e.stopPropagation()} onKeyDown={e=>{if(e.key==='Escape')onCerrar()}} onSubmit={e=>{
      e.preventDefault()
      try { const r=calcularHerramienta(herramienta.id,campos);setResultado(r);setError('');onResultado(r,campos) } catch(e) {setResultado(null);setError(e instanceof Error ? e.message : String(e))}
    }}>
      <div className="hoja-atajos-cabeza"><b>{herramienta.nombre}</b><button type="button" onClick={onCerrar} aria-label="Cerrar herramienta">×</button></div>
      <div className="dialogo-herramienta-cuerpo">
        {herramienta.ayuda && <p>{herramienta.ayuda}</p>}
        {herramienta.campos.map((c,i)=><label key={c.id}>{c.texto}{c.opciones ? <select aria-label={c.texto} value={campos[c.id]} onChange={e=>{setCampos(v=>({...v,[c.id]:e.target.value}));setResultado(null)}}>{c.opciones.map(o=><option key={o}>{o}</option>)}</select> : <textarea aria-label={c.texto} autoFocus={i===0} rows={c.id==='datos'||c.id==='matriz'?4:1} spellCheck={false} value={campos[c.id]} onChange={e=>{setCampos(v=>({...v,[c.id]:e.target.value}));setResultado(null)}} />}</label>)}
        <button type="submit">Calcular</button>
        {error && <p role="alert">{error}</p>}
        {resultado && <section aria-label="Resultado de la herramienta"><p>{resultado.metodo}</p>
          {resultado.tex && <Formula tex={[resultado.tex]} />}
          {resultado.filas && <table><tbody>{resultado.filas.map(([a,b],i)=><tr key={i}><th>{a}</th><td>{b}</td></tr>)}</tbody></table>}
          {resultado.fuente && !resultado.tex && <pre>{resultado.fuente}</pre>}
          <div className="fila-botones"><button type="button" onClick={()=>navigator.clipboard?.writeText(resultado.tex || resultado.fuente || resultado.filas?.map(r=>r.join('\t')).join('\n') || '')}>Copiar resultado</button>
          {resultado.fuente && onInsertar && <button type="button" onClick={()=>onInsertar(resultado.fuente!)}>Añadir resultado como objeto</button>}
          {resultado.fuentes && onInsertarLista && <button type="button" onClick={()=>onInsertarLista(resultado.fuentes!)}>Añadir familia de objetos</button>}
          {resultado.puntos && onInsertarLista && <button type="button" onClick={()=>onInsertarLista(resultado.puntos!.filter(p=>p.every(Number.isFinite)).map(([x,y])=>`(${numeroFuente(x)},${numeroFuente(y)})`))}>Añadir puntos de la tabla</button>}</div>
        </section>}
      </div>
    </form>
  </div>
}
