import { definir, type PropsPanel } from '../../nucleo/tipos'
import { radios } from '../../nucleo/menu'
import { Atajos, Expresion, Grupo, Muestra, Rango, Resultado, Segmentado } from '../../nucleo/controles'
import { compilarSuave } from '../../lib/expresion'
import { transformada, VENTANAS, integrarTrozos } from '../../lib/senales'
import { fft } from '../../lib/fft'
import type { Pintor2D } from '../../render/pintor2d'

type Modo = 'espectro' | 'muestreo' | 'dft'

export interface EstadoTransformada {
  expr: string
  L: number
  modo: Modo
  nuMax: number
  fs: number
  ventana: 'rectangular' | 'hann' | 'hamming' | 'blackman'
  Nd: number
  ver: 'modulo' | 'fase' | 'reim'
}

const EJEMPLOS: Array<{ t: string; e: string; L: number }> = [
  { t: 'gaussiana', e: 'exp(-pi*t^2)', L: 4 },
  { t: 'rect', e: 'rect(t)', L: 3 },
  { t: 'tri', e: 'tri(t)', L: 3 },
  { t: 'exp(−|t|)', e: 'exp(-|t|)', L: 12 },
  { t: 'causal exp(−t)', e: 'exp(-t)*heaviside(t)', L: 14 },
  { t: 'ráfaga', e: 'cos(2*pi*3*t)*exp(-t^2)', L: 5 },
  { t: 'sinc²', e: 'sinc(t)^2', L: 16 },
]

/** DTFT de las muestras x(n/fs), escalada por Tₛ: por Poisson es Σₖ X(ν − k·fs). */
export function dtftMuestras(x: (t: number) => number, fs: number, L: number, nus: ArrayLike<number>) {
  const n0 = Math.ceil(-L * fs)
  const n1 = Math.floor(L * fs)
  const re = new Float64Array(nus.length)
  const im = new Float64Array(nus.length)
  for (let k = 0; k < nus.length; k++) {
    let sr = 0
    let si = 0
    for (let n = n0; n <= n1; n++) {
      const v = x(n / fs)
      if (!Number.isFinite(v)) continue
      const a = (-2 * Math.PI * nus[k] * n) / fs
      sr += v * Math.cos(a)
      si += v * Math.sin(a)
    }
    re[k] = sr / fs
    im[k] = si / fs
  }
  return { re, im }
}

/** Reconstrucción de Whittaker–Shannon x_r(t) = Σ x(n/fs) sinc(fs·t − n). */
export function reconstruir(x: (t: number) => number, fs: number, L: number, t: number) {
  let s = 0
  for (let n = Math.ceil(-L * fs); n <= Math.floor(L * fs); n++) {
    const v = x(n / fs)
    if (!Number.isFinite(v)) continue
    const u = fs * t - n
    s += v * (u === 0 ? 1 : Math.sin(Math.PI * u) / (Math.PI * u))
  }
  return s
}

/** Ancho de banda que contiene el 99,9 % de la energía (∫|X|² dν = ∫x² dt por Plancherel). */
export function anchoDeBanda(x: (t: number) => number, L: number): number {
  const energia = integrarTrozos((t) => x(t) ** 2, -L, L, 1600)
  if (!(energia > 0)) return 0
  const paso = 0.02
  let acum = 0
  let nu = 0
  for (let k = 0; k < 2000; k++) {
    const nus = [nu + paso / 2]
    const X = transformada(x, L, nus, 400)
    acum += 2 * paso * (X.re[0] ** 2 + X.im[0] ** 2)
    nu += paso
    if (acum >= 0.999 * energia) return nu
  }
  return Infinity
}

let cacheAncho = { clave: '', v: 0 }
// el espectro continuo solo depende de la señal, L y la banda: mover fₛ, N o la ventana no lo recalcula
let cacheX: { clave: string; X: { re: Float64Array; im: Float64Array } } = { clave: '', X: { re: new Float64Array(0), im: new Float64Array(0) } }

function Panel({ s, set }: PropsPanel<EstadoTransformada>) {
  return (
    <>
      <Grupo titulo="Señal">
        <Expresion etiqueta="x(t) =" valor={s.expr} variables={['t']} onChange={(expr: string) => set({ expr })} />
        <Atajos opciones={EJEMPLOS.map((ej) => ({ t: ej.t, activo: s.expr === ej.e, onClick: () => set({ expr: ej.e, L: ej.L }) }))} />
        <Rango etiqueta="Soporte |t| ≤ L" valor={s.L} min={1} max={30} paso={0.5} onChange={(L) => set({ L })} />
      </Grupo>
      <Grupo titulo="Qué mirar">
        <Segmentado
         
          valor={s.modo}
          opciones={[
            { v: 'espectro', t: 'Espectro' },
            { v: 'muestreo', t: 'Muestreo' },
            { v: 'dft', t: 'DFT' },
          ]}
          onChange={(modo) => set({ modo })}
        />
        {s.modo === 'espectro' && (
          <Segmentado
           
            valor={s.ver}
            opciones={[
              { v: 'modulo', t: '|X|' },
              { v: 'fase', t: 'fase' },
              { v: 'reim', t: 'Re e Im' },
            ]}
            onChange={(ver) => set({ ver })}
          />
        )}
        <Rango etiqueta="Banda |ν| ≤" valor={s.nuMax} min={0.5} max={12} paso={0.1} onChange={(nuMax) => set({ nuMax })} />
        {s.modo === 'muestreo' && <Rango etiqueta="Frecuencia de muestreo fₛ" valor={s.fs} min={0.5} max={20} paso={0.1} onChange={(fs) => set({ fs })} />}
        {s.modo === 'dft' && (
          <>
            <Segmentado
             
              valor={s.ventana}
              opciones={[
                { v: 'rectangular', t: 'Rectangular' },
                { v: 'hann', t: 'Hann' },
                { v: 'hamming', t: 'Hamming' },
                { v: 'blackman', t: 'Blackman' },
              ]}
              onChange={(ventana) => set({ ventana })}
            />
            <Rango etiqueta="Muestras N" valor={s.Nd} min={8} max={512} paso={1} formato={(v) => String(Math.round(v))} onChange={(Nd) => set({ Nd: Math.round(Nd) })} />
          </>
        )}
      </Grupo>
      <Resultado />
    </>
  )
}

const REPARTO = 0.45

function marcoY(vals: number[], simetrico = false): [number, number] {
  let lo = Math.min(0, ...vals.filter(Number.isFinite))
  let hi = Math.max(0, ...vals.filter(Number.isFinite))
  if (simetrico) {
    const m = Math.max(Math.abs(lo), Math.abs(hi))
    lo = -m
    hi = m
  }
  const pad = 0.12 * (hi - lo || 1)
  return [lo - pad, hi + pad]
}

function dibujarTiempo(g: Pintor2D, s: EstadoTransformada, x: (t: number) => number) {
  const M = 1200
  const pts: Array<[number, number]> = []
  for (let i = 0; i <= M; i++) {
    const t = -s.L + (2 * s.L * i) / M
    pts.push([t, x(t)])
  }
  g.ventana = { x: [-s.L, s.L], y: marcoY(pts.map((p) => p[1])) }
  g.ejes({ etiquetaX: 't', etiquetaY: 'x' })
  g.curva(pts, g.color('--ink'), 2)
  if (s.modo === 'muestreo') {
    const col = g.color('--pos')
    for (let n = Math.ceil(-s.L * s.fs); n <= Math.floor(s.L * s.fs); n++) {
      const t = n / s.fs
      const v = x(t)
      if (!Number.isFinite(v)) continue
      g.curva([[t, 0], [t, v]], col, 1)
      g.punto(t, v, col, 2.5)
    }
    const rec: Array<[number, number]> = []
    for (let i = 0; i <= 600; i++) {
      const t = -s.L + (2 * s.L * i) / 600
      rec.push([t, reconstruir(x, s.fs, s.L, t)])
    }
    g.curva(rec, g.color('--accent'), 1.8, true)
  }
  if (s.modo === 'dft') {
    const w = VENTANAS[s.ventana]
    const col = g.color('--pos')
    const dt = (2 * s.L) / s.Nd
    const pv: Array<[number, number]> = []
    for (let n = 0; n < s.Nd; n++) {
      const t = -s.L + n * dt
      pv.push([t, w(n, s.Nd) * g.ventana.y[1] * 0.85])
    }
    g.curva(pv, g.color('--grid'), 1.2, true)
    if (s.Nd <= 128)
      for (let n = 0; n < s.Nd; n++) {
        const t = -s.L + n * dt
        g.punto(t, x(t) * w(n, s.Nd), col, 2)
      }
  }
}

/** DFT de N muestras en [−L, L) con ventana, escalada por Δt y con la fase de t = −L corregida: aproxima X(νₖ). */
export function dftEscalada(x: (t: number) => number, L: number, Nd: number, ventana: keyof typeof VENTANAS) {
  const dt = (2 * L) / Nd
  const w = VENTANAS[ventana]
  const muestras = Array.from({ length: Nd }, (_, n) => {
    const v = x(-L + n * dt) * w(n, Nd)
    return Number.isFinite(v) ? v : 0
  })
  const X = fft(muestras)
  const out: Array<{ nu: number; re: number; im: number }> = []
  for (let k = 0; k < Nd; k++) {
    const kk = k <= Nd / 2 ? k : k - Nd
    const nu = kk / (Nd * dt)
    // la primera muestra está en t = −L, no en 0: X(ν) ≈ Δt·e^{+2πiνL}·Xₖ
    const a = 2 * Math.PI * nu * L
    const re = dt * (X.re[k] * Math.cos(a) - X.im[k] * Math.sin(a))
    const im = dt * (X.re[k] * Math.sin(a) + X.im[k] * Math.cos(a))
    out.push({ nu, re, im })
  }
  return out.sort((p, q) => p.nu - q.nu)
}

function dibujarFrecuencia(g: Pintor2D, s: EstadoTransformada, x: (t: number) => number) {
  const M = 500
  const nus = Array.from({ length: M + 1 }, (_, i) => -s.nuMax + (2 * s.nuMax * i) / M)
  const clave = `${s.expr}|${s.L}|${s.nuMax}`
  if (cacheX.clave !== clave) cacheX = { clave, X: transformada(x, s.L, nus) }
  const X = cacheX.X
  const mod = nus.map((_, i) => Math.hypot(X.re[i], X.im[i]))
  const tinta = g.color('--ink')
  if (s.modo === 'espectro' && s.ver === 'fase') {
    g.ventana = { x: [-s.nuMax, s.nuMax], y: [-3.6, 3.6] }
    g.ejes({ etiquetaX: 'ν', etiquetaY: 'arg X' })
    const mx = Math.max(...mod)
    let tramo: Array<[number, number]> = []
    let prev = NaN
    for (let i = 0; i <= M; i++) {
      // la fase de un valor ~0 es ruido: no se dibuja
      if (mod[i] < 1e-6 * mx) {
        if (tramo.length > 1) g.curva(tramo, g.color('--neg'), 1.8)
        tramo = []
        prev = NaN
        continue
      }
      const f = Math.atan2(X.im[i], X.re[i])
      if (Number.isFinite(prev) && Math.abs(f - prev) > Math.PI) {
        if (tramo.length > 1) g.curva(tramo, g.color('--neg'), 1.8)
        tramo = []
      }
      tramo.push([nus[i], f])
      prev = f
    }
    if (tramo.length > 1) g.curva(tramo, g.color('--neg'), 1.8)
    return
  }
  if (s.modo === 'espectro' && s.ver === 'reim') {
    g.ventana = { x: [-s.nuMax, s.nuMax], y: marcoY([...X.re, ...X.im], true) }
    g.ejes({ etiquetaX: 'ν' })
    g.curva(nus.map((n, i) => [n, X.re[i]]), g.color('--pos'), 2)
    g.curva(nus.map((n, i) => [n, X.im[i]]), g.color('--neg'), 2)
    return
  }
  const extra: number[] = []
  let alias: { re: Float64Array; im: Float64Array } | null = null
  if (s.modo === 'muestreo') {
    alias = dtftMuestras(x, s.fs, s.L, nus)
    for (let i = 0; i <= M; i++) extra.push(Math.hypot(alias.re[i], alias.im[i]))
  }
  let bins: ReturnType<typeof dftEscalada> = []
  if (s.modo === 'dft') {
    bins = dftEscalada(x, s.L, s.Nd, s.ventana).filter((b) => Math.abs(b.nu) <= s.nuMax)
    for (const b of bins) extra.push(Math.hypot(b.re, b.im))
  }
  g.ventana = { x: [-s.nuMax, s.nuMax], y: marcoY([...mod, ...extra]) }
  g.ejes({ etiquetaX: 'ν', etiquetaY: '|X|' })
  if (s.modo === 'muestreo') {
    const h = s.fs / 2
    g.rellenar([[-h, g.ventana.y[0]], [h, g.ventana.y[0]], [h, g.ventana.y[1]], [-h, g.ventana.y[1]]], g.color('--accent'), 0.07)
    g.curva(nus.map((n, i) => [n, extra[i]]), g.color('--accent'), 2)
  }
  g.curva(nus.map((n, i) => [n, mod[i]]), tinta, s.modo === 'espectro' ? 2.2 : 1.4, s.modo !== 'espectro')
  if (s.modo === 'dft') {
    const col = g.color('--pos')
    for (const b of bins) {
      const A = Math.hypot(b.re, b.im)
      g.curva([[b.nu, 0], [b.nu, A]], col, 1.2)
      g.punto(b.nu, A, col, 2.2)
    }
  }
}

export default definir<EstadoTransformada>({
  id: 'transformada',
  area: 'senales',
  resumen: 'Transformada de Fourier, muestreo, aliasing y DFT con ventanas',
  corto: 'Transformada de Fourier',
  titulo: 'Transformada de <i>Fourier</i>',
  entradilla: 'Espectro continuo de una señal escrita, qué le hace el muestreo y cómo lo ve la DFT.',
  inicial: { expr: 'cos(2*pi*3*t)*exp(-t^2)', L: 5, modo: 'espectro', nuMax: 5, fs: 5, ventana: 'hann', Nd: 64, ver: 'modulo' },
  Panel,
  menu: (s) => ({
    ejemplos: EJEMPLOS.map((e) => ({ t: e.t, tipo: 'radio' as const, activo: s.expr === e.e, hacer: () => ({ expr: e.e, L: e.L }) })),
    acciones: [
      radios<EstadoTransformada, Modo>('Qué mirar', [{ v: 'espectro', t: 'Espectro continuo' }, { v: 'muestreo', t: 'Muestreo y aliasing' }, { v: 'dft', t: 'DFT con ventana' }], s.modo, (modo) => ({ modo })),
      radios<EstadoTransformada, EstadoTransformada['ventana']>('Ventana', [{ v: 'rectangular', t: 'Rectangular' }, { v: 'hann', t: 'Hann' }, { v: 'hamming', t: 'Hamming' }, { v: 'blackman', t: 'Blackman' }], s.ventana, (ventana) => ({ ventana })),
      radios<EstadoTransformada, EstadoTransformada['ver']>('Espectro', [{ v: 'modulo', t: 'Módulo' }, { v: 'fase', t: 'Fase' }, { v: 'reim', t: 'Re e Im' }], s.ver, (ver) => ({ ver })),
    ],
  }),
  resultadoEnPanel: true,
  rotulo: (s) => ({ nombre: s.modo === 'muestreo' ? `fₛ = ${s.fs}` : s.modo === 'dft' ? `N = ${s.Nd}` : 'X(ν)', apunte: s.modo }),
  formula: (s) => {
    const base = [String.raw`X(\nu)=\int_{-\infty}^{\infty}x(t)\,e^{-2\pi i\nu t}\,dt`]
    if (s.modo === 'muestreo')
      base.push(String.raw`T_s\sum_n x(nT_s)\,e^{-2\pi i\nu nT_s}=\sum_k X(\nu-k f_s)`, String.raw`x_r(t)=\sum_n x(nT_s)\,\mathrm{sinc}(f_s t-n)`)
    if (s.modo === 'dft') base.push(String.raw`X_k=\sum_{n=0}^{N-1}w_n\,x_n\,e^{-2\pi i kn/N},\quad \nu_k=\frac{k}{N\Delta t}`)
    return base
  },
  lecturas: (s) => {
    const { f: x, error } = compilarSuave(s.expr, ['t'])
    if (!x) return [['Estado', error ?? 'expresión incompleta']]
    const clave = `${s.expr}|${s.L}`
    if (cacheAncho.clave !== clave) cacheAncho = { clave, v: anchoDeBanda(x, s.L) }
    const B = cacheAncho.v
    const X0 = transformada(x, s.L, [0])
    const filas: Array<[string, string]> = [
      ['X(0) = ∫x dt', (Math.abs(X0.re[0]) < 5e-7 ? 0 : X0.re[0]).toFixed(6)],
      ['Energía ∫x² dt', integrarTrozos((t) => x(t) ** 2, -s.L, s.L, 1600).toFixed(6)],
      ['Banda con el 99.9 % de la energía', Number.isFinite(B) ? `|ν| ≤ ${B.toFixed(2)}` : 'más allá de la ventana'],
    ]
    if (s.modo === 'muestreo') {
      filas.push(['Frecuencia de Nyquist fₛ/2', (s.fs / 2).toFixed(3)])
      filas.push(['¿Hay aliasing?', B > s.fs / 2 ? `sí: fₛ < 2B = ${(2 * B).toFixed(2)}` : 'no (fₛ ≥ 2B)'])
      let e2 = 0
      for (let i = 0; i <= 400; i++) {
        const t = -s.L / 2 + (s.L * i) / 400
        e2 += (x(t) - reconstruir(x, s.fs, s.L, t)) ** 2
      }
      filas.push(['Error de reconstrucción (rms en |t| ≤ L/2)', Math.sqrt(e2 / 401).toExponential(2)])
    }
    if (s.modo === 'dft') {
      const dt = (2 * s.L) / s.Nd
      filas.push(['Δt', dt.toFixed(4)])
      filas.push(['Resolución Δν = 1/(NΔt)', (1 / (s.Nd * dt)).toFixed(4)])
      filas.push(['Frecuencia máxima 1/(2Δt)', (1 / (2 * dt)).toFixed(3)])
      filas.push(['¿Se pliega el espectro?', B > 1 / (2 * dt) ? 'sí: la banda pasa de 1/(2Δt), sube N' : 'no'])
    }
    return filas
  },
  leyenda: (s) => (
    <>
      <Muestra color="var(--ink)">{s.modo === 'espectro' ? 'X(ν) continua' : 'x(t) y |X(ν)|'}</Muestra>
      {s.modo === 'muestreo' && (
        <>
          <Muestra color="var(--pos)">muestras</Muestra>
          <Muestra color="var(--accent)">reconstrucción · espectro periodizado</Muestra>
        </>
      )}
      {s.modo === 'dft' && <Muestra color="var(--pos)">Δt·|Xₖ|</Muestra>}
      {s.modo === 'espectro' && s.ver === 'reim' && (
        <>
          <Muestra color="var(--pos)">Re X</Muestra>
          <Muestra color="var(--neg)">Im X</Muestra>
        </>
      )}
    </>
  ),
  comparaciones: [
    { t: 'Muestreo suficiente contra aliasing', a: { modo: 'muestreo', fs: 8 }, b: { modo: 'muestreo', fs: 4 } },
    { t: 'Ventana rectangular contra Hann', a: { modo: 'dft', ventana: 'rectangular' }, b: { modo: 'dft', ventana: 'hann' } },
  ],
  vista: {
    tipo: '2d',
    navegable: false,
    dibujar(g, s) {
      const { f: x, error } = compilarSuave(s.expr, ['t'])
      if (!x) {
        g.ventana = { x: [-1, 1], y: [-1, 1] }
        g.texto(error ?? 'la expresión no es válida', -0.9, 0.8, g.color('--pos'))
        return
      }
      g.region(0, 0, 1, REPARTO)
      dibujarTiempo(g, s, x)
      g.finRegion()
      g.region(0, REPARTO, 1, 1 - REPARTO)
      g.panel()
      dibujarFrecuencia(g, s, x)
      g.finRegion()
    },
  },
})
