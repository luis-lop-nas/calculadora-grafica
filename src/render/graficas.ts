import type { Pintor2D } from './pintor2d'

/** Una curva de una magnitud frente al tiempo. */
export interface Serie {
  pts: Array<[number, number]>
  color: string
  nombre?: string
}

/** Un panel de la cuadrícula: un título (la magnitud y su unidad) y sus curvas. */
export interface PanelTiempo {
  titulo: string
  series: Serie[]
}

function valorEn(pts: Array<[number, number]>, t: number): number | null {
  if (!pts.length) return null
  if (t <= pts[0][0]) return pts[0][1]
  if (t >= pts[pts.length - 1][0]) return pts[pts.length - 1][1]
  let lo = 0
  let hi = pts.length - 1
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1
    if (pts[m][0] <= t) lo = m
    else hi = m
  }
  const [t0, a] = pts[lo]
  const [t1, b] = pts[hi]
  return a + ((t - t0) / (t1 - t0 || 1)) * (b - a)
}

const bonito = (v: number) => {
  const a = Math.abs(v)
  if (a !== 0 && (a < 1e-3 || a >= 1e5)) return v.toExponential(2)
  return v.toFixed(a < 10 ? 2 : 1)
}

/**
 * Cuadrícula de gráficas frente al tiempo con un cursor en el instante `t`: cada panel
 * se encuadra solo con sus datos y marca el valor de cada curva en el cursor.
 */
export function graficasTiempo(g: Pintor2D, paneles: PanelTiempo[], opts: { t: number; tMax: number; columnas?: number }) {
  const n = paneles.length
  if (!n) return
  const col = Math.min(n, opts.columnas ?? 2)
  const filas = Math.ceil(n / col)
  const margen = 0.012
  paneles.forEach((p, k) => {
    const i = k % col
    const j = Math.floor(k / col)
    const fw = 1 / col
    const fh = 1 / filas
    g.region(i * fw + margen, j * fh + margen, fw - 2 * margen, fh - 2 * margen)
    g.fondoRegion(g.color('--panel'))
    const vals = p.series.flatMap((s) => s.pts.map((q) => q[1])).filter(Number.isFinite)
    let y0 = vals.length ? Math.min(...vals) : -1
    let y1 = vals.length ? Math.max(...vals) : 1
    if (y1 - y0 < 1e-9) {
      const c = y0
      const d = Math.max(1, Math.abs(c) * 0.2)
      y0 = c - d
      y1 = c + d
    }
    const py = 0.14 * (y1 - y0)
    const tMax = Math.max(opts.tMax, 1e-6)
    g.ventana = { x: [-0.04 * tMax, tMax * 1.02], y: [y0 - py, y1 + py] }
    g.ejes({ etiquetaX: 't' })
    for (const s of p.series) g.curva(s.pts, s.color, 1.8)
    // cursor
    const t = Math.min(opts.t, tMax)
    g.curva(
      [
        [t, g.ventana.y[0]],
        [t, g.ventana.y[1]],
      ],
      g.color('--ink-soft'),
      1,
      true,
    )
    const xTexto = g.ventana.x[0] + 0.03 * (g.ventana.x[1] - g.ventana.x[0])
    const yTexto = g.ventana.y[1] - 0.07 * (g.ventana.y[1] - g.ventana.y[0])
    g.texto(p.titulo, xTexto, yTexto, g.color('--ink'), { fuente: `600 12px ${getComputedStyle(document.documentElement).getPropertyValue('--sans') || 'sans-serif'}` })
    p.series.forEach((s, q) => {
      const v = valorEn(s.pts, t)
      if (v === null) return
      g.punto(t, v, s.color, 4)
      g.texto(`${s.nombre ? s.nombre + ' ' : ''}${bonito(v)}`, t, v, s.color, { dx: 7, dy: -9 - 13 * (q % 3) })
    })
    g.finRegion()
  })
}
