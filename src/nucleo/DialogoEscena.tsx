import { useEffect, useRef, useState } from 'react'
import { compilar } from '../lib/expresion'
import type { AjustesEscena } from './escena'

type Ventana = { x: [number, number]; y: [number, number] }

/** Acepta «-2», «2,5», «2pi», «pi/2»…: el evaluador de la calculadora, sin variables. */
function numero(src: string): number | null {
  try {
    const v = compilar(src.replace(',', '.'), [])()
    return Number.isFinite(v) ? v : null
  } catch {
    return null
  }
}

const texto = (v: number) => String(Math.round(v * 1e4) / 1e4)

/** Escena ▸ Editar ejes y encuadre…: rango de cada eje, rótulos y si se mantiene el 1:1. */
export function DialogoEscena({
  ventana,
  escena,
  onAplicar,
  onCerrar,
}: {
  ventana: Ventana
  escena: AjustesEscena
  onAplicar: (p: Partial<AjustesEscena>) => void
  onCerrar: () => void
}) {
  const [campos, setCampos] = useState({
    xa: texto(ventana.x[0]),
    xb: texto(ventana.x[1]),
    ya: texto(ventana.y[0]),
    yb: texto(ventana.y[1]),
    pasoX: String(escena.pasoX), pasoY: String(escena.pasoY),
    pasoAngular: String(escena.pasoAngular), paso: String(escena.vista.paso),
    cruceX: String(escena.cruceX), cruceY: String(escena.cruceY), razon: String(escena.razon),
    fondo: escena.fondo, colorEjes: escena.colorEjes,
    rotuloX: escena.rotuloX,
    rotuloY: escena.rotuloY,
  })
  const [proporcion, setProporcion] = useState(escena.proporcion)
  const primero = useRef<HTMLInputElement>(null)
  useEffect(() => primero.current?.select(), [])

  const [xa, xb, ya, yb] = [campos.xa, campos.xb, campos.ya, campos.yb].map(numero)
  const extras = ['pasoX', 'pasoY', 'pasoAngular', 'paso', 'cruceX', 'cruceY', 'razon'] as const
  const vals = Object.fromEntries(extras.map(k => [k, numero(campos[k])]))
  const errorExtra = extras.some(k => vals[k] === null) || vals.pasoX! < 0 || vals.pasoY! < 0 || vals.paso! <= 0 || vals.razon! <= 0 || vals.pasoAngular! < 1 || vals.pasoAngular! > 180 ? 'Revisa los pasos, el ángulo (1–180°) y la proporción positiva.' : null
  const error = errorExtra ?? (
    xa === null || xb === null || ya === null || yb === null
      ? 'Algún límite no es un número'
      : xa >= xb || ya >= yb
        ? 'El mínimo tiene que ser menor que el máximo'
        : (escena.logX && xa <= 0) || (escena.logY && ya <= 0)
          ? 'Un eje logarítmico empieza en un valor positivo'
          : null)

  const aplicar = () => {
    if (error) return
    onAplicar({
      encuadre: { x: [xa!, xb!], y: [ya!, yb!] },
      rotuloX: campos.rotuloX.trim(),
      rotuloY: campos.rotuloY.trim(),
      proporcion,
      pasoX: vals.pasoX!, pasoY: vals.pasoY!, pasoAngular: vals.pasoAngular!,
      cruceX: vals.cruceX!, cruceY: vals.cruceY!, razon: vals.razon!,
      fondo: campos.fondo, colorEjes: campos.colorEjes,
      vista: { ...escena.vista, paso: vals.paso! },
    })
  }
  const campo = (clave: keyof typeof campos, etiqueta: string, ref?: React.Ref<HTMLInputElement>) => (
    <label>
      <span>{etiqueta}</span>
      <input ref={ref} value={campos[clave]} spellCheck={false} onChange={(e) => setCampos((c) => ({ ...c, [clave]: e.target.value }))} />
    </label>
  )

  return (
    <div className="velo" role="presentation" onMouseDown={onCerrar}>
      <form
        className="hoja-atajos dialogo-escena"
        role="dialog"
        aria-modal="true"
        aria-label="Ejes y encuadre"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && onCerrar()}
        onSubmit={(e) => {
          e.preventDefault()
          aplicar()
        }}
      >
        <div className="hoja-atajos-cabeza">
          <b>Ejes y encuadre</b>
          <button type="button" className="cajon-cerrar" aria-label="Cerrar" onClick={onCerrar}>
            ×
          </button>
        </div>
        <div className="dialogo-escena-cuerpo">
          <fieldset>
            <legend>Eje X</legend>
            {campo('xa', 'mín', primero)}
            {campo('xb', 'máx')}
            {campo('rotuloX', 'rótulo')}
          </fieldset>
          <fieldset>
            <legend>Eje Y</legend>
            {campo('ya', 'mín')}
            {campo('yb', 'máx')}
            {campo('rotuloY', 'rótulo')}
          </fieldset>
          <fieldset>
            <legend>Marcas y ajuste</legend>
            {campo('pasoX', 'Marcas X (0 automático)')}{campo('pasoY', 'Marcas Y (0 automático)')}
            {campo('pasoAngular', 'Ángulo de rejilla polar (°)')}{campo('paso', 'Paso de ajuste')}
            {campo('cruceX', 'Cruce X')}{campo('cruceY', 'Cruce Y')}
          </fieldset>
          <label>Proporción <select value={proporcion} onChange={e => setProporcion(e.target.value as AjustesEscena['proporcion'])}>
            <option value="uno">1:1</option><option value="libre">Libre</option><option value="personalizada">Personalizada</option>
          </select></label>
          {proporcion === 'personalizada' && campo('razon', 'Píxeles por unidad X / Y')}
          <p>La proporción fija amplía el intervalo que haga falta para encajar en el lienzo.</p>
          <label>Fondo <input type="color" value={campos.fondo || '#ffffff'} onChange={e => setCampos(c => ({ ...c, fondo: e.target.value }))} /></label>
          <label>Color de ejes <input type="color" value={campos.colorEjes || '#777777'} onChange={e => setCampos(c => ({ ...c, colorEjes: e.target.value }))} /></label>
          <button type="button" onClick={() => setCampos(c => ({ ...c, fondo: '', colorEjes: '' }))}>Usar colores del tema</button>
          <p className="dialogo-escena-nota">{error ?? 'Admite expresiones como 2pi o -pi/2. Con el rótulo vacío se usa el del módulo.'}</p>
        </div>
        <div className="dialogo-escena-pie">
          <button type="button" onClick={onCerrar}>
            Cancelar
          </button>
          <button type="submit" className="activo" disabled={!!error}>
            Aplicar
          </button>
        </div>
      </form>
    </div>
  )
}
