import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AREAS, AREAS_CORTAS, type Area, type ModuloAny } from './tipos'

const ORDEN: Area[] = ['funciones', 'geometria', 'cuantica', 'edp', 'edo', 'campos', 'algebra', 'senales', 'mecanica', 'fisica', 'estadistica', 'numerico']

export function Navegacion({
  modulos,
  id,
  onElegir,
  acciones,
}: {
  modulos: ModuloAny[]
  id: string
  onElegir: (id: string) => void
  acciones?: ReactNode
}) {
  const [paleta, setPaleta] = useState(false)
  const activo = modulos.find((m) => m.id === id)!
  const porArea = useMemo(() => {
    const g = new Map<Area, ModuloAny[]>()
    for (const m of modulos) g.set(m.area, [...(g.get(m.area) ?? []), m])
    return g
  }, [modulos])
  const hermanos = porArea.get(activo.area) ?? []

  useEffect(() => {
    const atajo = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaleta((v) => !v)
      }
    }
    document.addEventListener('keydown', atajo)
    return () => document.removeEventListener('keydown', atajo)
  }, [])

  return (
    <>
      <header className="navegacion">
        <div className="barra">
          <div className="marca-menu" aria-hidden="true">Calculadora</div>
          <div className="areas" role="tablist" aria-label="Ámbitos matemáticos">
          {ORDEN.filter((a) => porArea.has(a)).map((a) => (
            <button
              key={a}
              type="button"
              role="tab"
              aria-selected={a === activo.area}
              title={AREAS[a]}
              onClick={() => {
                if (a !== activo.area) onElegir(porArea.get(a)![0].id)
              }}
            >
              {AREAS_CORTAS[a]}
            </button>
          ))}
          </div>
          <div className="navegacion-relleno" />
          <button type="button" className="buscar" onClick={() => setPaleta(true)} aria-label="Buscar módulo">
            <span className="buscar-icono" aria-hidden="true">⌕</span>
            <span className="buscar-texto">Buscar módulo</span>
            <kbd>⌘K</kbd>
          </button>
          {acciones}
        </div>

        <nav className="modulos" aria-label={`Herramientas de ${AREAS_CORTAS[activo.area]}`}>
          <div className="modulos-lista">
            {hermanos.map((m) => (
              <button key={m.id} type="button" aria-current={m.id === id} onClick={() => onElegir(m.id)}>
                {m.corto ?? m.resumen}
              </button>
            ))}
          </div>
        </nav>
      </header>

      {paleta && (
        <Paleta
          modulos={modulos}
          id={id}
          onCerrar={() => setPaleta(false)}
          onElegir={(x) => {
            onElegir(x)
            setPaleta(false)
          }}
        />
      )}
    </>
  )
}

function normaliza(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

function Paleta({
  modulos,
  id,
  onElegir,
  onCerrar,
}: {
  modulos: ModuloAny[]
  id: string
  onElegir: (id: string) => void
  onCerrar: () => void
}) {
  const [q, setQ] = useState('')
  const [i, setI] = useState(0)
  const campo = useRef<HTMLInputElement>(null)

  const lista = useMemo(() => {
    const t = normaliza(q.trim())
    if (!t) return modulos
    return modulos.filter((m) =>
      normaliza(`${m.resumen} ${m.entradilla} ${AREAS[m.area]}`).includes(t),
    )
  }, [q, modulos])

  useEffect(() => {
    campo.current?.focus()
  }, [])
  useEffect(() => {
    setI(0)
  }, [q])

  const teclado = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') return onCerrar()
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setI((v) => Math.min(lista.length - 1, v + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setI((v) => Math.max(0, v - 1))
    } else if (e.key === 'Enter' && lista[i]) {
      onElegir(lista[i].id)
    }
  }

  return (
    <div className="velo" role="presentation" onMouseDown={onCerrar}>
      <div className="paleta" role="dialog" aria-modal="true" aria-label="Buscar módulo" onMouseDown={(e) => e.stopPropagation()}>
        <input
          ref={campo}
          aria-label="Buscar módulo"
          role="combobox"
          aria-controls="lista-modulos"
          aria-activedescendant={lista[i] ? `modulo-${lista[i].id}` : undefined}
          aria-expanded="true"
          value={q}
          placeholder="Escribe onda, fase, orbital, anillo…"
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={teclado}
        />
        {lista.length === 0 ? (
          <div className="vacio">Nada con ese nombre. Prueba con el tema: calor, Bessel, autovectores.</div>
        ) : (
          <ul id="lista-modulos" role="listbox">
            {lista.map((m, k) => (
              <li
                key={m.id}
                id={`modulo-${m.id}`}
                role="option"
                aria-selected={k === i}
                onMouseEnter={() => setI(k)}
                onClick={() => onElegir(m.id)}
              >
                <div>
                  <b>{m.resumen}</b>
                  <small>{m.entradilla}</small>
                </div>
                <span>
                  {AREAS_CORTAS[m.area]}
                  {m.id === id ? ' · abierto' : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
