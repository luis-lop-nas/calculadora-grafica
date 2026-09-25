import { useEffect, useMemo, useRef, useState } from 'react'
import type { EntradaMenu } from './tipos'

/** Una orden suelta de la paleta: el camino por la barra de menús y qué hace. */
export interface OrdenPaleta {
  camino: string[]
  hacer: () => void
  /** Casillas y radios marcados. */
  activo?: boolean
}

/** Aplana entradas de menú a órdenes; lo desactivado no se ofrece. */
export function aplanar<S>(es: EntradaMenu<S>[] | undefined, camino: string[], ejecutar: (e: EntradaMenu<S>) => void): OrdenPaleta[] {
  return (es ?? []).flatMap((e) => {
    if (e.desactivado) return []
    const aqui = [...camino, e.t]
    if (e.hijos) return aplanar(e.hijos, aqui, ejecutar)
    return [{ camino: aqui, activo: e.tipo ? !!e.activo : undefined, hacer: () => ejecutar(e) }]
  })
}

const normaliza = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Buscar orden (⇧⌘P): cualquier cosa de la barra de menús escribiendo su nombre, como el F3 de Blender. */
export function PaletaOrdenes({ ordenes, onCerrar }: { ordenes: OrdenPaleta[]; onCerrar: () => void }) {
  const [q, setQ] = useState('')
  const [i, setI] = useState(0)
  const campo = useRef<HTMLInputElement>(null)

  const lista = useMemo(() => {
    const palabras = normaliza(q.trim()).split(/\s+/).filter(Boolean)
    if (!palabras.length) return ordenes
    return ordenes.filter((o) => {
      const texto = normaliza(o.camino.join(' '))
      return palabras.every((p) => texto.includes(p))
    })
  }, [q, ordenes])

  useEffect(() => campo.current?.focus(), [])
  useEffect(() => setI(0), [q])

  const elegir = (o: OrdenPaleta | undefined) => {
    if (!o) return
    o.hacer()
    onCerrar()
  }

  const teclado = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') return onCerrar()
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setI((v) => Math.min(lista.length - 1, v + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setI((v) => Math.max(0, v - 1))
    } else if (e.key === 'Enter') elegir(lista[i])
  }

  return (
    <div className="velo" role="presentation" onMouseDown={onCerrar}>
      <div className="paleta" role="dialog" aria-modal="true" aria-label="Buscar orden" onMouseDown={(e) => e.stopPropagation()}>
        <input
          ref={campo}
          aria-label="Buscar orden"
          role="combobox"
          aria-controls="lista-ordenes"
          aria-activedescendant={lista[i] ? `orden-${i}` : undefined}
          aria-expanded="true"
          value={q}
          placeholder="Escribe tangente, rejilla, ejemplo, añadir punto…"
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={teclado}
        />
        {lista.length === 0 ? (
          <div className="vacio">Ninguna orden con ese nombre en este módulo.</div>
        ) : (
          <ul id="lista-ordenes" role="listbox">
            {lista.map((o, k) => (
              <li key={o.camino.join('▸') + k} id={`orden-${k}`} role="option" aria-selected={k === i} onMouseEnter={() => setI(k)} onClick={() => elegir(o)}>
                <div>
                  <b>
                    {o.camino[o.camino.length - 1]}
                    {o.activo ? ' ✓' : ''}
                  </b>
                  <small>{o.camino.slice(0, -1).join(' ▸ ')}</small>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
