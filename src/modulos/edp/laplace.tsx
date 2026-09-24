import { definir, type PropsPanel } from '../../nucleo/tipos'
import { accion, capaFija, capaVer, coords, radios } from '../../nucleo/menu'
import { Expresion, Grupo, Interruptor, Muestra, Nota, Rango, Segmentado, Resultado } from '../../nucleo/controles'
import { compilarSuave } from '../../lib/expresion'
import { divergente } from '../../render/tema'

type Dominio = 'rectangulo' | 'disco'
type Dato = 'seno' | 'escalon' | 'pulso' | 'lineal' | 'propia'

export interface EstadoLaplace {
  dominio: Dominio
  dato: Dato
  modo: number
  terminos: number
  expr: string
  alambre: boolean
  /** Sonda (x, y) sobre el dominio: u ahí y su media en una circunferencia alrededor. */
  sonda: number[]
}

const NU = 110
const NV = 110

/** Dato de contorno: f(x) en el lado de arriba, g(θ) en la circunferencia. */
export function datoDeContorno(s: EstadoLaplace): (u: number) => number {
  const per = s.dominio === 'disco'
  switch (s.dato) {
    case 'seno':
      return (u) => Math.sin(s.modo * Math.PI * (per ? u / Math.PI : u))
    case 'escalon':
      return (u) => (per ? (Math.cos(u) > 0 ? 1 : -1) : u < 0.5 ? 1 : -1)
    case 'pulso': {
      const c = per ? Math.PI / 2 : 0.5
      const w = per ? 0.3 : 0.06
      return (u) => Math.exp(-((u - c) ** 2) / (2 * w * w))
    }
    case 'propia': {
      const f = compilarSuave(s.expr, ['t']).f
      return f ?? (() => 0)
    }
    default:
      return (u) => (per ? Math.cos(u) : 2 * u - 1)
  }
}

const memo = new Map<string, any>()
function coeficientes(s: EstadoLaplace) {
  const clave = `${s.dominio}|${s.dato}|${s.modo}|${s.expr}|${s.terminos}`
  const guardado = memo.get(clave)
  if (guardado) return guardado
  const f = datoDeContorno(s)
  const N = 3000
  let res: any
  if (s.dominio === 'rectangulo') {
    const A: number[] = []
    for (let n = 1; n <= s.terminos; n++) {
      let acc = 0
      for (let i = 1; i < N; i++) acc += f(i / N) * Math.sin(n * Math.PI * (i / N))
      A.push((2 * acc) / N)
    }
    res = { A }
  } else {
    const a: number[] = []
    const b: number[] = []
    for (let n = 0; n <= s.terminos; n++) {
      let ca = 0
      let cb = 0
      for (let i = 0; i < N; i++) {
        const th = (2 * Math.PI * i) / N
        ca += f(th) * Math.cos(n * th)
        cb += f(th) * Math.sin(n * th)
      }
      a.push((2 * ca) / N)
      b.push((2 * cb) / N)
    }
    res = { a, b }
  }
  if (memo.size > 40) memo.clear()
  memo.set(clave, res)
  return res
}

/** u en coordenadas del lienzo: el cuadrado es [−1, 1]², el disco el unidad. */
export function uEn(s: EstadoLaplace, x: number, y: number): number {
  const u = solucion(s)
  return s.dominio === 'rectangulo' ? u((x + 1) / 2, (y + 1) / 2) : u(Math.hypot(x, y), Math.atan2(y, x))
}

/** Radio de la circunferencia de la media: cabe dentro del dominio. */
function radioMedia(s: EstadoLaplace) {
  const [x, y] = s.sonda
  const hueco = s.dominio === 'rectangulo' ? Math.min(1 - Math.abs(x), 1 - Math.abs(y)) : 1 - Math.hypot(x, y)
  return Math.max(0.02, Math.min(0.3, hueco * 0.8))
}

function mediaEnCircunferencia(s: EstadoLaplace) {
  const [x, y] = s.sonda
  const r = radioMedia(s)
  let m = 0
  for (let k = 0; k < 256; k++) m += uEn(s, x + r * Math.cos((2 * Math.PI * k) / 256), y + r * Math.sin((2 * Math.PI * k) / 256))
  return m / 256
}

/** Máximo de |u|: la superficie se dibuja con altura u/amp·0,4. */
function amplitud(s: EstadoLaplace) {
  const u = solucion(s)
  let amp = 0
  for (let i = 0; i <= 40; i++)
    for (let j = 0; j <= 40; j++) {
      const v = s.dominio === 'rectangulo' ? u(i / 40, j / 40) : u(i / 40, (2 * Math.PI * j) / 40)
      amp = Math.max(amp, Math.abs(v))
    }
  return amp || 1
}

export function solucion(s: EstadoLaplace): (p: number, q: number) => number {
  const c = coeficientes(s)
  if (s.dominio === 'rectangulo') {
    const A = c.A as number[]
    return (x, y) =>
      A.reduce((acc, An, i) => {
        const n = i + 1
        const d = Math.sinh(n * Math.PI)
        // para n grande sinh desborda: se usa la forma estable e^{nπ(y−1)}
        const r = d > 1e100 ? Math.exp(n * Math.PI * (y - 1)) : Math.sinh(n * Math.PI * y) / d
        return acc + An * Math.sin(n * Math.PI * x) * r
      }, 0)
  }
  const a = c.a as number[]
  const b = c.b as number[]
  return (r, th) => {
    let acc = a[0] / 2
    for (let n = 1; n < a.length; n++) acc += Math.pow(r, n) * (a[n] * Math.cos(n * th) + b[n] * Math.sin(n * th))
    return acc
  }
}

function Panel({ s, set }: PropsPanel<EstadoLaplace>) {
  return (
    <>
      <Grupo titulo="Dominio">
        <Segmentado
          valor={s.dominio}
          opciones={[
            { v: 'rectangulo', t: 'Cuadrado' },
            { v: 'disco', t: 'Disco' },
          ]}
          onChange={(dominio) => set({ dominio })}
        />
      </Grupo>

      <Resultado />

      <Grupo titulo="Dato de contorno">
        <Segmentado
          columnas={2}
          valor={s.dato}
          opciones={[
            { v: 'seno', t: 'Armónico' },
            { v: 'escalon', t: 'Escalón' },
            { v: 'pulso', t: 'Pulso' },
            { v: 'lineal', t: 'Lineal' },
            { v: 'propia', t: 'El mío' },
          ]}
          onChange={(dato) => set({ dato })}
        />
        {s.dato === 'propia' && (
          <>
            <Expresion
              etiqueta={s.dominio === 'disco' ? 'g(t) =' : 'f(t) ='}
              valor={s.expr}
              variables={['t']}
              onChange={(expr: string) => set({ expr })}
            />
            <Nota>
              En el disco <b>t es el ángulo θ ∈ [0, 2π]</b>; en el cuadrado, la coordenada{' '}
              <b>x ∈ [0, 1]</b> del lado de arriba. El resto del borde se queda a cero.
            </Nota>
          </>
        )}
        {s.dato === 'seno' && (
          <Rango
            etiqueta="Frecuencia del dato"
            valor={s.modo}
            min={1}
            max={8}
            paso={1}
            formato={(v) => `${v}`}
            onChange={(modo) => set({ modo })}
          />
        )}
        <Rango
          etiqueta="Términos de la serie"
          valor={s.terminos}
          min={1}
          max={80}
          paso={1}
          formato={(v) => `${v}`}
          onChange={(terminos) => set({ terminos })}
        />
        <div className="interruptores">
          <Interruptor activo={s.alambre} onChange={(alambre) => set({ alambre })}>
            Malla
          </Interruptor>
        </div>
      </Grupo>
    </>
  )
}

export default definir<EstadoLaplace>({
  id: 'laplace',
  area: 'edp',
  resumen: 'Laplace: problema de Dirichlet',
  corto: 'Ecuación de Laplace',
  titulo: 'Ecuación de <i>Laplace</i>',
  entradilla: 'Δu = 0 con el valor prescrito en el borde: la solución más lisa que lo cumple.',
  inicial: { dominio: 'disco', dato: 'escalon', modo: 2, terminos: 40, expr: 'cos(3*t)+sin(t)/2', alambre: false, sonda: [0.25, -0.2] },
  Panel,
  capas: (s) => [
    capaFija<EstadoLaplace>('pos', 'u > 0', '--pos'),
    capaFija<EstadoLaplace>('neg', 'u < 0', '--neg'),
    capaFija<EstadoLaplace>('sonda', 'Sonda (propiedad de la media)', '--ink', coords(s.sonda)),
    capaVer(s, 'alambre', 'Malla de alambre', '--ink-soft'),
  ],
  menu: (s) => ({
    acciones: [
      radios<EstadoLaplace, Dominio>('Dominio', [{ v: 'rectangulo', t: 'Cuadrado' }, { v: 'disco', t: 'Disco' }], s.dominio, (dominio) => ({ dominio })),
      radios<EstadoLaplace, Dato>('Dato en el borde', [{ v: 'seno', t: 'Armónico' }, { v: 'escalon', t: 'Escalón' }, { v: 'pulso', t: 'Pulso' }, { v: 'lineal', t: 'Lineal' }, { v: 'propia', t: 'El mío' }], s.dato, (dato) => ({ dato })),
      accion<EstadoLaplace>('Sonda al centro', () => ({ sonda: [0, 0] })),
    ],
  }),
  resultadoEnPanel: true,
  rotulo: (s) => ({
    nombre: s.dominio === 'disco' ? 'Disco unidad' : 'Cuadrado unidad',
    apunte: s.dominio === 'disco' ? 'serie de Poisson' : 'tres lados a cero, dato arriba',
  }),
  formula: (s) =>
    s.dominio === 'disco'
      ? [
          String.raw`u(r,\theta)=\frac{a_0}{2}+\sum_{n\ge1} r^n\big(a_n\cos n\theta+b_n\sin n\theta\big)`,
          String.raw`u(0)=\frac{1}{2\pi}\int_0^{2\pi} g(\theta)\,d\theta`,
        ]
      : [
          String.raw`u(x,y)=\sum_{n\ge1} A_n \sin(n\pi x)\,\frac{\sinh(n\pi y)}{\sinh(n\pi)}`,
          String.raw`A_n=2\int_0^1 f(x)\sin(n\pi x)\,dx`,
        ],
  lecturas: (s) => {
    const u = solucion(s)
    let mn = Infinity
    let mx = -Infinity
    for (let i = 1; i < 60; i++)
      for (let j = 1; j < 60; j++) {
        const v =
          s.dominio === 'rectangulo'
            ? u(i / 60, (j / 60) * 0.98)
            : u((i / 60) * 0.98, (2 * Math.PI * j) / 60)
        mn = Math.min(mn, v)
        mx = Math.max(mx, v)
      }
    const enSonda = uEn(s, s.sonda[0], s.sonda[1])
    const media = mediaEnCircunferencia(s)
    const filas: Array<[string, string]> = [
      ['u en la sonda', enSonda.toFixed(6)],
      [`media en |P − z| = ${radioMedia(s).toFixed(2)}`, media.toFixed(6)],
      ['Mínimo interior', mn.toFixed(4)],
      ['Máximo interior', mx.toFixed(4)],
    ]
    if (s.dominio === 'disco') {
      const c = coeficientes(s)
      filas.push(['u en el centro', (c.a[0] / 2).toFixed(5)])
      filas.push(['Media del borde', (c.a[0] / 2).toFixed(5)])
      filas.push(['a₁', c.a[1]?.toFixed(4) ?? '—'])
      filas.push(['b₁', c.b[1]?.toFixed(4) ?? '—'])
    } else {
      filas.push(['u en el centro', u(0.5, 0.5).toFixed(5)])
      filas.push(['Decaimiento e^(−π)', Math.exp(-Math.PI).toFixed(5)])
    }
    filas.push(['Términos', `${s.terminos}`])
    return filas
  },
  leyenda: () => (
    <>
      <Muestra color="var(--pos)">u &gt; 0</Muestra>
      <Muestra color="var(--neg)">u &lt; 0</Muestra>
      <span>el máximo vive siempre en el borde</span>
    </>
  ),
  vista: {
    tipo: '3d',
    camara: { theta: 0.9, phi: 1.22, r: 3.3 },
    construir(e, s) {
      e.zArriba(true)
      e.ejes(1.2, ['x', 'y', 'u'])
      const u = solucion(s)
      const amp = amplitud(s)
      const A = 0.4
      const sup = e.superficie(NU, NV, { alambre: s.alambre })
      sup.actualizar((i, j) => {
        const p = i / (NU - 1)
        const q = j / (NV - 1)
        if (s.dominio === 'rectangulo') {
          const z = u(p, q) / amp
          return [2 * p - 1, 2 * q - 1, z * A, divergente(z)]
        }
        const th = q * 2 * Math.PI
        const z = u(p, th) / amp
        return [p * Math.cos(th), p * Math.sin(th), z * A, divergente(z)]
      })

      // el dato de contorno, dibujado sobre el borde
      const f = datoDeContorno(s)
      const borde: Array<[number, number, number]> = []
      if (s.dominio === 'disco') {
        for (let i = 0; i <= 240; i++) {
          const th = (2 * Math.PI * i) / 240
          borde.push([Math.cos(th), Math.sin(th), (f(th) / amp) * A])
        }
      } else {
        for (let i = 0; i <= 240; i++) {
          const x = i / 240
          borde.push([2 * x - 1, 1, (f(x) / amp) * A])
        }
      }
      e.linea(borde, e.color('--accent'))

      // la sonda: la circunferencia de la media, levantada sobre la superficie
      const [px, py] = s.sonda
      const rm = radioMedia(s)
      const circ: Array<[number, number, number]> = []
      for (let k = 0; k <= 96; k++) {
        const x = px + rm * Math.cos((2 * Math.PI * k) / 96)
        const y = py + rm * Math.sin((2 * Math.PI * k) / 96)
        circ.push([x, y, (uEn(s, x, y) / amp) * A + 0.004])
      }
      e.linea(circ, e.color('--ink'))
      e.linea([[px, py, 0], [px, py, (uEn(s, px, py) / amp) * A]], e.color('--ink'), 0.6)
    },
    interaccion: {
      asas: (s) => [{ id: 'P', p: [s.sonda[0], s.sonda[1], (uEn(s, s.sonda[0], s.sonda[1]) / amplitud(s)) * 0.4], color: '--ink', nombre: 'P' }],
      mover(_id, t, s) {
        let [x, y] = t.p
        if (s.dominio === 'rectangulo') [x, y] = [Math.max(-0.97, Math.min(0.97, x)), Math.max(-0.97, Math.min(0.97, y))]
        else {
          const r = Math.hypot(x, y)
          if (r > 0.95) [x, y] = [(x * 0.95) / r, (y * 0.95) / r]
        }
        return { sonda: [Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000] }
      },
      pista: 'Arrastra la sonda: u en el centro es la media de u en la circunferencia',
    },
  },
})
