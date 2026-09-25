import { definir, type PropsPanel, type Vista2D } from '../../nucleo/tipos'
import { accion, capaVer, coords, radios } from '../../nucleo/menu'
import { Grupo, Interruptor, Muestra, Rango, Resultado, Segmentado } from '../../nucleo/controles'
import { boost, clase, componer, doppler, gamma, gemelos, intervalo, rapidez, type Suceso } from '../../lib/relatividad'
import type { Pintor2D } from '../../render/pintor2d'

type Modo = 'diagrama' | 'gemelos' | 'contraccion' | 'velocidades'

export interface EstadoRelatividad {
  modo: Modo
  beta: number
  eventos: Array<{ t: number; x: number }>
  rejillaPrima: boolean
  L: number
  L0: number
  /** velocidad de un objeto medida en S′ */
  up: number
}

const BMAX = 0.95
const NOMBRES = 'ABCDEFGH'
const f3 = (x: number) => (Math.abs(x) < 5e-13 ? 0 : x).toFixed(3)

function Panel({ s, set }: PropsPanel<EstadoRelatividad>) {
  return (
    <>
      <Grupo titulo="Relatividad especial (c = 1)">
        <Segmentado
         
          valor={s.modo}
          opciones={[{ v: 'diagrama', t: 'Minkowski' }, { v: 'gemelos', t: 'Gemelos' }, { v: 'contraccion', t: 'Contracción' }, { v: 'velocidades', t: 'Velocidades' }]}
          onChange={(modo) => set({ modo })}
        />
        <Rango etiqueta="β = v/c de S′" valor={s.beta} min={-BMAX} max={BMAX} paso={0.01} onChange={(beta) => set({ beta })} />
        {s.modo === 'diagrama' && <Interruptor activo={s.rejillaPrima} onChange={(rejillaPrima) => set({ rejillaPrima })}>Rejilla de S′</Interruptor>}
        {s.modo === 'gemelos' && <Rango etiqueta="distancia del viaje L" valor={s.L} min={0.5} max={5} paso={0.1} onChange={(L) => set({ L })} />}
        {s.modo === 'contraccion' && <Rango etiqueta="longitud propia L₀" valor={s.L0} min={0.5} max={4} paso={0.1} onChange={(L0) => set({ L0 })} />}
        {s.modo === 'velocidades' && <Rango etiqueta="u′ (velocidad en S′)" valor={s.up} min={-0.99} max={0.99} paso={0.01} onChange={(up) => set({ up })} />}
      </Grupo>
      <Resultado />
    </>
  )
}

/* ── dibujo ── */

/** Punto de S con coordenadas (t′, x′) en S′, como [x, t] del lienzo. */
function desdePrima(b: number, tp: number, xp: number): [number, number] {
  const [t, x] = boost(-b, [tp, xp])
  return [x, t]
}

function ejesPrima(g: Pintor2D, b: number, alcance: number, rejilla: boolean) {
  const col = g.color('--pos')
  g.curva([desdePrima(b, -alcance, 0), desdePrima(b, alcance, 0)], col, 1.6)
  g.curva([desdePrima(b, 0, -alcance), desdePrima(b, 0, alcance)], col, 1.6)
  const [xt, tt] = desdePrima(b, 3.6, 0)
  g.texto("t′", xt, tt, col, { dx: 6, dy: -4, fuente: `italic 16px ${'Georgia, serif'}` })
  const [xx, tx] = desdePrima(b, 0, 2.8)
  g.texto("x′", xx, tx, col, { dx: 4, dy: -10, fuente: `italic 16px ${'Georgia, serif'}` })
  // marcas unidad de S′ sobre sus ejes
  for (let k = -6; k <= 6; k++) {
    if (!k) continue
    const [a, c] = desdePrima(b, k, 0)
    g.punto(a, c, col, 2.2)
    const [d, e] = desdePrima(b, 0, k)
    g.punto(d, e, col, 2.2)
  }
  if (rejilla)
    for (let k = -8; k <= 8; k++) {
      g.curva([desdePrima(b, k, -alcance), desdePrima(b, k, alcance)], g.color('--pos'), 0.5, true)
      g.curva([desdePrima(b, -alcance, k), desdePrima(b, alcance, k)], g.color('--pos'), 0.5, true)
    }
}

function fondo(g: Pintor2D, alcance: number) {
  g.ejes({ etiquetaX: 'x', etiquetaY: 't', rejilla: true, paso: 1 })
  // cono de luz e hipérbolas de calibración t² − x² = ±1
  g.curva([[-alcance, -alcance], [alcance, alcance]], g.color('--ocre'), 1.2, true)
  g.curva([[-alcance, alcance], [alcance, -alcance]], g.color('--ocre'), 1.2, true)
  const hip: Array<[number, number]> = []
  const hip2: Array<[number, number]> = []
  for (let i = -60; i <= 60; i++) {
    const u = (i / 60) * 2.5
    hip.push([Math.sinh(u), Math.cosh(u)])
    hip2.push([Math.cosh(u), Math.sinh(u)])
  }
  g.curva(hip, g.color('--ink-soft'), 0.8, true)
  g.curva(hip2, g.color('--ink-soft'), 0.8, true)
}

function vistaDiagrama(g: Pintor2D, s: EstadoRelatividad) {
  g.ventana = { x: [-4, 4], y: [-1.5, 4.5] }
  g.igualarEscala()
  fondo(g, 12)
  ejesPrima(g, s.beta, 12, s.rejillaPrima)
  s.eventos.forEach((ev, i) => {
    const [tp, xp] = boost(s.beta, [ev.t, ev.x])
    // líneas de simultaneidad y de posición del suceso en S′ (paralelas a los ejes primados)
    g.curva([desdePrima(s.beta, tp, 0), [ev.x, ev.t]], g.color('--pos'), 0.9, true)
    g.curva([desdePrima(s.beta, 0, xp), [ev.x, ev.t]], g.color('--pos'), 0.9, true)
    g.curva([[0, ev.t], [ev.x, ev.t]], g.color('--ink-soft'), 0.7, true)
    g.curva([[ev.x, 0], [ev.x, ev.t]], g.color('--ink-soft'), 0.7, true)
  })
  for (let i = 0; i + 1 < s.eventos.length; i++) {
    const a = s.eventos[i]
    const c = s.eventos[i + 1]
    const s2 = intervalo([a.t, a.x], [c.t, c.x])
    const tipo = clase(s2)
    g.curva([[a.x, a.t], [c.x, c.t]], g.color(tipo === 'temporal' ? '--accent' : tipo === 'espacial' ? '--rosa' : '--ocre'), 1.3)
  }
}

function vistaGemelos(g: Pintor2D, s: EstadoRelatividad) {
  const b = Math.max(0.05, Math.abs(s.beta))
  const gm = gemelos(b, s.L)
  g.ventana = { x: [-1, s.L + 1], y: [-0.18 * gm.T, gm.T + 0.5] }
  g.igualarEscala()
  fondo(g, 2 * gm.T + 4)
  const giro: [number, number] = [s.L, gm.T / 2]
  g.curva([[0, 0], [0, gm.T]], g.color('--ink'), 2.4)
  g.curva([[0, 0], giro, [0, gm.T]], g.color('--accent'), 2.4)
  // líneas de simultaneidad del viajero justo antes y justo después del giro
  g.curva([[0, gm.antes], giro], g.color('--pos'), 1.2, true)
  g.curva([[0, gm.despues], giro], g.color('--aux'), 1.2, true)
  g.rellenar([[0, gm.antes], giro, [0, gm.despues]], g.color('--pos'), 0.08)
  // un pulso de luz del viajero a casa por cada unidad de su tiempo propio
  const g_ = gamma(b)
  for (let k = 1; k < gm.tau; k++) {
    const t = k * g_
    const e: [number, number] = t <= gm.T / 2 ? [b * t, t] : [s.L - b * (t - gm.T / 2), t]
    g.curva([e, [0, e[1] + e[0]]], g.color('--ocre'), 0.8)
    g.punto(e[0], e[1], g.color('--accent'), 2.5)
  }
  for (let k = 1; k < gm.T; k++) g.punto(0, k, g.color('--ink'), 2.5)
  g.texto('casa', 0, 0.75 * gm.T, g.color('--ink'), { dx: -40 })
  g.texto('viajero', giro[0], giro[1], g.color('--accent'), { dx: 8 })
}

function vistaContraccion(g: Pintor2D, s: EstadoRelatividad) {
  const b = s.beta
  const gg = gamma(b)
  g.ventana = { x: [-1.5, s.L0 + 2], y: [-1.5, 4.5] }
  g.igualarEscala()
  fondo(g, 14)
  ejesPrima(g, b, 14, false)
  // hoja de universo de la varilla: extremos quietos en x′ = 0 y x′ = L₀
  const h = 14
  const A0 = desdePrima(b, -h, 0)
  const A1 = desdePrima(b, h, 0)
  const B0 = desdePrima(b, -h, s.L0)
  const B1 = desdePrima(b, h, s.L0)
  g.rellenar([A0, A1, B1, B0], g.color('--accent'), 0.14)
  g.curva([A0, A1], g.color('--accent'), 1.4)
  g.curva([B0, B1], g.color('--accent'), 1.4)
  // medida en S (t = 0) y en S′ (t′ = 0)
  g.curva([[0, 0], [s.L0 / gg, 0]], g.color('--ink'), 3.2)
  g.curva([desdePrima(b, 0, 0), desdePrima(b, 0, s.L0)], g.color('--pos'), 3.2)
  // reloj quieto en S′: marca t′ = 1, 2, 3 cuando en S es t = γ, 2γ, 3γ
  for (let k = 1; k <= 3; k++) {
    const [x, t] = desdePrima(b, k, 0)
    g.punto(x, t, g.color('--pos'), 3.5)
    g.curva([[0, t], [x, t]], g.color('--ink-soft'), 0.8, true)
  }
}

function vistaVelocidades(g: Pintor2D, s: EstadoRelatividad) {
  g.ventana = { x: [-1.05, 1.05], y: [-1.6, 1.6] }
  g.ejes({ etiquetaX: 'u′', etiquetaY: 'u' })
  g.curva([[-1.05, 1], [1.05, 1]], g.color('--ocre'), 1, true)
  g.curva([[-1.05, -1], [1.05, -1]], g.color('--ocre'), 1, true)
  g.funcion((u) => (Math.abs(u) < 1 ? componer(u, s.beta) : NaN), g.color('--accent'), 2.2)
  g.funcion((u) => u + s.beta, g.color('--ink-soft'), 1.2)
  g.punto(s.up, componer(s.up, s.beta), g.color('--pos'), 5)
}

const vistas: Record<Modo, Vista2D<EstadoRelatividad>> = {
  diagrama: {
    tipo: '2d',
    clave: 'diagrama',
    navegable: false,
    interaccion: {
      asas: (st) => [
        ...st.eventos.map((ev, i) => ({ id: `e${i}`, p: [ev.x, ev.t], color: '--ink', nombre: NOMBRES[i] })),
        { id: 'beta', p: desdePrima(st.beta, 2.6, 0), color: '--pos', nombre: 'β' },
      ],
      mover: (id, t, st) => {
        if (id === 'beta') {
          const [x, tt] = t.p
          if (tt <= 0.1) return
          return { beta: Math.max(-BMAX, Math.min(BMAX, Math.round((x / tt) * 100) / 100)) }
        }
        const i = Number(id.slice(1))
        return { eventos: st.eventos.map((ev, j) => (j === i ? { t: t.p[1], x: t.p[0] } : ev)) }
      },
      anadir: (t, st) => (st.eventos.length < NOMBRES.length ? { eventos: [...st.eventos, { t: t.p[1], x: t.p[0] }] } : undefined),
      quitar: (id, st) => (id === 'beta' ? undefined : { eventos: st.eventos.filter((_ev, j) => `e${j}` !== id) }),
      pista: 'Arrastra los sucesos y el eje t′; doble clic añade o quita',
    },
    dibujar: (g, st) => vistaDiagrama(g, st),
  },
  gemelos: { tipo: '2d', clave: 'gemelos', navegable: false, dibujar: (g, st) => vistaGemelos(g, st) },
  contraccion: { tipo: '2d', clave: 'contraccion', navegable: false, dibujar: (g, st) => vistaContraccion(g, st) },
  velocidades: { tipo: '2d', clave: 'velocidades', navegable: false, dibujar: (g, st) => vistaVelocidades(g, st) },
}

function lecturas(s: EstadoRelatividad): Array<[string, string]> {
  const b = s.beta
  const gg = gamma(b)
  const filas: Array<[string, string]> = [['γ = 1/√(1 − β²)', gg.toFixed(6)]]
  if (s.modo === 'diagrama') {
    s.eventos.forEach((ev, i) => {
      const [tp, xp] = boost(b, [ev.t, ev.x])
      filas.push([`${NOMBRES[i]}: (t, x) → (t′, x′)`, `(${f3(ev.t)}, ${f3(ev.x)}) → (${f3(tp)}, ${f3(xp)})`])
    })
    for (let i = 0; i + 1 < s.eventos.length; i++) {
      const a: Suceso = [s.eventos[i].t, s.eventos[i].x]
      const c: Suceso = [s.eventos[i + 1].t, s.eventos[i + 1].x]
      const s2 = intervalo(a, c)
      const tipo = clase(s2)
      const orden = Math.sign(c[0] - a[0]) === Math.sign(boost(b, c)[0] - boost(b, a)[0]) ? 'mismo orden' : 'orden invertido en S′'
      filas.push([`s² ${NOMBRES[i]}${NOMBRES[i + 1]} (${tipo})`, `${f3(s2)} · ${tipo === 'espacial' ? orden : 'orden causal fijo'}`])
    }
  } else if (s.modo === 'gemelos') {
    const bb = Math.max(0.05, Math.abs(b))
    const gm = gemelos(bb, s.L)
    filas[0] = ['γ', gamma(bb).toFixed(6)]
    filas.push(
      ['Tiempo en casa T = 2L/β', gm.T.toFixed(6)],
      ['Tiempo del viajero τ = T/γ', gm.tau.toFixed(6)],
      ['Diferencia T − τ', (gm.T - gm.tau).toFixed(6)],
      ['Salto de simultaneidad en el giro 2βL', (gm.despues - gm.antes).toFixed(6)],
      ['Por Doppler: (τ/2)(D + 1/D)', ((gm.tau / 2) * (doppler(bb) + 1 / doppler(bb))).toFixed(6)],
    )
  } else if (s.modo === 'contraccion') {
    filas.push(['Longitud medida en S: L₀/γ', (s.L0 / gg).toFixed(6)], ['Un tic de S′ dura en S: γ', gg.toFixed(6)])
  } else {
    const u = componer(s.up, b)
    filas.push(
      ['u = (u′ + β)/(1 + u′β)', u.toFixed(6)],
      ['Galileo u′ + β', (s.up + b).toFixed(6)],
      ['atanh u', rapidez(u).toFixed(6)],
      ['atanh u′ + atanh β', (rapidez(s.up) + rapidez(b)).toFixed(6)],
    )
  }
  return filas
}

export default definir<EstadoRelatividad>({
  id: 'relatividad',
  area: 'mecanica',
  resumen: 'Relatividad especial: diagrama de Minkowski, simultaneidad, dilatación, contracción, gemelos y composición de velocidades',
  corto: 'Relatividad especial',
  titulo: 'Relatividad <i>especial</i>',
  entradilla: 'Diagrama de Minkowski con un sistema que se mueve: arrastra los sucesos y el eje t′.',
  inicial: {
    modo: 'diagrama',
    beta: 0.5,
    eventos: [{ t: 1, x: 0.4 }, { t: 2.6, x: 1.1 }, { t: 1.6, x: 3.2 }],
    rejillaPrima: false,
    L: 3,
    L0: 2,
    up: 0.7,
  },
  Panel,
  capas: (s) =>
    s.modo === 'diagrama'
      ? [
          capaVer(s, 'rejillaPrima', 'Rejilla de S′', '--accent'),
          ...s.eventos.map((e, i) => ({ id: `e${i}`, nombre: `Suceso ${NOMBRES[i]}`, color: '--ink', detalle: `(t, x) = ${coords([e.t, e.x])}`, quitar: (t: EstadoRelatividad) => ({ eventos: t.eventos.filter((_, k) => k !== i) }) })),
        ]
      : [],
  menu: (s) => ({
    anadir: s.modo === 'diagrama' ? [accion<EstadoRelatividad>('Suceso', (t) => ({ eventos: [...t.eventos, { t: 1, x: 0.5 }] }), s.eventos.length >= NOMBRES.length)] : [],
    acciones: [
      radios<EstadoRelatividad, Modo>('Qué mirar', [{ v: 'diagrama', t: 'Diagrama de Minkowski' }, { v: 'gemelos', t: 'Paradoja de los gemelos' }, { v: 'contraccion', t: 'Contracción de longitudes' }, { v: 'velocidades', t: 'Composición de velocidades' }], s.modo, (modo) => ({ modo })),
      radios<EstadoRelatividad, number>('β = v/c', [0, 0.25, 0.5, 0.6, 0.8, 0.9, 0.99].map((v) => ({ v, t: String(v).replace('.', ',') })), s.beta, (beta) => ({ beta })),
    ],
  }),
  resultadoEnPanel: true,
  rotulo: (s) => ({ nombre: `β = ${s.beta.toFixed(2)}`, apunte: s.modo }),
  formula: (s) =>
    s.modo === 'velocidades'
      ? [String.raw`u=\frac{u'+\beta}{1+u'\beta},\qquad \operatorname{atanh}u=\operatorname{atanh}u'+\operatorname{atanh}\beta`]
      : s.modo === 'gemelos'
        ? [String.raw`\tau=\int\!\sqrt{1-v^2}\,dt=\frac{T}{\gamma},\qquad T=\frac{2L}{\beta}`]
        : s.modo === 'contraccion'
          ? [String.raw`L=\frac{L_0}{\gamma},\qquad \Delta t=\gamma\,\Delta\tau`]
          : [String.raw`t'=\gamma\,(t-\beta x),\quad x'=\gamma\,(x-\beta t)`, String.raw`s^2=\Delta t^2-\Delta x^2=\Delta t'^2-\Delta x'^2`],
  lecturas,
  leyenda: (s) =>
    s.modo === 'velocidades' ? (
      <>
        <Muestra color="var(--accent)">relativista</Muestra>
        <Muestra color="var(--ink-soft)">Galileo</Muestra>
        <Muestra color="var(--ocre)">±c</Muestra>
      </>
    ) : s.modo === 'gemelos' ? (
      <>
        <Muestra color="var(--ink)">casa</Muestra>
        <Muestra color="var(--accent)">viajero</Muestra>
        <Muestra color="var(--pos)">simultaneidad a la ida</Muestra>
        <Muestra color="var(--aux)">a la vuelta</Muestra>
        <Muestra color="var(--ocre)">señales cada unidad de τ</Muestra>
      </>
    ) : (
      <>
        <Muestra color="var(--pos)">ejes de S′</Muestra>
        <Muestra color="var(--ocre)">cono de luz</Muestra>
        {s.modo === 'diagrama' ? (
          <>
            <Muestra color="var(--accent)">temporal</Muestra>
            <Muestra color="var(--rosa)">espacial</Muestra>
          </>
        ) : (
          <Muestra color="var(--accent)">varilla quieta en S′</Muestra>
        )}
      </>
    ),
  comparaciones: [{ t: 'Dos velocidades del sistema', a: { beta: 0.3 }, b: { beta: 0.8 } }],
  vista: (s) => vistas[s.modo],
})
