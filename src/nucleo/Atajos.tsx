import { useEffect } from 'react'
import { escritorio } from './escritorio'
const mac = escritorio ? escritorio.plataforma === 'darwin' : /Mac/.test(navigator.platform)
const atajo = (s: string) => mac ? s : s.replaceAll('⌘', 'Ctrl+').replaceAll('⌥', 'Alt+').replaceAll('⇧', 'Mayús+')

/** Hoja con todos los atajos (⌘/), como la de Illustrator o Blender. */
const GRUPOS: Array<[string, Array<[string, string]>]> = [
  [
    'General',
    [
      ['⌘K', 'Buscar módulo'],
      ['Q · clic derecho', 'Edición rápida de objetos'],
      ['1–8 · Esc', 'Elegir sector del menú radial · cerrar'],
      ['F9', 'Ajustar último cálculo'],
      ['⌥ + clic derecho', 'Menú contextual nativo completo'],
      ['⇧⌘P', 'Buscar orden (cualquier entrada de los menús)'],
      ['⌘Z · ⇧⌘Z', 'Deshacer · Rehacer'],
      ['⌘S · ⇧⌘S', 'Guardar · Guardar como'],
      ['⌘E', 'Exportar PNG'],
      ['⌥⌘D', 'Comparar A y B'],
      ['⌘\\', 'Modo presentación'],
      ['⌘/', 'Esta hoja'],
    ],
  ],
  [
    'Vista',
    [
      ['X · Y · Z', 'Mirar desde ese eje'],
      ['0', 'Vista de partida'],
      ['⌘0', 'Encuadrar todo'],
      ['⌘+ · ⌘−', 'Acercar · Alejar el lienzo'],
      ['⇧⌘O', 'Perspectiva / ortográfica'],
      ["⇧⌘'", 'Ajustar a la rejilla'],
      ['Espacio', 'Reproducir · parar la animación'],
      ['Espacio + arrastrar', 'Desplazar la vista (2D y 3D)'],
      ['⇧ Espacio', 'Autogiro'],
    ],
  ],
  [
    'En el lienzo 3D',
    [
      ['Arrastrar', 'Girar la cámara (o mover un punto)'],
      ['Rueda', 'Acercar o alejar'],
      ['⌥ + arrastrar', 'Mover un punto en vertical'],
      ['Mayús + arrastrar', 'Por un eje y a pasos de la rejilla'],
      ['Doble clic', 'Punto nuevo · sobre un punto, quitarlo'],
      ['Clic en un punto', 'Seleccionarlo · Esc: soltarlo'],
      ['Supr · ⌫', 'Borrar el punto seleccionado'],
    ],
  ],
  [
    'Figuras (Aplicaciones lineales)',
    [
      ['Clic', 'Seleccionar · Esc: soltar'],
      ['⌘ + arrastrar', 'Mover la figura'],
      ['R · ⌘R', 'Girarla con el ratón'],
      ['X · Y · Z (girando)', 'Eje de giro'],
      ['Mayús (girando)', 'A pasos de 15°'],
      ['Clic · Intro · Esc', 'Vale · vale · deshacer el giro'],
    ],
  ],
]

export function HojaAtajos({ onCerrar }: { onCerrar: () => void }) {
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCerrar()
    }
    document.addEventListener('keydown', tecla)
    return () => document.removeEventListener('keydown', tecla)
  }, [onCerrar])
  return (
    <div className="velo" role="presentation" onMouseDown={onCerrar}>
      <div className="hoja-atajos" role="dialog" aria-modal="true" aria-label="Atajos de teclado" onMouseDown={(e) => e.stopPropagation()}>
        <div className="hoja-atajos-cabeza">
          <b>Atajos de teclado</b>
          <button type="button" className="cajon-cerrar" aria-label="Cerrar" onClick={onCerrar}>
            ×
          </button>
        </div>
        <div className="hoja-atajos-cuerpo">
          {GRUPOS.map(([titulo, filas]) => (
            <section key={titulo}>
              <h2>{titulo}</h2>
              <dl>
                {filas.map(([k, v]) => (
                  <div key={k + v}>
                    <dt>
                      <kbd>{atajo(k)}</kbd>
                    </dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
