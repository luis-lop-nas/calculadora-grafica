import { dimCircuito } from '../dimensional'
import { definir, type PropsPanel } from '../../nucleo/tipos'
import { accion, radios } from '../../nucleo/menu'
import { Grupo, Muestra, Rango, Resultado, Segmentado } from '../../nucleo/controles'
import type { Pintor2D } from '../../render/pintor2d'

type Tipo = 'serie' | 'paralelo'
type Modo = 'transitorio' | 'alterna'

export interface EstadoCircuito {
  tipo: Tipo
  modo: Modo
  R: number
  L: number
  C: number
  /** amplitud de la fuente: tensión (serie) o corriente (paralelo) */
  A: number
  w: number
  x0: number
  y0: number
  tMax: number
}

/**
 * Serie (fuente de tensión V): L i′ + R i + v_C = V, i = C v_C′  ⇒  v_C″ + 2α v_C′ + ω₀² v_C = ω₀² V, α = R/(2L).
 * Paralelo (fuente de corriente I): C v′ + v/R + i_L = I, v = L i_L′  ⇒  i_L″ + 2α i_L′ + ω₀² i_L = ω₀² I, α = 1/(2RC).
 * En los dos casos la incógnita u (v_C o i_L) cumple la misma EDO; se resuelve en forma cerrada.
 */
export function parametros(s: Pick<EstadoCircuito, 'tipo' | 'R' | 'L' | 'C'>) {
  const w0 = 1 / Math.sqrt(s.L * s.C)
  const alfa = s.tipo === 'serie' ? s.R / (2 * s.L) : 1 / (2 * s.R * s.C)
  const Q = s.tipo === 'serie' ? (w0 * s.L) / s.R : s.R * Math.sqrt(s.C / s.L)
  return { w0, alfa, Q, ancho: 2 * alfa, regimen: alfa > w0 * (1 + 1e-12) ? 'sobreamortiguado' : alfa < w0 * (1 - 1e-12) ? 'subamortiguado' : 'crítico' }
}

/**
 * u(t) y u′(t) para u″ + 2α u′ + ω₀² u = ω₀² A con u(0) = u₀, u′(0) = v₀ (forma cerrada en los tres regímenes).
 */
export function transitorio(alfa: number, w0: number, A: number, u0: number, v0: number, t: number): [number, number] {
  const c0 = u0 - A
  if (Math.abs(alfa - w0) <= 1e-12 * w0) {
    // crítico: (c₀ + (v₀ + α c₀) t) e^{−αt}
    const k = v0 + alfa * c0
    const e = Math.exp(-alfa * t)
    return [A + (c0 + k * t) * e, (k - alfa * (c0 + k * t)) * e]
  }
  if (alfa > w0) {
    const d = Math.sqrt(alfa * alfa - w0 * w0)
    const r1 = -alfa + d
    const r2 = -alfa - d
    // c₁ + c₂ = c₀,  r₁c₁ + r₂c₂ = v₀
    const c1 = (v0 - r2 * c0) / (r1 - r2)
    const c2 = c0 - c1
    return [A + c1 * Math.exp(r1 * t) + c2 * Math.exp(r2 * t), r1 * c1 * Math.exp(r1 * t) + r2 * c2 * Math.exp(r2 * t)]
  }
  const wd = Math.sqrt(w0 * w0 - alfa * alfa)
  const B = (v0 + alfa * c0) / wd
  const e = Math.exp(-alfa * t)
  const cs = Math.cos(wd * t)
  const sn = Math.sin(wd * t)
  return [A + e * (c0 * cs + B * sn), e * (-alfa * (c0 * cs + B * sn) + wd * (-c0 * sn + B * cs))]
}

/** Magnitudes físicas en t: la incógnita u, su derivada y lo que se deduce de ellas. */
export function estadoEn(s: EstadoCircuito, t: number) {
  const { alfa, w0 } = parametros(s)
  if (s.tipo === 'serie') {
    // u = v_C; x0 = v_C(0), y0 = i(0); v_C′ = i/C
    const [vC, dvC] = transitorio(alfa, w0, s.A, s.x0, s.y0 / s.C, t)
    const i = s.C * dvC
    return { u: vC, i, vR: s.R * i, vL: s.A - s.R * i - vC, vC }
  }
  // u = i_L; x0 = v(0), y0 = i_L(0); i_L′ = v/L
  const [iL, diL] = transitorio(alfa, w0, s.A, s.y0, s.x0 / s.L, t)
  const v = s.L * diL
  return { u: iL, i: iL, vR: v, vL: v, vC: v, iR: v / s.R, iC: s.A - v / s.R - iL }
}

/** Energía almacenada ½Li² + ½Cv². */
export function energia(s: EstadoCircuito, t: number) {
  const e = estadoEn(s, t)
  return s.tipo === 'serie' ? 0.5 * s.L * e.i ** 2 + 0.5 * s.C * e.vC ** 2 : 0.5 * s.L * e.u ** 2 + 0.5 * s.C * e.vC ** 2
}

/** Potencia de la fuente menos la disipada en R: por conservación es dE/dt. */
export function potenciaNeta(s: EstadoCircuito, t: number) {
  const e = estadoEn(s, t)
  return s.tipo === 'serie' ? s.A * e.i - s.R * e.i ** 2 : s.A * e.vC - e.vC ** 2 / s.R
}

/* ── alterna ── */

type C = [number, number]
const mul = (a: C, b: C): C => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]]
const div = (a: C, b: C): C => {
  const m = b[0] * b[0] + b[1] * b[1]
  return [(a[0] * b[0] + a[1] * b[1]) / m, (a[1] * b[0] - a[0] * b[1]) / m]
}

/**
 * Fasores (amplitudes complejas) del régimen permanente con fuente A·cos ωt.
 * Serie: Z = R + i(ωL − 1/(ωC)), I = V/Z. Paralelo: Y = 1/R + i(ωC − 1/(ωL)), V = I/Y.
 */
export function fasores(s: EstadoCircuito, w = s.w) {
  if (s.tipo === 'serie') {
    const Z: C = [s.R, w * s.L - 1 / (w * s.C)]
    const I = div([s.A, 0], Z)
    return { Z, I, V: [s.A, 0] as C, VR: mul([s.R, 0], I), VL: mul([0, w * s.L], I), VC: mul([0, -1 / (w * s.C)], I) }
  }
  const Y: C = [1 / s.R, w * s.C - 1 / (w * s.L)]
  const V = div([s.A, 0], Y)
  return { Z: div([1, 0], Y), I: [s.A, 0] as C, V, VR: V, VL: V, VC: V, IR: div(V, [s.R, 0]), IL: div(V, [0, w * s.L]), IC: mul([0, w * s.C], V) }
}

/** Respuesta en amplitud (corriente en serie, tensión en paralelo) frente a ω. */
export function respuestaAmplitud(s: EstadoCircuito, w: number) {
  const f = fasores(s, w)
  const x = s.tipo === 'serie' ? f.I : f.V
  return Math.hypot(x[0], x[1])
}

function Panel({ s, set }: PropsPanel<EstadoCircuito>) {
  const serie = s.tipo === 'serie'
  return (
    <>
      <Grupo titulo="Circuito">
        <Segmentado columnas={2} valor={s.tipo} opciones={[{ v: 'serie', t: 'RLC serie' }, { v: 'paralelo', t: 'RLC paralelo' }]} onChange={(tipo) => set({ tipo })} />
        <Segmentado columnas={2} valor={s.modo} opciones={[{ v: 'transitorio', t: 'Transitorio (continua)' }, { v: 'alterna', t: 'Alterna y resonancia' }]} onChange={(modo) => set({ modo })} />
        <Rango etiqueta="R (Ω)" valor={s.R} min={0.05} max={serie ? 40 : 400} paso={0.05} onChange={(R) => set({ R })} />
        <Rango etiqueta="L (H)" valor={s.L} min={0.01} max={5} paso={0.01} onChange={(L) => set({ L })} />
        <Rango etiqueta="C (F)" valor={s.C} min={0.001} max={2} paso={0.001} formato={(v) => v.toFixed(3)} onChange={(C) => set({ C })} />
        <Rango etiqueta={serie ? 'Fuente V' : 'Fuente I'} valor={s.A} min={-10} max={10} paso={0.1} onChange={(A) => set({ A })} />
      </Grupo>
      <Resultado />
      {s.modo === 'transitorio' ? (
        <Grupo titulo="Condiciones en t = 0">
          <Rango etiqueta="v_C(0)" valor={s.x0} min={-10} max={10} paso={0.1} onChange={(x0) => set({ x0 })} />
          <Rango etiqueta={serie ? 'i(0)' : 'i_L(0)'} valor={s.y0} min={-5} max={5} paso={0.05} onChange={(y0) => set({ y0 })} />
          <Rango etiqueta="Ver t hasta" valor={s.tMax} min={0.5} max={40} paso={0.5} onChange={(tMax) => set({ tMax })} />
        </Grupo>
      ) : (
        <Grupo titulo="Fuente alterna">
          <Rango etiqueta="ω (rad/s)" valor={s.w} min={0.05} max={20} paso={0.01} onChange={(w) => set({ w })} />
        </Grupo>
      )}
    </>
  )
}

const flechaC = (g: Pintor2D, z: C, color: string, nombre: string) => {
  g.flecha(0, 0, z[0], z[1], color, 2.2, 8)
  g.texto(nombre, z[0], z[1], color, { dx: 6, dy: -8 })
}

function vistaTransitorio(g: Pintor2D, s: EstadoCircuito) {
  const M = 800
  const ts = Array.from({ length: M + 1 }, (_, i) => (s.tMax * i) / M)
  const es = ts.map((t) => estadoEn(s, t))
  const serie = s.tipo === 'serie'
  const curvas: Array<[string, number[], string]> = serie
    ? [['i', es.map((e) => e.i), '--accent'], ['v_C', es.map((e) => e.vC), '--pos']]
    : [['v', es.map((e) => e.vC), '--pos'], ['i_L', es.map((e) => e.u), '--accent']]
  for (let k = 0; k < 2; k++) {
    const [nombre, ys, col] = curvas[k]
    const lo = Math.min(0, ...ys)
    const hi = Math.max(0, ...ys)
    const pad = 0.12 * (hi - lo || 1)
    g.region(0, k * 0.5, 1, 0.5)
    if (k) g.fondoRegion(g.color('--ground'))
    g.ventana = { x: [-0.02 * s.tMax, s.tMax], y: [lo - pad, hi + pad] }
    g.ejes({ etiquetaX: 't', etiquetaY: nombre })
    g.curva(ts.map((t, i) => [t, ys[i]] as [number, number]), g.color(col), 2.2)
    g.finRegion()
  }
}

function vistaAlterna(g: Pintor2D, s: EstadoCircuito, reloj: number) {
  const f = fasores(s)
  const w = s.w
  // animación: los fasores giran con e^{iωt}; se ralentiza para que se pueda seguir
  const th = ((reloj * 0.8) % (2 * Math.PI / Math.max(w, 1e-9))) * w
  const gira = (z: C): C => mul(z, [Math.cos(th), Math.sin(th)])
  const serie = s.tipo === 'serie'
  const tensiones: Array<[C, string, string]> = serie
    ? [[f.V, '--ink', 'V'], [f.VR, '--pos', 'V_R'], [f.VL, '--neg', 'V_L'], [f.VC, '--accent', 'V_C']]
    : [[f.V, '--ink', 'V']]
  const corrientes: Array<[C, string, string]> = serie ? [[f.I, '--accent', 'I']] : [[f.I, '--ink', 'I'], [f.IR!, '--pos', 'I_R'], [f.IL!, '--neg', 'I_L'], [f.IC!, '--accent', 'I_C']]
  // las corrientes se escalan para compartir dibujo con las tensiones
  const mv = Math.max(...tensiones.map(([z]) => Math.hypot(...z)))
  const mi = Math.max(...corrientes.map(([z]) => Math.hypot(...z)))
  const kI = mi > 0 ? (0.8 * mv) / mi : 1
  const R = 1.25 * Math.max(mv, 1e-9)
  g.region(0, 0, 0.45, 1)
  g.ventana = { x: [-R, R], y: [-R, R] }
  g.igualarEscala()
  g.ejes({ etiquetaX: 'Re', etiquetaY: 'Im' })
  for (const [z, col, n] of tensiones) flechaC(g, gira(z), g.color(col), n)
  for (const [z, col, n] of corrientes) flechaC(g, gira([z[0] * kI, z[1] * kI]), g.color(col), `${n} (×${kI.toPrecision(2)})`)
  g.finRegion()

  g.region(0.45, 0, 0.55, 0.5)
  g.fondoRegion(g.color('--ground'))
  const T = (2 * Math.PI) / w
  const ts = Array.from({ length: 401 }, (_, i) => (2 * T * i) / 400)
  const re = (z: C, t: number) => z[0] * Math.cos(w * t) - z[1] * Math.sin(w * t)
  const vv = serie ? f.V : f.V
  const ii = serie ? f.I : f.I
  const amp = Math.max(Math.hypot(...vv), Math.hypot(...ii) * kI)
  g.ventana = { x: [0, 2 * T], y: [-1.2 * amp, 1.2 * amp] }
  g.ejes({ etiquetaX: 't' })
  g.curva(ts.map((t) => [t, re(vv, t)] as [number, number]), g.color('--ink'), 2)
  g.curva(ts.map((t) => [t, kI * re(ii, t)] as [number, number]), g.color('--accent'), 2)
  const tAhora = (th / w) % (2 * T)
  g.curva([[tAhora, -1.2 * amp], [tAhora, 1.2 * amp]], g.color('--grid'), 1, true)
  g.finRegion()

  g.region(0.45, 0.5, 0.55, 0.5)
  const { w0 } = parametros(s)
  const wMax = Math.max(3 * w0, 1.3 * w)
  const ws = Array.from({ length: 600 }, (_, i) => (wMax * (i + 1)) / 600)
  const amps = ws.map((x) => respuestaAmplitud(s, x))
  const top = Math.max(...amps)
  g.ventana = { x: [0, wMax], y: [0, 1.15 * top] }
  g.ejes({ etiquetaX: 'ω', etiquetaY: serie ? '|I|' : '|V|' })
  g.curva(ws.map((x, i) => [x, amps[i]] as [number, number]), g.color('--accent'), 2)
  g.curva([[w0, 0], [w0, 1.15 * top]], g.color('--pos'), 1, true)
  g.curva([[0, top / Math.SQRT2], [wMax, top / Math.SQRT2]], g.color('--grid'), 1, true)
  g.punto(w, respuestaAmplitud(s, w), g.color('--ink'), 4)
  g.finRegion()
}

export default definir<EstadoCircuito>({
  id: 'circuito',
  area: 'senales',
  dimensiones: dimCircuito,
  resumen: 'Circuitos RLC serie y paralelo: transitorio, fasores, impedancia y resonancia',
  corto: 'Circuitos RLC',
  titulo: 'Circuitos <i>RLC</i>',
  entradilla: 'Carga y descarga con continua, o régimen permanente en alterna con sus fasores girando.',
  inicial: { tipo: 'serie', modo: 'transitorio', R: 1, L: 1, C: 0.25, A: 5, w: 2, x0: 0, y0: 0, tMax: 12 },
  Panel,
  menu: (s) => ({
    acciones: [
      radios<EstadoCircuito, Tipo>('Conexión', [{ v: 'serie', t: 'RLC serie' }, { v: 'paralelo', t: 'RLC paralelo' }], s.tipo, (tipo) => ({ tipo })),
      radios<EstadoCircuito, Modo>('Régimen', [{ v: 'transitorio', t: 'Transitorio' }, { v: 'alterna', t: 'Corriente alterna (fasores)' }], s.modo, (modo) => ({ modo })),
      accion<EstadoCircuito>('Amortiguamiento crítico', (t) => (t.tipo === 'serie' ? { R: 2 * Math.sqrt(t.L / t.C) } : { R: 0.5 * Math.sqrt(t.L / t.C) })),
      accion<EstadoCircuito>('A la frecuencia de resonancia', (t) => ({ w: 1 / Math.sqrt(t.L * t.C), modo: 'alterna' })),
    ],
  }),
  resultadoEnPanel: true,
  rotulo: (s) => ({ nombre: s.tipo === 'serie' ? 'RLC serie' : 'RLC paralelo', apunte: s.modo }),
  formula: (s) =>
    s.tipo === 'serie'
      ? [String.raw`L\,i' + R\,i + v_C = V,\quad i = C\,v_C'`, String.raw`\omega_0=\frac1{\sqrt{LC}},\quad \alpha=\frac{R}{2L},\quad Q=\frac{\omega_0L}{R}`, ...(s.modo === 'alterna' ? [String.raw`Z = R + i\Big(\omega L-\frac{1}{\omega C}\Big),\quad \mathbf I = \mathbf V/Z`] : [])]
      : [String.raw`C\,v' + \frac{v}{R} + i_L = I,\quad v = L\,i_L'`, String.raw`\omega_0=\frac1{\sqrt{LC}},\quad \alpha=\frac{1}{2RC},\quad Q=R\sqrt{\frac CL}`, ...(s.modo === 'alterna' ? [String.raw`Y = \frac1R + i\Big(\omega C-\frac{1}{\omega L}\Big),\quad \mathbf V = \mathbf I/Y`] : [])],
  lecturas: (s) => {
    const p = parametros(s)
    const filas: Array<[string, string]> = [
      ['ω₀ = 1/√(LC)', p.w0.toFixed(4)],
      ['α', p.alfa.toFixed(4)],
      ['Régimen', p.regimen],
      ['Factor de calidad Q', p.Q.toFixed(4)],
    ]
    if (s.modo === 'transitorio') {
      if (p.regimen === 'subamortiguado') filas.push(['ω_d = √(ω₀² − α²)', Math.sqrt(p.w0 ** 2 - p.alfa ** 2).toFixed(4)])
      const e0 = energia(s, 0)
      const e1 = energia(s, s.tMax)
      // ∫ (P_fuente − P_R) dt por Simpson: tiene que dar la variación de energía almacenada
      const n = 2000
      let I = 0
      for (let k = 0; k <= n; k++) I += (k === 0 || k === n ? 1 : k % 2 ? 4 : 2) * potenciaNeta(s, (s.tMax * k) / n)
      I *= s.tMax / (3 * n)
      filas.push(['Energía almacenada al final', e1.toFixed(6)], ['Balance ΔE − ∫(P_fuente − P_R)', (e1 - e0 - I).toExponential(2)])
    } else {
      const f = fasores(s)
      const phi = (Math.atan2(f.Z[1], f.Z[0]) * 180) / Math.PI
      const P = s.tipo === 'serie' ? 0.5 * s.R * Math.hypot(...f.I) ** 2 : (0.5 * Math.hypot(...f.V) ** 2) / s.R
      filas.push(
        ['|Z|', Math.hypot(...f.Z).toFixed(4)],
        ['Desfase de Z (φ)', `${phi.toFixed(3)}° (${phi > 1e-9 ? 'inductivo' : phi < -1e-9 ? 'capacitivo' : 'resistivo'})`],
        [s.tipo === 'serie' ? 'Amplitud de I' : 'Amplitud de V', (s.tipo === 'serie' ? Math.hypot(...f.I) : Math.hypot(...f.V)).toFixed(4)],
        ['Potencia media en R', P.toFixed(4)],
        ['Factor de potencia cos φ', Math.cos((phi * Math.PI) / 180).toFixed(4)],
        ['Ancho de banda Δω = ω₀/Q', (p.w0 / p.Q).toFixed(4)],
      )
    }
    return filas
  },
  leyenda: (s) =>
    s.modo === 'transitorio' ? (
      s.tipo === 'serie' ? (
        <>
          <Muestra color="var(--accent)">corriente i</Muestra>
          <Muestra color="var(--pos)">tensión en C</Muestra>
        </>
      ) : (
        <>
          <Muestra color="var(--pos)">tensión v</Muestra>
          <Muestra color="var(--accent)">corriente en L</Muestra>
        </>
      )
    ) : (
      <>
        <Muestra color="var(--ink)">fuente</Muestra>
        <Muestra color="var(--pos)">R</Muestra>
        <Muestra color="var(--neg)">L</Muestra>
        <Muestra color="var(--accent)">C · I</Muestra>
      </>
    ),
  comparaciones: [
    { t: 'Subamortiguado contra sobreamortiguado', a: { R: 1 }, b: { R: 6 } },
    { t: 'Por debajo y por encima de ω₀', a: { modo: 'alterna', w: 1 }, b: { modo: 'alterna', w: 4 } },
  ],
  vista: (s) => ({
    tipo: '2d',
    navegable: false,
    animada: () => s.modo === 'alterna',
    dibujar(g, st, reloj) {
      if (st.modo === 'transitorio') vistaTransitorio(g, st)
      else vistaAlterna(g, st, reloj ?? 0)
    },
  }),
})
