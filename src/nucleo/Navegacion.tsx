import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AREAS, AREAS_CORTAS, type Area, type ModuloAny } from './tipos'

/** De la más potente a la más concreta; el menú de la app sigue el orden de `MODULOS`, que va igual. */
const ORDEN: Area[] = ['algebra', 'geometria', 'funciones', 'edo', 'edp', 'campos', 'senales', 'mecanica', 'fisica', 'cuantica', 'estadistica', 'numerico']

export function Navegacion({
  modulos,
  id,
  onElegir,
  acciones,
  exportar,
}: {
  modulos: ModuloAny[]
  id: string
  onElegir: (id: string) => void
  acciones?: ReactNode
  /** Botones que van al final del menú ☰, en «Exportar». */
  exportar?: ReactNode
}) {
  const [paleta, setPaleta] = useState(false)
  const [menu, setMenu] = useState(false)
  const activo = modulos.find((m) => m.id === id)!
  const porArea = useMemo(() => {
    const g = new Map<Area, ModuloAny[]>()
    for (const m of modulos) g.set(m.area, [...(g.get(m.area) ?? []), m])
    return g
  }, [modulos])

  useEffect(() => {
    const atajo = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setMenu(false)
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
          <button type="button" className="hamburguesa" aria-label="Menú de secciones" aria-expanded={menu} onClick={() => setMenu(true)}>
            <span aria-hidden="true" />
          </button>
          <button type="button" className="ruta" title="Todas las secciones" onClick={() => setMenu(true)}>
            <span className="ruta-area">{AREAS_CORTAS[activo.area]}</span>
            <span className="ruta-sep" aria-hidden="true">›</span>
            <span className="ruta-modulo">{activo.corto ?? activo.resumen}</span>
          </button>
          <div className="navegacion-relleno" />
          <button type="button" className="buscar" onClick={() => setPaleta(true)} aria-label="Buscar módulo">
            <span className="buscar-icono" aria-hidden="true">⌕</span>
            <span className="buscar-texto">Buscar módulo</span>
            <kbd>⌘K</kbd>
          </button>
          {acciones}
        </div>
      </header>

      {menu && (
        <Cajon
          areas={ORDEN.filter((a) => porArea.has(a)).map((a) => [a, porArea.get(a)!] as const)}
          id={id}
          exportar={exportar}
          onCerrar={() => setMenu(false)}
          onElegir={(x) => {
            onElegir(x)
            setMenu(false)
          }}
        />
      )}

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

/** Menú ☰: todas las áreas con sus módulos, en panel lateral; Esc o clic fuera lo cierra. */
function Cajon({
  areas,
  id,
  exportar,
  onElegir,
  onCerrar,
}: {
  areas: ReadonlyArray<readonly [Area, ModuloAny[]]>
  id: string
  exportar?: ReactNode
  onElegir: (id: string) => void
  onCerrar: () => void
}) {
  const caja = useRef<HTMLElement>(null)
  useEffect(() => {
    const previo = document.activeElement as HTMLElement | null
    const actual = caja.current?.querySelector<HTMLButtonElement>('[aria-current="true"]')
    actual?.scrollIntoView({ block: 'center' })
    actual?.focus()
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCerrar()
    }
    document.addEventListener('keydown', tecla)
    return () => {
      document.removeEventListener('keydown', tecla)
      previo?.focus?.()
    }
  }, [])

  return (
    <div className="velo-cajon" role="presentation" onMouseDown={onCerrar}>
      <nav ref={caja} className="cajon" aria-label="Secciones" onMouseDown={(e) => e.stopPropagation()}>
        <div className="cajon-cabeza">
          <b>Calculadora</b>
          <button type="button" className="cajon-cerrar" aria-label="Cerrar menú" onClick={onCerrar}>
            ×
          </button>
        </div>
        <div className="cajon-lista">
          {areas.map(([a, mods]) => (
            <section key={a}>
              <h2 title={AREAS[a]}>{AREAS_CORTAS[a]}</h2>
              <ul>
                {mods.map((m) => (
                  <li key={m.id}>
                    <button type="button" aria-current={m.id === id} title={m.resumen} onClick={() => onElegir(m.id)}>
                      {m.corto ?? m.resumen}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        {exportar && (
          <div
            className="cajon-pie"
            onClick={(e) => {
              if ((e.target as HTMLElement).closest('button')) onCerrar()
            }}
          >
            <h2>Exportar</h2>
            {exportar}
          </div>
        )}
      </nav>
    </div>
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
