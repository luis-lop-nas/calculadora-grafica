import { definir, type PropsPanel, type Vista } from '../../nucleo/tipos'
import { casilla, radios } from '../../nucleo/menu'
import { Atajos, Grupo, Interruptor, Muestra, Rango, Resultado, Segmentado } from '../../nucleo/controles'
import {
  camino, ciclo, critico, entropia, espinodal, fase, maxwell, pVdW, R, rendimientoTeorico, resumen, SUSTANCIAS, TVdW, volumenesVdW,
  type Gas, type ParamCiclo, type Proceso, type TipoCiclo,
} from '../../lib/termo'
import type { Pintor2D } from '../../render/pintor2d'

type Modo = 'ciclos' | 'vdw'

interface Par {
  V1: number
  P1: number
  a: number
  b: number
}

export interface EstadoTermo {
  modo: Modo
  ciclo: TipoCiclo
  gas: 'mono' | 'di'
  par: Record<TipoCiclo, Par>
  regenerador: boolean
  sust: number
  v: number
  T: number
  fondo: boolean
  ideal: boolean
}

const N_MOL = 1

/** Rango de a y b por ciclo; los usan los deslizadores y las asas. */
const LIMITES: Record<TipoCiclo, { a: [number, number, string]; b: [number, number, string] }> = {
  carnot: { a: [1.1, 6, 'V₂/V₁ (expansión isoterma)'], b: [0.1, 0.95, 'T_c/T_h'] },
  otto: { a: [1.5, 14, 'compresión r = V₁/V₂'], b: [1.1, 5, 'calentamiento T₃/T₂'] },
  diesel: { a: [5, 25, 'compresión r = V₁/V₂'], b: [1.1, 4, 'corte r_c = V₃/V₂'] },
  brayton: { a: [1.5, 30, 'presiones r_p = P₂/P₁'], b: [1.1, 5, 'calentamiento T₃/T₂'] },
  stirling: { a: [1.2, 8, 'compresión r = V₁/V₂'], b: [1.1, 5, 'T_h/T_c'] },
}

const NOMBRES: Record<TipoCiclo, string> = { carnot: 'Carnot', otto: 'Otto', diesel: 'Diesel', brayton: 'Brayton', stirling: 'Stirling' }

const PAR_INICIAL: Record<TipoCiclo, Par> = {
  carnot: { V1: 10, P1: 500, a: 3, b: 0.5 },
  otto: { V1: 24, P1: 100, a: 8, b: 2.5 },
  diesel: { V1: 24, P1: 100, a: 18, b: 2 },
  brayton: { V1: 24, P1: 100, a: 10, b: 2.4 },
  stirling: { V1: 24, P1: 100, a: 3, b: 2.5 },
}

const gasDe = (s: EstadoTermo): Gas => ({ n: N_MOL, gamma: s.gas === 'mono' ? 5 / 3 : 7 / 5 })
const paramDe = (s: EstadoTermo): ParamCiclo => ({ tipo: s.ciclo, ...s.par[s.ciclo], regenerador: s.regenerador })
const acota = (x: number, [lo, hi]: readonly [number, number, ...unknown[]]) => Math.min(hi, Math.max(lo, x))
const limB = (s: EstadoTermo): [number, number] => {
  const [lo, hi] = LIMITES[s.ciclo].b
  // en el Diesel el corte no puede pasar del volumen máximo
  return s.ciclo === 'diesel' ? [lo, Math.min(hi, 0.95 * s.par.diesel.a)] : [lo, hi]
}

const pct = (x: number) => `${(100 * x).toFixed(2)} %`
const J = (x: number) => `${x.toFixed(1)} J`
const num = (x: number, d = 3) => (Number.isFinite(x) ? x.toFixed(d) : '—')

function conPar(s: EstadoTermo, parche: Partial<Par>): Partial<EstadoTermo> {
  return { par: { ...s.par, [s.ciclo]: { ...s.par[s.ciclo], ...parche } } }
}

function Panel({ s, set }: PropsPanel<EstadoTermo>) {
  const p = s.par[s.ciclo]
  const L = LIMITES[s.ciclo]
  return (
    <>
      <Grupo titulo="Termodinámica">
        <Segmentado valor={s.modo} opciones={[{ v: 'ciclos', t: 'Ciclos de gas ideal' }, { v: 'vdw', t: 'Van der Waals' }]} onChange={(modo) => set({ modo })} />
      </Grupo>
      {s.modo === 'ciclos' && (
        <>
          <Grupo titulo="Ciclo">
            <Segmentado valor={s.ciclo} opciones={(Object.keys(NOMBRES) as TipoCiclo[]).map((v) => ({ v, t: NOMBRES[v] }))} onChange={(ciclo) => set({ ciclo })} />
            <Segmentado valor={s.gas} opciones={[{ v: 'mono', t: 'Monoatómico γ = 5/3' }, { v: 'di', t: 'Diatómico γ = 7/5' }]} onChange={(gas) => set({ gas })} />
            {s.ciclo === 'stirling' && (
              <Interruptor activo={s.regenerador} onChange={(regenerador) => set({ regenerador })}>
                Regenerador ideal
              </Interruptor>
            )}
          </Grupo>
          <Grupo titulo="Parámetros (1 mol)">
            <Rango etiqueta="V₁ (L)" valor={p.V1} min={2} max={40} paso={0.1} formato={(v) => v.toFixed(1)} onChange={(V1) => set(conPar(s, { V1 }))} />
            <Rango etiqueta="P₁ (kPa)" valor={p.P1} min={20} max={1000} paso={1} formato={(v) => v.toFixed(0)} onChange={(P1) => set(conPar(s, { P1 }))} />
            <Rango etiqueta={L.a[2]} valor={p.a} min={L.a[0]} max={L.a[1]} paso={0.01} onChange={(a) => set(conPar(s, { a, b: s.ciclo === 'diesel' ? Math.min(p.b, 0.95 * a) : p.b }))} />
            <Rango etiqueta={L.b[2]} valor={p.b} min={limB(s)[0]} max={limB(s)[1]} paso={0.01} onChange={(b) => set(conPar(s, { b }))} />
            <Atajos opciones={[{ t: 'Valores de partida', onClick: () => set(conPar(s, PAR_INICIAL[s.ciclo])) }]} />
          </Grupo>
        </>
      )}
      {s.modo === 'vdw' && (
        <Grupo titulo="Gas de van der Waals">
          <Atajos opciones={SUSTANCIAS.map((u, i) => ({ t: u.nombre, activo: i === s.sust, onClick: () => set({ sust: i }) }))} />
          <Rango etiqueta="T / T_c" valor={s.T} min={0.5} max={1.4} paso={0.001} formato={(v) => v.toFixed(3)} onChange={(T) => set({ T })} />
          <Rango etiqueta="v / v_c" valor={s.v} min={0.36} max={5} paso={0.001} formato={(v) => v.toFixed(3)} onChange={(v) => set({ v })} />
          <Interruptor activo={s.fondo} onChange={(fondo) => set({ fondo })}>Otras isotermas</Interruptor>
          <Interruptor activo={s.ideal} onChange={(ideal) => set({ ideal })}>Gas ideal a la misma T</Interruptor>
          <Atajos opciones={[{ t: 'Punto crítico', onClick: () => set({ T: 1, v: 1 }) }, { t: 'En la campana', onClick: () => set({ T: 0.9, v: 1.2 }) }]} />
        </Grupo>
      )}
      <Resultado />
    </>
  )
}

/* ── ciclos ── */

/** Trozos del lienzo: dejan sitio a los rótulos de los ejes y a la leyenda de abajo. */
const REGION_PV = [0.01, 0.04, 0.48, 0.84] as const
const REGION_TS = [0.52, 0.04, 0.47, 0.84] as const

/** Redondea hacia arriba a 1, 2 o 5 × 10ⁿ: la ventana solo salta de vez en cuando al arrastrar. */
function techo(x: number) {
  const e = 10 ** Math.floor(Math.log10(x))
  const m = x / e
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * e
}

const colorTramo = (g: Pintor2D, Q: number, tipo: Proceso, regen: boolean) =>
  regen && tipo === 'isocora' ? g.color('--aux') : Math.abs(Q) < 1e-9 ? g.color('--ink-soft') : Q > 0 ? g.color('--pos') : g.color('--neg')

function flechaEnMedio(g: Pintor2D, pts: Array<[number, number]>, color: string) {
  const i = Math.floor(pts.length / 2)
  const [a, b] = [pts[i], pts[i + 1]]
  g.flecha(a[0], a[1], b[0] - a[0], b[1] - a[1], color, 2, 10)
}

function dibujarCiclo(g: Pintor2D, s: EstadoTermo) {
  const gas = gasDe(s)
  const p = paramDe(s)
  const c = ciclo(gas, p)
  const res = resumen(gas, p)
  const regen = s.ciclo === 'stirling' && s.regenerador
  const caminos = c.tramos.map((t) => camino(gas, c.estados[t.de], c.estados[t.a], t.tipo))
  const e1 = c.estados[0]

  // T–S a la derecha
  g.region(...REGION_TS)
  const S = caminos.map((cm) => cm.map((e) => [entropia(gas, e.V, e.T, e1.V, e1.T), e.T] as [number, number]))
  const Ss = S.flat().map((q) => q[0])
  const [smin, smax] = [Math.min(...Ss), Math.max(...Ss)]
  const ds = smax - smin
  const Ttope = techo(1.12 * res.Tmax)
  g.ventana = { x: [smin - 0.2 * ds, smax + 0.12 * ds], y: [-0.07 * Ttope, 1.04 * Ttope] }
  g.ejes({ etiquetaX: 'S − S₁ (J/K)', etiquetaY: 'T (K)' })
  // el rectángulo de Carnot entre las mismas temperaturas extremas y el mismo salto de entropía
  g.curva([[smin, res.Tmin], [smax, res.Tmin], [smax, res.Tmax], [smin, res.Tmax], [smin, res.Tmin]], g.color('--ink-soft'), 1, true)
  g.rellenar(S.flat(), g.color('--accent'), 0.14)
  S.forEach((pts, i) => {
    const col = colorTramo(g, res.tramos[i].Q, res.tramos[i].tipo, regen)
    g.curva(pts, col, 2.4)
    flechaEnMedio(g, pts, col)
  })
  S.forEach((pts, i) => g.texto(String(i + 1), pts[0][0], pts[0][1], g.color('--ink'), { dx: 8, dy: -10 }))
  g.finRegion()

  // P–V a la izquierda, con las asas
  g.region(...REGION_PV)
  const PV = caminos.map((cm) => cm.map((e) => [e.V, e.P] as [number, number]))
  const Vmax = Math.max(...PV.flat().map((q) => q[0]))
  const Pmax = Math.max(...PV.flat().map((q) => q[1]))
  const [Vtope, Ptope] = [techo(1.08 * Vmax), techo(1.1 * Pmax)]
  g.ventana = { x: [-0.12 * Vtope, 1.04 * Vtope], y: [-0.07 * Ptope, 1.04 * Ptope] }
  g.ejes({ etiquetaX: 'V (L)', etiquetaY: 'P (kPa)' })
  const nR = gas.n * R
  for (const T of [res.Tmax, res.Tmin]) {
    const iso: Array<[number, number]> = []
    for (let i = 1; i <= 200; i++) {
      const V = (Vtope * i) / 200
      iso.push([V, (nR * T) / V])
    }
    g.curva(iso.filter((q) => q[1] < 2 * g.ventana.y[1]), g.color('--grid'), 1, true)
  }
  g.rellenar(PV.flat(), g.color('--accent'), 0.16)
  PV.forEach((pts, i) => {
    const col = colorTramo(g, res.tramos[i].Q, res.tramos[i].tipo, regen)
    g.curva(pts, col, 2.4)
    flechaEnMedio(g, pts, col)
  })
  const ventana = { x: [...g.ventana.x] as [number, number], y: [...g.ventana.y] as [number, number] }
  g.finRegion()
  g.ventana = ventana
  g.usarRegion(...REGION_PV)
}

/** La asa i + 1 está en el estado i; las tres primeras bastan para fijar el ciclo. */
function asasCiclo(s: EstadoTermo) {
  const c = ciclo(gasDe(s), paramDe(s))
  return c.estados.slice(0, 3).map((e, i) => ({ id: String(i + 1), p: [e.V, e.P], color: i === 0 ? '--accent' : '--ink', nombre: String(i + 1) }))
}

function moverCiclo(id: string, [x, y]: number[], s: EstadoTermo): Partial<EstadoTermo> | void {
  const gas = gasDe(s)
  const p = s.par[s.ciclo]
  const k = gas.gamma - 1
  const L = LIMITES[s.ciclo]
  if (id === '1') return conPar(s, { V1: acota(x, [0.5, 200]), P1: acota(y, [5, 1e5]) })
  const c = ciclo(gas, paramDe(s))
  const [, e2] = c.estados
  const nR = gas.n * R
  switch (s.ciclo) {
    case 'carnot':
      if (id === '2') return conPar(s, { a: acota(x / p.V1, L.a) })
      return conPar(s, { b: acota((e2.V / Math.max(x, 1e-9)) ** k, L.b) })
    case 'otto':
      if (id === '2') return conPar(s, { a: acota(p.V1 / Math.max(x, 1e-9), L.a) })
      return conPar(s, { b: acota((y * e2.V) / nR / e2.T, L.b) })
    case 'diesel':
      if (id === '2') {
        const a = acota(p.V1 / Math.max(x, 1e-9), L.a)
        return conPar(s, { a, b: Math.min(p.b, 0.95 * a) })
      }
      return conPar(s, { b: acota(x / e2.V, limB(s)) })
    case 'brayton':
      if (id === '2') return conPar(s, { a: acota(y / p.P1, L.a) })
      return conPar(s, { b: acota(x / e2.V, L.b) })
    case 'stirling':
      if (id === '2') return conPar(s, { a: acota(p.V1 / Math.max(x, 1e-9), L.a) })
      return conPar(s, { b: acota(y / e2.P, L.b) })
  }
}

/* ── van der Waals ── */

const VENTANA_VDW = { x: [0, 4.2] as [number, number], y: [-0.15, 1.9] as [number, number] }

function isoterma(T: number, v0: number, v1: number, N = 400): Array<[number, number]> {
  const pts: Array<[number, number]> = []
  for (let i = 0; i <= N; i++) {
    const v = v0 + ((v1 - v0) * i) / N
    pts.push([v, pVdW(v, T)])
  }
  return pts
}

/** Campana de coexistencia (binodal) y espinodal, de T = 0.5 al punto crítico. */
function campanas() {
  const bin: Array<[number, number]> = []
  const bing: Array<[number, number]> = []
  const esp: Array<[number, number]> = []
  const espg: Array<[number, number]> = []
  for (let i = 0; i <= 160; i++) {
    const T = 1 - (1 - (i / 160) ** 2) * 0.5 - 1e-6
    const m = maxwell(Math.min(T, 1 - 1e-6))
    const sp = espinodal(Math.min(T, 1 - 1e-6))
    if (m) {
      bin.push([m.vl, m.p])
      bing.unshift([m.vg, m.p])
    }
    if (sp) {
      esp.push([sp[0], pVdW(sp[0], T)])
      espg.unshift([sp[1], pVdW(sp[1], T)])
    }
  }
  return { binodal: [...bin, [1, 1] as [number, number], ...bing], espinodal: [...esp, [1, 1] as [number, number], ...espg] }
}

let campanaGuardada: ReturnType<typeof campanas> | null = null
const campana = () => (campanaGuardada ??= campanas())

function dibujarVdW(g: Pintor2D, s: EstadoTermo) {
  // p_sat(T) a la derecha
  g.region(0.64, 0.1, 0.35, 0.74)
  g.ventana = { x: [0.36, 1.42], y: [-0.12, 1.95] }
  g.ejes({ etiquetaX: 'T / T_c', etiquetaY: 'p / p_c' })
  const pst: Array<[number, number]> = []
  for (let i = 0; i <= 120; i++) {
    const T = 0.5 + (0.5 * i) / 120 - (i === 120 ? 1e-7 : 0)
    const m = maxwell(T)
    if (m) pst.push([T, m.p])
  }
  g.curva(pst, g.color('--accent'), 2.2)
  g.punto(1, 1, g.color('--rosa'), 5)
  g.texto('C', 1, 1, g.color('--rosa'), { dx: 8, dy: -8 })
  g.texto('líquido', 0.62, 0.7, g.color('--ink-soft'))
  g.texto('gas', 0.9, 0.2, g.color('--ink-soft'))
  g.texto('supercrítico', 1.1, 1.5, g.color('--ink-soft'))
  g.punto(s.T, pVdW(s.v, s.T), g.color('--pos'), 5)
  g.finRegion()

  g.region(0.01, 0.04, 0.6, 0.84)
  g.ventana = { x: [...VENTANA_VDW.x], y: [...VENTANA_VDW.y] }
  g.ejes({ etiquetaX: 'v / v_c', etiquetaY: 'p / p_c' })
  const { binodal, espinodal: esp } = campana()
  g.rellenar(binodal, g.color('--accent'), 0.08)
  g.curva(binodal, g.color('--accent'), 1.6)
  g.curva(esp, g.color('--accent'), 1, true)
  if (s.fondo) {
    for (const T of [0.75, 0.8, 0.85, 0.9, 0.95, 1, 1.05, 1.1, 1.2, 1.3]) {
      if (Math.abs(T - s.T) > 1e-3) g.curva(isoterma(T, 0.36, VENTANA_VDW.x[1]).filter((q) => q[1] < 3), g.color('--grid'), 1)
    }
  }
  if (s.ideal) {
    const id: Array<[number, number]> = []
    for (let i = 0; i <= 300; i++) {
      const v = 0.3 + (3.9 * i) / 300
      id.push([v, (8 * s.T) / (3 * v)])
    }
    g.curva(id.filter((q) => q[1] < 3), g.color('--morado'), 1.4, true)
  }
  const m = maxwell(s.T)
  if (m) {
    // las dos áreas de Maxwell, a cada lado del corte central
    const vs = volumenesVdW(m.p, s.T)
    const vm = vs[1]
    const lobulo = (a: number, b: number) => [...isoterma(s.T, a, b, 200), [b, m.p], [a, m.p]] as Array<[number, number]>
    g.rellenar(lobulo(m.vl, vm), g.color('--neg'), 0.35)
    g.rellenar(lobulo(vm, m.vg), g.color('--pos'), 0.35)
    g.curva([[m.vl, m.p], [m.vg, m.p]], g.color('--ink'), 1.8)
    g.punto(m.vl, m.p, g.color('--ink'), 3.5)
    g.punto(m.vg, m.p, g.color('--ink'), 3.5)
  }
  g.curva(isoterma(s.T, 0.36, VENTANA_VDW.x[1]).filter((q) => q[1] < 3), g.color('--ink'), 2.4)
  g.punto(1, 1, g.color('--rosa'), 4)
  const ventana = { x: [...g.ventana.x] as [number, number], y: [...g.ventana.y] as [number, number] }
  g.finRegion()
  g.ventana = ventana
  g.usarRegion(0.01, 0.04, 0.6, 0.84)
}

/** Calor latente reducido: L = Δu + p Δv con u = −3/v (en unidades de p_c v_c). */
export const latenteVdW = (T: number) => {
  const m = maxwell(T)
  return m ? 3 / m.vl - 3 / m.vg + m.p * (m.vg - m.vl) : NaN
}

const VISTAS: Record<Modo, Vista<EstadoTermo>> = {
  ciclos: {
    tipo: '2d',
    clave: 'ciclos',
    navegable: false,
    interaccion: {
      asas: asasCiclo,
      mover: (id, t, s) => moverCiclo(id, t.p, s),
      pista: 'Arrastra el estado 1 para mover el ciclo, y 2 y 3 para cambiar sus razones',
    },
    dibujar: (g, s) => dibujarCiclo(g, s),
  },
  vdw: {
    tipo: '2d',
    clave: 'vdw',
    navegable: false,
    interaccion: {
      asas: (s) => [{ id: 'estado', p: [s.v, pVdW(s.v, s.T)], color: '--pos', nombre: 'estado' }],
      mover: (_id, t) => {
        const v = acota(t.p[0], [0.36, 5])
        return { v, T: acota(TVdW(v, t.p[1]), [0.5, 1.4]) }
      },
      pista: 'Arrastra el estado: su isoterma pasa a ser la que se dibuja',
    },
    dibujar: (g, s) => dibujarVdW(g, s),
  },
}

function lecturas(s: EstadoTermo): Array<[string, string]> {
  if (s.modo === 'ciclos') {
    const gas = gasDe(s)
    const p = paramDe(s)
    const c = ciclo(gas, p)
    const r = resumen(gas, p)
    const nombre: Record<Proceso, string> = { isoterma: 'isoterma', adiabatica: 'adiabática', isobara: 'isóbara', isocora: 'isócora' }
    return [
      ['Rendimiento η = W/Q_abs', pct(r.eta)],
      ['Fórmula del ciclo', pct(rendimientoTeorico(gas, p))],
      ['Carnot entre T_max y T_min', pct(1 - r.Tmin / r.Tmax)],
      ['Trabajo neto W', J(r.W)],
      ['Calor absorbido Q_abs', J(r.Qabs)],
      ['Calor cedido Q_ced', J(r.Qced)],
      ['Clausius ∮ δQ/T', `${r.tramos.reduce((a, t) => a + t.dS, 0).toExponential(1)} J/K`],
      ...r.tramos.map((t): [string, string] => [`${t.de + 1}→${t.a + 1} ${nombre[t.tipo]}`, `Q = ${t.Q.toFixed(1)} J · W = ${t.W.toFixed(1)} J · ΔS = ${t.dS.toFixed(3)} J/K`]),
      ...c.estados.map((e, i): [string, string] => [`Estado ${i + 1}`, `${e.P.toFixed(1)} kPa · ${e.V.toFixed(3)} L · ${e.T.toFixed(1)} K`]),
    ]
  }
  const u = SUSTANCIAS[s.sust]
  const cr = critico(u)
  const p = pVdW(s.v, s.T)
  const filas: Array<[string, string]> = [
    ['Punto crítico', `${cr.T.toFixed(1)} K · ${(cr.p / 1e5).toFixed(1)} bar · ${(cr.v * 1e6).toFixed(1)} cm³/mol`],
    ['Estado reducido (v, p, T)', `${num(s.v)} · ${num(p)} · ${num(s.T)}`],
    ['Estado real', `${(s.T * cr.T).toFixed(1)} K · ${((p * cr.p) / 1e5).toFixed(2)} bar · ${(s.v * cr.v * 1e6).toFixed(1)} cm³/mol`],
    ['Fase', fase(s.v, s.T)],
    ['Compresibilidad Z = pv/RT', num((3 / 8) * (p * s.v) / s.T, 4)],
  ]
  const m = maxwell(s.T)
  if (m) {
    const L = latenteVdW(s.T)
    filas.push(
      ['Presión de vapor (Maxwell)', `${num(m.p, 4)} p_c = ${((m.p * cr.p) / 1e5).toFixed(2)} bar`],
      ['v_l, v_g', `${num(m.vl, 4)}, ${num(m.vg, 4)}`],
      ['Calor latente L = Δu + pΔv', `${num(L, 4)} p_c v_c = ${((L * cr.p * cr.v) / 1000).toFixed(2)} kJ/mol`],
    )
  }
  return filas
}

function formula(s: EstadoTermo): string[] {
  if (s.modo === 'vdw')
    return [
      String.raw`\Big(p+\frac{a}{v^2}\Big)(v-b)=RT`,
      String.raw`p_r=\frac{8T_r}{3v_r-1}-\frac{3}{v_r^2}`,
      String.raw`\int_{v_l}^{v_g}p\,dv=p_s\,(v_g-v_l)`,
      String.raw`\frac{dp_s}{dT}=\frac{L}{T\,(v_g-v_l)}`,
    ]
  const comun = String.raw`\eta=\frac{W}{Q_{\rm abs}},\qquad W=\oint P\,dV=\oint T\,dS`
  const propia: Record<TipoCiclo, string> = {
    carnot: String.raw`\eta=1-\frac{T_c}{T_h}`,
    otto: String.raw`\eta=1-r^{1-\gamma}`,
    diesel: String.raw`\eta=1-\frac{r^{1-\gamma}\,(r_c^{\gamma}-1)}{\gamma\,(r_c-1)}`,
    brayton: String.raw`\eta=1-r_p^{(1-\gamma)/\gamma}`,
    stirling: s.regenerador
      ? String.raw`\eta=1-\frac{T_c}{T_h}\ \text{(regenerador ideal)}`
      : String.raw`\eta=\frac{R\,(T_h-T_c)\ln r}{c_v(T_h-T_c)+RT_h\ln r}`,
  }
  return [comun, propia[s.ciclo]]
}

export default definir<EstadoTermo>({
  id: 'termodinamica',
  area: 'fisica',
  resumen: 'Termodinámica: ciclos de Carnot, Otto, Diesel, Brayton y Stirling en P–V y T–S, y gas de van der Waals con la construcción de Maxwell',
  corto: 'Termodinámica',
  titulo: 'Termo<i>dinámica</i>',
  entradilla: 'Arrastra los estados del ciclo: el rendimiento sale de integrar el camino y se contrasta con la fórmula.',
  inicial: {
    modo: 'ciclos',
    ciclo: 'otto',
    gas: 'di',
    par: PAR_INICIAL,
    regenerador: false,
    sust: 0,
    v: 1.8,
    T: 0.9,
    fondo: true,
    ideal: false,
  },
  Panel,
  menu: (s) => ({
    acciones: [
      radios<EstadoTermo, Modo>('Tema', [{ v: 'ciclos', t: 'Ciclos térmicos' }, { v: 'vdw', t: 'Gas de van der Waals' }], s.modo, (modo) => ({ modo })),
      radios<EstadoTermo, TipoCiclo>('Ciclo', (Object.keys(NOMBRES) as TipoCiclo[]).map((v) => ({ v, t: NOMBRES[v] })), s.ciclo, (ciclo) => ({ ciclo, modo: 'ciclos' })),
      radios<EstadoTermo, 'mono' | 'di'>('Gas', [{ v: 'mono', t: 'Monoatómico (γ = 5/3)' }, { v: 'di', t: 'Diatómico (γ = 7/5)' }], s.gas, (gas) => ({ gas })),
      casilla<EstadoTermo>('Regenerador (Stirling)', s.regenerador, (regenerador) => ({ regenerador })),
      casilla<EstadoTermo>('Comparar con el gas ideal', s.ideal, (ideal) => ({ ideal })),
    ],
  }),
  resultadoEnPanel: true,
  rotulo: (s) =>
    s.modo === 'ciclos'
      ? { nombre: `Ciclo ${NOMBRES[s.ciclo]}`, apunte: s.gas === 'mono' ? 'gas monoatómico' : 'gas diatómico' }
      : { nombre: `Van der Waals · ${SUSTANCIAS[s.sust].nombre}`, apunte: `T = ${s.T.toFixed(3)} T_c` },
  formula,
  lecturas,
  leyenda: (s) =>
    s.modo === 'ciclos' ? (
      <>
        <Muestra color="var(--pos)">absorbe calor</Muestra>
        <Muestra color="var(--neg)">cede calor</Muestra>
        <Muestra color="var(--ink-soft)">adiabática</Muestra>
        {s.ciclo === 'stirling' && s.regenerador && <Muestra color="var(--aux)">regenerador</Muestra>}
      </>
    ) : (
      <>
        <Muestra color="var(--accent)">coexistencia y espinodal</Muestra>
        <Muestra color="var(--neg)">área bajo la recta</Muestra>
        <Muestra color="var(--pos)">área sobre la recta</Muestra>
        {s.ideal && <Muestra color="var(--morado)">gas ideal</Muestra>}
      </>
    ),
  comparaciones: [
    { t: 'Otto frente a Diesel', a: { modo: 'ciclos', ciclo: 'otto' }, b: { modo: 'ciclos', ciclo: 'diesel' } },
    { t: 'Monoatómico frente a diatómico', a: { modo: 'ciclos', gas: 'mono' }, b: { modo: 'ciclos', gas: 'di' } },
    { t: 'Stirling sin y con regenerador', a: { modo: 'ciclos', ciclo: 'stirling', regenerador: false }, b: { modo: 'ciclos', ciclo: 'stirling', regenerador: true } },
    { t: 'Van der Waals: por debajo y por encima de T_c', a: { modo: 'vdw', T: 0.9 }, b: { modo: 'vdw', T: 1.1 } },
  ],
  vista: (s) => VISTAS[s.modo],
})
