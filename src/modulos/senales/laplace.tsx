import { definir, type PropsPanel } from '../../nucleo/tipos'
import katex from 'katex'
import { Atajos, Expresion, Grupo, Muestra, Rango, Resultado, Segmentado } from '../../nucleo/controles'
import { edoPorLaplace, laplace, laplaceInversa, leerExpr, type ResultadoEdoL, type ResultadoL } from '../../lib/cas/laplace'
import { leerCondiciones } from '../../lib/cas/edo'
import { UNO, contiene, evaluar, prod, suma, type E } from '../../lib/cas/expr'
import { racional } from '../../lib/cas/algebra'
import { texConExponenciales } from '../../lib/cas/tex'
import { raicesPolinomio } from '../../lib/matrices'
import { rk4 } from '../../lib/numerico'
import type { Pintor2D } from '../../render/pintor2d'

type Modo = 'directa' | 'inversa' | 'edo'

export interface EstadoLaplaceT {
  modo: Modo
  f: string
  F: string
  edo: string
  ci: string
  tMax: number
}

const EJ_F = ['t*exp(-2t)', 'sin(3t)', 'exp(-t)*cos(2t)', 't^2', 'heaviside(t-1)*(t-1)', 'sin(t)^2', 'sqrt(t)', 'cosh(2t)', 'dirac(t-2)+1']
const EJ_S = ['1/(s*(s+1))', '(s+3)/(s^2+2s+5)', '1/(s^2+1)^2', 'exp(-2s)/(s+1)', '(1-exp(-s))/s^2', '1/(s^3+s+1)', 's/(s^2-4)']
const EJ_EDO: Array<{ t: string; e: string; ci: string }> = [
  { t: 'resonancia', e: "y''+y=sin(t)", ci: "y(0)=0, y'(0)=0" },
  { t: 'amortiguado', e: "y''+3y'+2y=exp(-t)", ci: "y(0)=1, y'(0)=0" },
  { t: 'RC con escalón', e: "y'+y=heaviside(t-1)", ci: 'y(0)=0' },
  { t: 'impulso', e: "y''+2y'+5y=dirac(t-1)", ci: "y(0)=0, y'(0)=0" },
  { t: 'pulso', e: "y''+4y=heaviside(t-1)-heaviside(t-3)", ci: "y(0)=0, y'(0)=0" },
  { t: 'tercer orden', e: "y'''+y''+4y'+4y=0", ci: "y(0)=1, y'(0)=0, y''(0)=-1" },
]

type Salida = { tipo: 'directa'; f: E; r: ResultadoL } | { tipo: 'inversa'; F: E; r: ResultadoL } | { tipo: 'edo'; r: ResultadoEdoL; ci: number[] }

let cache: { clave: string; v: Salida | { error: string } } = { clave: '', v: { error: '' } }

export function calcular(s: EstadoLaplaceT): Salida | { error: string } {
  const clave = `${s.modo}|${s.f}|${s.F}|${s.edo}|${s.ci}`
  if (cache.clave === clave) return cache.v
  let v: Salida | { error: string }
  try {
    if (s.modo === 'directa') {
      const f = leerExpr(s.f, 't')
      v = { tipo: 'directa', f, r: laplace(f) }
    } else if (s.modo === 'inversa') {
      const F = leerExpr(s.F, 's')
      v = { tipo: 'inversa', F, r: laplaceInversa(F) }
    } else {
      const conds = leerCondiciones(s.ci).sort((a, b) => a.k - b.k)
      if (conds.some((c, i) => c.k !== i || evaluar(c.x0) !== 0)) throw new Error("las condiciones van en t = 0 y en orden: y(0), y'(0), …")
      v = { tipo: 'edo', r: edoPorLaplace(s.edo, conds.map((c) => c.v)), ci: conds.map((c) => evaluar(c.v)) }
    }
  } catch (e) {
    v = { error: (e as Error).message }
  }
  cache = { clave, v }
  return v
}

/** Polos y ceros de cada fracción racional de F (por retardo), numéricos. */
export function polosCeros(F: E): { polos: Array<[number, number]>; ceros: Array<[number, number]> } {
  // los retardos e^{−τs} no tienen polos ni ceros: se quitan antes de mirar la parte racional
  const sinRetardos = (e: E): E => {
    if (e.t === '^' && e.b.t === 's' && e.b.v === 'e' && contiene(e.e, 's')) return UNO
    if (e.t === '*') return prod(...e.a.map(sinRetardos))
    if (e.t === '+') return suma(...e.a.map(sinRetardos))
    return e
  }
  const par = racional(sinRetardos(F), 's')
  if (!par) return { polos: [], ceros: [] }
  const num = (p: Array<{ n: bigint; d: bigint }>) => p.map((c) => Number(c.n) / Number(c.d))
  const [N, D] = par
  return { polos: D.length > 1 ? raicesPolinomio(num(D)) : [], ceros: N.length > 1 ? raicesPolinomio(num(N)) : [] }
}

/** Solución numérica independiente de Σ aₖ y⁽ᵏ⁾ = g(t) por RK4 con paso fijo. */
export function edoNumerica(a: number[], g: E, ci: number[], tMax: number, pasos = 4000): Array<[number, number]> {
  const n = a.length - 1
  const ge = (t: number) => {
    const v = evaluar(g, { t })
    return Number.isFinite(v) ? v : 0
  }
  const campo = (t: number, Y: number[]) => {
    const d = Y.slice(1)
    let acc = ge(t)
    for (let k = 0; k < n; k++) acc -= a[k] * Y[k]
    d.push(acc / a[n])
    return d
  }
  const h = tMax / pasos
  let Y = [...ci]
  const out: Array<[number, number]> = [[0, Y[0]]]
  for (let i = 0; i < pasos; i++) {
    Y = rk4(campo, i * h, Y, h)
    out.push([(i + 1) * h, Y[0]])
  }
  return out
}

function Pasos({ r }: { r: ResultadoL }) {
  return (
    <Grupo titulo="Pasos">
      <ol className="pasos">
        {r.pasos.map((p, i) => (
          <li key={i}>
            <span>{p.t}</span>
            {p.tex && (
              <div
                className="formula-paso"
                dangerouslySetInnerHTML={{ __html: katex.renderToString(p.tex, { displayMode: true, throwOnError: false, output: 'html' }) }}
              />
            )}
          </li>
        ))}
      </ol>
    </Grupo>
  )
}

function Panel({ s, set }: PropsPanel<EstadoLaplaceT>) {
  const v = calcular(s)
  return (
    <>
      <Grupo titulo="Qué calcular">
        <Segmentado
          columnas={3}
          valor={s.modo}
          opciones={[
            { v: 'directa', t: 'L{f}' },
            { v: 'inversa', t: 'L⁻¹{F}' },
            { v: 'edo', t: 'Resolver EDO' },
          ]}
          onChange={(modo) => set({ modo })}
        />
        {s.modo === 'directa' && (
          <>
            <Expresion etiqueta="f(t) =" valor={s.f} variables={['t']} onChange={(f: string) => set({ f })} />
            <Atajos opciones={EJ_F.map((e) => ({ t: e, activo: s.f === e, onClick: () => set({ f: e }) }))} />
          </>
        )}
        {s.modo === 'inversa' && (
          <>
            <Expresion etiqueta="F(s) =" valor={s.F} variables={['s']} onChange={(F: string) => set({ F })} />
            <Atajos opciones={EJ_S.map((e) => ({ t: e, activo: s.F === e, onClick: () => set({ F: e }) }))} />
          </>
        )}
        {s.modo === 'edo' && (
          <>
            <Expresion etiqueta="EDO" valor={s.edo} variables={['t', 'y', "y'", "y''", "y'''", "y''''"]} onChange={(edo: string) => set({ edo })} comprobar={() => null} />
            <Expresion etiqueta="en t = 0" valor={s.ci} variables={['y']} onChange={(ci: string) => set({ ci })} comprobar={() => null} />
            <Atajos opciones={EJ_EDO.map((e) => ({ t: e.t, activo: s.edo === e.e, onClick: () => set({ edo: e.e, ci: e.ci }) }))} />
          </>
        )}
        <Rango etiqueta="Ver t hasta" valor={s.tMax} min={2} max={40} paso={0.5} onChange={(tMax) => set({ tMax })} />
      </Grupo>
      <Resultado />
      {'error' in v ? null : <Pasos r={v.r} />}
    </>
  )
}

const REPARTO = 0.6

function dibujarTiempo(g: Pintor2D, s: EstadoLaplaceT, v: Salida) {
  const expr = v.tipo === 'directa' ? v.f : v.r.resultado
  const M = 800
  const pts: Array<[number, number]> = []
  for (let i = 0; i <= M; i++) {
    const t = (s.tMax * i) / M
    let y = NaN
    try {
      y = evaluar(expr, { t })
    } catch {}
    pts.push([t, Number.isFinite(y) ? y : NaN])
  }
  let num: Array<[number, number]> = []
  if (v.tipo === 'edo') num = edoNumerica(v.r.coeficientes, v.r.g, v.ci, s.tMax, 2000)
  const ys = [...pts, ...num].map((p) => p[1]).filter(Number.isFinite)
  const lo = Math.min(0, ...ys)
  const hi = Math.max(0, ...ys)
  const pad = 0.12 * (hi - lo || 1)
  g.ventana = { x: [-0.04 * s.tMax, s.tMax], y: [lo - pad, hi + pad] }
  g.ejes({ etiquetaX: 't', etiquetaY: v.tipo === 'edo' ? 'y' : 'f' })
  let tramo: Array<[number, number]> = []
  for (const p of pts) {
    if (Number.isFinite(p[1])) tramo.push(p)
    else {
      if (tramo.length > 1) g.curva(tramo, g.color('--accent'), 2.2)
      tramo = []
    }
  }
  if (tramo.length > 1) g.curva(tramo, g.color('--accent'), 2.2)
  if (num.length) {
    const col = g.color('--pos')
    for (let i = 0; i < num.length; i += 50) g.punto(num[i][0], num[i][1], col, 2.4)
  }
}

function dibujarPlanoS(g: Pintor2D, v: Salida) {
  const F = v.tipo === 'directa' ? v.r.resultado : v.tipo === 'inversa' ? v.F : v.r.Y
  const { polos, ceros } = polosCeros(F)
  const todos = [...polos, ...ceros]
  const R = Math.max(2, ...todos.map(([a, b]) => Math.max(Math.abs(a), Math.abs(b)) * 1.3))
  g.ventana = { x: [-R, R], y: [-R, R] }
  g.igualarEscala()
  const sigma = polos.length ? Math.max(...polos.map((p) => p[0])) : 0
  const [x0, x1] = g.ventana.x
  const [y0, y1] = g.ventana.y
  if (sigma < x1) g.rellenar([[Math.max(sigma, x0), y0], [x1, y0], [x1, y1], [Math.max(sigma, x0), y1]], g.color('--accent'), 0.08)
  g.ejes({ etiquetaX: 'Re s', etiquetaY: 'Im s' })
  const tam = 7
  const neg = g.color('--neg')
  for (const [a, b] of polos) {
    const X = g.X(a)
    const Y = g.Y(b)
    g.ctx.save()
    g.ctx.strokeStyle = neg
    g.ctx.lineWidth = 2.2
    g.ctx.beginPath()
    g.ctx.moveTo(X - tam, Y - tam)
    g.ctx.lineTo(X + tam, Y + tam)
    g.ctx.moveTo(X + tam, Y - tam)
    g.ctx.lineTo(X - tam, Y + tam)
    g.ctx.stroke()
    g.ctx.restore()
  }
  for (const [a, b] of ceros) {
    g.ctx.save()
    g.ctx.strokeStyle = g.color('--pos')
    g.ctx.lineWidth = 2
    g.ctx.beginPath()
    g.ctx.arc(g.X(a), g.Y(b), tam, 0, 2 * Math.PI)
    g.ctx.stroke()
    g.ctx.restore()
  }
}

export default definir<EstadoLaplaceT>({
  id: 'transformada-laplace',
  area: 'senales',
  resumen: 'Transformada de Laplace, su inversa por fracciones simples y EDO lineales con condiciones iniciales',
  corto: 'Laplace',
  titulo: 'Transformada de <i>Laplace</i>',
  entradilla: 'Con pasos. Cada resultado se comprueba con la integral ∫₀^∞ f e^{−st} dt.',
  inicial: { modo: 'edo', f: 't*exp(-2t)', F: '(s+3)/(s^2+2s+5)', edo: "y''+3y'+2y=exp(-t)", ci: "y(0)=1, y'(0)=0", tMax: 10 },
  Panel,
  resultadoEnPanel: true,
  rotulo: (s) => ({ nombre: s.modo === 'directa' ? 'F(s) = L{f}' : s.modo === 'inversa' ? 'f(t) = L⁻¹{F}' : 'y(t)', apunte: s.modo }),
  formula: (s) => {
    const v = calcular(s)
    if ('error' in v) return [String.raw`\mathcal L\{f\}(s)=\int_0^\infty f(t)\,e^{-st}\,dt`]
    if (v.tipo === 'directa') return [String.raw`\mathcal L\{f\}(s)=${texConExponenciales(v.r.resultado)}`]
    if (v.tipo === 'inversa') return [String.raw`f(t)=${texConExponenciales(v.r.resultado)}`]
    return [v.r.ecuacionS, String.raw`Y(s)=${texConExponenciales(v.r.Y)}`, String.raw`y(t)=${texConExponenciales(v.r.resultado)}`]
  },
  lecturas: (s) => {
    const v = calcular(s)
    if ('error' in v) return [['No se puede', v.error]]
    const filas: Array<[string, string]> = [
      ['Comprobación', v.r.verificada ? 'cuadra con la integral numérica' : 'NO cuadra: revisar'],
      ['Diferencia relativa', v.r.error.toExponential(2)],
    ]
    if (v.r.aproximada) filas.push(['Raíces', 'sin forma cerrada: decimales'])
    if (v.tipo === 'edo') {
      filas.push(['Residuo al sustituir en la EDO', v.r.residuo.toExponential(2)])
      const num = edoNumerica(v.r.coeficientes, v.r.g, v.ci, s.tMax, 4000)
      let peor = 0
      for (let i = 0; i < num.length; i += 40) {
        const [t, y] = num[i]
        const e = evaluar(v.r.resultado, { t })
        if (Number.isFinite(e)) peor = Math.max(peor, Math.abs(e - y))
      }
      filas.push(['Diferencia con RK4 (paso fijo)', peor.toExponential(2)])
    }
    return filas
  },
  leyenda: (s) => (
    <>
      <Muestra color="var(--accent)">{s.modo === 'edo' ? 'y(t) por Laplace' : s.modo === 'directa' ? 'f(t)' : 'f(t) = L⁻¹{F}'}</Muestra>
      {s.modo === 'edo' && <Muestra color="var(--pos)">RK4 independiente</Muestra>}
      <Muestra color="var(--neg)">polos</Muestra>
      <Muestra color="var(--pos)">ceros</Muestra>
    </>
  ),
  vista: {
    tipo: '2d',
    navegable: false,
    dibujar(g, s) {
      const v = calcular(s)
      if ('error' in v) {
        g.ventana = { x: [-1, 1], y: [-1, 1] }
        g.texto(v.error, -0.95, 0.8, g.color('--pos'))
        return
      }
      g.region(0, 0, REPARTO, 1)
      dibujarTiempo(g, s, v)
      g.finRegion()
      g.region(REPARTO, 0, 1 - REPARTO, 1)
      g.fondoRegion(g.color('--ground'))
      dibujarPlanoS(g, v)
      g.finRegion()
    },
  },
})
