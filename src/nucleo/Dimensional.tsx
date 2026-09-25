import katex from 'katex'
import { texto, unidadSI, type Dimensional } from '../lib/dimensiones'

const K = ({ t }: { t: string }) => <span dangerouslySetInnerHTML={{ __html: katex.renderToString(t, { throwOnError: false, output: 'html' }) }} />

/**
 * La vista de análisis dimensional: cada magnitud con su dimensión y su unidad SI, y cada
 * ecuación del módulo con la dimensión de todos sus términos y si es homogénea.
 */
export function AnalisisDimensional({ d }: { d: Dimensional }) {
  const buenas = d.ecuaciones.filter((e) => e.dim).length
  return (
    <details className="dimensional">
      <summary>
        Análisis dimensional
        {d.ecuaciones.length > 0 && (
          <span className={buenas === d.ecuaciones.length ? 'dim-ok' : 'dim-mal'}>
            {buenas}/{d.ecuaciones.length} homogéneas
          </span>
        )}
      </summary>
      {d.nota && <p className="dim-nota">{d.nota}</p>}
      <table className="dim-tabla">
        <thead>
          <tr>
            <th>magnitud</th>
            <th>dimensión</th>
            <th>SI</th>
            {d.magnitudes.some((m) => m.valor) && <th>valor</th>}
          </tr>
        </thead>
        <tbody>
          {d.magnitudes.map((m, i) => (
            <tr key={i}>
              <td>
                <K t={m.simbolo} /> <span className="dim-nombre">{m.nombre}</span>
              </td>
              <td className="dim-dim">{texto(m.dim)}</td>
              <td>{unidadSI(m.dim)}</td>
              {d.magnitudes.some((x) => x.valor) && <td>{m.valor ?? ''}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      {d.ecuaciones.map((e, i) => (
        <div key={i} className="dim-ecuacion">
          <div className="dim-cabeza">
            <span>{e.nombre}</span>
            <span className={e.dim ? 'dim-ok' : 'dim-mal'}>{e.dim ? `✓ ${texto(e.dim)} (${unidadSI(e.dim)})` : `✗ ${e.error ?? ''}`}</span>
          </div>
          <K t={e.tex} />
          <div className="dim-terminos">
            {e.terminos.map((t, k) => (
              <span key={k}>
                <K t={t.tex} /> → {t.dim ? texto(t.dim) : '?'}
              </span>
            ))}
          </div>
        </div>
      ))}
    </details>
  )
}
