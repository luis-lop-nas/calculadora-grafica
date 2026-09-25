import { definir, type PropsPanel } from '../../nucleo/tipos'
import { accion, capaFija, casilla } from '../../nucleo/menu'
import { Atajos, Expresion, Grupo, Interruptor, Muestra, Rango, Resultado } from '../../nucleo/controles'
import { compilarSuave } from '../../lib/expresion'
import { integrarTrozos, rupturas } from '../../lib/senales'
import { convolucion } from '../../lib/fft'

export interface EstadoConvolucion {
  x: string
  h: string
  L: number
  t0: number
  animar: boolean
}

const EJEMPLOS: Array<{ t: string; x: string; h: string; L: number }> = [
  { t: 'rect ∗ rect', x: 'rect(t)', h: 'rect(t)', L: 3 },
  { t: 'rect ∗ rect ancho', x: 'rect(t)', h: 'rect(t/2)', L: 3 },
  { t: 'dos exponenciales causales', x: 'exp(-t)*heaviside(t)', h: 'exp(-2*t)*heaviside(t)', L: 8 },
  { t: 'gauss ∗ gauss', x: 'exp(-t^2)', h: 'exp(-t^2/2)', L: 6 },
  { t: 'RC: escalón', x: 'heaviside(t)', h: 'exp(-t)*heaviside(t)', L: 8 },
  { t: 'eco', x: 'tri(t)', h: 'rect(10*t)*10+rect(10*(t-2))*5', L: 5 },
]

/** (x∗h)(t) = ∫ x(τ) h(t − τ) dτ en [−L, L], partiendo en los saltos de los dos factores. */
export function convolucionEn(x: (t: number) => number, h: (t: number) => number, L: number, t: number): number {
  const prod = (tau: number) => x(tau) * h(t - tau)
  // los saltos del producto son los de x y los de h trasladados: se buscan en la función producto
  const cortes = rupturas(prod, -L, L)
  const puntos = [-L, ...cortes, L]
  let s = 0
  for (let i = 0; i < puntos.length - 1; i++) s += integrarTrozos(prod, puntos[i], puntos[i + 1], Math.max(4, Math.ceil((200 * (puntos[i + 1] - puntos[i])) / (2 * L))))
  return s
}

/** y en una rejilla vía FFT (regla del rectángulo): rápida para dibujar, error O(Δt) en los saltos. */
export function convolucionRejilla(x: (t: number) => number, h: (t: number) => number, L: number, M = 2048) {
  const dt = (2 * L) / M
  const xs = Array.from({ length: M }, (_, i) => {
    const v = x(-L + (i + 0.5) * dt)
    return Number.isFinite(v) ? v : 0
  })
  const hs = Array.from({ length: M }, (_, i) => {
    const v = h(-L + (i + 0.5) * dt)
    return Number.isFinite(v) ? v : 0
  })
  const y = convolucion(xs, hs)
  // índice k ↔ t = −2L + (k + 1)·dt (suma de los dos centros de celda)
  return Array.from(y, (v, k) => [-2 * L + (k + 1) * dt, v * dt] as [number, number])
}

let cache = { clave: '', y: [] as Array<[number, number]> }

function Panel({ s, set }: PropsPanel<EstadoConvolucion>) {
  return (
    <>
      <Grupo titulo="Señales">
        <Expresion etiqueta="x(t) =" valor={s.x} variables={['t']} onChange={(x: string) => set({ x })} />
        <Expresion etiqueta="h(t) =" valor={s.h} variables={['t']} onChange={(h: string) => set({ h })} />
        <Atajos opciones={EJEMPLOS.map((ej) => ({ t: ej.t, activo: s.x === ej.x && s.h === ej.h, onClick: () => set({ x: ej.x, h: ej.h, L: ej.L }) }))} />
        <Rango etiqueta="Ventana |t| ≤ L" valor={s.L} min={1} max={20} paso={0.5} onChange={(L) => set({ L })} />
      </Grupo>
      <Resultado />
      <Grupo titulo="Instante">
        <Rango etiqueta="t" valor={s.t0} min={-s.L} max={s.L} paso={0.01} onChange={(t0) => set({ t0 })} />
        <div className="interruptores">
          <Interruptor activo={s.animar} onChange={(animar) => set({ animar })}>
            Deslizar h(t − τ) solo
          </Interruptor>
        </div>
      </Grupo>
    </>
  )
}

const REPARTO = 0.5

/** Instante efectivo: con la animación el tiempo recorre la ventana en bucle. */
const instante = (s: EstadoConvolucion, reloj: number) => (s.animar ? -s.L + ((reloj * 0.6) % (2 * s.L)) : s.t0)

export default definir<EstadoConvolucion>({
  id: 'convolucion',
  area: 'senales',
  resumen: 'Convolución: x(τ)·h(t − τ), el área que se acumula y la salida y = x ∗ h',
  corto: 'Convolución',
  titulo: 'Convolución <i>x ∗ h</i>',
  entradilla: 'Da la vuelta a h, deslízala y mira cómo el área del producto dibuja la salida.',
  inicial: { x: 'rect(t)', h: 'exp(-t)*heaviside(t)', L: 4, t0: 0.4, animar: false },
  Panel,
  capas: () => [capaFija<EstadoConvolucion>('x', 'x(τ)', '--ink'), capaFija<EstadoConvolucion>('h', 'h(t − τ)', '--neg'), capaFija<EstadoConvolucion>('p', 'Producto (área = y(t))', '--pos'), capaFija<EstadoConvolucion>('y', 'y(t)', '--accent')],
  menu: (s) => ({
    ejemplos: EJEMPLOS.map((e) => ({ t: e.t, tipo: 'radio' as const, activo: s.x === e.x && s.h === e.h, hacer: () => ({ x: e.x, h: e.h, L: e.L }) })),
    acciones: [casilla<EstadoConvolucion>('Recorrer t solo', s.animar, (animar) => ({ animar })), accion<EstadoConvolucion>('t = 0', () => ({ t0: 0 }))],
  }),
  resultadoEnPanel: true,
  rotulo: (s) => ({ nombre: 'y = x ∗ h', apunte: s.animar ? 'animando' : `t = ${s.t0.toFixed(2)}` }),
  formula: () => [String.raw`y(t)=(x*h)(t)=\int_{-\infty}^{\infty}x(\tau)\,h(t-\tau)\,d\tau`, String.raw`\mathcal F\{x*h\}=X(\nu)\,H(\nu)`],
  lecturas: (s) => {
    const x = compilarSuave(s.x, ['t']).f
    const h = compilarSuave(s.h, ['t']).f
    if (!x || !h) return [['Estado', 'alguna expresión no es válida']]
    const area = (f: (t: number) => number) => integrarTrozos(f, -s.L, s.L, 800)
    const ax = area(x)
    const ah = area(h)
    return [
      [`y(${s.t0.toFixed(2)}) por cuadratura`, convolucionEn(x, h, s.L, s.t0).toFixed(8)],
      ['∫x', ax.toFixed(6)],
      ['∫h', ah.toFixed(6)],
      ['∫y = ∫x · ∫h', (ax * ah).toFixed(6)],
    ]
  },
  leyenda: () => (
    <>
      <Muestra color="var(--ink)">x(τ)</Muestra>
      <Muestra color="var(--neg)">h(t − τ)</Muestra>
      <Muestra color="var(--pos)">producto (área = y(t))</Muestra>
      <Muestra color="var(--accent)">y(t)</Muestra>
    </>
  ),
  vista: (s) => ({
    tipo: '2d',
    navegable: false,
    animada: (st) => st.animar,
    interaccion: s.animar
      ? undefined
      : {
          asas: (st) => [{ id: 't', p: [st.t0, 0], color: '--pos', eje: 'x', nombre: 't' }],
          mover: (_id, t, st) => ({ t0: Math.max(-st.L, Math.min(st.L, t.p[0])) }),
          pista: 'Arrastra t por el eje',
        },
    dibujar(g, st, reloj) {
      const x = compilarSuave(st.x, ['t']).f
      const h = compilarSuave(st.h, ['t']).f
      if (!x || !h) {
        g.ventana = { x: [-1, 1], y: [-1, 1] }
        g.texto('alguna expresión no es válida', -0.9, 0.8, g.color('--pos'))
        return
      }
      const clave = `${st.x}|${st.h}|${st.L}`
      if (cache.clave !== clave) cache = { clave, y: convolucionRejilla(x, h, st.L) }
      const t = instante(st, reloj ?? 0)
      const M = 900
      const taus = Array.from({ length: M + 1 }, (_, i) => -st.L + (2 * st.L * i) / M)
      const xv = taus.map((u) => x(u))
      const hv = taus.map((u) => h(t - u))
      const pv = taus.map((_, i) => xv[i] * hv[i])
      const fin = (v: number[]) => v.filter(Number.isFinite)
      const all = [...fin(xv), ...fin(hv), ...fin(pv)]
      const lo = Math.min(0, ...all)
      const hi = Math.max(0, ...all)
      const pad = 0.15 * (hi - lo || 1)

      g.region(0, 0, 1, REPARTO)
      g.ventana = { x: [-st.L, st.L], y: [lo - pad, hi + pad] }
      g.ejes({ etiquetaX: 'τ' })
      const poli: Array<[number, number]> = [[taus[0], 0], ...taus.map((u, i) => [u, Number.isFinite(pv[i]) ? pv[i] : 0] as [number, number]), [taus[M], 0]]
      g.rellenar(poli, g.color('--pos'), 0.3)
      g.curva(taus.map((u, i) => [u, xv[i]]), g.color('--ink'), 2)
      g.curva(taus.map((u, i) => [u, hv[i]]), g.color('--neg'), 2)
      g.curva([[t, g.ventana.y[0]], [t, g.ventana.y[1]]], g.color('--grid'), 1, true)
      g.finRegion()

      g.region(0, REPARTO, 1, 1 - REPARTO)
      g.panel()
      const ys = cache.y.filter((p) => p[0] >= -st.L && p[0] <= st.L)
      const yv = ys.map((p) => p[1])
      const ylo = Math.min(0, ...yv)
      const yhi = Math.max(0, ...yv)
      const ypad = 0.15 * (yhi - ylo || 1)
      g.ventana = { x: [-st.L, st.L], y: [ylo - ypad, yhi + ypad] }
      g.ejes({ etiquetaX: 't', etiquetaY: 'y' })
      g.curva(ys, g.color('--grid'), 1.4)
      g.curva(ys.filter((p) => p[0] <= t), g.color('--accent'), 2.4)
      const yt = convolucionEn(x, h, st.L, t)
      g.punto(t, yt, g.color('--accent'), 4)
      g.finRegion()
      g.ventana = { x: [-st.L, st.L], y: [ylo - ypad, yhi + ypad] }
      g.usarRegion(0, REPARTO, 1, 1 - REPARTO)
    },
  }),
})
