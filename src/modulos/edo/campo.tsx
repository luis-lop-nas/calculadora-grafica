import { definir, type PropsPanel } from '../../nucleo/tipos'
import { Atajos, Boton, Expresion, Grupo, Interruptor, Muestra, Rango, Segmentado, Resultado } from '../../nucleo/controles'
import { compilarSuave } from '../../lib/expresion'
import { euler, rk2, rk4 } from '../../lib/numerico'

type Metodo = 'rk4' | 'rk2' | 'euler' | 'comparar'

interface S {
  expr: string
  h: number
  metodo: Metodo
  semillas: Array<[number, number]>
  verCampo: boolean
  verIsoclinas: boolean
}

const EJEMPLOS = [
  { e: 'y', t: "y' = y" },
  { e: 'x-y', t: "y' = x − y" },
  { e: 'y*(1-y)', t: 'logística' },
  { e: '-x/y', t: "y' = −x/y" },
  { e: 'sin(x)-y', t: "y' = sen x − y" },
  { e: 'x*x-y', t: "y' = x² − y" },
]

function Panel({ s, set }: PropsPanel<S>) {
  return (
    <>
      <Grupo titulo="Ecuación">
        <Expresion
          etiqueta="y′ ="
          valor={s.expr}
          variables={['x', 'y']}
          onChange={(expr: string) => set({ expr })}
        />
        <Atajos
          opciones={EJEMPLOS.map((ej) => ({
            t: ej.t,
            activo: s.expr === ej.e,
            onClick: () => set({ expr: ej.e, semillas: [] }),
          }))}
        />
      </Grupo>

      <Resultado />

      <Grupo titulo="Integración">
        <Segmentado
          columnas={2}
          valor={s.metodo}
          opciones={[
            { v: 'rk4', t: 'RK4' },
            { v: 'rk2', t: 'Punto medio' },
            { v: 'euler', t: 'Euler' },
            { v: 'comparar', t: 'Comparar' },
          ]}
          onChange={(metodo) => set({ metodo })}
        />
        <Rango
          etiqueta="Paso h"
          valor={s.h}
          min={0.005}
          max={0.6}
          paso={0.005}
          formato={(v) => v.toFixed(3)}
          onChange={(h) => set({ h })}
        />
        <div className="interruptores">
          <Interruptor activo={s.verCampo} onChange={(verCampo) => set({ verCampo })}>
            Campo de direcciones
          </Interruptor>
          <Interruptor activo={s.verIsoclinas} onChange={(verIsoclinas) => set({ verIsoclinas })}>
            Isoclinas
          </Interruptor>
          <Boton onClick={() => set({ semillas: [] })}>Borrar curvas</Boton>
        </div>
      </Grupo>
    </>
  )
}

/** Integra hacia delante y hacia atrás desde la semilla, con el método pedido. */
function integrar(f: (x: number, y: number) => number, x0: number, y0: number, h: number, metodo: Metodo, ymax: number) {
  const paso = metodo === 'euler' ? euler : metodo === 'rk2' ? rk2 : rk4
  const campo = (x: number, y: number[]) => [f(x, y[0])]
  const ramas: Array<Array<[number, number]>> = []
  for (const signo of [1, -1]) {
    const pts: Array<[number, number]> = [[x0, y0]]
    let y = [y0]
    let x = x0
    for (let i = 0; i < 4000; i++) {
      const ny = paso(campo, x, y, signo * h)
      x += signo * h
      if (!Number.isFinite(ny[0]) || Math.abs(ny[0]) > ymax * 6 || Math.abs(x) > 60) break
      y = ny
      pts.push([x, y[0]])
    }
    ramas.push(pts)
  }
  return ramas
}

export default definir<S>({
  id: 'campo',
  area: 'edo',
  resumen: 'Campo de direcciones y′ = f(x, y)',
  corto: 'Campo de direcciones',
  titulo: 'Campo de <i>direcciones</i>',
  entradilla: 'Pulsa en el lienzo para lanzar una solución por ese punto.',
  inicial: { expr: 'y*(1-y)', h: 0.05, metodo: 'rk4', semillas: [[-3, 0.2]], verCampo: true, verIsoclinas: false },
  Panel,
  resultadoEnPanel: true,
  rotulo: (s) => ({ nombre: 'y′ = f(x, y)', apunte: `${s.semillas.length} curva(s)` }),
  formula: (s) => [
    String.raw`y' = ${s.expr.replace(/\*/g, '\\cdot ')}`,
    s.metodo === 'euler'
      ? String.raw`y_{k+1}=y_k+h\,f(x_k,y_k)\qquad O(h)`
      : s.metodo === 'rk2'
        ? String.raw`y_{k+1}=y_k+h\,f\!\left(x_k+\tfrac h2,\;y_k+\tfrac h2 f_k\right)\qquad O(h^2)`
        : String.raw`y_{k+1}=y_k+\tfrac h6\left(k_1+2k_2+2k_3+k_4\right)\qquad O(h^4)`,
  ],
  lecturas: (s) => {
    const { f } = compilarSuave(s.expr, ['x', 'y'])
    const filas: Array<[string, string]> = [
      ['Paso h', s.h.toFixed(3)],
      ['Semillas', `${s.semillas.length}`],
    ]
    if (f && s.semillas.length) {
      const [x0, y0] = s.semillas[s.semillas.length - 1]
      filas.push(['Última semilla', `(${x0.toFixed(2)}, ${y0.toFixed(2)})`])
      filas.push(['f en la semilla', f(x0, y0).toFixed(4)])
      if (s.metodo === 'comparar') {
        const campo = (x: number, y: number[]) => [f(x, y[0])]
        let ye = [y0]
        let yr = [y0]
        let x = x0
        for (let i = 0; i < 40; i++) {
          ye = euler(campo, x, ye, s.h)
          yr = rk4(campo, x, yr, s.h)
          x += s.h
        }
        filas.push(['Euler tras 40 pasos', ye[0].toFixed(5)])
        filas.push(['RK4 tras 40 pasos', yr[0].toFixed(5)])
        filas.push(['Diferencia', Math.abs(ye[0] - yr[0]).toFixed(5)])
      }
    }
    return filas
  },
  leyenda: (s) =>
    s.metodo === 'comparar' ? (
      <>
        <Muestra color="var(--accent)">RK4</Muestra>
        <Muestra color="var(--pos)">Euler</Muestra>
        <Muestra color="var(--neg)">punto medio</Muestra>
      </>
    ) : (
      <>
        <Muestra color="var(--ink-soft)">campo de direcciones</Muestra>
        <Muestra color="var(--accent)">soluciones</Muestra>
      </>
    ),
  pista: 'Pulsa para lanzar una solución · arrastra para mover · rueda para zoom',
  vista: {
    tipo: '2d',
    ventana: { x: [-5, 5], y: [-3, 3] },
    alPulsar: (p, s) => ({ semillas: [...s.semillas, [p.x, p.y] as [number, number]] }),
    interaccion: {
      asas: (s) => s.semillas.map((q, i) => ({ id: `S${i}`, p: q, color: '--ink' })),
      mover: (id, t, s) => ({ semillas: s.semillas.map((q, i) => (i === +id.slice(1) ? ([t.p[0], t.p[1]] as [number, number]) : q)) }),
      quitar: (id, s) => ({ semillas: s.semillas.filter((_, i) => i !== +id.slice(1)) }),
      pista: 'Pulsa para lanzar una curva · arrastra su punto de partida · doble clic o Supr: quitarla',
    },
    dibujar(g, s) {
      g.ejes({ etiquetaX: 'x', etiquetaY: 'y' })
      const { f } = compilarSuave(s.expr, ['x', 'y'])
      if (!f) {
        g.texto('la expresión no es válida', g.ventana.x[0] + 0.3, g.ventana.y[1] - 0.4, g.color('--pos'))
        return
      }
      const suave = g.color('--ink-soft')
      const [xa, xb] = g.ventana.x
      const [ya, yb] = g.ventana.y

      if (s.verCampo) {
        const paso = (xb - xa) / 26
        const largo = paso * 0.42
        for (let x = xa; x <= xb; x += paso)
          for (let y = ya; y <= yb; y += paso) {
            const m = f(x, y)
            if (!Number.isFinite(m)) continue
            const n = Math.hypot(1, m)
            g.flecha(x - (largo / n) * 0.5, y - ((largo * m) / n) * 0.5, largo / n, (largo * m) / n, suave, 1.1, 4)
          }
      }

      if (s.verIsoclinas) {
        const neg = g.color('--neg')
        for (const c of [-2, -1, -0.5, 0, 0.5, 1, 2]) {
          const pts: Array<[number, number]> = []
          const N = 300
          for (let i = 0; i <= N; i++) {
            const x = xa + ((xb - xa) * i) / N
            // busca y con f(x,y) = c por bisección en la ventana
            let lo = ya
            let hi = yb
            const F = (y: number) => f(x, y) - c
            if (!Number.isFinite(F(lo)) || !Number.isFinite(F(hi)) || F(lo) * F(hi) > 0) {
              if (pts.length > 1) g.curva(pts, neg, 1, true)
              pts.length = 0
              continue
            }
            for (let j = 0; j < 40; j++) {
              const m = (lo + hi) / 2
              if (F(lo) * F(m) <= 0) hi = m
              else lo = m
            }
            pts.push([x, (lo + hi) / 2])
          }
          if (pts.length > 1) {
            g.curva(pts, neg, 1, true)
            g.texto(`f = ${c}`, pts[0][0], pts[0][1], neg, { dx: 4, dy: -8 })
          }
        }
      }

      const metodos: Array<[Metodo, string]> =
        s.metodo === 'comparar'
          ? [
              ['rk4', g.color('--accent')],
              ['rk2', g.color('--neg')],
              ['euler', g.color('--pos')],
            ]
          : [[s.metodo, g.color('--accent')]]

      for (const [x0, y0] of s.semillas) {
        for (const [m, color] of metodos) {
          for (const rama of integrar(f, x0, y0, s.h, m, Math.max(Math.abs(ya), Math.abs(yb))))
            g.curva(rama, color, m === 'rk4' ? 2.2 : 1.6)
        }
        g.punto(x0, y0, g.color('--ink'), 3.5)
      }
    },
  },
})
