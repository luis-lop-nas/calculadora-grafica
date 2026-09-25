/**
 * Barra de editor al pie del lienzo, al estilo del editor de niveles de Geometry Dash:
 * a la izquierda los modos (Construir, Editar, Borrar); en el centro, en Construir,
 * las pestañas de categorías con su rejilla de objetos, y en Editar, el objeto
 * seleccionado con sus valores y los botones para moverlo, duplicarlo o quitarlo.
 *
 * El módulo guarda el modo y el «pincel» (el objeto elegido para colocar) en su
 * estado, porque el clic en el lienzo (`alPulsar`) necesita saberlos.
 */
import { useEffect, type ReactNode } from 'react'

export type ModoEditor = 'construir' | 'editar' | 'borrar'

/** Estado mínimo que un módulo con editor guarda. */
export interface EstadoEditor {
  modo: ModoEditor
  /** Objeto que se coloca con cada clic en Construir. */
  pincel: string | null
  /** Pestaña de categoría abierta. */
  categoria: string
  /** Barra desplegada o recogida. */
  barra: boolean
  /** Rejilla al colocar y con las flechas (0 = libre, al centímetro). */
  paso?: number
}

export const EDITOR_INICIAL: EstadoEditor = { modo: 'editar', pincel: null, categoria: '', barra: true, paso: 0.5 }

/** Paso efectivo de la rejilla. */
export const pasoRejilla = (ed: EstadoEditor) => (ed.paso === undefined ? 0.5 : ed.paso || 0.01)

export interface ObjetoCatalogo {
  id: string
  nombre: string
  /** Trazos del icono en una caja de 32×32 (atributo `d` de un path). */
  icono: string
  /** Color del trazo (variable CSS); por defecto, la tinta. */
  color?: string
}

export interface Categoria {
  id: string
  nombre: string
  objetos: ObjetoCatalogo[]
}

/** Un valor editable del objeto seleccionado. */
export type CampoEditor =
  | { tipo?: 'numero'; etiqueta: string; valor: number; paso: number; min?: number; max?: number; unidad?: string; decimales?: number; onChange: (v: number) => void }
  | { tipo: 'opciones'; etiqueta: string; valor: string; opciones: Array<{ v: string; t: string }>; onChange: (v: string) => void }
  | { tipo: 'si-no'; etiqueta: string; valor: boolean; onChange: (v: boolean) => void }

export interface Seleccion {
  nombre: string
  /** Variable CSS del color de la muestra. */
  color?: string
  campos: CampoEditor[]
  /** Mover a pasos: dx, dy en unidades del mundo; sin `mover` no salen las flechas. */
  mover?: (dx: number, dy: number) => void
  /** Paso de las flechas (Mayús: ×10). */
  paso?: number
  duplicar?: () => void
  voltear?: () => void
  quitar: () => void
  soltar: () => void
}

/* ---------------------------------------------------------------- iconos */

/** Circunferencia como trozo de `d`. */
export const circ = (cx: number, cy: number, r: number) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`
/** Rectángulo como trozo de `d`. */
export const caja = (x: number, y: number, w: number, h: number) => `M${x} ${y}h${w}v${h}h${-w}Z`

function Icono({ d, color, tam = 28 }: { d: string; color?: string; tam?: number }) {
  return (
    <svg width={tam} height={tam} viewBox="0 0 32 32" aria-hidden="true">
      <path d={d} fill="none" stroke={color ? `var(${color})` : 'currentColor'} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

const ICONO_MODO: Record<ModoEditor, string> = {
  construir: 'M16 7v18M7 16h18',
  editar: 'M9 23l2-6 10-10 4 4-10 10-6 2zM19 9l4 4',
  borrar: 'M8 10h16M13 10V7h6v3M10 10l1 15h10l1-15',
}
const NOMBRE_MODO: Record<ModoEditor, string> = { construir: 'Construir', editar: 'Editar', borrar: 'Borrar' }

/* ---------------------------------------------------------------- campos */

const fmt = (v: number, d: number) => (Math.abs(v) < 10 ** -(d + 1) ? 0 : v).toFixed(d)

function CampoNumero({ c }: { c: Extract<CampoEditor, { tipo?: 'numero' }> }) {
  const d = c.decimales ?? (c.paso >= 1 ? 0 : c.paso >= 0.1 ? 1 : 2)
  const acota = (v: number) => Math.min(c.max ?? Infinity, Math.max(c.min ?? -Infinity, +v.toFixed(6)))
  return (
    <label className="ed-campo">
      <span>{c.etiqueta}</span>
      <span className="ed-num">
        <button type="button" aria-label={`Bajar ${c.etiqueta}`} onClick={() => c.onChange(acota(c.valor - c.paso))}>
          −
        </button>
        <input
          type="number"
          step={c.paso}
          min={c.min}
          max={c.max}
          value={fmt(c.valor, d)}
          onChange={(e) => {
            const v = parseFloat(e.target.value.replace(',', '.'))
            if (Number.isFinite(v)) c.onChange(acota(v))
          }}
        />
        <button type="button" aria-label={`Subir ${c.etiqueta}`} onClick={() => c.onChange(acota(c.valor + c.paso))}>
          +
        </button>
        {c.unidad && <em>{c.unidad}</em>}
      </span>
    </label>
  )
}

function Campo({ c }: { c: CampoEditor }) {
  if (c.tipo === 'opciones')
    return (
      <label className="ed-campo">
        <span>{c.etiqueta}</span>
        <select value={c.valor} onChange={(e) => c.onChange(e.target.value)}>
          {c.opciones.map((o) => (
            <option key={o.v} value={o.v}>
              {o.t}
            </option>
          ))}
        </select>
      </label>
    )
  if (c.tipo === 'si-no')
    return (
      <label className="ed-campo">
        <span>{c.etiqueta}</span>
        <button type="button" className="ed-boton" aria-pressed={c.valor} onClick={() => c.onChange(!c.valor)}>
          {c.valor ? 'Sí' : 'No'}
        </button>
      </label>
    )
  return <CampoNumero c={c} />
}

/* ---------------------------------------------------------------- la barra */

const escribiendo = (ev: KeyboardEvent) => {
  const el = ev.target as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)
}

export function BarraEditor({
  ed,
  set,
  categorias,
  seleccion,
  extra,
}: {
  ed: EstadoEditor
  set: (p: Partial<EstadoEditor>) => void
  categorias: Categoria[]
  seleccion: Seleccion | null
  /** Botones propios del módulo a la derecha (vaciar, reproducir…). */
  extra?: ReactNode
}) {
  const cat = categorias.find((c) => c.id === ed.categoria) ?? categorias[0]

  // teclado: flechas mueven, Supr quita, ⌘D duplica, Esc suelta; 1/2/3 cambian de modo
  useEffect(() => {
    const tecla = (ev: KeyboardEvent) => {
      if (escribiendo(ev) || ev.altKey) return
      const cmd = ev.metaKey || ev.ctrlKey
      if (!cmd && (ev.key === '1' || ev.key === '2' || ev.key === '3')) {
        set({ modo: (['construir', 'editar', 'borrar'] as const)[+ev.key - 1] })
        return
      }
      if (ev.key === 'Escape' && (seleccion || ed.pincel)) {
        if (ed.pincel) set({ pincel: null })
        seleccion?.soltar()
        return
      }
      if (!seleccion) return
      if (cmd && ev.key.toLowerCase() === 'd' && seleccion.duplicar) {
        ev.preventDefault()
        seleccion.duplicar()
        return
      }
      if (cmd) return
      if ((ev.key === 'Delete' || ev.key === 'Backspace') && ed.modo === 'editar') {
        ev.preventDefault()
        seleccion.quitar()
        return
      }
      const flechas: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }
      const f = flechas[ev.key]
      if (f && seleccion.mover) {
        ev.preventDefault()
        const k = (seleccion.paso ?? 0.5) * (ev.shiftKey ? 10 : 1)
        seleccion.mover(f[0] * k, f[1] * k)
      }
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [ed, seleccion, set])

  if (!ed.barra)
    return (
      <div className="editor recogido">
        <button type="button" className="ed-boton" onClick={() => set({ barra: true })} title="Abrir el editor">
          <Icono d={ICONO_MODO[ed.modo]} tam={18} /> Editor ▴
        </button>
      </div>
    )

  return (
    <div className="editor" role="toolbar" aria-label="Editor del escenario">
      <div className="ed-modos">
        {(['construir', 'editar', 'borrar'] as const).map((m, i) => (
          <button key={m} type="button" aria-pressed={ed.modo === m} title={`${NOMBRE_MODO[m]} (${i + 1})`} onClick={() => set({ modo: m })}>
            <Icono d={ICONO_MODO[m]} tam={20} />
            <span>{NOMBRE_MODO[m]}</span>
          </button>
        ))}
      </div>

      <div className="ed-centro">
        {ed.modo === 'construir' && (
          <>
            <div className="ed-pestanas" role="tablist">
              {categorias.map((c) => (
                <button key={c.id} type="button" role="tab" aria-selected={c.id === cat.id} onClick={() => set({ categoria: c.id })}>
                  {c.nombre}
                </button>
              ))}
            </div>
            <div className="ed-rejilla">
              {cat.objetos.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  className="ed-objeto"
                  aria-pressed={ed.pincel === o.id}
                  title={`${o.nombre}: clic en el lienzo para colocarlo`}
                  onClick={() => set({ pincel: ed.pincel === o.id ? null : o.id })}
                >
                  <Icono d={o.icono} color={o.color} />
                  <span>{o.nombre}</span>
                </button>
              ))}
            </div>
            <p className="ed-pista">{ed.pincel ? 'Clic en el lienzo: colocar (se queda elegido para poner más). Esc: soltar.' : 'Elige un objeto y haz clic en el lienzo.'}</p>
          </>
        )}
        {ed.modo === 'editar' &&
          (seleccion ? (
            <>
              <div className="ed-titulo">
                {seleccion.color && <span className="sw" style={{ background: `var(${seleccion.color})` }} />}
                <b>{seleccion.nombre}</b>
                <span className="ed-acciones">
                  {seleccion.mover && (
                    <span className="ed-flechas" title="Mover (flechas; Mayús: ×10)">
                      <button type="button" aria-label="Mover a la izquierda" onClick={() => seleccion.mover!(-(seleccion.paso ?? 0.5), 0)}>
                        ←
                      </button>
                      <button type="button" aria-label="Mover abajo" onClick={() => seleccion.mover!(0, -(seleccion.paso ?? 0.5))}>
                        ↓
                      </button>
                      <button type="button" aria-label="Mover arriba" onClick={() => seleccion.mover!(0, seleccion.paso ?? 0.5)}>
                        ↑
                      </button>
                      <button type="button" aria-label="Mover a la derecha" onClick={() => seleccion.mover!(seleccion.paso ?? 0.5, 0)}>
                        →
                      </button>
                    </span>
                  )}
                  {seleccion.voltear && (
                    <button type="button" className="ed-boton" onClick={seleccion.voltear} title="Voltear en horizontal">
                      ⇋ Voltear
                    </button>
                  )}
                  {seleccion.duplicar && (
                    <button type="button" className="ed-boton" onClick={seleccion.duplicar} title="Duplicar (⌘D)">
                      ⧉ Duplicar
                    </button>
                  )}
                  <button type="button" className="ed-boton peligro" onClick={seleccion.quitar} title="Quitar (Supr)">
                    Quitar
                  </button>
                  <button type="button" className="ed-boton" onClick={seleccion.soltar} title="Soltar (Esc)">
                    ✕
                  </button>
                </span>
              </div>
              <div className="ed-campos">
                {seleccion.campos.map((c) => (
                  <Campo key={c.etiqueta} c={c} />
                ))}
              </div>
            </>
          ) : (
            <p className="ed-pista">Clic en un objeto del lienzo para editar sus valores. Arrastra sus asas para moverlo o cambiarle el tamaño.</p>
          ))}
        {ed.modo === 'borrar' && <p className="ed-pista">Clic en un objeto del lienzo para quitarlo, o arrastra por encima de varios para quitarlos de un trazo. ⌘Z los devuelve.</p>}
      </div>

      <div className="ed-extra">
        {extra}
        <select className="ed-rejilla-paso" value={ed.paso ?? 0.5} title="Rejilla: al colocar y con las flechas" onChange={(e) => set({ paso: +e.target.value })}>
          {[0, 0.1, 0.5, 1].map((k) => (
            <option key={k} value={k}>
              {k === 0 ? 'Libre' : `▦ ${String(k).replace('.', ',')}`}
            </option>
          ))}
        </select>
        <button type="button" className="ed-boton" onClick={() => set({ barra: false })} title="Recoger el editor">
          ▾
        </button>
      </div>
    </div>
  )
}
