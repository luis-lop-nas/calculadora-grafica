import { definir, type PropsPanel } from '../../nucleo/tipos'
import { Atajos, Expresion, Grupo, Interruptor, Muestra, Rango, Resultado, Segmentado } from '../../nucleo/controles'
import { leerExpr } from '../../lib/cas/laplace'
import { racional } from '../../lib/cas/algebra'
import { simbolos } from '../../lib/cas/expr'
import {
  asintotaModulo, asintotasLugar, bode, ceros, evalFT, lazoCerrado, logEspacio, lugarRaices, margenes, metricas, mulP, nyquist, polos, respuesta,
  routh, type FT,
} from '../../lib/control'
import type { Pintor2D } from '../../render/pintor2d'

type Vista = 'escalon' | 'bode' | 'nyquist' | 'lugar'

export interface EstadoControl {
  G: string
  K: number
  cerrado: boolean
  pid: boolean
  Kp: number
  Ki: number
  Kd: number
  vista: Vista
  tMax: number
}

const EJEMPLOS: Array<{ t: string; G: string }> = [
  { t: '1.er orden', G: '1/(s+1)' },
  { t: '2.º orden', G: '4/(s^2+1.2s+4)' },
  { t: 'tipo 1', G: '10/(s*(s+2)*(s+5))' },
  { t: 'con cero', G: '(s+3)/(s*(s+1)*(s+6))' },
  { t: 'inestable', G: '1/((s-1)*(s+4))' },
  { t: 'integrador doble', G: '1/s^2' },
  { t: 'fase no mínima', G: '(1-s)/((s+1)*(s+2))' },
]

let cacheG: { clave: string; g: FT | null; error: string | null } = { clave: '', g: null, error: null }

/** G(s) escrita → cociente de polinomios con coeficientes en coma flotante (exactos si eran racionales). */
export function leerG(src: string): { g: FT | null; error: string | null } {
  if (cacheG.clave === src) return cacheG
  let r: { g: FT | null; error: string | null }
  try {
    const e = leerExpr(src, 's')
    if ([...simbolos(e)].some((v) => v !== 's')) throw new Error('solo puede quedar s libre')
    const par = racional(e, 's')
    if (!par) throw new Error('G(s) tiene que ser un cociente de polinomios en s')
    const aNum = (p: Array<{ n: bigint; d: bigint }>) => p.map((c) => Number(c.n) / Number(c.d))
    const g = { num: aNum(par[0]), den: aNum(par[1]) }
    if (g.num.length > g.den.length) throw new Error('G(s) no es propia: más ceros que polos')
    r = { g, error: null }
  } catch (e) {
    r = { g: null, error: (e as Error).message }
  }
  cacheG = { clave: src, ...r }
  return r
}

/** Lazo abierto L = C·K·G, con C = Kp + Ki/s + Kd·s si hay PID. */
export function lazo(s: EstadoControl, g: FT): FT {
  let L: FT = { num: g.num.map((v) => v * s.K), den: g.den }
  if (s.pid) L = { num: mulP(L.num, [s.Ki, s.Kp, s.Kd]), den: mulP(L.den, [0, 1]) }
  return L
}

export function sistema(s: EstadoControl): { L: FT; T: FT } | { error: string } {
  const { g, error } = leerG(s.G)
  if (!g) return { error: error ?? 'G(s) no válida' }
  const L = lazo(s, g)
  const T = s.cerrado ? lazoCerrado(L) : L
  return { L, T }
}

function Panel({ s, set }: PropsPanel<EstadoControl>) {
  return (
    <>
      <Grupo titulo="Planta">
        <Expresion etiqueta="G(s) =" valor={s.G} variables={['s']} onChange={(G: string) => set({ G })} />
        <Atajos opciones={EJEMPLOS.map((e) => ({ t: e.t, activo: s.G === e.G, onClick: () => set({ G: e.G }) }))} />
        <Rango etiqueta="Ganancia K" valor={s.K} min={0.01} max={100} paso={0.01} onChange={(K) => set({ K })} />
        <div className="interruptores">
          <Interruptor activo={s.cerrado} onChange={(cerrado) => set({ cerrado })}>
            Lazo cerrado con realimentación unitaria
          </Interruptor>
          <Interruptor activo={s.pid} onChange={(pid) => set({ pid })}>
            Controlador PID en serie
          </Interruptor>
        </div>
        {s.pid && (
          <>
            <Rango etiqueta="Kp" valor={s.Kp} min={0} max={20} paso={0.05} onChange={(Kp) => set({ Kp })} />
            <Rango etiqueta="Ki" valor={s.Ki} min={0} max={20} paso={0.05} onChange={(Ki) => set({ Ki })} />
            <Rango etiqueta="Kd" valor={s.Kd} min={0} max={10} paso={0.05} onChange={(Kd) => set({ Kd })} />
          </>
        )}
      </Grupo>
      <Grupo titulo="Vista">
        <Segmentado
          columnas={2}
          valor={s.vista}
          opciones={[
            { v: 'escalon', t: 'Escalón' },
            { v: 'bode', t: 'Bode' },
            { v: 'nyquist', t: 'Nyquist' },
            { v: 'lugar', t: 'Lugar de las raíces' },
          ]}
          onChange={(vista) => set({ vista })}
        />
        {s.vista === 'escalon' && <Rango etiqueta="Ver t hasta" valor={s.tMax} min={1} max={60} paso={0.5} onChange={(tMax) => set({ tMax })} />}
      </Grupo>
      <Resultado />
    </>
  )
}

const fmt = (v: number | null, d = 3) => (v === null || !Number.isFinite(v) ? '—' : v.toFixed(d))
const complejo = ([a, b]: [number, number]) => (Math.abs(b) < 1e-9 ? a.toFixed(4) : `${a.toFixed(4)} ${b < 0 ? '−' : '+'} ${Math.abs(b).toFixed(4)}i`)

function cruz(g: Pintor2D, x: number, y: number, color: string, tam = 6) {
  const X = g.X(x)
  const Y = g.Y(y)
  g.ctx.save()
  g.ctx.strokeStyle = color
  g.ctx.lineWidth = 2
  g.ctx.beginPath()
  g.ctx.moveTo(X - tam, Y - tam)
  g.ctx.lineTo(X + tam, Y + tam)
  g.ctx.moveTo(X + tam, Y - tam)
  g.ctx.lineTo(X - tam, Y + tam)
  g.ctx.stroke()
  g.ctx.restore()
}

function circulo(g: Pintor2D, x: number, y: number, color: string, tam = 6) {
  g.ctx.save()
  g.ctx.strokeStyle = color
  g.ctx.lineWidth = 2
  g.ctx.beginPath()
  g.ctx.arc(g.X(x), g.Y(y), tam, 0, 2 * Math.PI)
  g.ctx.stroke()
  g.ctx.restore()
}

function planoS(g: Pintor2D, sys: FT, extra: Array<[number, number]> = []) {
  const ps = polos(sys)
  const zs = ceros(sys)
  const R = Math.max(1.5, ...[...ps, ...zs, ...extra].map(([a, b]) => 1.25 * Math.max(Math.abs(a), Math.abs(b))))
  g.ventana = { x: [-R, R], y: [-R, R] }
  g.igualarEscala()
  g.rellenar([[0, g.ventana.y[0]], [g.ventana.x[1], g.ventana.y[0]], [g.ventana.x[1], g.ventana.y[1]], [0, g.ventana.y[1]]], g.color('--neg'), 0.06)
  g.ejes({ etiquetaX: 'Re', etiquetaY: 'Im' })
  for (const [a, b] of ps) cruz(g, a, b, g.color('--neg'))
  for (const [a, b] of zs) circulo(g, a, b, g.color('--pos'))
}

function vistaEscalon(g: Pintor2D, s: EstadoControl, T: FT) {
  const y = respuesta(T, s.tMax, 1200)
  const final = evalFT(T, 0, 0)[0]
  const ys = y.map((p) => p[1]).filter(Number.isFinite)
  const lo = Math.min(0, ...ys)
  const hi = Math.max(0, ...ys, Number.isFinite(final) ? final : 0)
  const pad = 0.12 * (hi - lo || 1)
  g.region(0, 0, 0.62, 1)
  g.ventana = { x: [-0.03 * s.tMax, s.tMax], y: [lo - pad, Math.min(hi + pad, 1e6)] }
  g.ejes({ etiquetaX: 't', etiquetaY: 'y' })
  if (Number.isFinite(final) && Math.abs(final) < 1e6) g.curva([[0, final], [s.tMax, final]], g.color('--ink-soft'), 1, true)
  g.curva([[0, 0], [0, 1], [s.tMax, 1]], g.color('--grid'), 1, true)
  g.curva(y, g.color('--accent'), 2.2)
  g.finRegion()
  g.region(0.62, 0, 0.38, 1)
  g.fondoRegion(g.color('--ground'))
  planoS(g, T)
  g.finRegion()
}

function vistaBode(g: Pintor2D, L: FT) {
  const todas = [...polos(L), ...ceros(L)].map(([a, b]) => Math.hypot(a, b)).filter((r) => r > 1e-9)
  const w0 = 10 ** Math.floor(Math.log10(Math.min(1, ...todas) / 20))
  const w1 = 10 ** Math.ceil(Math.log10(Math.max(1, ...todas) * 20))
  const ws = logEspacio(w0, w1, 600)
  const b = bode(L, ws)
  const lg = (w: number) => Math.log10(w)
  const mags = b.map((p) => p.mag).filter(Number.isFinite)
  const mlo = Math.max(-160, Math.min(...mags))
  const mhi = Math.min(160, Math.max(...mags))
  const m = margenes(L, w0, w1)
  g.region(0, 0, 1, 0.52)
  g.ventana = { x: [lg(w0), lg(w1)], y: [mlo - 10, mhi + 10] }
  g.ejes({ etiquetaX: 'log₁₀ ω', etiquetaY: '|L| dB' })
  g.curva([[lg(w0), 0], [lg(w1), 0]], g.color('--ink-soft'), 1, true)
  g.curva(ws.map((w) => [lg(w), asintotaModulo(L, w)] as [number, number]), g.color('--grid'), 1.4, true)
  g.curva(b.map((p) => [lg(p.w), p.mag] as [number, number]), g.color('--accent'), 2.2)
  if (m.wc) g.punto(lg(m.wc), 0, g.color('--pos'), 4)
  g.finRegion()
  const fases = b.map((p) => p.fase)
  g.region(0, 0.52, 1, 0.48)
  g.fondoRegion(g.color('--ground'))
  g.ventana = { x: [lg(w0), lg(w1)], y: [Math.min(-200, ...fases) - 15, Math.max(20, ...fases) + 15] }
  g.ejes({ etiquetaX: 'log₁₀ ω', etiquetaY: 'fase °' })
  g.curva([[lg(w0), -180], [lg(w1), -180]], g.color('--neg'), 1, true)
  g.curva(b.map((p) => [lg(p.w), p.fase] as [number, number]), g.color('--accent'), 2.2)
  if (m.w180) g.punto(lg(m.w180), -180, g.color('--neg'), 4)
  if (m.wc && m.mf !== null) {
    g.curva([[lg(m.wc), -180], [lg(m.wc), -180 + m.mf]], g.color('--pos'), 2)
  }
  g.finRegion()
}

function vistaNyquist(g: Pintor2D, L: FT) {
  const { camino } = nyquist(L)
  // lo que se va al infinito (integradores) se recorta a una caja razonable alrededor de −1
  // lo que importa es el entorno de −1: se encuadra lo que cae en |L| < 4 (un integrador se va al infinito)
  const cerca = camino.filter(([a, b]) => Math.hypot(a, b) < 4)
  const R = Math.max(1.6, ...cerca.map(([a, b]) => 1.15 * Math.max(Math.abs(a), Math.abs(b))))
  g.ventana = { x: [-R, R], y: [-R, R] }
  g.igualarEscala()
  g.ejes({ etiquetaX: 'Re L', etiquetaY: 'Im L' })
  g.curva(Array.from({ length: 121 }, (_, i) => [Math.cos((i * Math.PI) / 60), Math.sin((i * Math.PI) / 60)] as [number, number]), g.color('--grid'), 1, true)
  const mitad = Math.floor(camino.length / 2)
  const recorta = (pts: Array<[number, number]>) => pts.filter(([a, b]) => Math.abs(a) < 50 * R && Math.abs(b) < 50 * R)
  g.curva(recorta(camino.slice(mitad)), g.color('--accent'), 2.2)
  g.curva(recorta(camino.slice(0, mitad + 1)), g.color('--accent'), 1.4, true)
  cruz(g, -1, 0, g.color('--neg'), 7)
}

// el lugar no depende de K (solo el punto marcado): mover el deslizador no lo recalcula
let cacheLugar: { clave: string; ramas: Array<Array<[number, number]>> } = { clave: '', ramas: [] }

function vistaLugar(g: Pintor2D, s: EstadoControl, L: FT) {
  // el lugar se traza sobre L/K: la K del deslizador es el punto marcado en cada rama
  const base: FT = { num: L.num.map((v) => v / s.K), den: L.den }
  const clave = JSON.stringify(base)
  if (cacheLugar.clave !== clave) cacheLugar = { clave, ramas: lugarRaices(base, logEspacio(1e-3, 1e4, 900)) }
  const ramas = cacheLugar.ramas
  const actuales = polos(lazoCerrado(L))
  // encuadre por los polos, ceros y raíces actuales: las ramas que se van a infinito no deciden la escala
  const marcas = [...polos(base), ...ceros(base), ...actuales]
  const R = Math.max(3, ...marcas.map(([a, b]) => 2.2 * Math.max(Math.abs(a), Math.abs(b))))
  g.ventana = { x: [-R, R], y: [-R, R] }
  g.igualarEscala()
  g.rellenar([[0, g.ventana.y[0]], [g.ventana.x[1], g.ventana.y[0]], [g.ventana.x[1], g.ventana.y[1]], [0, g.ventana.y[1]]], g.color('--neg'), 0.06)
  g.ejes({ etiquetaX: 'Re', etiquetaY: 'Im' })
  const as = asintotasLugar(base)
  if (as)
    for (const ang of as.angulos) {
      const r = (ang * Math.PI) / 180
      g.curva([[as.centroide, 0], [as.centroide + 3 * R * Math.cos(r), 3 * R * Math.sin(r)]], g.color('--grid'), 1, true)
    }
  for (const rama of ramas) g.curva(rama, g.color('--accent'), 2)
  for (const [a, b] of polos(base)) cruz(g, a, b, g.color('--neg'))
  for (const [a, b] of ceros(base)) circulo(g, a, b, g.color('--pos'))
  for (const [a, b] of actuales) g.punto(a, b, g.color('--ink'), 4.5)
}

export default definir<EstadoControl>({
  id: 'control',
  area: 'senales',
  resumen: 'Sistemas LTI y control: escalón, Bode, Nyquist, lugar de las raíces, PID y Routh–Hurwitz',
  corto: 'Control',
  titulo: 'Sistemas y <i>control</i>',
  entradilla: 'Escribe G(s), cierra el lazo, añade un PID y mira estabilidad, márgenes y respuesta.',
  inicial: { G: '10/(s*(s+2)*(s+5))', K: 1, cerrado: true, pid: false, Kp: 1, Ki: 0, Kd: 0, vista: 'escalon', tMax: 12 },
  Panel,
  resultadoEnPanel: true,
  rotulo: (s) => ({ nombre: s.cerrado ? 'T(s) = L/(1 + L)' : 'L(s)', apunte: s.vista }),
  formula: (s) => {
    const out = [String.raw`L(s)=${s.pid ? String.raw`\Big(K_p+\tfrac{K_i}{s}+K_d s\Big)` : ''}K\,G(s),\qquad T(s)=\frac{L(s)}{1+L(s)}`]
    if (s.vista === 'bode') out.push(String.raw`\mathrm{MF}=180^\circ+\angle L(i\omega_c),\quad \mathrm{MG}=-20\log_{10}|L(i\omega_{180})|`)
    if (s.vista === 'nyquist') out.push(String.raw`Z = N + P`)
    return out
  },
  lecturas: (s) => {
    const sys = sistema(s)
    if ('error' in sys) return [['No se puede', sys.error]]
    const { L, T } = sys
    const pcl = polos(lazoCerrado(L))
    const inestables = pcl.filter(([a]) => a > 1e-9).length
    const filas: Array<[string, string]> = []
    if (s.cerrado) {
      filas.push(['Estabilidad en lazo cerrado', inestables ? `inestable (${inestables} polo${inestables > 1 ? 's' : ''} con Re > 0)` : pcl.some(([a]) => Math.abs(a) < 1e-9) ? 'marginal (polo en el eje)' : 'estable'])
      filas.push(['Polos del lazo cerrado', pcl.map(complejo).join(' · ')])
      const r = routh(lazoCerrado(L).den)
      filas.push(['Routh: cambios de signo', `${r.cambios}${r.especial ? ` (${r.especial})` : ''}`])
    } else filas.push(['Polos de L', polos(L).map(complejo).join(' · ') || '—'])
    if (s.vista === 'escalon') {
      const estable = polos(T).every(([a]) => a < -1e-9)
      if (estable) {
        const y = respuesta(T, s.tMax, 4000)
        const m = metricas(y, evalFT(T, 0, 0)[0])
        filas.push(['Valor final T(0)', fmt(m.final, 5)], ['Sobreoscilación', `${fmt(m.sobreoscilacion, 2)} %`], ['Tiempo de pico', fmt(m.tPico)], ['Subida 10–90 %', fmt(m.tSubida)], ['Establecimiento 2 %', fmt(m.tEstablecimiento)])
        if (s.cerrado) filas.push(['Error en régimen permanente', fmt(1 - m.final, 5)])
      } else filas.push(['Respuesta', 'no se asienta: hay polos con Re ≥ 0'])
    }
    if (s.vista === 'bode') {
      const m = margenes(L)
      filas.push(['Cruce de ganancia ω_c', fmt(m.wc, 4)], ['Margen de fase', m.mf === null ? '—' : `${fmt(m.mf, 2)}°`], ['Cruce de fase ω₁₈₀', fmt(m.w180, 4)], ['Margen de ganancia', m.mg === null ? '∞' : `${fmt(m.mg, 2)} dB`])
    }
    if (s.vista === 'nyquist') {
      const n = nyquist(L)
      filas.push(['N (vueltas horarias a −1)', String(n.N + 0)], ['P (polos de L con Re > 0)', String(n.P)], ['Z = N + P', String(n.Z)], ['Polos inestables contados', String(inestables)])
    }
    if (s.vista === 'lugar') {
      const as = asintotasLugar({ num: L.num.map((v) => v / s.K), den: L.den })
      if (as) filas.push(['Centroide de las asíntotas', fmt(as.centroide, 4)], ['Ángulos', as.angulos.map((a) => `${a.toFixed(0)}°`).join(', ')])
    }
    return filas
  },
  leyenda: (s) => (
    <>
      <Muestra color="var(--accent)">{s.vista === 'escalon' ? 'respuesta al escalón' : s.vista === 'bode' ? 'módulo y fase (asíntotas a trazos)' : s.vista === 'nyquist' ? 'L(iω), ω > 0 (ω < 0 a trazos)' : 'ramas del lugar'}</Muestra>
      <Muestra color="var(--neg)">polos · −1</Muestra>
      <Muestra color="var(--pos)">ceros · márgenes</Muestra>
      {s.vista === 'lugar' && <Muestra color="var(--ink)">polos con la K actual</Muestra>}
    </>
  ),
  comparaciones: [
    { t: 'Lazo abierto contra cerrado', a: { cerrado: false }, b: { cerrado: true } },
    { t: 'Sin PID contra con PID', a: { pid: false }, b: { pid: true, Kp: 2, Ki: 1, Kd: 0.5 } },
  ],
  vista: {
    tipo: '2d',
    navegable: false,
    dibujar(g, s) {
      const sys = sistema(s)
      if ('error' in sys) {
        g.ventana = { x: [-1, 1], y: [-1, 1] }
        g.texto(sys.error, -0.95, 0.8, g.color('--pos'))
        return
      }
      if (s.vista === 'escalon') vistaEscalon(g, s, sys.T)
      else if (s.vista === 'bode') vistaBode(g, sys.L)
      else if (s.vista === 'nyquist') vistaNyquist(g, sys.L)
      else vistaLugar(g, s, sys.L)
    },
  },
})

