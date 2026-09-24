import katex from 'katex'
import { definir, type PropsPanel } from '../../nucleo/tipos'
import { Atajos, Expresion, Grupo, Interruptor, Muestra, Nota, Resultado } from '../../nucleo/controles'
import { compilarEdo, derivadaAlta, solucionEn, valoresIniciales, type Cond, type EdoNum } from '../../lib/edo'
import {
  leerCondiciones, leerEdo, particular, resolverEdo, serieTaylor, texE, VARIABLES_EDO, Y, type Condicion, type Particular, type SolEdo,
} from '../../lib/cas/edo'
import { evaluar, type E } from '../../lib/cas/expr'
import type { Pintor2D } from '../../render/pintor2d'

interface S {
  ecuacion: string
  condiciones: string
  verDerivada: boolean
  verFamilia: boolean
  verCampo: boolean
  verSerie: boolean
  verPasos: boolean
  /** Sube al pulsar «Encuadrar»: vuelve a calcular la ventana. */
  encuadre: number
}

const EJEMPLOS: Array<{ t: string; e: string; c: string }> = [
  { t: 'Decaimiento', e: "y' + 2*y = 0", c: 'y(0) = 1' },
  { t: 'Lineal', e: "y' + y/x = x^2", c: 'y(1) = 1' },
  { t: 'Logística', e: "y' = y*(1 - y)", c: 'y(0) = 0.1' },
  { t: 'Bernoulli', e: "y' - y = x*y^2", c: 'y(0) = 1' },
  { t: 'Exacta', e: "2*x*y + (x^2 + 3*y^2)*y' = 0", c: 'y(1) = 1' },
  { t: 'Riccati', e: "y' = x^2 + y^2", c: 'y(0) = 0' },
  { t: 'Amortiguado', e: "y'' + 0.4*y' + 9*y = 0", c: "y(0) = 1, y'(0) = 0" },
  { t: 'Resonancia', e: "y'' + 4*y = cos(2*x)", c: "y(0) = 0, y'(0) = 0" },
  { t: 'Euler', e: "x^2*y'' - 2*x*y' + 2*y = 0", c: "y(1) = 1, y'(1) = 0" },
  { t: 'Contorno', e: "y'' + y = x", c: 'y(0) = 0, y(pi/2) = 1' },
  { t: 'Airy', e: "y'' + x*y = 0", c: "y(0) = 1, y'(0) = 0" },
  { t: 'Tercer orden', e: "y''' - y = 0", c: "y(0) = 1, y'(0) = 0, y''(0) = 0" },
  { t: 'Péndulo', e: "y'' + 0.2*y' + sin(y) = 0", c: "y(0) = 2.5, y'(0) = 0" },
  { t: 'Van der Pol', e: "y'' - 2*(1 - y^2)*y' + y = 0", c: "y(0) = 0.5, y'(0) = 0" },
]

/* ---------- todo lo que sale de la ecuación, calculado una vez ---------- */

interface Estudio {
  error: string | null
  orden: number
  texto: string
  sol: SolEdo | null
  conds: Condicion[]
  errorConds: string | null
  part: Particular | null
  serie: { serie: E; texto: string } | null
  ed: EdoNum | null
  ini: { x0: number; Y0: number[] } | null
  errorIni: string | null
}

const cache = new Map<string, Estudio>()

function estudio(s: S): Estudio {
  const llave = s.ecuacion + '\u0000' + s.condiciones
  const hecho = cache.get(llave)
  if (hecho) return hecho
  const r: Estudio = { error: null, orden: 0, texto: '', sol: null, conds: [], errorConds: null, part: null, serie: null, ed: null, ini: null, errorIni: null }
  try {
    const l = leerEdo(s.ecuacion)
    r.orden = l.orden
    r.texto = l.texto
    r.ed = compilarEdo(s.ecuacion, VARIABLES_EDO, l.orden)
  } catch (e) {
    r.error = (e as Error).message
  }
  if (!r.error) {
    try {
      r.sol = resolverEdo(s.ecuacion)
    } catch {
      r.sol = null
    }
    try {
      r.conds = leerCondiciones(s.condiciones)
    } catch (e) {
      r.errorConds = (e as Error).message
    }
    if (r.sol && r.conds.length) r.part = particular(r.sol, r.conds)
    if (r.conds.length) {
      try {
        r.serie = serieTaylor(s.ecuacion, r.conds)
      } catch {
        r.serie = null
      }
      const v = valoresIniciales(r.ed!, r.conds.map((c): Cond => ({ k: c.k, x0: evaluar(c.x0), v: evaluar(c.v) })))
      if ('error' in v) r.errorIni = v.error
      else r.ini = v
    }
  }
  if (cache.size > 40) cache.delete(cache.keys().next().value!)
  cache.set(llave, r)
  return r
}

const funcionDe = (e: E) => (x: number) => evaluar(e, { x })

const texGeneral = (sol: SolEdo) => {
  if (sol.explicita) return `y = ${texE(sol.explicita)}`
  if (sol.implicita) return `${texE(sol.implicita)} = C_{1}`
  if (sol.homogenea) return `y_h = ${texE(sol.homogenea)}`
  return null
}

/* ---------- panel ---------- */

function Pasos({ pasos }: { pasos: SolEdo['pasos'] }) {
  return (
    <ol className="pasos">
      {pasos.map((p, i) => (
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
  )
}

function Panel({ s, set }: PropsPanel<S>) {
  const r = estudio(s)
  const nuevo = (e: { e: string; c: string }) => set({ ecuacion: e.e, condiciones: e.c, encuadre: s.encuadre + 1 })
  return (
    <>
      <Grupo titulo="Ecuación">
        <Expresion
          etiqueta=""
          valor={s.ecuacion}
          variables={['x', 'y', "y'", "y''", "y'''"]}
          piezas={['=', 'sin(', 'cos(', 'exp(', 'ln(', 'sqrt(', '^', 'pi']}
          comprobar={(v) => {
            try {
              leerEdo(v)
              return null
            } catch (e) {
              return (e as Error).message
            }
          }}
          previa={(v) => {
            try {
              return leerEdo(v).texto
            } catch {
              return null
            }
          }}
          onChange={(ecuacion: string) => set({ ecuacion })}
        />
        <Nota>
          Se escribe <b>entera, con el igual</b> y en cualquier forma: y″ + 3·y′ + 2·y = exp(−x), 2xy + (x² + 3y²)·y′ = 0…
          Hasta orden {6}, lineal o no. Primero se busca la <b>fórmula cerrada</b> (factor integrante, característica,
          coeficientes indeterminados, variación de parámetros, Cauchy–Euler, separable, Bernoulli, exacta, homogénea,
          reducción de orden) y <b>se comprueba metiéndola en la ecuación</b>; si no hay, queda la serie de Taylor y la
          numérica (Dormand–Prince adaptativo).
        </Nota>
        <Atajos opciones={EJEMPLOS.map((e) => ({ t: e.t, activo: s.ecuacion === e.e, onClick: () => nuevo(e) }))} />
      </Grupo>

      <Resultado />

      <Grupo titulo="Condiciones">
        <Expresion
          etiqueta=""
          valor={s.condiciones}
          variables={[]}
          piezas={['y(0) = ', "y'(0) = ", "y''(0) = ", ', ', 'pi']}
          comprobar={(v) => {
            try {
              const cs = leerCondiciones(v)
              if (r.orden && cs.length && cs.length !== r.orden) return `hacen falta ${r.orden} condiciones (hay ${cs.length})`
              return null
            } catch (e) {
              return (e as Error).message
            }
          }}
          previa={(v) => {
            try {
              return leerCondiciones(v).map((c) => c.texto).join(',\\quad ')
            } catch {
              return null
            }
          }}
          onChange={(condiciones: string) => set({ condiciones })}
        />
        <Nota>
          Separadas por comas: <b>y(0) = 1, y′(0) = 0</b>. Si están en <b>puntos distintos</b> (y(0) = 0, y(π/2) = 1) es un
          problema de contorno: la fórmula cerrada fija las constantes con todas a la vez y la numérica usa disparo. Vacío:
          solo la solución general.
        </Nota>
        <div className="interruptores">
          <Interruptor activo={s.verFamilia} onChange={(verFamilia) => set({ verFamilia })}>
            Familia
          </Interruptor>
          <Interruptor activo={s.verDerivada} onChange={(verDerivada) => set({ verDerivada })}>
            y′(x)
          </Interruptor>
          {r.orden === 1 && (
            <Interruptor activo={s.verCampo} onChange={(verCampo) => set({ verCampo })}>
              Campo de pendientes
            </Interruptor>
          )}
          {r.serie && (
            <Interruptor activo={s.verSerie} onChange={(verSerie) => set({ verSerie })}>
              Serie de Taylor
            </Interruptor>
          )}
        </div>
        <Atajos opciones={[{ t: 'Encuadrar', onClick: () => set({ encuadre: s.encuadre + 1 }) }]} />
      </Grupo>

      {r.sol && r.sol.pasos.length > 0 && (
        <Grupo titulo="Cómo se resuelve">
          <Interruptor activo={s.verPasos} onChange={(verPasos) => set({ verPasos })}>
            {r.sol.metodo || 'sin fórmula cerrada'}
          </Interruptor>
          {s.verPasos && <Pasos pasos={r.sol.pasos} />}
        </Grupo>
      )}
    </>
  )
}

/* ---------- dibujo ---------- */

const encuadrados = new WeakMap<Pintor2D, string>()

function curvas(r: Estudio, xa: number, xb: number) {
  if (!r.ed || !r.ini) return null
  return solucionEn(r.ed, r.ini.x0, r.ini.Y0, xa, xb)
}

/** Ventana que enseña la solución: x alrededor de las condiciones, y con los percentiles de la curva. */
function ventanaAuto(r: Estudio): { x: [number, number]; y: [number, number] } {
  const xs = r.conds.map((c) => evaluar(c.x0))
  const a = xs.length ? Math.min(...xs) : 0
  const b = xs.length ? Math.max(...xs) : 0
  const L = Math.max(8, 1.6 * (b - a))
  const x: [number, number] = [a - 0.12 * L, a + L]
  const c = curvas(r, x[0], x[1])
  // la altura la marca lo que pasa desde el primer dato hacia delante: hacia atrás suele explotar
  // sobre una rejilla uniforme en x: el paso adaptativo se amontona junto a una asíntota y sesgaría la cuenta
  const pts = (c?.puntos ?? []).filter((p) => p[0] >= a && Number.isFinite(p[1]))
  const ys: number[] = []
  for (let i = 0, j = 0; i <= 300 && pts.length; i++) {
    const xi = a + ((x[1] - a) * i) / 300
    while (j + 1 < pts.length && pts[j + 1][0] <= xi) j++
    if (pts[j][0] <= xi + 1e-9 && (j + 1 < pts.length || Math.abs(pts[j][0] - xi) < (x[1] - a) / 300)) ys.push(pts[j][1])
  }
  ys.sort((p, q) => p - q)
  if (!ys.length) return { x, y: [-3, 3] }
  const q = (f: number) => ys[Math.round(f * (ys.length - 1))]
  // con una cola que explota (asíntota), los percentiles extremos se la comen: se usan los centrales
  const cola = q(0.98) - q(0.02) > 8 * (q(0.9) - q(0.1) || 1)
  const lo = cola ? q(0.1) : q(0.02)
  const hi = cola ? q(0.9) : q(0.98)
  const alto = Math.max(2, hi - lo)
  return { x, y: [lo - 0.15 * alto, hi + 0.15 * alto] }
}

function fmt(v: number) {
  return String(Math.round(v * 1000) / 1000)
}

function reescribir(conds: Condicion[], cambio: (c: Condicion, i: number) => { x0: number; v: number } | null) {
  return conds
    .map((c, i) => {
      const n = cambio(c, i)
      return n ? `${Y(c.k)}(${fmt(n.x0)}) = ${fmt(n.v)}` : `${Y(c.k)}(${fmtE(c.x0)}) = ${fmtE(c.v)}`
    })
    .join(', ')
}

const fmtE = (e: E) => fmt(evaluar(e))

export default definir<S>({
  id: 'resolver',
  area: 'edo',
  resumen: 'Resolver una EDO escrita tal cual: fórmula cerrada, pasos y numérica',
  corto: 'Resolver EDO',
  titulo: 'Resolver una <i>EDO</i>',
  entradilla: 'Escribe la ecuación y sus condiciones: la clasifica, la resuelve con pasos y la dibuja.',
  inicial: {
    ecuacion: "y'' + 3*y' + 2*y = 0",
    condiciones: "y(0) = 1, y'(0) = 0",
    verDerivada: false,
    verFamilia: true,
    verCampo: true,
    verSerie: false,
    verPasos: true,
    encuadre: 0,
  },
  Panel,
  resultadoEnPanel: true,
  rotulo: (s) => {
    const r = estudio(s)
    if (r.error) return { nombre: 'No se entiende', apunte: r.error }
    return { nombre: `EDO de orden ${r.orden}`, apunte: r.sol?.clases.slice(1).join(', ') ?? '' }
  },
  formula: (s) => {
    const r = estudio(s)
    if (r.error) return []
    const out = [r.texto]
    const g = r.sol && texGeneral(r.sol)
    if (g) out.push(g)
    if (r.part?.y) out.push(`y = ${texE(r.part.y)}`)
    else if (r.part?.phi) out.push(`${texE(r.part.phi)} = 0`)
    else if (!g && r.serie) out.push(r.serie.texto)
    if (r.sol?.singulares.length) out.push(r.sol.singulares.map((c) => `y = ${texE(c)}`).join(',\\ ') + '\\ \\text{(singulares)}')
    return out
  },
  lecturas: (s) => {
    const r = estudio(s)
    if (r.error) return [['Estado', r.error]]
    const f: Array<[string, string]> = []
    const sol = r.sol
    if (sol?.metodo) f.push(['Método', sol.metodo])
    if (sol?.explicita || sol?.implicita) f.push(['Comprobada', sol.verificada ? 'sí, sustituyéndola' : 'no se pudo'])
    else f.push(['Fórmula cerrada', sol?.homogenea ? 'solo la homogénea' : 'no encontrada: serie y numérica'])
    if (r.errorConds) f.push(['Condiciones', r.errorConds])
    if (r.part?.nota) f.push(['Constantes', r.part.nota])
    for (const [n, v] of r.part?.constantes ?? []) f.push([n.replace(/\d/g, (d) => '₀₁₂₃₄₅₆₇₈₉'[Number(d)]), texPlano(v)])
    if (r.errorIni) f.push(['Numérica', r.errorIni])
    else if (r.ini && r.conds.some((c) => evaluar(c.x0) !== r.ini!.x0 || c.k >= r.orden)) f.push(['Disparo', `y′(${fmt(r.ini.x0)}) = ${r.ini.Y0[1]?.toFixed(6)}`])
    // la comprobación de verdad: fórmula frente a numérica sobre el mismo intervalo
    if (r.part?.y && r.ini) {
      const c = curvas(r, r.ini.x0 - 2, r.ini.x0 + 8)
      const y = funcionDe(r.part.y)
      let dif = 0
      for (const p of c?.puntos ?? []) {
        const v = y(p[0])
        if (Number.isFinite(v) && Math.abs(p[1]) < 1e6) dif = Math.max(dif, Math.abs(p[1] - v) / (1 + Math.abs(v)))
      }
      f.push(['Fórmula vs numérica', dif.toExponential(2)])
    }
    return f
  },
  leyenda: (s) => {
    const r = estudio(s)
    return (
      <>
        <Muestra color="var(--accent)">y(x)</Muestra>
        {r.part?.y && <Muestra color="var(--pos)">fórmula cerrada</Muestra>}
        {s.verFamilia && <Muestra color="var(--ink-soft)">familia</Muestra>}
        {s.verDerivada && <Muestra color="var(--aux)">y′(x)</Muestra>}
        {s.verSerie && r.serie && <Muestra color="var(--neg)">Taylor</Muestra>}
      </>
    )
  },
  vista: {
    tipo: '2d',
    ventana: { x: [-1, 8], y: [-2, 2] },
    interaccion: {
      asas(s) {
        const r = estudio(s)
        if (!r.ini) return []
        return r.conds.flatMap((c, i) => {
          const x0 = evaluar(c.x0)
          const v = evaluar(c.v)
          if (c.k === 0) return [{ id: `c${i}`, p: [x0, v], color: '--accent', nombre: `y(${fmt(x0)})` }]
          if (c.k === 1) {
            // la pendiente se agarra por un punto un poco más allá, sobre la tangente
            const y0 = r.conds.find((d) => d.k === 0 && evaluar(d.x0) === x0)
            if (!y0) return []
            return [{ id: `c${i}`, p: [x0 + 0.6, evaluar(y0.v) + v * 0.6], color: '--aux', nombre: 'y′', eje: 'y' as const }]
          }
          return []
        })
      },
      mover(id, t, s) {
        const r = estudio(s)
        const i = Number(id.slice(1))
        const c = r.conds[i]
        if (!c) return
        return {
          condiciones: reescribir(r.conds, (d, j) => {
            if (j !== i) return null
            if (d.k === 0) return { x0: t.p[0], v: t.p[1] }
            const x0 = evaluar(d.x0)
            const y0 = r.conds.find((e) => e.k === 0 && evaluar(e.x0) === x0)!
            return { x0, v: (t.p[1] - evaluar(y0.v)) / 0.6 }
          }),
        }
      },
      pista: 'Arrastra y(x₀) (también en horizontal) o la pendiente; rueda y arrastre para moverte',
    },
    dibujar(g, s) {
      const r = estudio(s)
      const llave = `${s.ecuacion}|${s.condiciones.replace(/[\d.]+/g, '#')}|${s.encuadre}`
      if (encuadrados.get(g) !== llave && !r.error) {
        encuadrados.set(g, llave)
        g.ventana = ventanaAuto(r)
      }
      g.ejes({ etiquetaX: 'x', etiquetaY: 'y' })
      if (r.error || !r.ed) {
        g.texto(r.error ?? 'no se entiende la ecuación', g.ventana.x[0], g.ventana.y[1], g.color('--pos'), { dx: 12, dy: 18 })
        return
      }
      const [xa, xb] = g.ventana.x
      const [ya, yb] = g.ventana.y
      const ed = r.ed

      if (s.verCampo && r.orden === 1) {
        const nx = 26
        const ny = Math.max(8, Math.round((nx * g.alto) / Math.max(1, g.ancho)))
        const hx = (xb - xa) / nx
        const hy = (yb - ya) / ny
        const col = g.color('--line')
        g.ctx.strokeStyle = col
        g.ctx.lineWidth = 1
        for (let i = 0; i <= nx; i++)
          for (let j = 0; j <= ny; j++) {
            const x = xa + (i + 0.5) * hx
            const y = ya + (j + 0.5) * hy
            const m = derivadaAlta(ed, x, [y])
            if (!Number.isFinite(m)) continue
            // segmento de largo fijo en pantalla
            const dxp = 1
            const dyp = (m * (g.Y(y + 1) - g.Y(y))) / (g.X(x + 1) - g.X(x))
            const k = 7 / Math.hypot(dxp, dyp)
            g.ctx.beginPath()
            g.ctx.moveTo(g.X(x) - dxp * k, g.Y(y) - dyp * k)
            g.ctx.lineTo(g.X(x) + dxp * k, g.Y(y) + dyp * k)
            g.ctx.stroke()
          }
      }

      if (r.errorConds || r.errorIni || !r.ini) {
        // sin condiciones válidas: la familia general, si la hay
        const sol = r.sol
        if (sol?.explicita) {
          const base: Record<string, number> = {}
          for (const k of [-2, -1, -0.5, 0.5, 1, 2]) {
            const pts: Array<[number, number]> = []
            for (let i = 0; i <= 400; i++) {
              const x = xa + ((xb - xa) * i) / 400
              for (let n = 1; n <= r.orden; n++) base['C' + n] = n === 1 ? k : 0.5 * k
              const v = evaluar(sol.explicita, { x, ...base })
              pts.push([x, Number.isFinite(v) && Math.abs(v) < 1e6 ? v : NaN])
            }
            g.curva(pts, g.color('--accent'), 1.2)
          }
        }
        g.texto(r.errorConds ?? r.errorIni ?? 'sin condiciones: la familia de la solución general', xa, yb, g.color('--ink-soft'), { dx: 12, dy: 18 })
        return
      }

      const margen = 0.02 * (xb - xa)
      const c = curvas(r, xa - margen, xb + margen)!
      const alto = yb - ya
      const recorta = (v: number) => (Number.isFinite(v) && Math.abs(v - (ya + yb) / 2) < 20 * alto ? v : NaN)

      if (s.verFamilia) {
        const d = 0.08 * alto
        for (const k of [-3, -2, -1, 1, 2, 3]) {
          const Y0 = r.ini.Y0.slice()
          Y0[0] += k * d
          const f = solucionEn(ed, r.ini.x0, Y0, xa - margen, xb + margen)
          g.curva(f.puntos.map((p) => [p[0], recorta(p[1])] as [number, number]), g.color('--line'), 1.1)
        }
      }
      if (s.verDerivada) g.curva(c.puntos.map((p) => [p[0], recorta(p[2] ?? NaN)] as [number, number]), g.color('--aux'), 1.6)
      if (r.part?.y) {
        const y = funcionDe(r.part.y)
        const pts: Array<[number, number]> = []
        for (let i = 0; i <= 600; i++) {
          const x = xa + ((xb - xa) * i) / 600
          pts.push([x, recorta(y(x))])
        }
        g.curva(pts, g.color('--pos'), 4.5)
      }
      if (s.verSerie && r.serie) {
        const y = funcionDe(r.serie.serie)
        const pts: Array<[number, number]> = []
        for (let i = 0; i <= 400; i++) {
          const x = xa + ((xb - xa) * i) / 400
          pts.push([x, recorta(y(x))])
        }
        g.curva(pts, g.color('--neg'), 1.6, true)
      }
      g.curva(c.puntos.map((p) => [p[0], recorta(p[1])] as [number, number]), g.color('--accent'), 2)
      for (const p of c.paradas) {
        g.curva([[p.x, ya], [p.x, yb]], g.color('--neg'), 1, true)
        g.texto(p.motivo, p.x, yb, g.color('--neg'), { dx: 6, dy: 16 })
      }
      for (const cd of r.conds) if (cd.k === 0) g.punto(evaluar(cd.x0), evaluar(cd.v), g.color('--ink'), 4)
    },
  },
})

function texPlano(e: E): string {
  if (e.t === 'q') return e.d === 1n ? String(e.n) : `${e.n}/${e.d}`
  const v = evaluar(e)
  const t = texE(e)
  const limpio = /^-?\d+(\.\d+)?$/.test(t) || /^-?\\frac\{\d+\}\{\d+\}$/.test(t) ? t.replace(/\\frac\{(\d+)\}\{(\d+)\}/, '$1/$2') : null
  return limpio ?? (Number.isFinite(v) ? v.toPrecision(8) : t)
}
