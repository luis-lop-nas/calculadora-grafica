import katex from 'katex'
import { createContext, useContext, useRef, useState, type PointerEvent as EventoPuntero, type ReactNode } from 'react'
import { aLatex, compilarSuave } from '../lib/expresion'

export function Grupo({ titulo, children }: { titulo?: string; children: ReactNode }) {
  return (
    <div className="grupo" role="group" aria-label={titulo}>
      {children}
    </div>
  )
}

/**
 * Elegir una opción entre varias. La forma la decide el número de opciones:
 * hasta tres van en fila, cuatro en dos por dos, y de cinco en adelante van en
 * un desplegable, como los ejemplos de `Atajos`.
 */
export function Segmentado<T extends string | number>({
  valor,
  opciones,
  onChange,
  columnas,
}: {
  valor: T
  opciones: Array<{ v: T; t: string }>
  onChange: (v: T) => void
  columnas?: 2 | 3
}) {
  const n = opciones.length
  if (n >= 5) {
    const i = opciones.findIndex((o) => o.v === valor)
    return (
      <select className="desplegable" value={i} onChange={(e) => onChange(opciones[+e.target.value].v)}>
        {opciones.map((o, j) => (
          <option key={String(o.v)} value={j}>
            {o.t}
          </option>
        ))}
      </select>
    )
  }
  const clase = n === 4 ? 'seg envuelve' : columnas === 3 && n === 3 ? 'seg tres' : 'seg'
  return (
    <div className={clase}>
      {opciones.map((o) => (
        <button key={String(o.v)} type="button" aria-pressed={o.v === valor} onClick={() => onChange(o.v)}>
          {o.t}
        </button>
      ))}
    </div>
  )
}

export function Rango({
  etiqueta,
  valor,
  min,
  max,
  paso = 0.01,
  formato,
  onChange,
}: {
  etiqueta: ReactNode
  valor: number
  min: number
  max: number
  paso?: number
  formato?: (v: number) => string
  onChange: (v: number) => void
}) {
  return (
    <div className="rango">
      <div className="fila">
        <label>{etiqueta}</label>
        <output>{formato ? formato(valor) : valor.toFixed(2)}</output>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={paso}
        value={valor}
        onChange={(e) => onChange(+e.target.value)}
      />
    </div>
  )
}

export function Interruptor({
  activo,
  onChange,
  children,
}: {
  activo: boolean
  onChange: (v: boolean) => void
  children: ReactNode
}) {
  return (
    <button type="button" className="tog" role="switch" aria-checked={activo} aria-pressed={activo} onClick={() => onChange(!activo)}>
      <span className="tog-texto">{children}</span>
      <span className="tog-pista" aria-hidden="true" />
    </button>
  )
}

export function Boton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className="accion" onClick={onClick}>
      {children}
    </button>
  )
}

export function Numero({
  etiqueta,
  valor,
  opciones,
  onChange,
}: {
  etiqueta: ReactNode
  valor: number
  opciones: number[]
  onChange: (v: number) => void
}) {
  return (
    <label>
      {etiqueta}
      <select value={valor} onChange={(e) => onChange(+e.target.value)}>
        {opciones.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  )
}

export function Eleccion<T extends string>({
  etiqueta,
  valor,
  opciones,
  onChange,
}: {
  etiqueta?: ReactNode
  valor: T
  opciones: Array<{ v: T; t: string }>
  onChange: (v: T) => void
}) {
  return (
    <label className="eleccion">
      {etiqueta}
      <select value={valor} onChange={(e) => onChange(e.target.value as T)}>
        {opciones.map((o) => (
          <option key={o.v} value={o.v}>
            {o.t}
          </option>
        ))}
      </select>
    </label>
  )
}

export function Formula({ tex }: { tex: string[] }) {
  const html = tex
    .map((t) => katex.renderToString(t, { displayMode: true, throwOnError: false, output: 'html' }))
    .join('')
  return <div className="formula" dangerouslySetInnerHTML={{ __html: html }} />
}

export function Enlinea({ tex }: { tex: string }) {
  return (
    <span
      dangerouslySetInnerHTML={{
        __html: katex.renderToString(tex, { displayMode: false, throwOnError: false, output: 'html' }),
      }}
    />
  )
}

export function Lecturas({ filas }: { filas: Array<[string, string]> }) {
  return (
    <dl className="lecturas">
      {filas.map(([k, v], i) => (
        <div key={i} style={{ display: 'contents' }}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Explicación plegada tras un ⓘ: está a mano sin ocupar el panel. */
export function Nota({ children }: { children: ReactNode }) {
  return (
    <details className="nota">
      <summary aria-label="Más información">i</summary>
      <p>{children}</p>
    </details>
  )
}

/** El bloque de solución (rótulo, fórmulas, lecturas); el armazón lo rellena. */
export const RanuraResultado = createContext<ReactNode>(null)

/** Dónde quiere el módulo la solución dentro de su panel (ver `resultadoEnPanel`). */
export function Resultado() {
  return <>{useContext(RanuraResultado)}</>
}

export function Muestra({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span>
      <span className="sw" style={{ background: color }} />
      {children}
    </span>
  )
}

/* ---------- entrada de números ---------- */

function bonito(v: number) {
  if (!Number.isFinite(v)) return '0'
  // 4 decimales caben en la celda; el valor guardado conserva su precisión
  return String(Math.round(v * 1e4) / 1e4)
}

/** Celda numérica: se arrastra en horizontal para cambiarla, o se pulsa para escribirla. */
function Celda({ valor, paso, onChange }: { valor: number; paso: number; onChange: (v: number) => void }) {
  const ref = useRef<HTMLInputElement>(null)
  const [texto, setTexto] = useState<string | null>(null)
  const tira = useRef<{ x: number; v: number; movido: boolean } | null>(null)

  const abajo = (e: EventoPuntero<HTMLInputElement>) => {
    if (document.activeElement === ref.current) return
    e.preventDefault()
    ref.current?.setPointerCapture(e.pointerId)
    tira.current = { x: e.clientX, v: valor, movido: false }
  }
  const mover = (e: EventoPuntero<HTMLInputElement>) => {
    const t = tira.current
    if (!t) return
    const dx = e.clientX - t.x
    if (Math.abs(dx) > 3) t.movido = true
    if (t.movido) onChange(Math.round((t.v + dx * paso) / paso) * paso)
  }
  const arriba = (e: EventoPuntero<HTMLInputElement>) => {
    const t = tira.current
    tira.current = null
    ref.current?.releasePointerCapture?.(e.pointerId)
    if (t && !t.movido) {
      ref.current?.focus()
      ref.current?.select()
    }
  }

  return (
    <div className="celda">
      <input
        ref={ref}
        type="text"
        inputMode="decimal"
        spellCheck={false}
        value={texto ?? bonito(valor)}
        title="Arrastra para cambiar el valor · pulsa para escribirlo"
        onPointerDown={abajo}
        onPointerMove={mover}
        onPointerUp={arriba}
        onPointerCancel={() => (tira.current = null)}
        onChange={(e) => {
          setTexto(e.target.value)
          const v = parseFloat(e.target.value.replace(',', '.'))
          if (Number.isFinite(v)) onChange(v)
        }}
        onBlur={() => setTexto(null)}
        onKeyDown={(e) => {
          if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
          e.preventDefault()
          const d = (e.key === 'ArrowUp' ? 1 : -1) * paso * (e.shiftKey ? 10 : 1)
          setTexto(null)
          onChange(Math.round((valor + d) / paso) * paso)
        }}
      />
    </div>
  )
}

/** La serif de los nombres no trae ₀…₉: se escriben como subíndices de verdad. */
function conSubindices(t: string) {
  return t.split(/([₀-₉]+)/).map((trozo, i) =>
    /[₀-₉]/.test(trozo) ? <sub key={i}>{[...trozo].map((c) => c.charCodeAt(0) - 0x2080).join('')}</sub> : trozo,
  )
}

/**
 * Matriz o lista de vectores. Con `filas` cada fila lleva su nombre y el color
 * con el que sale dibujada; sin `filas` se pinta entre corchetes, como una matriz.
 */
export function Matriz({
  A,
  onChange,
  paso = 0.05,
  filas,
  quitar,
}: {
  A: number[][]
  onChange: (A: number[][]) => void
  paso?: number
  filas?: Array<{ nombre: string; color?: string }>
  /** Con filas: añade una × al final de cada una. */
  quitar?: (i: number) => void
}) {
  const cambia = (i: number, j: number, v: number) => {
    const B = A.map((f) => f.slice())
    B[i][j] = v
    onChange(B)
  }
  const rejilla = (i: number) => (
    <div key={i} className="celdas" style={{ gridTemplateColumns: `repeat(${A[i].length}, 62px)` }}>
      {A[i].map((v, j) => (
        <Celda key={j} valor={v} paso={paso} onChange={(x) => cambia(i, j, x)} />
      ))}
    </div>
  )

  if (filas) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {A.map((_, i) => (
          <div className="vector" key={i}>
            <span className="nombre">
              {filas[i].color && <span className="punto" style={{ background: filas[i].color }} />}
              <span>{conSubindices(filas[i].nombre)}</span>
            </span>
            {rejilla(i)}
            {quitar && (
              <button type="button" className="quitar-fila" title="Quitar" aria-label={`Quitar ${filas[i].nombre}`} onClick={() => quitar(i)}>
                ×
              </button>
            )}
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="matriz-marco">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>{A.map((_, i) => rejilla(i))}</div>
    </div>
  )
}

/* ---------- entrada de expresiones ---------- */

const PIEZAS_POR_DEFECTO = ['sin(', 'cos(', 'exp(', 'sqrt(', 'ln(', '^', 'pi', '(', ')']

/** Barra de fórmula: lo que escribes se compone debajo mientras lo escribes. */
export function Expresion({
  etiqueta,
  valor,
  variables,
  onChange,
  piezas = PIEZAS_POR_DEFECTO,
  comprobar,
  previa,
}: {
  etiqueta: ReactNode
  valor: string
  variables: string[]
  onChange: (v: string) => void
  piezas?: string[]
  /** Validación propia: para lo que no es una expresión suelta, como una ecuación. */
  comprobar?: (v: string) => string | null
  /** LaTeX propio de la vista previa. */
  previa?: (v: string) => string | null
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [activo, setActivo] = useState(false)
  // un campo vacío no es un error: es una función que no se dibuja
  const vacio = valor.trim() === ''
  const error = vacio ? null : comprobar ? comprobar(valor) : compilarSuave(valor, variables).error
  const tex = vacio ? null : previa ? previa(valor) : aLatex(valor)

  const insertar = (t: string) => {
    const el = ref.current
    const i = el?.selectionStart ?? valor.length
    const j = el?.selectionEnd ?? i
    onChange(valor.slice(0, i) + t + valor.slice(j))
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(i + t.length, i + t.length)
    })
  }

  return (
    <div className="formulaentrada">
      <div className={`linea${error ? ' mal' : ''}`}>
        <span className="prefijo">{etiqueta}</span>
        <input
          ref={ref}
          type="text"
          spellCheck={false}
          autoComplete="off"
          value={valor}
          onFocus={() => setActivo(true)}
          onBlur={() => setActivo(false)}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
      {tex && !error && (
        <div
          className="vista-previa"
          dangerouslySetInnerHTML={{
            __html: katex.renderToString(tex, { displayMode: false, throwOnError: false, output: 'html' }),
          }}
        />
      )}
      {error && <span className="aviso">{error}</span>}
      {activo && (
        <div className="piezas">
          {[...variables, ...piezas].map((t) => (
            <button
              key={t}
              type="button"
              onMouseDown={(ev) => ev.preventDefault()}
              onClick={() => insertar(t)}
            >
              {t}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Ejemplos y presets: con dos o más, un desplegable; muestra el que está puesto
 * o, si no coincide ninguno, «Personalizado». Una sola opción es una acción y va
 * como tal. Si ninguna opción dice si está activa (ejemplos que se añaden, no que
 * se ponen), el desplegable vuelve a «Ejemplos…» tras elegir.
 */
export function Atajos({
  opciones,
  marcador,
}: {
  opciones: Array<{ t: string; activo?: boolean; onClick: () => void }>
  /** Texto cuando no hay ninguna activa. */
  marcador?: string
}) {
  if (opciones.length === 0) return null
  if (opciones.length === 1) {
    const o = opciones[0]
    return (
      <button type="button" className="accion" onClick={o.onClick}>
        {o.t}
      </button>
    )
  }
  const conEstado = opciones.some((o) => o.activo !== undefined)
  const i = opciones.findIndex((o) => o.activo)
  return (
    <select
      className="desplegable"
      value={i}
      onChange={(e) => {
        const j = +e.target.value
        if (j >= 0) opciones[j].onClick()
      }}
    >
      <option value={-1} disabled hidden>
        {marcador ?? (conEstado ? 'Personalizado' : 'Ejemplos…')}
      </option>
      {opciones.map((o, j) => (
        <option key={o.t} value={j}>
          {o.t}
        </option>
      ))}
    </select>
  )
}
