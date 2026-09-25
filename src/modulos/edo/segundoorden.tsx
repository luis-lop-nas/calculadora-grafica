import { definir, type PropsPanel } from '../../nucleo/tipos'
import { accion, capaFija, capaVer, radios } from '../../nucleo/menu'
import { Atajos, Expresion, Grupo, Interruptor, Matriz, Muestra, Nota, Rango, Segmentado, Resultado } from '../../nucleo/controles'
import { compilarSuave } from '../../lib/expresion'
import { rk4 } from '../../lib/numerico'
import type { Pintor2D } from '../../render/pintor2d'

type Problema = 'inicial' | 'contorno'
type Modelo = 'lineal' | 'general'

export interface EstadoSegundo {
  problema: Problema
  modelo: Modelo
  c: number
  k: number
  F0: number
  W: number
  expr: string
  inicio: number[][]
  frontera: number[][]
  T: number
  verFases: boolean
  verDerivada: boolean
}

const GENERALES = [
  { t: 'Péndulo', e: '-sin(y)-0.2*v' },
  { t: 'Van der Pol', e: '2*(1-y*y)*v-y' },
  { t: 'Duffing', e: 'y-y^3-0.2*v+0.3*cos(t)' },
  { t: 'Airy', e: '-t*y' },
  { t: 'Caída con rozamiento', e: '-1-0.4*v*abs(v)' },
]

const LINEALES = [
  { t: 'Sin amortiguar', c: 0, k: 4, F0: 0, W: 2 },
  { t: 'Subamortiguado', c: 0.5, k: 4, F0: 0, W: 2 },
  { t: 'Crítico', c: 4, k: 4, F0: 0, W: 2 },
  { t: 'Sobreamortiguado', c: 7, k: 4, F0: 0, W: 2 },
  { t: 'Resonancia', c: 0.15, k: 4, F0: 1, W: 2 },
  { t: 'Batimiento', c: 0, k: 4, F0: 1, W: 2.4 },
]

/** y'' = f(t, y, v). */
function campo(s: EstadoSegundo): ((t: number, y: number, v: number) => number) | null {
  if (s.modelo === 'lineal') return (t, y, v) => -s.c * v - s.k * y + s.F0 * Math.cos(s.W * t)
  const { f } = compilarSuave(s.expr, ['t', 'y', 'v'])
  return f ? (t, y, v) => f(t, y, v) : null
}

/** Integra el problema de valor inicial y devuelve la traza [t, y, v]. */
export function integrar(s: EstadoSegundo, y0: number, v0: number, pasos = 2000): number[][] {
  const f = campo(s)
  if (!f) return []
  const F = (t: number, Y: number[]) => [Y[1], f(t, Y[0], Y[1])]
  const h = s.T / pasos
  const out: number[][] = [[0, y0, v0]]
  let Y = [y0, v0]
  for (let i = 0; i < pasos; i++) {
    Y = rk4(F, i * h, Y, h)
    if (!Y.every(Number.isFinite) || Math.abs(Y[0]) > 1e8) break
    out.push([(i + 1) * h, Y[0], Y[1]])
  }
  return out
}

/**
 * Problema de contorno por tiro: se busca la pendiente inicial que hace que la
 * solución aterrice en y(T) = β. Con la secante, un problema lineal se resuelve
 * en un paso; si el problema es singular (resonancia con los autovalores del
 * operador) no hay pendiente que valga y se dice.
 */
export function tiro(s: EstadoSegundo) {
  const alfa = s.frontera[0][0]
  const beta = s.frontera[0][1]
  const fin = (v: number) => {
    const tr = integrar(s, alfa, v, 1200)
    const ultimo = tr[tr.length - 1]
    return ultimo && Math.abs(ultimo[0] - s.T) < 1e-6 ? ultimo[1] : NaN
  }
  const intentos: number[] = []
  let v0 = 0
  let v1 = (beta - alfa) / s.T || 1
  let f0 = fin(v0) - beta
  let f1 = fin(v1) - beta
  intentos.push(v0, v1)
  for (let i = 0; i < 40 && Math.abs(f1) > 1e-10; i++) {
    const den = f1 - f0
    if (!Number.isFinite(den) || Math.abs(den) < 1e-14) break
    const v2 = v1 - (f1 * (v1 - v0)) / den
    if (!Number.isFinite(v2)) break
    v0 = v1
    f0 = f1
    v1 = v2
    f1 = fin(v1) - beta
    intentos.push(v1)
  }
  return { v: v1, resto: f1, intentos, resuelto: Number.isFinite(f1) && Math.abs(f1) < 1e-6 }
}

function Panel({ s, set }: PropsPanel<EstadoSegundo>) {
  return (
    <>
      <Grupo titulo="Problema">
        <Segmentado
          valor={s.problema}
          opciones={[
            { v: 'inicial' as Problema, t: 'Valor inicial' },
            { v: 'contorno' as Problema, t: 'Valor en la frontera' },
          ]}
          // un horizonte largo hace el problema de contorno casi singular con
          // amortiguamiento: para dos puntos, un tramo corto se porta mejor
          onChange={(problema) => set({ problema, T: problema === 'contorno' ? 6 : 20 })}
        />
        <Nota>
          {s.problema === 'inicial' ? (
            <>
              Una ecuación de segundo orden pide <b>dos datos en el mismo punto</b>: y(0) y y′(0).
              Con eso la solución es única y se integra hacia delante.
            </>
          ) : (
            <>
              Aquí los dos datos están en <b>puntos distintos</b>: y(0) = α e y(T) = β. Se resuelve
              por tiro, buscando la pendiente inicial que acierta en el otro extremo. Puede no haber
              solución, o haber infinitas.
            </>
          )}
        </Nota>
      </Grupo>

      <Resultado />

      <Grupo titulo="Ecuación">
        <Segmentado
          valor={s.modelo}
          opciones={[
            { v: 'lineal' as Modelo, t: 'Lineal' },
            { v: 'general' as Modelo, t: 'Cualquiera' },
          ]}
          onChange={(modelo) => set({ modelo })}
        />
        {s.modelo === 'lineal' ? (
          <>
            <Rango etiqueta="Amortiguamiento c" valor={s.c} min={0} max={8} paso={0.05} formato={(v) => v.toFixed(2)} onChange={(c) => set({ c })} />
            <Rango etiqueta="Rigidez k" valor={s.k} min={0.1} max={16} paso={0.1} formato={(v) => v.toFixed(1)} onChange={(k) => set({ k })} />
            <Rango etiqueta="Fuerza F₀" valor={s.F0} min={0} max={3} paso={0.05} formato={(v) => v.toFixed(2)} onChange={(F0) => set({ F0 })} />
            {s.F0 > 0 && (
              <Rango etiqueta="Frecuencia Ω" valor={s.W} min={0.1} max={6} paso={0.05} formato={(v) => v.toFixed(2)} onChange={(W) => set({ W })} />
            )}
            <Atajos
              opciones={LINEALES.map((p) => ({
                t: p.t,
                activo: s.c === p.c && s.k === p.k && s.F0 === p.F0 && (p.F0 === 0 || s.W === p.W),
                onClick: () => set({ c: p.c, k: p.k, F0: p.F0, W: p.W }),
              }))}
            />
          </>
        ) : (
          <>
            <Expresion etiqueta="y″ =" valor={s.expr} variables={['t', 'y', 'v']} onChange={(expr: string) => set({ expr })} />
            <Nota>
              <b>v</b> es y′. Así entran de golpe el péndulo, Van der Pol o una caída con rozamiento.
            </Nota>
            <Atajos opciones={GENERALES.map((p) => ({ t: p.t, activo: s.expr === p.e, onClick: () => set({ expr: p.e }) }))} />
          </>
        )}
      </Grupo>

      <Grupo titulo={s.problema === 'inicial' ? 'Condiciones iniciales' : 'Condiciones de contorno'}>
        {s.problema === 'inicial' ? (
          <Matriz A={s.inicio} onChange={(inicio: number[][]) => set({ inicio })} paso={0.1} filas={[{ nombre: 'y₀, y′₀', color: 'var(--accent)' }]} />
        ) : (
          <Matriz A={s.frontera} onChange={(frontera: number[][]) => set({ frontera })} paso={0.1} filas={[{ nombre: 'α, β', color: 'var(--accent)' }]} />
        )}
        <Rango etiqueta={s.problema === 'inicial' ? 'Horizonte T' : 'Longitud T'} valor={s.T} min={1} max={40} paso={0.5} formato={(v) => v.toFixed(1)} onChange={(T) => set({ T })} />
        <div className="interruptores">
          <Interruptor activo={s.verFases} onChange={(verFases) => set({ verFases })}>
            Plano de fases
          </Interruptor>
          <Interruptor activo={s.verDerivada} onChange={(verDerivada) => set({ verDerivada })}>
            y′(t)
          </Interruptor>
        </div>
      </Grupo>
    </>
  )
}

export default definir<EstadoSegundo>({
  id: 'segundoorden',
  area: 'edo',
  resumen: 'Segundo orden: valor inicial y de contorno',
  corto: 'Segundo orden y contorno',
  titulo: 'Segundo <i>orden</i>',
  entradilla: 'y″ = f(t, y, y′): dos datos en un punto, o uno en cada extremo.',
  inicial: {
    problema: 'inicial', modelo: 'lineal', c: 0.5, k: 4, F0: 0, W: 2,
    expr: '-sin(y)-0.2*v', inicio: [[1, 0]], frontera: [[0, 1]], T: 20,
    verFases: true, verDerivada: true,
  },
  Panel,
  capas: (s) => [
    capaFija<EstadoSegundo>('y', 'y(t)', '--accent'),
    capaVer(s, 'verDerivada', 'y′(t)', '--aux'),
    capaVer(s, 'verFases', 'Plano de fases (y, y′)', '--ink-soft'),
  ],
  menu: (s) => ({
    ejemplos: [
      ...LINEALES.map((p) => accion<EstadoSegundo>(`Lineal · ${p.t}`, () => ({ modelo: 'lineal', c: p.c, k: p.k, F0: p.F0, W: p.W }))),
      ...GENERALES.map((p) => accion<EstadoSegundo>(`General · ${p.t}`, () => ({ modelo: 'general', expr: p.e }))),
    ],
    acciones: [
      radios<EstadoSegundo, Problema>('Problema', [{ v: 'inicial', t: 'Valor inicial' }, { v: 'contorno', t: 'De contorno' }], s.problema, (problema) => ({ problema })),
      radios<EstadoSegundo, Modelo>('Ecuación', [{ v: 'lineal', t: 'Lineal y″ + c y′ + k y = F cos ωt' }, { v: 'general', t: 'General y″ = f(t, y, y′)' }], s.modelo, (modelo) => ({ modelo })),
      radios<EstadoSegundo, number>('Tiempo final T', [5, 10, 20, 40, 80].map((v) => ({ v, t: String(v) })), s.T, (T) => ({ T })),
    ],
  }),
  resultadoEnPanel: true,
  rotulo: (s) => {
    if (s.modelo !== 'lineal') return { nombre: 'y″ = f(t, y, y′)', apunte: s.problema === 'inicial' ? 'problema de valor inicial' : 'problema de contorno' }
    const disc = s.c * s.c - 4 * s.k
    const regimen = s.c === 0 ? 'sin amortiguar' : Math.abs(disc) < 1e-9 ? 'amortiguamiento crítico' : disc < 0 ? 'subamortiguado' : 'sobreamortiguado'
    return { nombre: regimen, apunte: `c² − 4k = ${disc.toFixed(3)}` }
  },
  formula: (s) => {
    const base =
      s.modelo === 'lineal'
        ? [String.raw`y'' + ${s.c}\,y' + ${s.k}\,y = ${s.F0 ? `${s.F0}\\cos(${s.W}t)` : '0'}`]
        : [String.raw`y'' = ${s.expr.replace(/\*/g, '\\cdot ')}`]
    if (s.problema === 'inicial') base.push(String.raw`y(0)=${s.inicio[0][0]},\qquad y'(0)=${s.inicio[0][1]}`)
    else base.push(String.raw`y(0)=${s.frontera[0][0]},\qquad y(T)=${s.frontera[0][1]}`)
    if (s.modelo === 'lineal' && s.problema === 'inicial')
      base.push(String.raw`\lambda^2+c\lambda+k=0 \Rightarrow \lambda=\frac{-c\pm\sqrt{c^2-4k}}{2}`)
    return base
  },
  lecturas: (s) => {
    const f = campo(s)
    if (!f) return [['Estado', 'la expresión no es válida']]
    const filas: Array<[string, string]> = []
    if (s.modelo === 'lineal') {
      const disc = s.c * s.c - 4 * s.k
      const w0 = Math.sqrt(s.k)
      filas.push(['ω₀ = √k', w0.toFixed(4)])
      filas.push(['ζ = c/(2√k)', (s.c / (2 * w0)).toFixed(4)])
      if (disc < 0) {
        filas.push(['λ', `${(-s.c / 2).toFixed(3)} ± ${(Math.sqrt(-disc) / 2).toFixed(3)}i`])
        filas.push(['ω amortiguada', (Math.sqrt(-disc) / 2).toFixed(4)])
        filas.push(['Periodo', ((4 * Math.PI) / Math.sqrt(-disc)).toFixed(4)])
      } else {
        filas.push(['λ₁', ((-s.c + Math.sqrt(disc)) / 2).toFixed(4)])
        filas.push(['λ₂', ((-s.c - Math.sqrt(disc)) / 2).toFixed(4)])
      }
      if (s.F0 > 0) {
        const den = Math.hypot(s.k - s.W * s.W, s.c * s.W)
        filas.push(['Amplitud estacionaria', (s.F0 / den).toFixed(4)])
        filas.push(['Desfase', `${((Math.atan2(s.c * s.W, s.k - s.W * s.W) * 180) / Math.PI).toFixed(1)}°`])
        const res = s.k - (s.c * s.c) / 2
        filas.push(['Ω de resonancia', res > 0 ? Math.sqrt(res).toFixed(4) : 'no hay (muy amortiguado)'])
      }
    }
    if (s.problema === 'contorno') {
      const t = tiro(s)
      filas.push(['y′(0) del tiro', Number.isFinite(t.v) ? t.v.toFixed(6) : '—'])
      filas.push(['Resto y(T) − β', Number.isFinite(t.resto) ? t.resto.toExponential(2) : '—'])
      filas.push(['Iteraciones', `${t.intentos.length - 2}`])
      filas.push(['¿Resuelto?', t.resuelto ? 'sí' : 'no: problema singular o divergente'])
      if (s.modelo === 'lineal' && s.c === 0) {
        // y'' + k y = 0 con y(0)=y(T)=0 solo tiene solución no trivial si √k·T = nπ
        const n = (Math.sqrt(s.k) * s.T) / Math.PI
        filas.push(['√k·T / π', n.toFixed(4)])
        if (Math.abs(n - Math.round(n)) < 0.01) filas.push(['Aviso', 'cerca de un autovalor del problema'])
      }
    } else {
      const tr = integrar(s, s.inicio[0][0], s.inicio[0][1])
      const ultimo = tr[tr.length - 1]
      if (ultimo) {
        filas.push(['y(T)', ultimo[1].toFixed(6)])
        filas.push(['y′(T)', ultimo[2].toFixed(6)])
        filas.push(['máx |y|', Math.max(...tr.map((p) => Math.abs(p[1]))).toFixed(5)])
      }
    }
    return filas
  },
  leyenda: (s) => (
    <>
      <Muestra color="var(--accent)">y(t)</Muestra>
      {s.verDerivada && <Muestra color="var(--aux)">y′(t)</Muestra>}
      {s.problema === 'contorno' && <Muestra color="var(--ink-soft)">tiros que no aciertan</Muestra>}
      {s.verFases && <span>derecha: plano (y, y′)</span>}
    </>
  ),
  vista: {
    tipo: '2d',
    navegable: false,
    interaccion: {
      asas(s) {
        if (s.problema === 'contorno') {
          const [a, b] = s.frontera[0]
          return [
            { id: 'a', p: [0, a], color: '--pos', nombre: 'α', eje: 'y' as const },
            { id: 'b', p: [s.T, b], color: '--pos', nombre: 'β', eje: 'y' as const },
          ]
        }
        const [y0, v0] = s.inicio[0]
        const h = s.T / 12
        return [
          { id: 'y0', p: [0, y0], color: '--accent', nombre: 'y(0)', eje: 'y' as const },
          { id: 'v0', p: [h, y0 + v0 * h], color: '--aux', nombre: 'y′(0)', eje: 'y' as const },
        ]
      },
      mover(id, t, s) {
        const r = (v: number) => Math.round(v * 1000) / 1000
        const y = r(t.p[1])
        if (id === 'a') return { frontera: [[y, s.frontera[0][1]]] }
        if (id === 'b') return { frontera: [[s.frontera[0][0], y]] }
        const [y0, v0] = s.inicio[0]
        if (id === 'y0') return { inicio: [[y, v0]] }
        return { inicio: [[y0, r((t.p[1] - y0) / (s.T / 12))]] }
      },
    },
    dibujar(g, s) {
      const f = campo(s)
      if (!f) {
        g.ejes({ etiquetaX: 't', etiquetaY: 'y' })
        g.texto('la expresión no es válida', 0.1, 0.5, g.color('--pos'))
        return
      }
      const anchoTiempo = s.verFases ? 0.64 : 1
      let trazas: number[][][] = []
      let principal: number[][] = []
      if (s.problema === 'inicial') {
        principal = integrar(s, s.inicio[0][0], s.inicio[0][1])
      } else {
        const t = tiro(s)
        const alfa = s.frontera[0][0]
        trazas = t.intentos.slice(0, -1).map((v) => integrar(s, alfa, v, 900))
        principal = integrar(s, alfa, t.v)
      }
      if (!principal.length) return

      let m = 0
      for (const p of principal) m = Math.max(m, Math.abs(p[1]), s.verDerivada ? Math.abs(p[2]) : 0)
      m = Math.max(0.5, Math.min(1e4, m)) * 1.15

      g.region(0, 0, anchoTiempo, 1)
      g.ventana = { x: [0, s.T], y: [-m, m] }
      g.ejes({ etiquetaX: 't', etiquetaY: 'y' })
      const suave = g.color('--ink-soft')
      // los tiros que fallan pueden dispararse órdenes de magnitud: se recortan
      // a la ventana en vez de dejar una banda vertical
      const recortada = (pts: Array<[number, number]>, color: string, grosor: number) => {
        let tramo: Array<[number, number]> = []
        for (const q of pts) {
          if (!Number.isFinite(q[1]) || Math.abs(q[1]) > m) {
            if (tramo.length > 1) g.curva(tramo, color, grosor)
            tramo = []
            continue
          }
          tramo.push(q)
        }
        if (tramo.length > 1) g.curva(tramo, color, grosor)
      }
      for (const tr of trazas.slice(-4))
        recortada(tr.map((p) => [p[0], p[1]] as [number, number]), suave, 1)
      if (s.problema === 'contorno') {
        g.punto(0, s.frontera[0][0], g.color('--pos'), 5)
        g.punto(s.T, s.frontera[0][1], g.color('--pos'), 5)
      }
      if (s.verDerivada)
        g.curva(principal.map((p) => [p[0], p[2]] as [number, number]), g.color('--aux'), 1.6)
      g.curva(principal.map((p) => [p[0], p[1]] as [number, number]), g.color('--accent'), 2.4)
      g.finRegion()

      if (s.verFases) {
        g.region(anchoTiempo, 0, 1 - anchoTiempo, 1)
        g.panel()
        planoFases(g, principal, m)
        g.finRegion()
      }
      g.ventana = { x: [0, s.T], y: [-m, m] }
      g.usarRegion(0, 0, anchoTiempo, 1)
    },
  },
})

function planoFases(g: Pintor2D, tr: number[][], m: number) {
  let r = 0
  for (const p of tr) r = Math.max(r, Math.abs(p[1]), Math.abs(p[2]))
  r = Math.max(0.5, Math.min(1e4, r)) * 1.15
  void m
  g.ventana = { x: [-r, r], y: [-r, r] }
  g.ejes({ etiquetaX: 'y', etiquetaY: 'y′' })
  g.curva(tr.map((p) => [p[1], p[2]] as [number, number]), g.color('--accent'), 1.8)
  if (tr.length) {
    g.punto(tr[0][1], tr[0][2], g.color('--ink'), 4)
    const u = tr[tr.length - 1]
    g.punto(u[1], u[2], g.color('--pos'), 4)
  }
}
