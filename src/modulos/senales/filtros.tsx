import { definir, type PropsPanel } from '../../nucleo/tipos'
import { Expresion, Grupo, Muestra, Rango, Resultado, Segmentado } from '../../nucleo/controles'
import { raicesPolinomio } from '../../lib/matrices'
import type { Pintor2D } from '../../render/pintor2d'

type Diseno = 'media' | 'iir1' | 'resonador' | 'peine' | 'butter' | 'propio'

export interface EstadoFiltro {
  diseno: Diseno
  M: number
  alfa: number
  r: number
  theta: number
  orden: number
  corte: number
  b: string
  a: string
  dB: boolean
}

export interface Coefs {
  b: number[]
  a: number[]
}

type C = [number, number]
const cmul = (x: C, y: C): C => [x[0] * y[0] - x[1] * y[1], x[0] * y[1] + x[1] * y[0]]
const cdiv = (x: C, y: C): C => {
  const m = y[0] * y[0] + y[1] * y[1]
  return [(x[0] * y[0] + x[1] * y[1]) / m, (x[1] * y[0] - x[0] * y[1]) / m]
}

/** Polinomio mónico con esas raíces, en potencias decrecientes (coeficiente de z^N primero). */
function desdeRaices(rs: C[]): C[] {
  let p: C[] = [[1, 0]]
  for (const r of rs) {
    const q: C[] = new Array(p.length + 1).fill(null).map(() => [0, 0] as C)
    for (let i = 0; i < p.length; i++) {
      q[i] = [q[i][0] + p[i][0], q[i][1] + p[i][1]]
      const m = cmul(p[i], r)
      q[i + 1] = [q[i + 1][0] - m[0], q[i + 1][1] - m[1]]
    }
    p = q
  }
  return p
}

/**
 * Butterworth paso bajo de orden N con corte ω_c (rad/muestra) por la bilineal con pre-distorsión:
 * Ω_c = 2 tan(ω_c/2), polos analógicos Ω_c e^{iπ(2k+N−1)/(2N)}, z = (2 + s)/(2 − s), N ceros en z = −1.
 * Se normaliza a ganancia 1 en continua; |H(e^{iω_c})| = 1/√2 exactamente.
 */
export function butterworth(N: number, wc: number): Coefs {
  const Wc = 2 * Math.tan(wc / 2)
  const polos: C[] = []
  for (let k = 1; k <= N; k++) {
    const th = (Math.PI * (2 * k + N - 1)) / (2 * N)
    const s: C = [Wc * Math.cos(th), Wc * Math.sin(th)]
    polos.push(cdiv([2 + s[0], s[1]], [2 - s[0], -s[1]]))
  }
  const a = desdeRaices(polos).map((c) => c[0])
  const b0 = desdeRaices(Array.from({ length: N }, () => [-1, 0] as C)).map((c) => c[0])
  // ganancia en z = 1: Σb / Σa
  const k = a.reduce((s, v) => s + v, 0) / b0.reduce((s, v) => s + v, 0)
  return { b: b0.map((v) => v * k), a }
}

export function coeficientes(s: EstadoFiltro): Coefs | { error: string } {
  switch (s.diseno) {
    case 'media':
      return { b: Array.from({ length: s.M }, () => 1 / s.M), a: [1] }
    case 'iir1':
      // y[n] = α x[n] + (1 − α) y[n − 1]
      return { b: [s.alfa], a: [1, -(1 - s.alfa)] }
    case 'resonador':
      // polos r e^{±iθ}, ceros en ±1: y[n] = x[n] − x[n−2] + 2r cos θ y[n−1] − r² y[n−2]
      return { b: [1, 0, -1], a: [1, -2 * s.r * Math.cos(s.theta), s.r * s.r] }
    case 'peine':
      return { b: [1, ...new Array(s.M - 1).fill(0), -1], a: [1] }
    case 'butter':
      return butterworth(s.orden, s.corte)
    default: {
      const lee = (t: string) => t.split(/[,;\s]+/).filter(Boolean).map(Number)
      const b = lee(s.b)
      const a = lee(s.a)
      if (!b.length || !a.length || [...b, ...a].some((v) => !Number.isFinite(v))) return { error: 'escribe números separados por comas' }
      if (a[0] === 0) return { error: 'a₀ no puede ser 0' }
      return { b: b.map((v) => v / a[0]), a: a.map((v) => v / a[0]) }
    }
  }
}

/** H(e^{iω}) = Σ bₖ e^{−ikω} / Σ aₖ e^{−ikω}. */
export function respuestaFrecuencia(c: Coefs, w: number): C {
  const ev = (p: number[]): C => p.reduce<C>((acc, v, k) => [acc[0] + v * Math.cos(k * w), acc[1] - v * Math.sin(k * w)], [0, 0])
  return cdiv(ev(c.b), ev(c.a))
}

/** Respuesta a una entrada por la ecuación en diferencias. */
export function filtrar(c: Coefs, x: number[]): number[] {
  const y: number[] = []
  for (let n = 0; n < x.length; n++) {
    let v = 0
    for (let k = 0; k < c.b.length; k++) if (n - k >= 0) v += c.b[k] * x[n - k]
    for (let k = 1; k < c.a.length; k++) if (n - k >= 0) v -= c.a[k] * y[n - k]
    y.push(v / c.a[0])
  }
  return y
}

/** Polos y ceros en el plano z (se completan con los del origen cuando b y a tienen distinta longitud). */
export function polosCerosZ(c: Coefs): { polos: C[]; ceros: C[] } {
  const N = Math.max(c.b.length, c.a.length) - 1
  const pad = (p: number[]) => [...p, ...new Array(N + 1 - p.length).fill(0)]
  // Σ pₖ z^{N−k}: en orden creciente de potencias es pad(p) al revés
  const raices = (p: number[]) => {
    const asc = pad(p).reverse()
    return asc.every((v) => v === 0) ? [] : (raicesPolinomio(asc) as C[])
  }
  return { polos: raices(c.a), ceros: raices(c.b) }
}

function Panel({ s, set }: PropsPanel<EstadoFiltro>) {
  return (
    <>
      <Grupo titulo="Filtro">
        <Segmentado
          columnas={3}
          valor={s.diseno}
          opciones={[
            { v: 'media', t: 'Media móvil' },
            { v: 'iir1', t: 'IIR 1.er orden' },
            { v: 'resonador', t: 'Resonador' },
            { v: 'peine', t: 'Peine' },
            { v: 'butter', t: 'Butterworth' },
            { v: 'propio', t: 'Coeficientes' },
          ]}
          onChange={(diseno) => set({ diseno })}
        />
        {(s.diseno === 'media' || s.diseno === 'peine') && <Rango etiqueta="M" valor={s.M} min={2} max={32} paso={1} formato={(v) => String(v)} onChange={(M) => set({ M: Math.round(M) })} />}
        {s.diseno === 'iir1' && <Rango etiqueta="α" valor={s.alfa} min={0.01} max={1} paso={0.01} onChange={(alfa) => set({ alfa })} />}
        {s.diseno === 'resonador' && (
          <>
            <Rango etiqueta="radio r de los polos" valor={s.r} min={0} max={0.999} paso={0.001} formato={(v) => v.toFixed(3)} onChange={(r) => set({ r })} />
            <Rango etiqueta="θ (rad/muestra)" valor={s.theta} min={0.05} max={3.1} paso={0.01} onChange={(theta) => set({ theta })} />
          </>
        )}
        {s.diseno === 'butter' && (
          <>
            <Rango etiqueta="orden N" valor={s.orden} min={1} max={10} paso={1} formato={(v) => String(v)} onChange={(orden) => set({ orden: Math.round(orden) })} />
            <Rango etiqueta="corte ω_c (rad/muestra)" valor={s.corte} min={0.05} max={3} paso={0.01} onChange={(corte) => set({ corte })} />
          </>
        )}
        {s.diseno === 'propio' && (
          <>
            <Expresion etiqueta="b =" valor={s.b} variables={[]} onChange={(b: string) => set({ b })} comprobar={() => null} />
            <Expresion etiqueta="a =" valor={s.a} variables={[]} onChange={(a: string) => set({ a })} comprobar={() => null} />
          </>
        )}
        <Segmentado columnas={2} valor={s.dB ? 'dB' : 'lin'} opciones={[{ v: 'lin', t: '|H| lineal' }, { v: 'dB', t: '|H| en dB' }]} onChange={(v) => set({ dB: v === 'dB' })} />
      </Grupo>
      <Resultado />
    </>
  )
}

function planoZ(g: Pintor2D, pc: { polos: C[]; ceros: C[] }) {
  const R = Math.max(1.4, ...[...pc.polos, ...pc.ceros].map(([a, b]) => 1.15 * Math.hypot(a, b)))
  g.ventana = { x: [-R, R], y: [-R, R] }
  g.igualarEscala()
  g.ejes({ etiquetaX: 'Re z', etiquetaY: 'Im z' })
  g.curva(Array.from({ length: 181 }, (_, i) => [Math.cos((i * Math.PI) / 90), Math.sin((i * Math.PI) / 90)] as [number, number]), g.color('--ink-soft'), 1.4)
  const t = 6
  for (const [a, b] of pc.polos) {
    const X = g.X(a)
    const Y = g.Y(b)
    g.ctx.save()
    g.ctx.strokeStyle = g.color('--neg')
    g.ctx.lineWidth = 2
    g.ctx.beginPath()
    g.ctx.moveTo(X - t, Y - t)
    g.ctx.lineTo(X + t, Y + t)
    g.ctx.moveTo(X + t, Y - t)
    g.ctx.lineTo(X - t, Y + t)
    g.ctx.stroke()
    g.ctx.restore()
  }
  for (const [a, b] of pc.ceros) {
    g.ctx.save()
    g.ctx.strokeStyle = g.color('--pos')
    g.ctx.lineWidth = 2
    g.ctx.beginPath()
    g.ctx.arc(g.X(a), g.Y(b), t, 0, 2 * Math.PI)
    g.ctx.stroke()
    g.ctx.restore()
  }
}

export default definir<EstadoFiltro>({
  id: 'filtros',
  area: 'senales',
  resumen: 'Filtros digitales FIR e IIR: polos y ceros en el plano z, respuesta en frecuencia e impulso',
  corto: 'Filtros digitales',
  titulo: 'Filtros <i>digitales</i>',
  entradilla: 'y[n] = Σ bₖ x[n−k] − Σ aₖ y[n−k]: dónde caen sus polos y ceros y qué deja pasar.',
  inicial: { diseno: 'butter', M: 8, alfa: 0.2, r: 0.95, theta: 1, orden: 4, corte: 0.8, b: '1, 2, 1', a: '1, -0.5, 0.25', dB: false },
  Panel,
  resultadoEnPanel: true,
  rotulo: (s) => ({ nombre: 'H(e^iω)', apunte: s.diseno }),
  formula: () => [String.raw`H(z)=\frac{\sum_k b_k z^{-k}}{\sum_k a_k z^{-k}},\qquad H(e^{i\omega})\ \ \omega\in[0,\pi]`],
  lecturas: (s) => {
    const c = coeficientes(s)
    if ('error' in c) return [['No se puede', c.error]]
    const pc = polosCerosZ(c)
    const rmax = Math.max(0, ...pc.polos.map(([a, b]) => Math.hypot(a, b)))
    const H0 = respuestaFrecuencia(c, 0)
    const Hpi = respuestaFrecuencia(c, Math.PI)
    const fmt = (v: number[]) => v.map((x) => +x.toPrecision(6)).join(', ')
    return [
      ['b', fmt(c.b)],
      ['a', fmt(c.a)],
      ['Tipo', c.a.length === 1 ? 'FIR (sin realimentación)' : 'IIR'],
      ['Estable', rmax < 1 - 1e-12 ? `sí (máx |polo| = ${rmax.toFixed(4)})` : `no (|polo| = ${rmax.toFixed(4)} ≥ 1)`],
      ['Ganancia en continua H(1)', Math.hypot(...H0).toFixed(6)],
      ['Ganancia en Nyquist H(−1)', Math.hypot(...Hpi).toFixed(6)],
    ]
  },
  leyenda: () => (
    <>
      <Muestra color="var(--neg)">polos</Muestra>
      <Muestra color="var(--pos)">ceros</Muestra>
      <Muestra color="var(--accent)">|H| y h[n]</Muestra>
    </>
  ),
  comparaciones: [
    { t: 'Butterworth de orden 2 contra 8', a: { diseno: 'butter', orden: 2 }, b: { diseno: 'butter', orden: 8 } },
    { t: 'Resonador ancho contra estrecho', a: { diseno: 'resonador', r: 0.8 }, b: { diseno: 'resonador', r: 0.99 } },
  ],
  vista: {
    tipo: '2d',
    navegable: false,
    dibujar(g, s) {
      const c = coeficientes(s)
      if ('error' in c) {
        g.ventana = { x: [-1, 1], y: [-1, 1] }
        g.texto(c.error, -0.95, 0.8, g.color('--pos'))
        return
      }
      g.region(0, 0, 0.4, 1)
      planoZ(g, polosCerosZ(c))
      g.finRegion()

      g.region(0.4, 0, 0.6, 0.55)
      g.fondoRegion(g.color('--ground'))
      const ws = Array.from({ length: 800 }, (_, i) => (Math.PI * i) / 799)
      const H = ws.map((w) => respuestaFrecuencia(c, w))
      const mag = H.map((h) => Math.hypot(...h))
      const ys = s.dB ? mag.map((m) => Math.max(-100, 20 * Math.log10(m))) : mag
      const top = Math.max(...ys)
      g.ventana = s.dB ? { x: [0, Math.PI], y: [Math.max(-100, Math.min(...ys)) - 5, top + 5] } : { x: [0, Math.PI], y: [0, 1.15 * top] }
      g.ejes({ etiquetaX: 'ω', etiquetaY: s.dB ? '|H| dB' : '|H|' })
      if (s.diseno === 'butter') {
        const nivel = s.dB ? -10 * Math.log10(2) : 1 / Math.SQRT2
        g.curva([[0, nivel], [Math.PI, nivel]], g.color('--grid'), 1, true)
        g.curva([[s.corte, g.ventana.y[0]], [s.corte, g.ventana.y[1]]], g.color('--grid'), 1, true)
      }
      g.curva(ws.map((w, i) => [w, ys[i]] as [number, number]), g.color('--accent'), 2.2)
      g.finRegion()

      g.region(0.4, 0.55, 0.6, 0.45)
      const N = 48
      const h = filtrar(c, Array.from({ length: N }, (_, n) => (n === 0 ? 1 : 0)))
      const hi = Math.max(0, ...h)
      const lo = Math.min(0, ...h)
      const pad = 0.15 * (hi - lo || 1)
      g.ventana = { x: [-1, N], y: [lo - pad, hi + pad] }
      g.ejes({ etiquetaX: 'n', etiquetaY: 'h[n]' })
      const col = g.color('--accent')
      h.forEach((v, n) => {
        g.curva([[n, 0], [n, v]], col, 1.4)
        g.punto(n, v, col, 2.4)
      })
      g.finRegion()
    },
  },
})
