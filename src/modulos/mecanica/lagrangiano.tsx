import { definir, type PropsPanel } from '../../nucleo/tipos'
import { Atajos, Expresion, Grupo, Muestra, Rango, Resultado, Segmentado } from '../../nucleo/controles'
import { tex } from '../../lib/cas/tex'
import type { E } from '../../lib/cas/expr'
import {
  analizarLagrangiano, estadoEn, integrar, leerLista, leerPuntos, leerValores, numerico, periodo, poincare, vel, type Numerico, type Sistema,
  type Trayectoria,
} from '../../lib/mecanica'
import type { Pintor2D } from '../../render/pintor2d'

type Vista = 'animacion' | 'tiempo' | 'fases' | 'energia' | 'poincare'

export interface EstadoLagrangiano {
  coords: string
  L: string
  params: string
  ci: string
  puntos: string
  tMax: number
  vista: Vista
  velocidad: number
}

export const PRESETS: Array<{ t: string } & Omit<EstadoLagrangiano, 'vista' | 'velocidad'>> = [
  {
    t: 'péndulo',
    coords: 'theta',
    L: "1/2*m*l^2*theta'^2 + m*g*l*cos(theta)",
    params: 'm = 1, l = 1, g = 9.8',
    ci: "theta = 2.5, theta' = 0",
    puntos: '(l*sin(theta), -l*cos(theta))',
    tMax: 20,
  },
  {
    t: 'doble péndulo',
    coords: 'theta, phi',
    L: "(m1+m2)/2*l1^2*theta'^2 + m2/2*l2^2*phi'^2 + m2*l1*l2*theta'*phi'*cos(theta-phi) + (m1+m2)*g*l1*cos(theta) + m2*g*l2*cos(phi)",
    params: 'm1 = 1, m2 = 1, l1 = 1, l2 = 1, g = 9.8',
    ci: "theta = 2, phi = 2.5, theta' = 0, phi' = 0",
    puntos: '(l1*sin(theta), -l1*cos(theta)); (l1*sin(theta)+l2*sin(phi), -l1*cos(theta)-l2*cos(phi))',
    tMax: 30,
  },
  {
    t: 'péndulo elástico',
    coords: 'r, theta',
    L: "m/2*(r'^2 + r^2*theta'^2) + m*g*r*cos(theta) - k/2*(r-l)^2",
    params: 'm = 1, g = 9.8, k = 40, l = 1',
    ci: "r = 1.3, theta = 0.8, r' = 0, theta' = 0",
    puntos: '(r*sin(theta), -r*cos(theta))',
    tMax: 20,
  },
  {
    t: 'carro y péndulo',
    coords: 'x, theta',
    L: "(mc+m)/2*x'^2 + m*l*x'*theta'*cos(theta) + m/2*l^2*theta'^2 + m*g*l*cos(theta)",
    params: 'mc = 2, m = 1, l = 1, g = 9.8',
    ci: "x = 0, theta = 1.2, x' = 0, theta' = 0",
    puntos: '(x, 0); (x + l*sin(theta), -l*cos(theta))',
    tMax: 15,
  },
  {
    t: 'Atwood',
    coords: 'x',
    L: "(m1+m2)/2*x'^2 + (m1-m2)*g*x",
    params: 'm1 = 1.2, m2 = 1, g = 9.8',
    ci: "x = 0, x' = 0",
    puntos: '(-0.6, -1.5 - x); (0.6, -1.5 + x)',
    tMax: 1.2,
  },
  {
    t: 'partícula en un cono',
    coords: 'r, phi',
    L: "m/2*((1 + c^2)*r'^2 + r^2*phi'^2) - m*g*c*r",
    params: 'm = 1, g = 9.8, c = 1',
    ci: "r = 1, phi = 0, r' = 0, phi' = 2.5",
    puntos: '(r*cos(phi), r*sin(phi))',
    tMax: 12,
  },
  {
    t: 'oscilador',
    coords: 'x',
    L: "m/2*x'^2 - k/2*x^2",
    params: 'm = 1, k = 4',
    ci: "x = 1, x' = 0",
    puntos: '(x, 0)',
    tMax: 10,
  },
]

const GRIEGAS = new Set(['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'theta', 'lambda', 'mu', 'nu', 'xi', 'rho', 'sigma', 'tau', 'phi', 'psi', 'omega', 'chi', 'eta', 'kappa'])
const nombreTex = (x: string) => (GRIEGAS.has(x) ? `\\${x}` : x)

/** TeX con puntos de Newton: θ′ → θ̇, θ″ → θ̈, p_theta → p_θ. */
export function texM(e: E): string {
  return tex(e)
    .replace(/\\mathrm\{([a-z]+)''\}/g, (_, v) => `\\ddot{${nombreTex(v)}}`)
    .replace(/\\mathrm\{([a-z]+)'\}/g, (_, v) => `\\dot{${nombreTex(v)}}`)
    .replace(/\\mathrm\{p_([a-z]+)\}/g, (_, v) => `p_{${nombreTex(v)}}`)
    // griegas que el CAS escribe con letras (phi es además una constante y no la traduce)
    .replace(/\\mathrm\{([a-z]+)\}/g, (m, v) => (GRIEGAS.has(v) ? `\\${v}` : m))
    .replace(/(?<![\\a-zA-Z])([a-z]+)(?![a-zA-Z])/g, (m, v) => (GRIEGAS.has(v) ? `\\${v} ` : m))
}

/** Una ecuación larga en varias líneas (KaTeX no parte solo): se agrupan los sumandos de ~70 caracteres. */
export function enLineas(izq: string, e: E, der = ''): string {
  const completa = `${izq}${texM(e)}${der}`
  if (completa.length < 110 || e.t !== '+') return completa
  const lineas: string[] = []
  let actual = ''
  e.a.forEach((term, i) => {
    const t = texM(term)
    const trozo = i === 0 ? t : t.startsWith('-') ? ` ${t}` : ` + ${t}`
    if (actual && (actual + trozo).length > 70) {
      lineas.push(actual)
      actual = trozo
    } else actual += trozo
  })
  lineas.push(actual)
  return String.raw`\begin{aligned}${izq}&${lineas.join(String.raw`\\&`)}${der}\end{aligned}`
}

type Calculo = { sis: Sistema; num: Numerico; tr: Trayectoria; y0: number[]; puntos: Array<(y: number[]) => [number, number]> }

let cache: { clave: string; v: Calculo | { error: string } } = { clave: '', v: { error: '' } }

export function calcular(s: EstadoLagrangiano): Calculo | { error: string } {
  const clave = [s.coords, s.L, s.params, s.ci, s.puntos, s.tMax].join('|')
  if (cache.clave === clave) return cache.v
  let v: Calculo | { error: string }
  try {
    const params = leerValores(s.params)
    const sis = analizarLagrangiano(s.coords, s.L, Object.keys(params))
    const num = numerico(sis, params)
    const ci = leerValores(s.ci)
    const y0 = [...sis.coords.map((q) => ci[q] ?? 0), ...sis.coords.map((q) => ci[vel(q)] ?? 0)]
    const tr = integrar(num, y0, s.tMax)
    const puntos = s.puntos.trim() ? leerPuntos(s.puntos, sis.coords, params) : []
    v = { sis, num, tr, y0, puntos }
  } catch (e) {
    v = { error: (e as Error).message }
  }
  cache = { clave, v }
  return v
}

function Panel({ s, set }: PropsPanel<EstadoLagrangiano>) {
  const coords = leerLista(s.coords)
  const vars = [...coords, ...coords.map(vel), 't']
  return (
    <>
      <Grupo titulo="Sistema">
        <Atajos opciones={PRESETS.map((p) => ({ t: p.t, activo: s.L === p.L, onClick: () => set({ coords: p.coords, L: p.L, params: p.params, ci: p.ci, puntos: p.puntos, tMax: p.tMax }) }))} />
        <Expresion etiqueta="q =" valor={s.coords} variables={[]} onChange={(coords: string) => set({ coords })} comprobar={() => null} />
        <Expresion etiqueta="L =" valor={s.L} variables={vars} onChange={(L: string) => set({ L })} comprobar={() => null} />
        <Expresion etiqueta="con" valor={s.params} variables={[]} onChange={(params: string) => set({ params })} comprobar={() => null} />
        <Expresion etiqueta="en t = 0" valor={s.ci} variables={[]} onChange={(ci: string) => set({ ci })} comprobar={() => null} />
        <Expresion etiqueta="cuerpos" valor={s.puntos} variables={coords} onChange={(puntos: string) => set({ puntos })} comprobar={() => null} />
      </Grupo>
      <Resultado />
      <Grupo titulo="Ver">
        <Segmentado
          columnas={3}
          valor={s.vista}
          opciones={[
            { v: 'animacion', t: 'Movimiento' },
            { v: 'tiempo', t: 'q(t)' },
            { v: 'fases', t: 'Fases' },
            { v: 'energia', t: 'Energía' },
            { v: 'poincare', t: 'Poincaré' },
          ]}
          onChange={(vista) => set({ vista })}
        />
        <Rango etiqueta="Integrar hasta t" valor={s.tMax} min={1} max={200} paso={1} onChange={(tMax) => set({ tMax })} />
        {s.vista === 'animacion' && <Rango etiqueta="Velocidad" valor={s.velocidad} min={0.1} max={3} paso={0.1} onChange={(velocidad) => set({ velocidad })} />}
      </Grupo>
    </>
  )
}

const COLORES = ['--accent', '--pos', '--neg', '--ink']

function marcoDe(pts: Array<[number, number]>, igual = false): { x: [number, number]; y: [number, number] } {
  const xs = pts.map((p) => p[0]).filter(Number.isFinite)
  const ys = pts.map((p) => p[1]).filter(Number.isFinite)
  let x0 = Math.min(...xs)
  let x1 = Math.max(...xs)
  let y0 = Math.min(...ys)
  let y1 = Math.max(...ys)
  if (igual) {
    x0 = Math.min(x0, 0)
    x1 = Math.max(x1, 0)
    y0 = Math.min(y0, 0)
    y1 = Math.max(y1, 0)
  }
  const px = 0.1 * (x1 - x0 || 1)
  const py = 0.1 * (y1 - y0 || 1)
  return { x: [x0 - px, x1 + px], y: [y0 - py, y1 + py] }
}

function vistaAnimacion(g: Pintor2D, s: EstadoLagrangiano, c: Calculo, reloj: number) {
  const tEnd = c.tr.t[c.tr.t.length - 1]
  const t = (reloj * s.velocidad) % Math.max(tEnd, 1e-9)
  // encuadre fijo: el de toda la trayectoria
  const muestra = Array.from({ length: 300 }, (_, i) => estadoEn(c.tr, (tEnd * i) / 299))
  const todos = muestra.flatMap((y) => c.puntos.map((p) => p(y)))
  g.ventana = marcoDe(todos, true)
  g.igualarEscala()
  g.ejes({ rejilla: true })
  if (!c.puntos.length) {
    g.texto('escribe la posición de los cuerpos en «cuerpos» para verlos moverse', g.ventana.x[0] * 0.95, g.ventana.y[1] * 0.9, g.color('--ink-soft'))
    return
  }
  const y = estadoEn(c.tr, t)
  // estela del último cuerpo
  const ultimo = c.puntos[c.puntos.length - 1]
  const estela: Array<[number, number]> = []
  for (let k = 0; k <= 150; k++) {
    const tk = t - (3 * k) / 150
    if (tk < 0) break
    estela.push(ultimo(estadoEn(c.tr, tk)))
  }
  g.curva(estela, g.color('--pos'), 1.4)
  const ps = c.puntos.map((p) => p(y))
  g.curva([[0, 0], ...ps], g.color('--ink-soft'), 2)
  g.punto(0, 0, g.color('--ink-soft'), 3)
  ps.forEach((p, i) => g.punto(p[0], p[1], g.color(COLORES[i % COLORES.length]), 7))
  g.texto(`t = ${t.toFixed(2)}`, g.ventana.x[0] + 0.03 * (g.ventana.x[1] - g.ventana.x[0]), g.ventana.y[1] - 0.05 * (g.ventana.y[1] - g.ventana.y[0]), g.color('--ink-soft'))
}

function vistaTiempo(g: Pintor2D, c: Calculo) {
  const n = c.sis.coords.length
  const ts = c.tr.t
  const vals = c.tr.y.flatMap((y) => y.slice(0, n))
  g.ventana = { x: [0, ts[ts.length - 1]], y: marcoDe(vals.map((v) => [0, v] as [number, number])).y }
  g.ejes({ etiquetaX: 't', etiquetaY: 'q' })
  for (let i = 0; i < n; i++) g.curva(ts.map((t, k) => [t, c.tr.y[k][i]] as [number, number]), g.color(COLORES[i % COLORES.length]), 2)
}

function vistaFases(g: Pintor2D, c: Calculo) {
  const n = c.sis.coords.length
  const pts: Array<[number, number]> = []
  for (let i = 0; i < n; i++) for (const y of c.tr.y) pts.push([y[i], y[n + i]])
  g.ventana = marcoDe(pts)
  g.ejes({ etiquetaX: 'q', etiquetaY: 'q̇' })
  for (let i = 0; i < n; i++) g.curva(c.tr.y.map((y) => [y[i], y[n + i]] as [number, number]), g.color(COLORES[i % COLORES.length]), 1.6)
}

function vistaEnergia(g: Pintor2D, c: Calculo) {
  const E0 = c.num.energia(c.y0, 0)
  const esc = Math.max(1e-12, Math.abs(E0))
  const pts = c.tr.t.map((t, k) => [t, (c.num.energia(c.tr.y[k], t) - E0) / esc] as [number, number])
  const m = Math.max(1e-14, ...pts.map((p) => Math.abs(p[1])))
  g.ventana = { x: [0, c.tr.t[c.tr.t.length - 1]], y: [-1.3 * m, 1.3 * m] }
  g.ejes({ etiquetaX: 't', etiquetaY: '(E − E₀)/|E₀|' })
  g.curva(pts, g.color('--accent'), 1.6)
}

function vistaPoincare(g: Pintor2D, c: Calculo) {
  const n = c.sis.coords.length
  if (n !== 2) {
    g.ventana = { x: [-1, 1], y: [-1, 1] }
    g.texto('la sección de Poincaré es para dos grados de libertad', -0.95, 0.8, g.color('--ink-soft'))
    return
  }
  const angulo = /theta|phi|alpha|beta|psi/.test(c.sis.coords[1])
  const pts = poincare(c.tr, n, angulo)
  if (!pts.length) {
    g.ventana = { x: [-1, 1], y: [-1, 1] }
    g.texto('ningún corte todavía: integra más tiempo', -0.95, 0.8, g.color('--ink-soft'))
    return
  }
  g.ventana = marcoDe(pts)
  g.ejes({ etiquetaX: c.sis.coords[0], etiquetaY: `${c.sis.coords[0]}′` })
  for (const [a, b] of pts) g.punto(a, b, g.color('--accent'), 2)
}

export default definir<EstadoLagrangiano>({
  id: 'lagrangiano',
  area: 'mecanica',
  resumen: 'Tu lagrangiano: ecuaciones de Euler–Lagrange y de Hamilton, movimiento, fases, energía y Poincaré',
  corto: 'Tu lagrangiano',
  titulo: 'Tu <i>lagrangiano</i>',
  entradilla: 'Escribe L(q, q̇) con q′ para las velocidades: sale todo lo demás.',
  inicial: { ...PRESETS[1], vista: 'animacion', velocidad: 1 },
  Panel,
  resultadoEnPanel: true,
  rotulo: (s) => ({ nombre: 'L = T − V', apunte: s.vista }),
  formula: (s) => {
    const c = calcular(s)
    if ('error' in c) return [String.raw`\frac{d}{dt}\frac{\partial L}{\partial \dot q_i}-\frac{\partial L}{\partial q_i}=0`]
    const out = [enLineas('L = ', c.sis.L)]
    c.sis.EL.forEach((e) => out.push(enLineas('', e, ' = 0')))
    if (c.sis.hamilton && c.sis.coords.length === 1) {
      const q = nombreTex(c.sis.coords[0])
      out.push(enLineas('H = ', c.sis.hamilton.H))
      out.push(String.raw`\dot{${q}} = ${texM(c.sis.hamilton.qd[0])},\qquad \dot p_{${q}} = ${texM(c.sis.hamilton.pd[0])}`)
    } else out.push(enLineas('E = ', c.sis.H))
    return out
  },
  lecturas: (s) => {
    const c = calcular(s)
    if ('error' in c) return [['No se puede', c.error]]
    const E0 = c.num.energia(c.y0, 0)
    let deriva = 0
    for (let k = 0; k < c.tr.t.length; k++) deriva = Math.max(deriva, Math.abs(c.num.energia(c.tr.y[k], c.tr.t[k]) - E0))
    const filas: Array<[string, string]> = [
      ['Grados de libertad', String(c.sis.coords.length)],
      ['Energía inicial', E0.toFixed(8)],
      [c.sis.dependeDeT ? 'Variación de H (L depende de t: no se conserva)' : 'Deriva máxima de la energía', `${deriva.toExponential(2)} (relativa ${(deriva / Math.max(1e-300, Math.abs(E0))).toExponential(2)})`],
      ['Pasos del integrador', String(c.tr.t.length)],
    ]
    if (c.tr.parada) filas.push(['Aviso', c.tr.parada])
    if (c.sis.coords.length === 1) {
      const T = periodo(c.tr, 1)
      filas.push(['Periodo medido', T === null ? 'no hay dos oscilaciones completas' : T.toFixed(10)])
    }
    return filas
  },
  leyenda: (s) =>
    s.vista === 'animacion' ? (
      <>
        <Muestra color="var(--accent)">cuerpo 1</Muestra>
        <Muestra color="var(--pos)">cuerpo 2 · estela</Muestra>
      </>
    ) : s.vista === 'energia' ? (
      <Muestra color="var(--accent)">error relativo de la energía</Muestra>
    ) : (
      <>
        <Muestra color="var(--accent)">1.ª coordenada</Muestra>
        <Muestra color="var(--pos)">2.ª coordenada</Muestra>
      </>
    ),
  comparaciones: [{ t: 'Dos condiciones iniciales casi iguales (caos)', a: { ci: "theta = 2, phi = 2.5, theta' = 0, phi' = 0" }, b: { ci: "theta = 2.001, phi = 2.5, theta' = 0, phi' = 0" } }],
  vista: (s) => ({
    tipo: '2d',
    clave: s.vista,
    navegable: false,
    animada: (st) => st.vista === 'animacion',
    dibujar(g, st, reloj) {
      const c = calcular(st)
      if ('error' in c) {
        g.ventana = { x: [-1, 1], y: [-1, 1] }
        g.texto(c.error, -0.95, 0.8, g.color('--pos'))
        return
      }
      if (st.vista === 'animacion') vistaAnimacion(g, st, c, reloj ?? 0)
      else if (st.vista === 'tiempo') vistaTiempo(g, c)
      else if (st.vista === 'fases') vistaFases(g, c)
      else if (st.vista === 'energia') vistaEnergia(g, c)
      else vistaPoincare(g, c)
    },
  }),
})
