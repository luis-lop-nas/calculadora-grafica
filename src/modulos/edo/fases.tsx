import { definir, type PropsPanel } from '../../nucleo/tipos'
import { Atajos, Boton, Expresion, Grupo, Interruptor, Matriz, Muestra, Rango, Segmentado, Resultado } from '../../nucleo/controles'
import { compilarSuave } from '../../lib/expresion'
import { trayectoria } from '../../lib/numerico'
import type { Pintor2D } from '../../render/pintor2d'
import { auto2, clasificar, det, traza } from '../../lib/matrices'
import { contorno, equilibrios, jacobiano } from '../../lib/contorno'

type Modo = 'lineal' | 'campo'

interface S {
  modo: Modo
  A: number[][]
  fx: string
  fy: string
  semillas: Array<[number, number]>
  verNulclinas: boolean
  verEquilibrios: boolean
  verCampo: boolean
  sembrar: boolean
  verTiempo: boolean
  T: number
}

const PRESETS = [
  { t: 'Péndulo', fx: 'y', fy: '-sin(x)-0.2*y' },
  { t: 'Lotka-Volterra', fx: 'x*(1-y)', fy: 'y*(x-1)' },
  { t: 'Van der Pol', fx: 'y', fy: '2*(1-x*x)*y-x' },
  { t: 'Duffing', fx: 'y', fy: 'x-x*x*x-0.2*y' },
  { t: 'Competencia', fx: 'x*(3-x-2*y)', fy: 'y*(2-x-y)' },
]

function campos(s: S) {
  if (s.modo === 'lineal') {
    const A = s.A
    return {
      f: (x: number, y: number) => A[0][0] * x + A[0][1] * y,
      g: (x: number, y: number) => A[1][0] * x + A[1][1] * y,
      error: null as string | null,
    }
  }
  const a = compilarSuave(s.fx, ['x', 'y'])
  const b = compilarSuave(s.fy, ['x', 'y'])
  return { f: a.f, g: b.f, error: a.error ?? b.error }
}

function Panel({ s, set }: PropsPanel<S>) {
  return (
    <>
      <Grupo titulo="Sistema">
        <Segmentado
          valor={s.modo}
          opciones={[
            { v: 'lineal', t: "x' = A x" },
            { v: 'campo', t: 'No lineal' },
          ]}
          onChange={(modo) => set({ modo, semillas: [] })}
        />
        {s.modo === 'lineal' ? (
          <Matriz A={s.A} onChange={(A: number[][]) => set({ A })} />
        ) : (
          <>
            <Expresion
              etiqueta="x′ ="
              valor={s.fx}
              variables={['x', 'y']}
              onChange={(fx: string) => set({ fx })}
            />
            <Expresion
              etiqueta="y′ ="
              valor={s.fy}
              variables={['x', 'y']}
              onChange={(fy: string) => set({ fy })}
            />
            <Atajos
              opciones={PRESETS.map((p) => ({
                t: p.t,
                activo: s.fx === p.fx && s.fy === p.fy,
                onClick: () => set({ fx: p.fx, fy: p.fy, semillas: [] }),
              }))}
            />
          </>
        )}
      </Grupo>

      <Resultado />

      <Grupo titulo="Qué se dibuja">
        <div className="interruptores">
          <Interruptor activo={s.verCampo} onChange={(verCampo) => set({ verCampo })}>
            Campo
          </Interruptor>
          <Interruptor activo={s.sembrar} onChange={(sembrar) => set({ sembrar })}>
            Familia de órbitas
          </Interruptor>
          <Interruptor activo={s.verTiempo} onChange={(verTiempo) => set({ verTiempo })}>
            x(t), y(t)
          </Interruptor>
          <Interruptor activo={s.verNulclinas} onChange={(verNulclinas) => set({ verNulclinas })}>
            Nulclinas
          </Interruptor>
          <Interruptor activo={s.verEquilibrios} onChange={(verEquilibrios) => set({ verEquilibrios })}>
            Equilibrios
          </Interruptor>
          <Boton onClick={() => set({ semillas: [] })}>Borrar órbitas</Boton>
        </div>
        {s.verTiempo && (
          <Rango
            etiqueta="Horizonte temporal"
            valor={s.T}
            min={2}
            max={40}
            paso={1}
            formato={(v) => `t ≤ ${v}`}
            onChange={(T) => set({ T })}
          />
        )}
      </Grupo>
    </>
  )
}

export default definir<S>({
  id: 'fases',
  area: 'edo',
  resumen: 'Retrato de fase de sistemas 2×2',
  corto: 'Retrato de fase',
  titulo: 'Retrato de <i>fase</i>',
  entradilla: 'Pulsa para lanzar una órbita. Las nulclinas cortan donde hay equilibrio.',
  inicial: {
    modo: 'lineal',
    A: [
      [0, 1],
      [-1, -0.4],
    ],
    fx: 'y',
    fy: '-sin(x)-0.2*y',
    semillas: [[1.5, 0]],
    verNulclinas: true,
    verEquilibrios: true,
    verCampo: true,
    sembrar: false,
    verTiempo: false,
    T: 14,
  },
  Panel,
  resultadoEnPanel: true,
  rotulo: (s) => {
    if (s.modo !== 'lineal') return { nombre: 'Sistema no lineal', apunte: `${s.semillas.length} órbita(s)` }
    return { nombre: clasificar(s.A).nombre, apunte: 'según τ y Δ' }
  },
  formula: (s) =>
    s.modo === 'lineal'
      ? [
          String.raw`\begin{pmatrix}x'\\y'\end{pmatrix}=\begin{pmatrix}${s.A[0][0]} & ${s.A[0][1]}\\ ${s.A[1][0]} & ${s.A[1][1]}\end{pmatrix}\begin{pmatrix}x\\y\end{pmatrix}`,
          String.raw`\lambda^2-\tau\lambda+\Delta=0,\quad \tau=\operatorname{tr}A,\ \Delta=\det A`,
        ]
      : [
          String.raw`x' = ${s.fx.replace(/\*/g, '\\cdot ')}`,
          String.raw`y' = ${s.fy.replace(/\*/g, '\\cdot ')}`,
        ],
  lecturas: (s) => {
    if (s.modo === 'lineal') {
      const vs = auto2(s.A)
      const t = traza(s.A)
      const d = det(s.A)
      const filas: Array<[string, string]> = [
        ['Traza τ', t.toFixed(4)],
        ['Determinante Δ', d.toFixed(4)],
        ['Discriminante τ²−4Δ', (t * t - 4 * d).toFixed(4)],
      ]
      vs.forEach((l, i) =>
        filas.push([`λ${i + 1}`, l.im === 0 ? l.re.toFixed(4) : `${l.re.toFixed(3)} ${l.im > 0 ? '+' : '−'} ${Math.abs(l.im).toFixed(3)}i`]),
      )
      vs.forEach((l, i) => {
        if (l.vector) filas.push([`v${i + 1}`, `(${l.vector[0].toFixed(3)}, ${l.vector[1].toFixed(3)})`])
      })
      return filas
    }
    const { f, g } = campos(s)
    if (!f || !g) return [['Estado', 'expresión no válida']]
    const eqs = equilibrios(f, g, { x: [-6, 6], y: [-6, 6] }, 50)
    const filas: Array<[string, string]> = [['Equilibrios en [−6, 6]²', `${eqs.length}`]]
    for (const p of eqs.slice(0, 4)) {
      const J = jacobiano(f, g, p[0], p[1])
      filas.push([`(${p[0].toFixed(2)}, ${p[1].toFixed(2)})`, clasificar(J).nombre])
    }
    return filas
  },
  leyenda: (s) => (
    <>
      <Muestra color="var(--accent)">órbitas</Muestra>
      {s.verNulclinas && (
        <>
          <Muestra color="var(--pos)">x′ = 0</Muestra>
          <Muestra color="var(--aux)">y′ = 0</Muestra>
        </>
      )}
      {s.modo === 'lineal' && <span>líneas gruesas = autovectores</span>}
    </>
  ),
  pista: 'Pulsa para lanzar una órbita · arrastra para mover · rueda para zoom',
  vista: {
    tipo: '2d',
    ventana: { x: [-4, 4], y: [-4, 4] },
    alPulsar: (p, s) => ({ semillas: [...s.semillas, [p.x, p.y] as [number, number]] }),
    interaccion: {
      asas: (s) => s.semillas.map((q, i) => ({ id: `S${i}`, p: q, color: '--ink' })),
      mover: (id, t, s) => ({ semillas: s.semillas.map((q, i) => (i === +id.slice(1) ? ([t.p[0], t.p[1]] as [number, number]) : q)) }),
      quitar: (id, s) => ({ semillas: s.semillas.filter((_, i) => i !== +id.slice(1)) }),
      pista: 'Pulsa para lanzar una curva · arrastra su punto de partida · doble clic o Supr: quitarla',
    },
    dibujar(g, s) {
      const { f, g: q } = campos(s)
      const marco = { x: [...g.ventana.x] as [number, number], y: [...g.ventana.y] as [number, number] }
      if (!f || !q) {
        g.ejes({ etiquetaX: 'x', etiquetaY: 'y' })
        g.texto('la expresión no es válida', marco.x[0] + 0.3, marco.y[1] - 0.4, g.color('--pos'))
        return
      }

      const anchoFase = s.verTiempo ? 0.62 : 1
      const semillas = todasLasSemillas(s, marco)

      g.region(0, 0, anchoFase, 1)
      g.ventana = marco
      planoDeFases(g, s, f, q, semillas, marco)
      g.finRegion()

      if (s.verTiempo) {
        g.region(anchoFase, 0, 1 - anchoFase, 1)
        g.fondoRegion(g.color('--ground'))
        seriesTemporales(g, s, f, q, semillas)
        g.finRegion()
      }

      // los clics se interpretan siempre sobre el plano de fases
      g.ventana = marco
      g.usarRegion(0, 0, anchoFase, 1)
    },
  },
})

/** Semillas puestas a mano más, si se pide, una rejilla que llena el retrato. */
function todasLasSemillas(s: S, marco: { x: [number, number]; y: [number, number] }) {
  const out: Array<[number, number]> = s.semillas.map((p) => [p[0], p[1]])
  if (!s.sembrar) return out
  const N = 5
  for (let i = 0; i < N; i++)
    for (let j = 0; j < N; j++) {
      const x = marco.x[0] + ((marco.x[1] - marco.x[0]) * (i + 0.5)) / N
      const y = marco.y[0] + ((marco.y[1] - marco.y[0]) * (j + 0.5)) / N
      out.push([x, y])
    }
  // un anillo pequeño alrededor del origen: es lo que revela un ciclo límite
  const r = 0.12 * Math.min(marco.x[1] - marco.x[0], marco.y[1] - marco.y[0])
  for (let k = 0; k < 6; k++) {
    const a = (2 * Math.PI * k) / 6
    out.push([r * Math.cos(a), r * Math.sin(a)])
  }
  return out
}

function orbita(
  f: (x: number, y: number) => number,
  q: (x: number, y: number) => number,
  semilla: [number, number],
  h: number,
  pasos: number,
  dentro: (y: number[]) => boolean,
) {
  return trayectoria((_t, y) => [f(y[0], y[1]), q(y[0], y[1])], [semilla[0], semilla[1]], h, pasos, dentro)
}

function planoDeFases(
  g: Pintor2D,
  s: S,
  f: (x: number, y: number) => number,
  q: (x: number, y: number) => number,
  semillas: Array<[number, number]>,
  marco: { x: [number, number]; y: [number, number] },
) {
  g.ejes({ etiquetaX: 'x', etiquetaY: 'y' })
  const suave = g.color('--ink-soft')
  const [xa, xb] = marco.x
  const [ya, yb] = marco.y
  const diag = Math.hypot(xb - xa, yb - ya)

  if (s.verCampo) {
    const paso = (xb - xa) / 24
    for (let x = xa; x <= xb; x += paso)
      for (let y = ya; y <= yb; y += paso) {
        const u = f(x, y)
        const v = q(x, y)
        const n = Math.hypot(u, v)
        if (!Number.isFinite(n) || n < 1e-9) continue
        const l = paso * 0.42
        g.flecha(x - ((u / n) * l) / 2, y - ((v / n) * l) / 2, (u / n) * l, (v / n) * l, suave, 1.1, 4)
      }
  }

  if (s.verNulclinas) {
    for (const [campo, color] of [
      [f, g.color('--pos')],
      [q, g.color('--aux')],
    ] as const) {
      for (const [a, b] of contorno(campo, marco, 0, 160, 160)) g.curva([a, b], color as string, 1.6)
    }
  }

  if (s.modo === 'lineal') {
    const acento = g.color('--ink')
    for (const l of auto2(s.A)) {
      if (!l.vector) continue
      const [vx, vy] = l.vector
      g.curva(
        [
          [-vx * diag, -vy * diag],
          [vx * diag, vy * diag],
        ],
        acento,
        1.8,
      )
    }
  }

  const h = diag / 900
  const dentro = (y: number[]) =>
    y[0] > xa - diag && y[0] < xb + diag && y[1] > ya - diag && y[1] < yb + diag
  const acento = g.color('--accent')
  semillas.forEach((semilla, i) => {
    // las semillas puestas a mano se integran en los dos sentidos; las de la
    // rejilla solo hacia delante, porque hacia atrás una órbita atractora explota
    const aMano = i < s.semillas.length
    for (const signo of aMano ? [1, -1] : [1]) {
      const tr = orbita(f, q, semilla, signo * h, aMano ? 3000 : 1800, dentro)
      g.curva(tr.map((p) => [p[0], p[1]] as [number, number]), acento, aMano ? 2 : 1.1)
    }
  })
  for (const p of s.semillas) g.punto(p[0], p[1], g.color('--ink'), 3.5)

  if (s.verEquilibrios) {
    const eqs =
      s.modo === 'lineal'
        ? Math.abs(det(s.A)) > 1e-9
          ? [[0, 0] as [number, number]]
          : []
        : equilibrios(f, q, marco, 60)
    for (const p of eqs) {
      const J = s.modo === 'lineal' ? s.A : jacobiano(f, q, p[0], p[1])
      const c = clasificar(J)
      const color =
        c.estable === 'estable' ? g.color('--neg') : c.estable === 'inestable' ? g.color('--pos') : g.color('--ink')
      g.punto(p[0], p[1], color, 6)
      g.texto(c.nombre, p[0], p[1], color, { dx: 10, dy: -10 })
    }
  }
}

/** x(t) e y(t) de la última órbita lanzada a mano, al lado del retrato. */
function seriesTemporales(
  g: Pintor2D,
  s: S,
  f: (x: number, y: number) => number,
  q: (x: number, y: number) => number,
  semillas: Array<[number, number]>,
) {

  // sin semillas a mano se usa un punto cerca del origen, no una esquina de la rejilla
  const semilla = s.semillas.length ? s.semillas[s.semillas.length - 1] : ([0.5, 0.5] as [number, number])
  void semillas
  const pasos = 1400
  const h = s.T / pasos
  const tr = orbita(f, q, semilla as [number, number], h, pasos, (y) => Math.abs(y[0]) < 1e6 && Math.abs(y[1]) < 1e6)
  let m = 0
  for (const p of tr) m = Math.max(m, Math.abs(p[0]), Math.abs(p[1]))
  m = Math.max(0.5, Math.min(50, m)) * 1.15
  g.ventana = { x: [0, s.T], y: [-m, m] }
  g.ejes({ etiquetaX: 't', paso: Math.max(1, Math.round(s.T / 6)) })

  const serie = (k: number, color: string) => {
    const pts: Array<[number, number]> = tr.map((p, i) => [i * h, p[k]] as [number, number])
    g.curva(pts, color, 2)
  }
  serie(0, g.color('--accent'))
  serie(1, g.color('--aux'))
  g.texto('x(t)', 0.04 * s.T, m * 0.88, g.color('--accent'))
  g.texto('y(t)', 0.04 * s.T, m * 0.72, g.color('--aux'))
  g.texto(
    `desde (${semilla[0].toFixed(2)}, ${semilla[1].toFixed(2)})`,
    0.04 * s.T,
    -m * 0.9,
    g.color('--ink-soft'),
  )
}
