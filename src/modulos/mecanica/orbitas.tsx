import { definir, type PropsPanel } from '../../nucleo/tipos'
import { accion, capaFija, capaVer, casilla, radios } from '../../nucleo/menu'
import { Grupo, Interruptor, Muestra, Rango, Resultado, Segmentado } from '../../nucleo/controles'
import { dormandPrince, interpolarHermite } from '../../lib/numerico'
import type { Pintor2D } from '../../render/pintor2d'

type Modo = 'orbita' | 'hohmann'

export interface EstadoOrbitas {
  modo: Modo
  mu: number
  r0: number
  v0: number
  /** ángulo de la velocidad respecto a la tangente (grados) */
  gamma: number
  eps: number
  vueltas: number
  areas: boolean
  r1: number
  r2: number
}

type Tray = { t: number[]; y: number[][]; dy: number[][]; parada?: string }

/**
 * Fuerza central por unidad de masa con V(r) = −μ/r − ε/r³: la corrección ε/r³ es la que, en
 * la ecuación de Binet, imita la de la relatividad general y hace precesar el perihelio.
 */
export function campoCentral(mu: number, eps: number) {
  return (_t: number, y: number[]) => {
    const [x, yy, vx, vy] = y
    const r2 = x * x + yy * yy
    const r = Math.sqrt(r2)
    // |F| = μ/r² + 3ε/r⁴, hacia el centro
    const f = (mu / r2 + (3 * eps) / (r2 * r2)) / r
    return [vx, vy, -f * x, -f * yy]
  }
}

export function invariantes(mu: number, eps: number, y: number[]) {
  const [x, yy, vx, vy] = y
  const r = Math.hypot(x, yy)
  const E = 0.5 * (vx * vx + vy * vy) - mu / r - eps / r ** 3
  const L = x * vy - yy * vx
  return { E, L }
}

/** Elementos de la cónica kepleriana (ε = 0): e = √(1 + 2EL²/μ²), a = −μ/(2E), T = 2π√(a³/μ). */
export function elementos(mu: number, E: number, L: number) {
  const e = Math.sqrt(Math.max(0, 1 + (2 * E * L * L) / (mu * mu)))
  const a = E < 0 ? -mu / (2 * E) : Infinity
  return { e, a, T: E < 0 ? 2 * Math.PI * Math.sqrt(a ** 3 / mu) : Infinity, rp: (L * L) / (mu * (1 + e)), ra: e < 1 ? (L * L) / (mu * (1 - e)) : Infinity }
}

export function estadoInicial(s: Pick<EstadoOrbitas, 'r0' | 'v0' | 'gamma'>): number[] {
  const g = (s.gamma * Math.PI) / 180
  // en (r0, 0): la tangente es +y, la radial +x
  return [s.r0, 0, s.v0 * Math.sin(g), s.v0 * Math.cos(g)]
}

let cache: { clave: string; tr: Tray | null } = { clave: '', tr: null }

export function trayectoria(s: EstadoOrbitas): Tray {
  const clave = [s.mu, s.r0, s.v0, s.gamma, s.eps, s.vueltas].join('|')
  if (cache.clave === clave && cache.tr) return cache.tr
  const y0 = estadoInicial(s)
  const { E, L } = invariantes(s.mu, s.eps, y0)
  const el = elementos(s.mu, E, L)
  const tFin = Number.isFinite(el.T) ? s.vueltas * el.T * 1.02 : (20 * s.r0) / Math.max(1e-9, s.v0)
  const f = campoCentral(s.mu, s.eps)
  // parada al caer al centro o escapar muy lejos
  const tr = dormandPrince(
    (t, y) => {
      const r = Math.hypot(y[0], y[1])
      // al caer al centro el campo diverge: NaN hace que el integrador se pare y lo avise
      if (r < 1e-3 * s.r0) return [NaN, NaN, NaN, NaN]
      return f(t, y)
    },
    0,
    y0,
    tFin,
    1e-11,
    400000,
  )
  cache = { clave, tr }
  return tr
}

/** Periapsides (mínimos de r) por cambio de signo de ṙ = (x vx + y vy)/r de − a +. */
export function periapsides(tr: Tray): Array<{ t: number; ang: number; r: number }> {
  const out: Array<{ t: number; ang: number; r: number }> = []
  const rd = (y: number[]) => y[0] * y[2] + y[1] * y[3]
  for (let k = 1; k < tr.t.length; k++) {
    if (rd(tr.y[k - 1]) < 0 && rd(tr.y[k]) >= 0) {
      let lo = tr.t[k - 1]
      let hi = tr.t[k]
      for (let i = 0; i < 80; i++) {
        const m = (lo + hi) / 2
        if (rd(interpolarHermite(tr, m)) < 0) lo = m
        else hi = m
      }
      const y = interpolarHermite(tr, (lo + hi) / 2)
      out.push({ t: (lo + hi) / 2, ang: Math.atan2(y[1], y[0]), r: Math.hypot(y[0], y[1]) })
    }
  }
  return out
}

/** Área barrida entre t₁ y t₂: ½∫(x ẏ − y ẋ) dt, por Simpson sobre la interpolación. */
export function areaBarrida(tr: Tray, t1: number, t2: number, n = 400): number {
  let s = 0
  for (let k = 0; k <= n; k++) {
    const y = interpolarHermite(tr, t1 + ((t2 - t1) * k) / n)
    s += (k === 0 || k === n ? 1 : k % 2 ? 4 : 2) * (y[0] * y[3] - y[1] * y[2])
  }
  return (0.5 * s * (t2 - t1)) / (3 * n)
}

/** Transferencia de Hohmann entre órbitas circulares r₁ → r₂. */
export function hohmann(mu: number, r1: number, r2: number) {
  const at = (r1 + r2) / 2
  const dv1 = Math.sqrt(mu / r1) * (Math.sqrt((2 * r2) / (r1 + r2)) - 1)
  const dv2 = Math.sqrt(mu / r2) * (1 - Math.sqrt((2 * r1) / (r1 + r2)))
  return { dv1, dv2, tTransferencia: Math.PI * Math.sqrt(at ** 3 / mu), at }
}

function Panel({ s, set }: PropsPanel<EstadoOrbitas>) {
  return (
    <>
      <Grupo titulo="Problema">
        <Segmentado columnas={2} valor={s.modo} opciones={[{ v: 'orbita', t: 'Órbita' }, { v: 'hohmann', t: 'Transferencia de Hohmann' }]} onChange={(modo) => set({ modo })} />
        <Rango etiqueta="μ = GM" valor={s.mu} min={0.1} max={10} paso={0.1} onChange={(mu) => set({ mu })} />
      </Grupo>
      <Resultado />
      {s.modo === 'orbita' ? (
        <Grupo titulo="Lanzamiento">
          <Rango etiqueta="r₀" valor={s.r0} min={0.2} max={5} paso={0.01} onChange={(r0) => set({ r0 })} />
          <Rango etiqueta="v₀" valor={s.v0} min={0.05} max={5} paso={0.01} onChange={(v0) => set({ v0 })} />
          <Rango etiqueta="ángulo con la tangente (°)" valor={s.gamma} min={-80} max={80} paso={1} onChange={(gamma) => set({ gamma })} />
          <Rango etiqueta="corrección ε/r³ (precesión)" valor={s.eps} min={0} max={0.05} paso={0.0005} formato={(v) => v.toFixed(4)} onChange={(eps) => set({ eps })} />
          <Rango etiqueta="vueltas" valor={s.vueltas} min={1} max={20} paso={1} formato={(v) => String(v)} onChange={(vueltas) => set({ vueltas: Math.round(vueltas) })} />
          <div className="interruptores">
            <Interruptor activo={s.areas} onChange={(areas) => set({ areas })}>
              Áreas barridas en tiempos iguales
            </Interruptor>
          </div>
        </Grupo>
      ) : (
        <Grupo titulo="Órbitas circulares">
          <Rango etiqueta="r₁ (inicial)" valor={s.r1} min={0.3} max={5} paso={0.01} onChange={(r1) => set({ r1 })} />
          <Rango etiqueta="r₂ (final)" valor={s.r2} min={0.3} max={8} paso={0.01} onChange={(r2) => set({ r2 })} />
        </Grupo>
      )}
    </>
  )
}

const circulo = (r: number, cx = 0, cy = 0) => Array.from({ length: 181 }, (_, i) => [cx + r * Math.cos((i * Math.PI) / 90), cy + r * Math.sin((i * Math.PI) / 90)] as [number, number])

function vistaOrbita(g: Pintor2D, s: EstadoOrbitas, reloj: number) {
  const tr = trayectoria(s)
  const pts = tr.y.map((y) => [y[0], y[1]] as [number, number])
  const R = Math.min(60, Math.max(1.2 * s.r0, ...pts.map(([a, b]) => 1.1 * Math.hypot(a, b))))
  g.region(0, 0, 0.62, 1)
  g.ventana = { x: [-R, R], y: [-R, R] }
  g.igualarEscala()
  g.ejes({ rejilla: true })
  const tEnd = tr.t[tr.t.length - 1]
  if (s.areas) {
    const { E, L } = invariantes(s.mu, s.eps, estadoInicial(s))
    const T = elementos(s.mu, E, L).T
    const periodoArea = Number.isFinite(T) ? T : tEnd
    const n = 8
    for (let k = 0; k < n; k += 2) {
      const t1 = (periodoArea * k) / n
      const t2 = (periodoArea * (k + 1)) / n
      const sector: Array<[number, number]> = [[0, 0]]
      for (let j = 0; j <= 40; j++) {
        const y = interpolarHermite(tr, t1 + ((t2 - t1) * j) / 40)
        sector.push([y[0], y[1]])
      }
      g.rellenar(sector, g.color('--accent'), 0.18)
    }
  }
  g.curva(pts, g.color('--accent'), 1.8)
  g.punto(0, 0, g.color('--pos'), 6)
  for (const p of periapsides(tr)) g.punto(p.r * Math.cos(p.ang), p.r * Math.sin(p.ang), g.color('--neg'), 3)
  const t = (reloj * 0.5) % Math.max(tEnd, 1e-9)
  const y = interpolarHermite(tr, t)
  g.punto(y[0], y[1], g.color('--ink'), 5)
  g.finRegion()

  // potencial efectivo U = L²/(2r²) − μ/r − ε/r³ y la energía
  g.region(0.62, 0, 0.38, 1)
  g.fondoRegion(g.color('--ground'))
  const { E, L } = invariantes(s.mu, s.eps, estadoInicial(s))
  const U = (r: number) => (L * L) / (2 * r * r) - s.mu / r - s.eps / r ** 3
  const rMax = Math.max(3 * s.r0, (L * L) / s.mu * 3)
  const rs = Array.from({ length: 400 }, (_, i) => 0.05 * s.r0 + (rMax * i) / 399)
  const us = rs.map(U)
  const umin = Math.min(...us, E)
  g.ventana = { x: [0, rMax], y: [umin - 0.3 * Math.abs(umin), Math.max(0.5 * Math.abs(umin), E + 0.3 * Math.abs(umin))] }
  g.ejes({ etiquetaX: 'r', etiquetaY: 'U_ef' })
  g.curva(rs.map((r, i) => [r, us[i]] as [number, number]), g.color('--accent'), 2)
  g.curva([[0, E], [rMax, E]], g.color('--neg'), 1.6, true)
  const r = Math.hypot(y[0], y[1])
  g.punto(r, E, g.color('--ink'), 4)
  g.finRegion()
  g.ventana = { x: [-R, R], y: [-R, R] }
  g.usarRegion(0, 0, 0.62, 1)
}

function vistaHohmann(g: Pintor2D, s: EstadoOrbitas, reloj: number) {
  const h = hohmann(s.mu, s.r1, s.r2)
  const R = 1.2 * Math.max(s.r1, s.r2)
  g.ventana = { x: [-R, R], y: [-R, R] }
  g.igualarEscala()
  g.ejes({ rejilla: true })
  g.curva(circulo(s.r1), g.color('--pos'), 1.6)
  g.curva(circulo(s.r2), g.color('--ink-soft'), 1.6)
  // elipse de transferencia con foco en el origen, periapsis en (r₁, 0)
  const e = Math.abs(s.r2 - s.r1) / (s.r1 + s.r2)
  const p = (2 * s.r1 * s.r2) / (s.r1 + s.r2)
  const sube = s.r2 > s.r1
  const elipse = Array.from({ length: 181 }, (_, i) => {
    const th = (i * Math.PI) / 180
    const r = p / (1 + (sube ? e : -e) * Math.cos(th))
    return [r * Math.cos(th), r * Math.sin(th)] as [number, number]
  })
  g.curva(elipse, g.color('--accent'), 2.2)
  // nave: 1 vuelta en r₁, transferencia, 1 vuelta en r₂
  const T1 = 2 * Math.PI * Math.sqrt(s.r1 ** 3 / s.mu)
  const T2 = 2 * Math.PI * Math.sqrt(s.r2 ** 3 / s.mu)
  const total = T1 + h.tTransferencia + T2
  const t = (reloj * 0.6) % total
  let pos: [number, number]
  if (t < T1) {
    const a = (2 * Math.PI * t) / T1
    pos = [s.r1 * Math.cos(a), s.r1 * Math.sin(a)]
  } else if (t < T1 + h.tTransferencia) {
    // anomalía media → excéntrica (Kepler, Newton) → verdadera. Subiendo, la nave sale del periapsis
    // (θ = 0); bajando, sale del apoapsis, que está en θ = 0 con el periapsis en θ = π
    const M = (sube ? 0 : Math.PI) + (Math.PI * (t - T1)) / h.tTransferencia
    let Ek = M
    for (let i = 0; i < 30; i++) Ek -= (Ek - e * Math.sin(Ek) - M) / (1 - e * Math.cos(Ek))
    const nu = 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(Ek / 2), Math.sqrt(1 - e) * Math.cos(Ek / 2))
    const th = sube ? nu : nu + Math.PI
    const r = h.at * (1 - e * Math.cos(Ek))
    pos = [r * Math.cos(th), r * Math.sin(th)]
  } else {
    const a = Math.PI + (2 * Math.PI * (t - T1 - h.tTransferencia)) / T2
    pos = [s.r2 * Math.cos(a), s.r2 * Math.sin(a)]
  }
  g.punto(0, 0, g.color('--pos'), 6)
  g.punto(pos[0], pos[1], g.color('--ink'), 5)
  g.punto(s.r1, 0, g.color('--accent'), 4)
  g.punto(-s.r2, 0, g.color('--accent'), 4)
}

export default definir<EstadoOrbitas>({
  id: 'orbitas',
  area: 'mecanica',
  resumen: 'Órbitas en un campo central: leyes de Kepler, potencial efectivo, precesión y transferencia de Hohmann',
  corto: 'Órbitas',
  titulo: 'Órbitas y <i>Kepler</i>',
  entradilla: 'Lanza un cuerpo alrededor de una masa central y compara con la cónica de Kepler.',
  inicial: { modo: 'orbita', mu: 1, r0: 1, v0: 1.2, gamma: 0, eps: 0, vueltas: 3, areas: true, r1: 1, r2: 2.5 },
  Panel,
  capas: (s) => (s.modo === 'orbita' ? [capaFija<EstadoOrbitas>('o', 'Órbita y U_ef', '--accent'), capaFija<EstadoOrbitas>('p', 'Periapsides', '--neg'), capaVer(s, 'areas', 'Áreas iguales (2.ª ley)', '--pos')] : []),
  menu: (s) => ({
    acciones: [
      radios<EstadoOrbitas, Modo>('Qué mirar', [{ v: 'orbita', t: 'Órbita en un campo central' }, { v: 'hohmann', t: 'Transferencia de Hohmann' }], s.modo, (modo) => ({ modo })),
      casilla<EstadoOrbitas>('Áreas iguales', s.areas, (areas) => ({ areas })),
      accion<EstadoOrbitas>('Órbita circular', (t) => ({ modo: 'orbita', v0: Math.sqrt(t.mu / t.r0), eps: 0 })),
    ],
  }),
  resultadoEnPanel: true,
  rotulo: (s) => ({ nombre: s.modo === 'orbita' ? 'r̈ = −∇V' : 'Hohmann', apunte: s.eps ? `ε = ${s.eps}` : 'Kepler' }),
  formula: (s) =>
    s.modo === 'orbita'
      ? [String.raw`V(r)=-\frac{\mu}{r}-\frac{\varepsilon}{r^3},\qquad U_{ef}=\frac{L^2}{2r^2}+V(r)`, String.raw`e=\sqrt{1+\frac{2EL^2}{\mu^2}},\quad a=-\frac{\mu}{2E},\quad T=2\pi\sqrt{\frac{a^3}{\mu}}`]
      : [String.raw`\Delta v_1=\sqrt{\tfrac{\mu}{r_1}}\Big(\sqrt{\tfrac{2r_2}{r_1+r_2}}-1\Big)`, String.raw`\Delta v_2=\sqrt{\tfrac{\mu}{r_2}}\Big(1-\sqrt{\tfrac{2r_1}{r_1+r_2}}\Big)`, String.raw`t_H=\pi\sqrt{\frac{a_t^3}{\mu}},\quad a_t=\frac{r_1+r_2}{2}`],
  lecturas: (s) => {
    if (s.modo === 'hohmann') {
      const h = hohmann(s.mu, s.r1, s.r2)
      return [
        ['Δv₁ (salida)', h.dv1.toFixed(6)],
        ['Δv₂ (llegada)', h.dv2.toFixed(6)],
        ['Δv total', (Math.abs(h.dv1) + Math.abs(h.dv2)).toFixed(6)],
        ['Tiempo de transferencia', h.tTransferencia.toFixed(6)],
      ]
    }
    const y0 = estadoInicial(s)
    const { E, L } = invariantes(s.mu, s.eps, y0)
    const el = elementos(s.mu, E, L)
    const tr = trayectoria(s)
    let dE = 0
    let dL = 0
    for (const y of tr.y) {
      const iv = invariantes(s.mu, s.eps, y)
      dE = Math.max(dE, Math.abs(iv.E - E))
      dL = Math.max(dL, Math.abs(iv.L - L))
    }
    const filas: Array<[string, string]> = [
      ['Energía E', E.toFixed(6)],
      ['Momento angular L', L.toFixed(6)],
      ['Tipo', E < 0 ? 'ligada (elipse)' : E === 0 ? 'parábola' : 'hipérbola: escapa'],
      ['Deriva de E y de L', `${dE.toExponential(1)} · ${dL.toExponential(1)}`],
    ]
    if (s.eps === 0) {
      filas.push(['Excentricidad e', el.e.toFixed(6)])
      if (E < 0) filas.push(['Semieje a', el.a.toFixed(6)], ['Periodo T = 2π√(a³/μ)', el.T.toFixed(6)])
    }
    const ps = periapsides(tr)
    if (ps.length >= 2) {
      filas.push(['Periodo radial medido', ((ps[ps.length - 1].t - ps[0].t) / (ps.length - 1)).toFixed(6)])
      let d = ps[1].ang - ps[0].ang
      d = Math.atan2(Math.sin(d), Math.cos(d))
      filas.push(['Precesión por vuelta', `${d.toExponential(3)} rad`])
      if (s.eps > 0) filas.push(['Primer orden 6πεμ/L⁴', ((6 * Math.PI * s.eps * s.mu) / L ** 4).toExponential(3)])
    }
    if (s.areas && E < 0 && Number.isFinite(el.T)) {
      const a1 = areaBarrida(tr, 0, el.T / 8)
      const a2 = areaBarrida(tr, (3 * el.T) / 8, el.T / 2)
      filas.push(['Áreas en dos octavos del periodo', `${a1.toFixed(6)} · ${a2.toFixed(6)}`])
    }
    return filas
  },
  leyenda: (s) =>
    s.modo === 'orbita' ? (
      <>
        <Muestra color="var(--accent)">órbita y U_ef</Muestra>
        <Muestra color="var(--neg)">periapsides · energía</Muestra>
      </>
    ) : (
      <>
        <Muestra color="var(--pos)">órbita inicial</Muestra>
        <Muestra color="var(--accent)">elipse de transferencia</Muestra>
        <Muestra color="var(--ink-soft)">órbita final</Muestra>
      </>
    ),
  comparaciones: [{ t: 'Kepler contra precesión', a: { eps: 0 }, b: { eps: 0.02 } }],
  vista: (s) => ({
    tipo: '2d',
    clave: s.modo,
    navegable: false,
    animada: () => true,
    interaccion:
      s.modo === 'orbita'
        ? {
            asas: (st) => [{ id: 'r0', p: [st.r0, 0], color: '--ink', eje: 'x', nombre: 'r₀' }],
            mover: (_id, t) => ({ r0: Math.max(0.2, Math.min(5, t.p[0])) }),
            pista: 'Arrastra el punto de lanzamiento',
          }
        : undefined,
    dibujar(g, st, reloj) {
      if (st.modo === 'orbita') vistaOrbita(g, st, reloj ?? 0)
      else vistaHohmann(g, st, reloj ?? 0)
    },
  }),
})
