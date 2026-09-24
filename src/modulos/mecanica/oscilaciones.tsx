import { definir, type PropsPanel } from '../../nucleo/tipos'
import { Expresion, Grupo, Muestra, Rango, Resultado, Segmentado } from '../../nucleo/controles'
import { autoGeneralizado, type Mat } from '../../lib/matrices'
import type { Pintor2D } from '../../render/pintor2d'

type Modo = 'cadena' | 'matrices' | 'forzado'

export interface EstadoOsc {
  modo: Modo
  N: number
  m: number
  k: number
  extremos: 'fijos' | 'libres'
  Mtxt: string
  Ktxt: string
  /** 0 = superposición; 1…N = solo ese modo */
  ver: number
  /** desplazamiento inicial: «1, 0, 0» */
  x0: string
  // forzado
  mf: number
  kf: number
  c: number
  F0: number
  W: number
  tMax: number
}

/** M y K de una cadena de N masas iguales unidas por muelles iguales. */
export function cadena(N: number, m: number, k: number, extremos: 'fijos' | 'libres'): { M: Mat; K: Mat } {
  const M = Array.from({ length: N }, (_, i) => Array.from({ length: N }, (_, j) => (i === j ? m : 0)))
  const K = Array.from({ length: N }, () => new Array(N).fill(0))
  for (let i = 0; i < N; i++) {
    const vecinos = (i > 0 ? 1 : extremos === 'fijos' ? 1 : 0) + (i < N - 1 ? 1 : extremos === 'fijos' ? 1 : 0)
    K[i][i] = k * vecinos
    if (i > 0) K[i][i - 1] = -k
    if (i < N - 1) K[i][i + 1] = -k
  }
  return { M, K }
}

export function leerMatriz(t: string): Mat {
  const filas = t.split(';').map((f) => f.split(/[,\s]+/).filter(Boolean).map(Number))
  if (!filas.length || filas.some((f) => f.length !== filas.length || f.some((v) => !Number.isFinite(v)))) throw new Error('escribe una matriz cuadrada: filas separadas por «;»')
  return filas
}

export interface Modos {
  M: Mat
  K: Mat
  w: number[]
  V: Mat
}

export function modos(s: EstadoOsc): Modos | { error: string } {
  try {
    const { M, K } = s.modo === 'matrices' ? { M: leerMatriz(s.Mtxt), K: leerMatriz(s.Ktxt) } : cadena(s.N, s.m, s.k, s.extremos)
    if (M.length !== K.length) throw new Error('M y K tienen que ser del mismo tamaño')
    for (let i = 0; i < K.length; i++) for (let j = 0; j < i; j++) if (Math.abs(K[i][j] - K[j][i]) > 1e-12 || Math.abs(M[i][j] - M[j][i]) > 1e-12) throw new Error('M y K tienen que ser simétricas')
    const r = autoGeneralizado(K, M)
    if (!r) throw new Error('M tiene que ser definida positiva')
    if (r.valores.some((v) => v < -1e-9)) throw new Error('K no es semidefinida positiva: el equilibrio es inestable')
    return { M, K, w: r.valores.map((v) => Math.sqrt(Math.max(0, v))), V: r.V }
  } catch (e) {
    return { error: (e as Error).message }
  }
}

/**
 * x(t) = Σ vᵢ (aᵢ cos ωᵢt + bᵢ sin ωᵢt) con aᵢ = vᵢᵀ M x₀ (modos M-ortonormales) y velocidad inicial nula.
 * Un modo con ω = 0 (cadena libre) es una traslación: con v₀ = 0 se queda quieto.
 */
export function evolucion(md: Modos, x0: number[], t: number, soloModo = 0): number[] {
  const n = md.M.length
  const out = new Array(n).fill(0)
  for (let i = 0; i < n; i++) {
    if (soloModo && soloModo - 1 !== i) continue
    const v = md.V.map((f) => f[i])
    let a = 0
    for (let p = 0; p < n; p++) for (let q = 0; q < n; q++) a += v[p] * md.M[p][q] * x0[q]
    const c = Math.cos(md.w[i] * t)
    for (let p = 0; p < n; p++) out[p] += v[p] * a * c
  }
  return out
}

const COLORES = ['--accent', '--pos', '--aux', '--rosa', '--morado', '--ocre']

/* ── forzado: m x″ + c x′ + k x = F₀ cos Ωt, x(0) = x′(0) = 0 ── */

export function amplitudForzada(m: number, k: number, c: number, F0: number, W: number) {
  return F0 / Math.hypot(k - m * W * W, c * W)
}

/** Desfase δ del régimen permanente x = A cos(Ωt − δ), en [0, π]. */
export const desfase = (m: number, k: number, c: number, W: number) => Math.atan2(c * W, k - m * W * W)

/** Solución exacta con condiciones nulas: régimen permanente + homogénea que las cumple. */
export function forzadoExacto(m: number, k: number, c: number, F0: number, W: number, t: number): number {
  const w0 = Math.sqrt(k / m)
  const z = c / (2 * Math.sqrt(k * m))
  const A = amplitudForzada(m, k, c, F0, W)
  const d = desfase(m, k, c, W)
  // particular: A cos(Ωt − δ); en 0 vale A cos δ y su derivada A Ω sin δ
  const xp0 = A * Math.cos(d)
  const vp0 = A * W * Math.sin(d)
  const u0 = -xp0
  const v0 = -vp0
  let xh: number
  const alfa = z * w0
  if (z < 1 - 1e-12) {
    const wd = w0 * Math.sqrt(1 - z * z)
    xh = Math.exp(-alfa * t) * (u0 * Math.cos(wd * t) + ((v0 + alfa * u0) / wd) * Math.sin(wd * t))
  } else if (z > 1 + 1e-12) {
    const q = w0 * Math.sqrt(z * z - 1)
    const r1 = -alfa + q
    const r2 = -alfa - q
    const c1 = (v0 - r2 * u0) / (r1 - r2)
    xh = c1 * Math.exp(r1 * t) + (u0 - c1) * Math.exp(r2 * t)
  } else xh = (u0 + (v0 + alfa * u0) * t) * Math.exp(-alfa * t)
  return A * Math.cos(W * t - d) + xh
}

function Panel({ s, set }: PropsPanel<EstadoOsc>) {
  const md = s.modo !== 'forzado' ? modos(s) : null
  const n = md && !('error' in md) ? md.M.length : 0
  return (
    <>
      <Grupo titulo="Sistema">
        <Segmentado columnas={3} valor={s.modo} opciones={[{ v: 'cadena', t: 'Cadena' }, { v: 'matrices', t: 'M y K' }, { v: 'forzado', t: 'Forzado' }]} onChange={(modo) => set({ modo, ver: 0 })} />
        {s.modo === 'cadena' && (
          <>
            <Rango etiqueta="masas N" valor={s.N} min={1} max={10} paso={1} formato={(v) => String(v)} onChange={(N) => set({ N: Math.round(N), ver: 0 })} />
            <Rango etiqueta="m" valor={s.m} min={0.1} max={5} paso={0.1} onChange={(m) => set({ m })} />
            <Rango etiqueta="k" valor={s.k} min={0.1} max={10} paso={0.1} onChange={(k) => set({ k })} />
            <Segmentado columnas={2} valor={s.extremos} opciones={[{ v: 'fijos', t: 'extremos fijos' }, { v: 'libres', t: 'extremos libres' }]} onChange={(extremos) => set({ extremos })} />
          </>
        )}
        {s.modo === 'matrices' && (
          <>
            <Expresion etiqueta="M =" valor={s.Mtxt} variables={[]} onChange={(Mtxt: string) => set({ Mtxt, ver: 0 })} comprobar={() => null} />
            <Expresion etiqueta="K =" valor={s.Ktxt} variables={[]} onChange={(Ktxt: string) => set({ Ktxt, ver: 0 })} comprobar={() => null} />
          </>
        )}
        {s.modo !== 'forzado' && (
          <>
            <Expresion etiqueta="x(0) =" valor={s.x0} variables={[]} onChange={(x0: string) => set({ x0 })} comprobar={() => null} />
            <Segmentado columnas={3} valor={s.ver} opciones={[{ v: 0, t: 'todo' }, ...Array.from({ length: n }, (_, i) => ({ v: i + 1, t: `modo ${i + 1}` }))]} onChange={(ver) => set({ ver })} />
          </>
        )}
        {s.modo === 'forzado' && (
          <>
            <Rango etiqueta="m" valor={s.mf} min={0.1} max={5} paso={0.1} onChange={(mf) => set({ mf })} />
            <Rango etiqueta="k" valor={s.kf} min={0.1} max={20} paso={0.1} onChange={(kf) => set({ kf })} />
            <Rango etiqueta="amortiguamiento c" valor={s.c} min={0} max={5} paso={0.01} onChange={(c) => set({ c })} />
            <Rango etiqueta="F₀" valor={s.F0} min={0} max={5} paso={0.1} onChange={(F0) => set({ F0 })} />
            <Rango etiqueta="Ω (frecuencia de la fuerza)" valor={s.W} min={0.05} max={8} paso={0.01} onChange={(W) => set({ W })} />
            <Rango etiqueta="Ver t hasta" valor={s.tMax} min={5} max={120} paso={1} onChange={(tMax) => set({ tMax })} />
          </>
        )}
      </Grupo>
      <Resultado />
    </>
  )
}

function leerX0(t: string, n: number): number[] {
  const v = t.split(/[,;\s]+/).filter(Boolean).map(Number)
  return Array.from({ length: n }, (_, i) => (Number.isFinite(v[i]) ? v[i] : 0))
}

function vistaModos(g: Pintor2D, s: EstadoOsc, md: Modos, reloj: number) {
  const n = md.M.length
  const x0 = leerX0(s.x0, n)
  const x = evolucion(md, x0, reloj * 0.8, s.ver)
  const amp = Math.max(0.3, ...x0.map(Math.abs), ...md.V.flat().map((v) => Math.abs(v)))
  // masas en fila, desplazadas horizontalmente; separación de reposo 1
  g.region(0, 0, 1, 0.5)
  const ancho = n + 1
  g.ventana = { x: [-0.3, ancho + 0.3], y: [-1, 1] }
  g.ejes({ rejilla: false })
  const pos = x.map((d, i) => i + 1 + (0.35 * d) / amp)
  const muelle = (a: number, b: number) => {
    const pts: Array<[number, number]> = []
    for (let j = 0; j <= 24; j++) pts.push([a + ((b - a) * j) / 24, j === 0 || j === 24 ? 0 : (j % 2 ? 0.12 : -0.12)])
    g.curva(pts, g.color('--ink-soft'), 1.4)
  }
  const fijos = s.modo === 'cadena' && s.extremos === 'fijos'
  if (fijos || s.modo === 'matrices') {
    g.curva([[0, -0.5], [0, 0.5]], g.color('--ink'), 3)
    g.curva([[ancho, -0.5], [ancho, 0.5]], g.color('--ink'), 3)
    muelle(0, pos[0] - 0.15)
    muelle(pos[n - 1] + 0.15, ancho)
  }
  for (let i = 0; i < n - 1; i++) muelle(pos[i] + 0.15, pos[i + 1] - 0.15)
  pos.forEach((p) => g.rellenar([[p - 0.15, -0.2], [p + 0.15, -0.2], [p + 0.15, 0.2], [p - 0.15, 0.2]], g.color('--accent'), 0.85))
  g.finRegion()

  // formas de los modos (desplazamiento de cada masa) y frecuencias
  g.region(0, 0.5, 0.6, 0.5)
  g.fondoRegion(g.color('--ground'))
  const vmax = Math.max(1e-9, ...md.V.flat().map(Math.abs))
  // con extremos fijos las paredes son nodos: se dibujan para que se vea la forma sinusoidal
  const paredes = s.modo === 'cadena' && s.extremos === 'fijos'
  g.ventana = { x: paredes ? [-0.2, n + 1.2] : [0.5, n + 0.5], y: [-1.2 * vmax, 1.2 * vmax] }
  g.ejes({ etiquetaX: 'masa', etiquetaY: 'modo' })
  for (let i = 0; i < n; i++) {
    if (s.ver && s.ver - 1 !== i) continue
    const pts = md.V.map((f, p) => [p + 1, f[i]] as [number, number])
    if (paredes) pts.unshift([0, 0]), pts.push([n + 1, 0])
    g.curva(pts, g.color(COLORES[i % COLORES.length]), 1.8)
    for (const [x, y] of pts.slice(paredes ? 1 : 0, paredes ? -1 : undefined)) g.punto(x, y, g.color(COLORES[i % COLORES.length]), 3)
  }
  g.finRegion()

  g.region(0.6, 0.5, 0.4, 0.5)
  const wmax = Math.max(1e-9, ...md.w)
  g.ventana = { x: [0, n + 1], y: [0, 1.15 * wmax] }
  g.ejes({ etiquetaX: 'n', etiquetaY: 'ω' })
  if (s.modo === 'cadena') {
    // relación de dispersión continua ω(q) = 2√(k/m)|sin(qa/2)|, muestreada por los modos
    const w0 = 2 * Math.sqrt(s.k / s.m)
    const curva: Array<[number, number]> = []
    for (let j = 0; j <= 100; j++) {
      const nn = (j / 100) * (n + 1)
      curva.push([nn, w0 * Math.abs(Math.sin((nn * Math.PI) / (2 * (s.extremos === 'fijos' ? n + 1 : n))))])
    }
    g.curva(curva, g.color('--grid'), 1.2, true)
  }
  md.w.forEach((w, i) => g.punto(s.modo === 'cadena' && s.extremos === 'libres' ? i : i + 1, w, g.color('--accent'), 4))
  g.finRegion()
}

function vistaForzado(g: Pintor2D, s: EstadoOsc) {
  const ts = Array.from({ length: 1200 }, (_, i) => (s.tMax * i) / 1199)
  const xs = ts.map((t) => forzadoExacto(s.mf, s.kf, s.c, s.F0, s.W, t))
  const A = amplitudForzada(s.mf, s.kf, s.c, s.F0, s.W)
  const m = Math.max(1e-9, ...xs.map(Math.abs))
  g.region(0, 0, 1, 0.5)
  g.ventana = { x: [0, s.tMax], y: [-1.2 * m, 1.2 * m] }
  g.ejes({ etiquetaX: 't', etiquetaY: 'x' })
  if (Number.isFinite(A)) {
    g.curva([[0, A], [s.tMax, A]], g.color('--grid'), 1, true)
    g.curva([[0, -A], [s.tMax, -A]], g.color('--grid'), 1, true)
  }
  g.curva(ts.map((t, i) => [t, xs[i]] as [number, number]), g.color('--accent'), 1.8)
  g.finRegion()

  const w0 = Math.sqrt(s.kf / s.mf)
  const Wmax = Math.max(3 * w0, 1.2 * s.W)
  const Ws = Array.from({ length: 500 }, (_, i) => (Wmax * (i + 1)) / 500)
  const As = Ws.map((W) => amplitudForzada(s.mf, s.kf, s.c, s.F0, W))
  const top = Math.min(Math.max(...As.filter(Number.isFinite)), 50 * (s.F0 / s.kf || 1))
  g.region(0, 0.5, 0.55, 0.5)
  g.fondoRegion(g.color('--ground'))
  g.ventana = { x: [0, Wmax], y: [0, 1.15 * top] }
  g.ejes({ etiquetaX: 'Ω', etiquetaY: 'A' })
  g.curva(Ws.map((W, i) => [W, Math.min(As[i], 2 * top)] as [number, number]), g.color('--accent'), 2)
  g.curva([[w0, 0], [w0, 1.15 * top]], g.color('--pos'), 1, true)
  if (Number.isFinite(A)) g.punto(s.W, Math.min(A, 1.1 * top), g.color('--ink'), 4)
  g.finRegion()

  g.region(0.55, 0.5, 0.45, 0.5)
  g.ventana = { x: [0, Wmax], y: [-0.2, Math.PI + 0.3] }
  g.ejes({ etiquetaX: 'Ω', etiquetaY: 'δ' })
  g.curva(Ws.map((W) => [W, desfase(s.mf, s.kf, s.c, W)] as [number, number]), g.color('--neg'), 2)
  g.curva([[0, Math.PI / 2], [Wmax, Math.PI / 2]], g.color('--grid'), 1, true)
  g.punto(s.W, desfase(s.mf, s.kf, s.c, s.W), g.color('--ink'), 4)
  g.finRegion()
}

export default definir<EstadoOsc>({
  id: 'oscilaciones',
  area: 'mecanica',
  resumen: 'Oscilaciones acopladas y modos normales, relación de dispersión, oscilador forzado y resonancia',
  corto: 'Oscilaciones',
  titulo: 'Oscilaciones y <i>modos normales</i>',
  entradilla: 'Masas y muelles: sus modos, cómo se superponen, y qué pasa cuando se les empuja.',
  inicial: { modo: 'cadena', N: 3, m: 1, k: 1, extremos: 'fijos', Mtxt: '1, 0; 0, 2', Ktxt: '3, -1; -1, 2', ver: 0, x0: '1, 0, 0', mf: 1, kf: 4, c: 0.2, F0: 1, W: 1.9, tMax: 60 },
  Panel,
  resultadoEnPanel: true,
  rotulo: (s) => ({ nombre: s.modo === 'forzado' ? 'm ẍ + c ẋ + k x = F₀ cos Ωt' : 'M ẍ + K x = 0', apunte: s.modo }),
  formula: (s) =>
    s.modo === 'forzado'
      ? [String.raw`A(\Omega)=\frac{F_0}{\sqrt{(k-m\Omega^2)^2+(c\Omega)^2}}`, String.raw`\tan\delta=\frac{c\Omega}{k-m\Omega^2}`, String.raw`\Omega_r=\omega_0\sqrt{1-2\zeta^2},\quad \zeta=\frac{c}{2\sqrt{km}}`]
      : [String.raw`K\,\mathbf v=\omega^2 M\,\mathbf v,\qquad \mathbf x(t)=\sum_i \mathbf v_i\,(\mathbf v_i^{\mathsf T}M\mathbf x_0)\cos\omega_i t`],
  lecturas: (s) => {
    if (s.modo === 'forzado') {
      const w0 = Math.sqrt(s.kf / s.mf)
      const z = s.c / (2 * Math.sqrt(s.kf * s.mf))
      const filas: Array<[string, string]> = [
        ['ω₀ = √(k/m)', w0.toFixed(5)],
        ['ζ', z.toFixed(5)],
        ['Amplitud estacionaria A(Ω)', amplitudForzada(s.mf, s.kf, s.c, s.F0, s.W).toFixed(6)],
        ['Desfase δ', `${((desfase(s.mf, s.kf, s.c, s.W) * 180) / Math.PI).toFixed(3)}°`],
      ]
      if (z < Math.SQRT1_2) filas.push(['Pico de resonancia Ω_r', (w0 * Math.sqrt(1 - 2 * z * z)).toFixed(5)])
      else filas.push(['Pico de resonancia', 'no hay (ζ ≥ 1/√2)'])
      if (s.c === 0 && Math.abs(s.W - w0) > 1e-9) filas.push(['Batidos: periodo 2π/|Ω − ω₀|', ((2 * Math.PI) / Math.abs(s.W - w0)).toFixed(4)])
      return filas
    }
    const md = modos(s)
    if ('error' in md) return [['No se puede', md.error]]
    return md.w.map((w, i) => [`ω${i + 1}`, `${w.toFixed(6)}   (T = ${w > 1e-12 ? ((2 * Math.PI) / w).toFixed(4) : '∞'})`] as [string, string])
  },
  leyenda: (s) =>
    s.modo === 'forzado' ? (
      <>
        <Muestra color="var(--accent)">x(t) y A(Ω)</Muestra>
        <Muestra color="var(--neg)">desfase</Muestra>
        <Muestra color="var(--pos)">ω₀</Muestra>
      </>
    ) : (
      <>
        {Array.from({ length: Math.min(s.modo === 'cadena' ? s.N : 6, 6) }, (_, i) => (
          <Muestra key={i} color={`var(${COLORES[i]})`}>modo {i + 1}</Muestra>
        ))}
      </>
    ),
  comparaciones: [
    { t: 'Sin y con amortiguamiento', a: { modo: 'forzado', c: 0 }, b: { modo: 'forzado', c: 0.5 } },
    { t: 'Extremos fijos contra libres', a: { modo: 'cadena', extremos: 'fijos' }, b: { modo: 'cadena', extremos: 'libres' } },
  ],
  vista: (s) => ({
    tipo: '2d',
    clave: s.modo === 'forzado' ? 'forzado' : 'modos',
    navegable: false,
    animada: (st) => st.modo !== 'forzado',
    dibujar(g, st, reloj) {
      if (st.modo === 'forzado') return vistaForzado(g, st)
      const md = modos(st)
      if ('error' in md) {
        g.ventana = { x: [-1, 1], y: [-1, 1] }
        g.texto(md.error, -0.95, 0.8, g.color('--pos'))
        return
      }
      vistaModos(g, st, md, reloj ?? 0)
    },
  }),
})
