import { definir, type PropsPanel, type Vista } from '../../nucleo/tipos'
import { casilla, radios } from '../../nucleo/menu'
import { Atajos, Expresion, Grupo, Interruptor, Muestra, Rango, Resultado, Segmentado } from '../../nucleo/controles'
import { compilarSuave } from '../../lib/expresion'
import {
  anillosOscuros, colorLongitud, fraunhofer2D, intensidadMichelson, intensidadRendijas, J11, reflectanciaMatriz,
} from '../../lib/optica'
import type { Pintor2D } from '../../render/pintor2d'

type Modo = 'rendijas' | 'abertura' | 'pelicula' | 'michelson'

export interface EstadoDifraccion {
  modo: Modo
  /** longitud de onda en nm */
  lambda: number
  N: number
  /** anchura y periodo de las rendijas, en μm */
  a: number
  d: number
  abertura: string
  zoom: number
  log: boolean
  nf: number
  ns: number
  /** espesor de la película en nm */
  e: number
  /** separación de los espejos en μm */
  dm: number
}

const ABERTURAS = [
  { t: 'Círculo', f: 'x^2 + y^2 < 0.06^2' },
  { t: 'Cuadrado', f: '(abs(x) < 0.06)*(abs(y) < 0.06)' },
  { t: 'Rendija', f: '(abs(x) < 0.02)*(abs(y) < 0.3)' },
  { t: 'Dos agujeros', f: '((x - 0.1)^2 + y^2 < 0.03^2) + ((x + 0.1)^2 + y^2 < 0.03^2)' },
  { t: 'Anillo', f: '(x^2 + y^2 < 0.08^2)*(x^2 + y^2 > 0.06^2)' },
  { t: 'Triángulo', f: '(y > -0.05)*(y < 0.1 - 2.6*abs(x))' },
  { t: 'Red', f: '(abs(x) < 0.25)*(abs(y) < 0.25)*(cos(80*x) > 0.6)*(cos(80*y) > 0.6)' },
]

const n = 256
const memoFFT = new Map<string, { t: Float64Array; I: Float64Array } | { error: string }>()
function patron(s: EstadoDifraccion) {
  let r = memoFFT.get(s.abertura)
  if (!r) {
    const c = compilarSuave(s.abertura, ['x', 'y'])
    if (!c.f) r = { error: c.error ?? 'no se entiende la abertura' }
    else {
      const t = new Float64Array(n * n)
      for (let j = 0; j < n; j++)
        for (let i = 0; i < n; i++) {
          const v = c.f(-1 + (2 * (i + 0.5)) / n, -1 + (2 * (j + 0.5)) / n)
          t[j * n + i] = Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0
        }
      r = t.some((v) => v > 0) ? { t, I: fraunhofer2D(t, n) } : { error: 'la abertura no deja pasar luz en [−1, 1]²' }
    }
    if (memoFFT.size > 20) memoFFT.clear()
    memoFFT.set(s.abertura, r)
  }
  return r
}

function Panel({ s, set }: PropsPanel<EstadoDifraccion>) {
  const p = s.modo === 'abertura' ? patron(s) : null
  return (
    <>
      <Grupo titulo="Óptica ondulatoria">
        <Segmentado columnas={2} valor={s.modo} opciones={[{ v: 'rendijas', t: 'Rendijas y redes' }, { v: 'abertura', t: 'Tu abertura (FFT)' }, { v: 'pelicula', t: 'Película delgada' }, { v: 'michelson', t: 'Michelson' }]} onChange={(modo) => set({ modo })} />
        {s.modo !== 'pelicula' && <Rango etiqueta="λ (nm)" valor={s.lambda} min={380} max={780} paso={1} formato={(v) => v.toFixed(0)} onChange={(lambda) => set({ lambda })} />}
      </Grupo>
      {s.modo === 'rendijas' && (
        <Grupo titulo="Aberturas">
          <Atajos opciones={[{ t: 'Una rendija', onClick: () => set({ N: 1 }) }, { t: 'Young', onClick: () => set({ N: 2 }) }, { t: 'Red de 8', onClick: () => set({ N: 8 }) }]} />
          <Rango etiqueta="número de rendijas N" valor={s.N} min={1} max={20} paso={1} formato={(v) => String(v)} onChange={(N) => set({ N: Math.round(N) })} />
          <Rango etiqueta="anchura a (μm)" valor={s.a} min={0.5} max={20} paso={0.1} onChange={(a) => set({ a, d: Math.max(s.d, a) })} />
          {s.N > 1 && <Rango etiqueta="periodo d (μm)" valor={s.d} min={s.a} max={60} paso={0.1} onChange={(d) => set({ d })} />}
        </Grupo>
      )}
      {s.modo === 'abertura' && (
        <Grupo titulo="Transmitancia t(x, y) en [−1, 1]²">
          <Atajos opciones={ABERTURAS.map((a) => ({ t: a.t, activo: s.abertura === a.f, onClick: () => set({ abertura: a.f }) }))} />
          <Expresion etiqueta="t =" valor={s.abertura} variables={['x', 'y']} onChange={(abertura) => set({ abertura })} />
          {p && 'error' in p && <p className="aviso">{p.error}</p>}
          <Rango etiqueta="zoom del patrón" valor={s.zoom} min={0.1} max={1} paso={0.01} onChange={(zoom) => set({ zoom })} />
          <Interruptor activo={s.log} onChange={(log) => set({ log })}>Escala logarítmica</Interruptor>
        </Grupo>
      )}
      {s.modo === 'pelicula' && (
        <Grupo titulo="Aire | película | sustrato">
          <Atajos opciones={[{ t: 'Antirreflejante MgF₂', onClick: () => set({ nf: 1.38, ns: 1.52, e: 100 }) }, { t: 'Pompa de jabón', onClick: () => set({ nf: 1.33, ns: 1, e: 350 }) }, { t: 'λ/4 ideal', onClick: () => set({ nf: Math.sqrt(1.52), ns: 1.52, e: 550 / (4 * Math.sqrt(1.52)) }) }]} />
          <Rango etiqueta="n de la película" valor={s.nf} min={1} max={2.5} paso={0.01} onChange={(nf) => set({ nf })} />
          <Rango etiqueta="n del sustrato" valor={s.ns} min={1} max={2.5} paso={0.01} onChange={(ns) => set({ ns })} />
          <Rango etiqueta="espesor (nm)" valor={s.e} min={0} max={1200} paso={1} formato={(v) => v.toFixed(0)} onChange={(e) => set({ e })} />
        </Grupo>
      )}
      {s.modo === 'michelson' && (
        <Grupo titulo="Interferómetro">
          <Rango etiqueta="diferencia de brazos d (μm)" valor={s.dm} min={0} max={60} paso={0.01} onChange={(dm) => set({ dm })} />
        </Grupo>
      )}
      <Resultado />
    </>
  )
}

const tono = (nm: number, I: number): [number, number, number] => {
  const [r, g, b] = colorLongitud(nm)
  const k = Math.max(0, Math.min(1, I))
  return [r * k, g * k, b * k]
}

/* ── rendijas ── */

function dibujarRendijas(g: Pintor2D, s: EstadoDifraccion) {
  const lam = s.lambda / 1000
  const smax = Math.min(1, (2.5 * lam) / s.a)
  // aberturas
  g.region(0, 0, 1, 0.16)
  const ancho = Math.max(s.a, (s.N - 1) * s.d + s.a) * 0.6 + s.a
  g.ventana = { x: [-ancho, ancho], y: [-1, 1] }
  g.rellenar([[-ancho, -1], [ancho, -1], [ancho, 1], [-ancho, 1]], g.color('--ink-soft'), 0.35)
  for (let j = 0; j < s.N; j++) {
    const c = (j - (s.N - 1) / 2) * s.d
    g.rellenar([[c - s.a / 2, -0.7], [c + s.a / 2, -0.7], [c + s.a / 2, 0.7], [c - s.a / 2, 0.7]], g.color('--ground'), 1)
  }
  g.texto(`${s.N} × ${s.a.toFixed(1)} μm${s.N > 1 ? `, periodo ${s.d.toFixed(1)} μm` : ''}`, -ancho, 0.85, g.color('--ink-soft'), { dx: 8 })
  g.finRegion()
  // curva de intensidad
  g.region(0, 0.16, 1, 0.64)
  g.ventana = { x: [-smax, smax], y: [-0.05, 1.12] }
  g.ejes({ etiquetaX: 'sin θ', etiquetaY: 'I/I₀' })
  const I = (x: number) => intensidadRendijas(s.N, s.a, s.d, lam, x)
  const envolvente = (x: number) => {
    const u = (Math.PI * s.a * x) / lam
    return Math.abs(u) < 1e-12 ? 1 : (Math.sin(u) / u) ** 2
  }
  g.funcion(envolvente, g.color('--ink-soft'), 1.2, 1200)
  g.funcion(I, g.color('--accent'), 1.8, 3000)
  if (s.N > 1)
    for (let m = -Math.floor(s.d / lam); m <= Math.floor(s.d / lam); m++) {
      const x = (m * lam) / s.d
      if (Math.abs(x) > smax || Math.abs(m) > 5) continue
      g.texto(`m=${m}`, x, 1.06, g.color('--pos'), { alinea: 'center' })
    }
  g.finRegion()
  // pantalla
  g.region(0, 0.8, 1, 0.2)
  g.ventana = { x: [-smax, smax], y: [0, 1] }
  const nx = 900
  g.mapa(nx, 1, (i) => tono(s.lambda, Math.sqrt(I(-smax + (2 * smax * (i + 0.5)) / nx))), [-smax, smax, 0, 1])
  g.finRegion()
}

/* ── abertura por FFT ── */

function dibujarAbertura(g: Pintor2D, s: EstadoDifraccion) {
  const p = patron(s)
  g.ventana = { x: [-1.05, 3.25], y: [-1.15, 1.15] }
  g.igualarEscala()
  if ('error' in p) return
  g.mapa(n, n, (i, j) => {
    const v = p.t[j * n + i]
    return [v, v, v]
  }, [-1, 1, -1, 1], false)
  g.texto('abertura', -1, 1.1, g.color('--ink-soft'))
  // patrón: la ventana central del espectro (zoom) en [1.2, 3.2]²
  const m = Math.max(8, Math.round((n * s.zoom) / 2) * 2)
  const o = (n - m) / 2
  const val = (i: number, j: number) => {
    const v = p.I[(o + j) * n + (o + i)]
    return s.log ? Math.max(0, 1 + Math.log10(Math.max(v, 1e-12)) / 4) : Math.sqrt(v)
  }
  g.mapa(m, m, (i, j) => tono(s.lambda, val(i, j)), [1.2, 3.2, -1, 1], m > 96)
  g.texto(`Fraunhofer |F{t}|²${s.log ? ' (4 décadas)' : ''}`, 1.2, 1.1, g.color('--ink-soft'))
}

/* ── película delgada ── */

function colorReflejado(nf: number, ns: number, e: number): [number, number, number] {
  let r = 0
  let gg = 0
  let b = 0
  let nr = 0
  let ng = 0
  let nb = 0
  for (let l = 380; l <= 780; l += 5) {
    const R = reflectanciaMatriz(1, nf, ns, e, l)
    const [cr, cg, cb] = colorLongitud(l)
    r += R * cr
    gg += R * cg
    b += R * cb
    nr += cr
    ng += cg
    nb += cb
  }
  return [r / nr, gg / ng, b / nb]
}

function dibujarPelicula(g: Pintor2D, s: EstadoDifraccion) {
  g.region(0, 0, 1, 0.72)
  const Rmax = Math.max(0.1, ...Array.from({ length: 81 }, (_, i) => reflectanciaMatriz(1, s.nf, s.ns, s.e, 380 + 5 * i)))
  g.ventana = { x: [370, 790], y: [-0.02 * Rmax, 1.15 * Rmax] }
  g.ejes({ etiquetaX: 'λ (nm)', etiquetaY: 'R' })
  for (let l = 380; l < 780; l += 4) g.rellenar([[l, 0], [l + 4, 0], [l + 4, reflectanciaMatriz(1, s.nf, s.ns, s.e, l + 2)], [l, reflectanciaMatriz(1, s.nf, s.ns, s.e, l + 2)]], `rgb(${colorLongitud(l + 2).map((c) => Math.round(c * 255)).join(',')})`, 0.35)
  g.funcion((l) => reflectanciaMatriz(1, s.nf, s.ns, s.e, l), g.color('--ink'), 2)
  g.funcion(() => ((1 - s.ns) / (1 + s.ns)) ** 2, g.color('--ink-soft'), 1)
  g.finRegion()
  // colores de la película según el espesor, con una marca en el actual
  g.region(0, 0.76, 1, 0.24)
  g.ventana = { x: [0, 1200], y: [0, 1] }
  // la reflectancia de una capa es de pocos %: los colores se normalizan al más brillante de la tira
  const tira = Array.from({ length: 300 }, (_, i) => colorReflejado(s.nf, s.ns, (1200 * (i + 0.5)) / 300))
  const brillo = Math.max(1e-12, ...tira.flat())
  g.mapa(300, 1, (i) => tira[i].map((c) => c / brillo) as [number, number, number], [0, 1200, 0, 0.72])
  g.curva([[s.e, 0], [s.e, 0.8]], g.color('--ink'), 2)
  g.texto('color reflejado según el espesor: 0', 0, 0.88, g.color('--ink-soft'), { dx: 4 })
  g.texto('1200 nm', 1200, 0.88, g.color('--ink-soft'), { alinea: 'right', dx: -4 })
  g.finRegion()
}

/* ── Michelson ── */

const THMAX = 0.25

function dibujarMichelson(g: Pintor2D, s: EstadoDifraccion) {
  g.ventana = { x: [-1.1, 2.6], y: [-1.1, 1.1] }
  g.igualarEscala()
  const lam = s.lambda / 1000
  const m = 300
  g.mapa(m, m, (i, j) => {
    const x = -1 + (2 * (i + 0.5)) / m
    const y = -1 + (2 * (j + 0.5)) / m
    const r = Math.hypot(x, y)
    return r > 1 ? [0, 0, 0] : tono(s.lambda, intensidadMichelson(s.dm, lam, r * THMAX))
  }, [-1, 1, -1, 1])
  // perfil radial
  g.curva([[1.25, 0], [1.25, 1]], g.color('--ink-soft'), 0.8)
  const pts: Array<[number, number]> = []
  for (let k = 0; k <= 400; k++) {
    const r = k / 400
    pts.push([1.25 + 1.2 * intensidadMichelson(s.dm, lam, r * THMAX), r])
  }
  g.curva(pts, g.color('--accent'), 1.5)
  for (const t of anillosOscuros(s.dm, lam, THMAX)) {
    g.punto(1.25, t / THMAX, g.color('--pos'), 2.5)
    g.curva([[0, t / THMAX], [1.25, t / THMAX]], g.color('--pos'), 0.6, true)
  }
  g.texto('I(θ), del centro al borde', 1.25, 1.05, g.color('--ink-soft'))
}

const VISTAS: Record<Modo, Vista<EstadoDifraccion>> = {
  rendijas: { tipo: '2d', clave: 'rendijas', navegable: false, dibujar: (g, st) => dibujarRendijas(g, st) },
  abertura: { tipo: '2d', clave: 'abertura', navegable: false, dibujar: (g, st) => dibujarAbertura(g, st) },
  pelicula: { tipo: '2d', clave: 'pelicula', navegable: false, dibujar: (g, st) => dibujarPelicula(g, st) },
  michelson: { tipo: '2d', clave: 'michelson', navegable: false, dibujar: (g, st) => dibujarMichelson(g, st) },
}

const grados = (x: number) => `${((x * 180) / Math.PI).toFixed(3)}°`

function lecturas(s: EstadoDifraccion): Array<[string, string]> {
  const lam = s.lambda / 1000
  if (s.modo === 'rendijas') {
    const filas: Array<[string, string]> = [['Primer cero de la rendija: sin θ = λ/a', (lam / s.a <= 1 ? grados(Math.asin(lam / s.a)) : 'no hay (a < λ)')]]
    if (s.N > 1) {
      filas.push(['Máximos principales: d sin θ = mλ', `hasta |m| = ${Math.floor(s.d / lam)}`])
      filas.push(['Orden 1', lam / s.d <= 1 ? grados(Math.asin(lam / s.d)) : '—'])
      filas.push(['Máximos secundarios entre principales', String(s.N - 2)])
      filas.push(['Poder de resolución (orden 1) λ/Δλ = N', String(s.N)])
      if (Math.abs(s.d / s.a - Math.round(s.d / s.a)) < 1e-9) filas.push(['Órdenes perdidos', `m = ±${Math.round(s.d / s.a)}, ±${2 * Math.round(s.d / s.a)}… (caen en ceros de la rendija)`])
    }
    return filas
  }
  if (s.modo === 'abertura') {
    const p = patron(s)
    if ('error' in p) return [['No se puede', p.error]]
    const area = p.t.reduce((a, v) => a + v, 0) * (2 / n) ** 2
    return [['Área que transmite', area.toFixed(5)], ['Rejilla', `${n} × ${n}, FFT 2D`], ['Disco de diámetro D: primer anillo oscuro', `sin θ = ${(J11 / Math.PI).toFixed(5)} λ/D`]]
  }
  if (s.modo === 'pelicula') {
    const R0 = ((1 - s.ns) / (1 + s.ns)) ** 2
    return [
      ['R en 550 nm', reflectanciaMatriz(1, s.nf, s.ns, s.e, 550).toFixed(6)],
      ['R del sustrato desnudo', R0.toFixed(6)],
      ['Espesor λ/4 para 550 nm', `${(550 / (4 * s.nf)).toFixed(2)} nm`],
      ['Índice ideal antirreflejante √n_s', Math.sqrt(s.ns).toFixed(4)],
    ]
  }
  const an = anillosOscuros(s.dm, lam, THMAX)
  return [
    ['Orden en el centro 2d/λ', ((2 * s.dm) / lam).toFixed(3)],
    ['Anillos oscuros visibles', String(an.length)],
    ['Primer anillo oscuro', an.length ? grados(an[0]) : '—'],
    ['Al mover un espejo λ/2 entra/sale', 'un anillo'],
  ]
}

export default definir<EstadoDifraccion>({
  id: 'difraccion',
  area: 'fisica',
  resumen: 'Óptica ondulatoria: rendijas y redes, difracción de una abertura escrita por FFT 2D, películas delgadas y Michelson',
  corto: 'Óptica ondulatoria',
  titulo: 'Óptica <i>ondulatoria</i>',
  entradilla: 'Interferencia y difracción: de Young a la red, la figura de Fraunhofer de cualquier abertura y los colores de una capa fina.',
  inicial: { modo: 'rendijas', lambda: 550, N: 2, a: 2, d: 8, abertura: ABERTURAS[0].f, zoom: 0.5, log: true, nf: 1.38, ns: 1.52, e: 100, dm: 12 },
  Panel,
  menu: (s) => ({
    ejemplos: ABERTURAS.map((a) => ({ t: `Abertura · ${a.t}`, tipo: 'radio' as const, activo: s.modo === 'abertura' && s.abertura === a.f, hacer: () => ({ modo: 'abertura' as Modo, abertura: a.f }) })),
    acciones: [
      radios<EstadoDifraccion, Modo>('Experimento', [{ v: 'rendijas', t: 'Rendijas y redes' }, { v: 'abertura', t: 'Abertura (Fraunhofer por FFT)' }, { v: 'pelicula', t: 'Película delgada' }, { v: 'michelson', t: 'Interferómetro de Michelson' }], s.modo, (modo) => ({ modo })),
      radios<EstadoDifraccion, number>('Rendijas N', [1, 2, 3, 5, 10, 20].map((v) => ({ v, t: String(v) })), s.N, (N) => ({ N, modo: 'rendijas' })),
      casilla<EstadoDifraccion>('Intensidad en escala logarítmica', s.log, (log) => ({ log })),
    ],
  }),
  resultadoEnPanel: true,
  rotulo: (s) => ({ nombre: { rendijas: `${s.N} rendija${s.N > 1 ? 's' : ''}`, abertura: 'Fraunhofer por FFT', pelicula: 'Película delgada', michelson: 'Michelson' }[s.modo], apunte: s.modo === 'pelicula' ? '' : `λ = ${s.lambda.toFixed(0)} nm` }),
  formula: (s) =>
    s.modo === 'rendijas'
      ? [String.raw`I=I_0\,\operatorname{sinc}^2\!\frac{a\sin\theta}{\lambda}\left[\frac{\sin(N\pi d\sin\theta/\lambda)}{N\sin(\pi d\sin\theta/\lambda)}\right]^2`, String.raw`\operatorname{sinc}x=\frac{\sin\pi x}{\pi x}`]
      : s.modo === 'abertura'
        ? [String.raw`I(f_x,f_y)\propto\left|\iint t(x,y)\,e^{-2\pi i(f_xx+f_yy)}\,dx\,dy\right|^2`, String.raw`\text{disco: }\left[\frac{2J_1(u)}{u}\right]^2,\ u=\frac{\pi D\sin\theta}{\lambda}`]
        : s.modo === 'pelicula'
          ? [String.raw`r=\frac{r_1+r_2e^{2i\beta}}{1+r_1r_2e^{2i\beta}},\qquad \beta=\frac{2\pi n_f e}{\lambda}`]
          : [String.raw`I=I_0\cos^2\!\left(\frac{2\pi d\cos\theta}{\lambda}\right)`, String.raw`\text{oscuros: }2d\cos\theta=\left(m+\tfrac12\right)\lambda`],
  lecturas,
  leyenda: (s) =>
    s.modo === 'rendijas' ? (
      <>
        <Muestra color="var(--accent)">intensidad</Muestra>
        <Muestra color="var(--ink-soft)">envolvente de una rendija</Muestra>
        <Muestra color="var(--pos)">órdenes de la red</Muestra>
      </>
    ) : s.modo === 'pelicula' ? (
      <>
        <Muestra color="var(--ink)">R(λ)</Muestra>
        <Muestra color="var(--ink-soft)">sustrato sin capa</Muestra>
      </>
    ) : s.modo === 'michelson' ? (
      <>
        <Muestra color="var(--accent)">perfil</Muestra>
        <Muestra color="var(--pos)">anillos oscuros (fórmula)</Muestra>
      </>
    ) : null,
  comparaciones: [{ t: 'Young frente a red de 8', a: { modo: 'rendijas', N: 2 }, b: { modo: 'rendijas', N: 8 } }],
  vista: (s) => VISTAS[s.modo],
})
