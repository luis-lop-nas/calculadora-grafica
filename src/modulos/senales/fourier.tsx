import { definir, type PropsPanel } from '../../nucleo/tipos'
import { Atajos, Expresion, Grupo, Interruptor, Muestra, Rango, Resultado, Segmentado } from '../../nucleo/controles'
import { compilarSuave } from '../../lib/expresion'
import { coeficientesFourier, sumaParcial, type Coeficientes } from '../../lib/senales'
import { identificar } from '../../lib/cas/limites'
import { tex as texE } from '../../lib/cas/tex'
import type { Pintor2D } from '../../render/pintor2d'

export interface EstadoFourier {
  expr: string
  /** periodo en unidades de π */
  periodoPi: number
  N: number
  fejer: boolean
  espectro: 'amplitud' | 'coeficientes'
  sonda: number
}

const EJEMPLOS: Array<{ t: string; e: string; T: number }> = [
  { t: 'cuadrada', e: 'sgn(t)', T: 2 },
  { t: 'sierra', e: 't/pi', T: 2 },
  { t: 'triangular', e: '|t|', T: 2 },
  { t: 'rectificada', e: '|sin(t)|', T: 2 },
  { t: 'parábola', e: 't^2', T: 2 },
  { t: 'pulso', e: 'rect(t)', T: 4 },
  { t: 'eᵗ', e: 'exp(t)', T: 2 },
]

const MAXN = 400

let cache: { clave: string; c: Coeficientes | null; error: string | null } = { clave: '', c: null, error: null }

/** Coeficientes hasta MAXN, cacheados por expresión y periodo (el deslizador de N no recalcula). */
export function analizar(s: Pick<EstadoFourier, 'expr' | 'periodoPi'>): { c: Coeficientes | null; f: ((t: number) => number) | null; error: string | null } {
  const { f, error } = compilarSuave(s.expr, ['t'])
  const clave = `${s.expr}|${s.periodoPi}`
  if (!f) return { c: null, f: null, error: error ?? 'expresión incompleta' }
  if (cache.clave !== clave) {
    const T = s.periodoPi * Math.PI
    try {
      cache = { clave, c: coeficientesFourier(f, T, MAXN), error: null }
    } catch (e) {
      cache = { clave, c: null, error: (e as Error).message }
    }
  }
  return { c: cache.c, f, error: cache.error }
}

/** Extensión periódica de f desde [−T/2, T/2). */
const periodica = (f: (t: number) => number, T: number) => (t: number) => f(t - T * Math.floor((t + T / 2) / T))

/** Saltos de la extensión periódica en [−T/2, T/2]: los interiores y, si f(−T/2) ≠ f(T/2), el de los extremos. */
export function saltos(f: (t: number) => number, c: Coeficientes): Array<{ t: number; izq: number; der: number }> {
  const T = c.T
  const e = 1e-9 * T
  const out = c.saltos.map((t) => ({ t, izq: f(t - e), der: f(t + e) }))
  const ia = f(T / 2 - e)
  const da = f(-T / 2 + e)
  if (Math.abs(ia - da) > 1e-6 * Math.max(1, Math.abs(ia), Math.abs(da))) out.push({ t: T / 2, izq: ia, der: da })
  return out
}

/**
 * Sobreoscilación de S_N en el primer salto, en % del salto: se busca el extremo de S_N a la derecha
 * del salto (en el primer lóbulo, antes de 3T/N) y se compara con el valor límite f(τ⁺).
 */
export function sobreoscilacion(f: (t: number) => number, c: Coeficientes, N: number): number | null {
  const ss = saltos(f, c)
  if (!ss.length) return null
  const { t: tau, der, izq } = ss[0]
  const J = der - izq
  let ext = der
  const M = 600
  for (let i = 1; i <= M; i++) {
    const t = tau + ((3 * c.T) / (N + 1)) * (i / M)
    const v = sumaParcial(c, N, t)
    ext = J > 0 ? Math.max(ext, v) : Math.min(ext, v)
  }
  return (100 * (ext - der)) / J
}

/** Energía de S_N: a₀²/4 + ½Σ(aₙ² + bₙ²), que por Parseval tiende a (1/T)∫f². */
export function energia(c: Coeficientes, N: number) {
  let e = (c.a[0] * c.a[0]) / 4
  for (let n = 1; n <= N; n++) e += (c.a[n] * c.a[n] + c.b[n] * c.b[n]) / 2
  return e
}

const exacto = (v: number) => {
  if (Math.abs(v) < 1e-11) return '0'
  const x = identificar(v)
  return x ? texE(x) : v.toFixed(5)
}

function Panel({ s, set }: PropsPanel<EstadoFourier>) {
  return (
    <>
      <Grupo titulo="Señal en un periodo">
        <Expresion etiqueta="f(t) =" valor={s.expr} variables={['t']} onChange={(expr: string) => set({ expr })} />
        <Atajos opciones={EJEMPLOS.map((ej) => ({ t: ej.t, activo: s.expr === ej.e && s.periodoPi === ej.T, onClick: () => set({ expr: ej.e, periodoPi: ej.T }) }))} />
        <Rango etiqueta="Periodo T" valor={s.periodoPi} min={0.5} max={8} paso={0.5} formato={(v) => `${v}π`} onChange={(periodoPi) => set({ periodoPi })} />
      </Grupo>
      <Resultado />
      <Grupo titulo="Suma parcial">
        <Rango etiqueta="Armónicos N" valor={s.N} min={0} max={MAXN} paso={1} formato={(v) => String(v)} onChange={(N) => set({ N })} />
        <Segmentado
          valor={s.espectro}
          opciones={[
            { v: 'amplitud', t: 'Amplitud Aₙ' },
            { v: 'coeficientes', t: 'aₙ y bₙ' },
          ]}
          onChange={(espectro) => set({ espectro })}
        />
        <div className="interruptores">
          <Interruptor activo={s.fejer} onChange={(fejer) => set({ fejer })}>
            Media de Fejér σ_N (sin Gibbs)
          </Interruptor>
        </div>
      </Grupo>
    </>
  )
}

const REPARTO = 0.62

function dibujarTiempo(g: Pintor2D, s: EstadoFourier, f: (t: number) => number, c: Coeficientes) {
  const T = c.T
  const fp = periodica(f, T)
  let lo = Infinity
  let hi = -Infinity
  for (let i = 0; i <= 800; i++) {
    const v = f(-T / 2 + (T * i) / 800)
    if (Number.isFinite(v)) {
      lo = Math.min(lo, v)
      hi = Math.max(hi, v)
    }
  }
  if (!Number.isFinite(lo)) {
    lo = -1
    hi = 1
  }
  const m = Math.max(0.25, 0.22 * (hi - lo))
  g.ventana = { x: [-1.5 * T, 1.5 * T], y: [Math.min(lo, 0) - m, Math.max(hi, 0) + m] }
  g.ejes({ etiquetaX: 't', etiquetaY: 'f' })
  // extensión periódica, sin unir los saltos
  const pts: Array<[number, number]> = []
  const trazar = () => {
    if (pts.length > 1) g.curva(pts, g.color('--ink-soft'), 1.6)
    pts.length = 0
  }
  const M = 1500
  let prev = NaN
  for (let i = 0; i <= M; i++) {
    const t = -1.5 * T + (3 * T * i) / M
    const v = fp(t)
    if (!Number.isFinite(v) || (Number.isFinite(prev) && Math.abs(v - prev) > 0.2 * (hi - lo + 1e-9) && Math.abs(v - prev) > 1e-6)) trazar()
    if (Number.isFinite(v)) pts.push([t, v])
    prev = v
  }
  trazar()
  const suma: Array<[number, number]> = []
  const muestras = Math.min(3000, 400 + 12 * s.N)
  for (let i = 0; i <= muestras; i++) {
    const t = -1.5 * T + (3 * T * i) / muestras
    suma.push([t, sumaParcial(c, s.N, t, s.fejer)])
  }
  g.curva(suma, g.color(s.fejer ? '--neg' : '--accent'), 2.2)
  for (const k of [-1, 0, 1]) {
    g.curva([[-T / 2 + k * T, g.ventana.y[0]], [-T / 2 + k * T, g.ventana.y[1]]], g.color('--grid'), 1, true)
  }
  const v = sumaParcial(c, s.N, s.sonda, s.fejer)
  g.curva([[s.sonda, fp(s.sonda)], [s.sonda, v]], g.color('--pos'), 1.2, true)
  g.punto(s.sonda, fp(s.sonda), g.color('--ink'), 3)
}

function dibujarEspectro(g: Pintor2D, s: EstadoFourier, c: Coeficientes) {
  const Nv = Math.max(8, s.N)
  const vals: Array<[number, number, number]> = []
  let mx = 1e-12
  for (let n = 0; n <= Nv; n++) {
    const an = n === 0 ? c.a[0] / 2 : c.a[n]
    const bn = n === 0 ? 0 : c.b[n]
    vals.push([n, an, bn])
    mx = Math.max(mx, Math.abs(an), Math.abs(bn), Math.hypot(an, bn))
  }
  const amp = s.espectro === 'amplitud'
  g.ventana = { x: [-0.8, Nv + 0.8], y: amp ? [-0.08 * mx, 1.15 * mx] : [-1.15 * mx, 1.15 * mx] }
  g.ejes({ etiquetaX: 'n' })
  const dentro = g.color('--accent')
  const fuera = g.color('--ink-soft')
  for (const [n, an, bn] of vals) {
    const col = n <= s.N ? dentro : fuera
    if (amp) {
      const A = Math.hypot(an, bn)
      g.curva([[n, 0], [n, A]], col, n <= s.N ? 2 : 1)
      g.punto(n, A, col, Nv > 80 ? 1.5 : 3)
    } else {
      g.curva([[n - 0.15, 0], [n - 0.15, an]], g.color('--pos'), 1.6)
      g.curva([[n + 0.15, 0], [n + 0.15, bn]], g.color('--neg'), 1.6)
    }
  }
}

export default definir<EstadoFourier>({
  id: 'fourier',
  area: 'senales',
  resumen: 'Series de Fourier: suma parcial, espectro, Gibbs y Parseval',
  corto: 'Series de Fourier',
  titulo: 'Series de <i>Fourier</i>',
  entradilla: 'Escribe f en un periodo; se extiende periódicamente y se aproxima con N armónicos.',
  inicial: { expr: 'sgn(t)', periodoPi: 2, N: 9, fejer: false, espectro: 'amplitud', sonda: 0.6 },
  Panel,
  resultadoEnPanel: true,
  rotulo: (s) => ({ nombre: s.fejer ? 'σ_N(t)' : 'S_N(t)', apunte: `N = ${s.N}` }),
  formula: (s) => {
    const { c } = analizar(s)
    const base = [
      String.raw`f(t)\sim\frac{a_0}{2}+\sum_{n\ge1}\big(a_n\cos n\omega t+b_n\sin n\omega t\big)`,
      String.raw`\omega=\frac{2\pi}{T},\qquad a_n=\frac{2}{T}\int_{-T/2}^{T/2}\!f(t)\cos n\omega t\,dt`,
      String.raw`b_n=\frac{2}{T}\int_{-T/2}^{T/2}\!f(t)\sin n\omega t\,dt`,
    ]
    if (!c) return base
    const filas: string[] = []
    filas.push(String.raw`\tfrac{a_0}{2} = ${exacto(c.a[0] / 2)}`)
    let puestos = 0
    for (let n = 1; n <= MAXN && puestos < 4; n++) {
      if (Math.abs(c.a[n]) < 1e-11 && Math.abs(c.b[n]) < 1e-11) continue
      const partes: string[] = []
      if (Math.abs(c.a[n]) >= 1e-11) partes.push(String.raw`a_{${n}}=${exacto(c.a[n])}`)
      if (Math.abs(c.b[n]) >= 1e-11) partes.push(String.raw`b_{${n}}=${exacto(c.b[n])}`)
      filas.push(partes.join(',\\;'))
      puestos++
    }
    // de dos en dos: una sola fila con todos se sale del panel
    const pares: string[] = []
    for (let i = 0; i < filas.length; i += 2) pares.push(filas.slice(i, i + 2).join(String.raw`\qquad `))
    return [...base, ...pares]
  },
  lecturas: (s) => {
    const { c, f, error } = analizar(s)
    if (!c || !f) return [['Estado', error ?? 'sin datos']]
    const e = energia(c, s.N)
    const g = sobreoscilacion(f, c, s.N)
    const filas: Array<[string, string]> = [
      ['Periodo T', `${s.periodoPi}π = ${c.T.toFixed(4)}`],
      ['Saltos en un periodo', String(saltos(f, c).length)],
      ['(1/T)∫f² (Parseval)', c.potencia.toFixed(6)],
      ['Energía de S_N', `${e.toFixed(6)} (${((100 * e) / (c.potencia || 1)).toFixed(3)} %)`],
      ['Error cuadrático medio', Math.sqrt(Math.max(0, c.potencia - e)).toExponential(3)],
      [`S_N(${s.sonda.toFixed(3)})`, sumaParcial(c, s.N, s.sonda, s.fejer).toFixed(6)],
    ]
    if (g !== null && s.N > 0 && !s.fejer) filas.push(['Sobreoscilación en el salto', `${g.toFixed(3)} % (límite 8.949 %)`])
    return filas
  },
  leyenda: (s) => (
    <>
      <Muestra color="var(--ink-soft)">f periódica</Muestra>
      <Muestra color={s.fejer ? 'var(--neg)' : 'var(--accent)'}>{s.fejer ? 'Fejér σ_N' : 'suma parcial S_N'}</Muestra>
      {s.espectro === 'coeficientes' ? (
        <>
          <Muestra color="var(--pos)">aₙ</Muestra>
          <Muestra color="var(--neg)">bₙ</Muestra>
        </>
      ) : null}
    </>
  ),
  pista: 'Arrastra la sonda para leer f(t) y S_N(t) en un punto',
  comparaciones: [
    { t: 'N armónicos contra 4N', a: { N: 5 }, b: { N: 20 } },
    { t: 'Dirichlet contra Fejér', a: { fejer: false }, b: { fejer: true } },
  ],
  vista: {
    tipo: '2d',
    navegable: false,
    interaccion: {
      asas: (s) => {
        const { c, f } = analizar(s)
        if (!c || !f) return []
        return [{ id: 'sonda', p: [s.sonda, periodica(f, c.T)(s.sonda)], color: '--pos', eje: 'x', nombre: 't₀' }]
      },
      mover: (_id, t) => ({ sonda: t.p[0] }),
      pista: 'Arrastra la sonda a lo largo del eje t',
    },
    dibujar(g, s) {
      const { c, f, error } = analizar(s)
      if (!c || !f) {
        g.ventana = { x: [-1, 1], y: [-1, 1] }
        g.texto(error ?? 'la expresión no es válida', -0.9, 0.8, g.color('--pos'))
        return
      }
      g.region(0, REPARTO, 1, 1 - REPARTO)
      g.fondoRegion(g.color('--ground'))
      dibujarEspectro(g, s, c)
      g.finRegion()
      g.region(0, 0, 1, REPARTO)
      dibujarTiempo(g, s, f, c)
      g.finRegion()
      // las asas viven en el panel del tiempo
      g.usarRegion(0, 0, 1, REPARTO)
    },
  },
})
