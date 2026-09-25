import { useEffect, useState } from 'react'
import { ejecutarObjetos, ponerPropiedades, propiedades, type ObjetoEditable } from './objetos'
import { CabeceraPanel } from './CabeceraPanel'

export function Inspector({ objetos, seleccion, elegir, s, set, cerrar, acoplado, alternar }: {
  acoplado:boolean; alternar:()=>void
  objetos: ObjetoEditable[]; seleccion: string[]; elegir: (ids: string[]) => void; s: any; set: (p: any) => void; cerrar: () => void
}) {
  const activa = objetos.find(c => seleccion.includes(c.id))
  const p = activa ? propiedades(s, activa.id) : {}
  const [error, setError] = useState('')
  const [fuente, setFuente] = useState(activa?.fuente ?? '')
  const [nombre, setNombre] = useState(activa?.nombre ?? '')
  useEffect(() => { setFuente(activa?.fuente ?? ''); setNombre(activa?.nombre ?? '') }, [activa?.id, activa?.fuente, activa?.nombre])
  const editar = (p: Parameters<typeof ponerPropiedades>[2]) => set(ponerPropiedades(s, seleccion, p))
  return <section className="inspector" aria-label="Objetos y propiedades">
    <CabeceraPanel titulo="Objetos y propiedades" cerrar={cerrar} cierre="Cerrar propiedades" acoplado={acoplado} alternar={alternar}/>
    <div className="inspector-lista" role="group" aria-label="Selección de objetos">
      {objetos.length === 0 && <p>Este módulo no declara objetos editables.</p>}
      {objetos.map(c => <label key={c.id}><input type="checkbox" checked={seleccion.includes(c.id)} onChange={e => elegir(e.target.checked ? [...seleccion,c.id] : seleccion.filter(id => id !== c.id))} /><span>{c.nombre}</span></label>)}
    </div>
    {activa && <>
      <label>Nombre<input value={nombre} onChange={e => setNombre(e.target.value)} onBlur={() => editar({ nombre })} /></label>
      {activa.editar && seleccion.length === 1 && <form onSubmit={e => { e.preventDefault(); try { set(activa.editar!(s, fuente)); setError('') } catch(e) { setError(e instanceof Error ? e.message : String(e)) } }}>
        {s._derivados?.some((d:any)=>d.objeto===activa.id) && <p>Resultado vinculado. Editar su definición lo convierte en una copia independiente.</p>}
        <label>Definición<textarea aria-label="Definición" value={fuente} onChange={e => setFuente(e.target.value)} spellCheck={false} /></label><button>Aplicar definición</button>
      </form>}
      {error && <p role="alert">{error}</p>}
      {activa.estilo && <fieldset><legend>Apariencia</legend>
        <label><input type="checkbox" checked={!!p.bloqueado} onChange={e => editar({ bloqueado: e.target.checked })} />Bloquear movimiento</label>
        <label>Color<input type="color" value={p.color || '#4488cc'} onChange={e => editar({ color: e.target.value })} /></label>
        <label>Grosor<input type="number" min="0.25" max="20" step="0.25" value={p.grosor ?? 2} onChange={e => editar({ grosor: +e.target.value })} /></label>
        <label>Opacidad<input type="range" min="0" max="1" step="0.05" value={p.opacidad ?? 1} onChange={e => editar({ opacidad: +e.target.value })} /></label>
        <label><input type="checkbox" checked={!!p.discontinuo} onChange={e => editar({ discontinuo: e.target.checked })} />Discontinuo</label>
      </fieldset>}
      <div className="fila-botones">
        <button disabled={!objetos.some(c => seleccion.includes(c.id) && c.duplicar)} onClick={() => set(ejecutarObjetos(s,objetos,seleccion,'duplicar'))}>Duplicar</button>
        <button disabled={!objetos.some(c => seleccion.includes(c.id) && c.alternar)} onClick={() => set(ejecutarObjetos(s,objetos,seleccion,'aislar'))}>Aislar</button>
        <button disabled={!objetos.some(c => seleccion.includes(c.id) && c.quitar)} onClick={() => set(ejecutarObjetos(s,objetos,seleccion,'eliminar'))}>Eliminar</button>
      </div>
    </>}
  </section>
}
