import { definir, type PropsPanel } from '../../nucleo/tipos'
import { capaFija, capaVer, radios } from '../../nucleo/menu'
import { Expresion, Grupo, Interruptor, Muestra, Nota, Rango, Segmentado } from '../../nucleo/controles'
import { compilarSuave } from '../../lib/expresion'
import { factorial, hermite, legendreP } from '../../lib/especiales'

type Base = 'fourier' | 'legendre' | 'chebyshev' | 'hermite'
type Objetivo = 'escalon' | 'valorAbs' | 'diente' | 'gauss' | 'propia'

interface S {
  base: Base
  objetivo: Objetivo
  expr: string
  N: number
  verTerminos: boolean
  verError: boolean
  /** Punto de lectura: f(x₀), S_N(x₀) y el error ahí. */
  x0: number
}

const DOMINIO: Record<Base, [number, number]> = {
  fourier: [-Math.PI, Math.PI],
  legendre: [-1, 1],
  chebyshev: [-1, 1],
  hermite: [-4, 4],
}

function objetivo(s: S): ((x: number) => number) | null {
  const [a, b] = DOMINIO[s.base]
  const L = b - a
  switch (s.objetivo) {
    case 'escalon':
      return (x) => (x < (a + b) / 2 ? -1 : 1)
    case 'valorAbs':
      return (x) => (2 * Math.abs(x - (a + b) / 2)) / (L / 2) - 1
    case 'diente':
      return (x) => (2 * (x - a)) / L - 1
    case 'gauss':
      return (x) => Math.exp(-((x - (a + b) / 2) ** 2) / (2 * (L / 12) ** 2))
    default:
      return compilarSuave(s.expr, ['x']).f
  }
}

/** n-ésima función de la base, ya ortonormal respecto de su peso. */
function base(s: S, n: number): (x: number) => number {
  switch (s.base) {
    case 'fourier': {
      if (n === 0) return () => 1 / Math.sqrt(2 * Math.PI)
      const k = Math.ceil(n / 2)
      return n % 2 === 1 ? (x) => Math.cos(k * x) / Math.sqrt(Math.PI) : (x) => Math.sin(k * x) / Math.sqrt(Math.PI)
    }
    case 'legendre':
      return (x) => legendreP(n, x) * Math.sqrt((2 * n + 1) / 2)
    case 'chebyshev':
      return (x) => {
        const th = Math.acos(Math.max(-1, Math.min(1, x)))
        return Math.cos(n * th) * (n === 0 ? Math.sqrt(1 / Math.PI) : Math.sqrt(2 / Math.PI))
      }
    default:
      return (x) => hermite(n, x) / Math.sqrt(Math.pow(2, n) * factorial(n) * Math.sqrt(Math.PI))
  }
}

const peso = (s: S) => (s.base === 'hermite' ? (x: number) => Math.exp(-x * x) : s.base === 'chebyshev' ? (x: number) => 1 / Math.sqrt(Math.max(1e-9, 1 - x * x)) : () => 1)

const memo = new Map<string, number[]>()
/** x₀ dentro del intervalo de la base elegida (cambiar de base puede dejarlo fuera). */
function enDominio(s: S) {
  const [a, b] = DOMINIO[s.base]
  return Math.max(a, Math.min(b, s.x0))
}

function coeficientes(s: S): number[] {
  const clave = `${s.base}|${s.objetivo}|${s.expr}|${s.N}`
  const guardado = memo.get(clave)
  if (guardado) return guardado
  const f = objetivo(s)
  if (!f) return []
  const [a, b] = DOMINIO[s.base]
  const w = peso(s)
  const M = 4000
  const out: number[] = []
  for (let n = 0; n <= s.N; n++) {
    const fi = base(s, n)
    let acc = 0
    // punto medio: sin él se pierde medio intervalo en cada extremo y la
    // norma sale sesgada en ~1/M, que se nota al comprobar Parseval
    if (s.base === 'chebyshev') {
      // sustitución x = cos θ: el peso singular desaparece
      for (let i = 0; i < M; i++) {
        const th = (Math.PI * (i + 0.5)) / M
        acc += f(Math.cos(th)) * fi(Math.cos(th))
      }
      acc = (acc * Math.PI) / M
    } else {
      for (let i = 0; i < M; i++) {
        const x = a + ((b - a) * (i + 0.5)) / M
        acc += f(x) * fi(x) * w(x)
      }
      acc = (acc * (b - a)) / M
    }
    out.push(acc)
  }
  if (memo.size > 40) memo.clear()
  memo.set(clave, out)
  return out
}

function Panel({ s, set }: PropsPanel<S>) {
  return (
    <>
      <Grupo titulo="Base ortonormal">
        <Segmentado
         
          valor={s.base}
          opciones={[
            { v: 'fourier', t: 'Fourier' },
            { v: 'legendre', t: 'Legendre' },
            { v: 'chebyshev', t: 'Chebyshev' },
            { v: 'hermite', t: 'Hermite' },
          ]}
          onChange={(b) => set({ base: b })}
        />
        <Nota>
          Dominio [{DOMINIO[s.base][0].toFixed(2)}, {DOMINIO[s.base][1].toFixed(2)}] con el peso propio de la base.
        </Nota>
      </Grupo>

      <Grupo titulo="Función a aproximar">
        <Segmentado
         
          valor={s.objetivo}
          opciones={[
            { v: 'escalon', t: 'Escalón' },
            { v: 'diente', t: 'Diente' },
            { v: 'valorAbs', t: '|x|' },
            { v: 'propia', t: 'La mía' },
          ]}
          onChange={(o) => set({ objetivo: o })}
        />
        {s.objetivo === 'propia' && (
          <Expresion
            etiqueta="f(x) ="
            valor={s.expr}
            variables={['x']}
            onChange={(expr: string) => set({ expr })}
          />
        )}
      </Grupo>

      <Grupo titulo="Aproximación">
        <Rango
          etiqueta="Términos N"
          valor={s.N}
          min={0}
          max={60}
          paso={1}
          formato={(v) => `${v}`}
          onChange={(N) => set({ N })}
        />
        <div className="interruptores">
          <Interruptor activo={s.verTerminos} onChange={(verTerminos) => set({ verTerminos })}>
            Términos sueltos
          </Interruptor>
          <Interruptor activo={s.verError} onChange={(verError) => set({ verError })}>
            Error
          </Interruptor>
        </div>
      </Grupo>
    </>
  )
}

export default definir<S>({
  id: 'hilbert',
  area: 'algebra',
  resumen: 'Bases de Hilbert y aproximación',
  corto: 'Bases de Hilbert',
  titulo: 'Bases de <i>Hilbert</i>',
  entradilla: 'La serie es la proyección sobre los primeros N vectores de una base ortonormal.',
  inicial: { base: 'fourier', objetivo: 'escalon', expr: 'exp(-x*x)', N: 9, verTerminos: false, verError: true, x0: 0.5 },
  Panel,
  capas: (s) => [
    capaFija<S>('f', 'f (la que se aproxima)', '--ink-soft'),
    capaFija<S>('SN', `Suma parcial S_${s.N} f`, '--accent'),
    capaVer(s, 'verError', 'Error f − S_N', '--pos'),
    capaVer(s, 'verTerminos', 'Términos cₙ φₙ', '--neg'),
  ],
  menu: (s) => ({
    acciones: [
      radios<S, Base>('Base', [{ v: 'fourier', t: 'Fourier' }, { v: 'legendre', t: 'Legendre' }, { v: 'chebyshev', t: 'Chebyshev' }, { v: 'hermite', t: 'Hermite' }], s.base, (base) => ({ base })),
      radios<S, Objetivo>('Función', [{ v: 'escalon', t: 'Escalón' }, { v: 'diente', t: 'Diente de sierra' }, { v: 'valorAbs', t: '|x|' }, { v: 'propia', t: 'La mía' }], s.objetivo, (objetivo) => ({ objetivo })),
      radios<S, number>('Términos N', [1, 2, 3, 5, 8, 12, 20, 30].map((v) => ({ v, t: String(v) })), s.N, (N) => ({ N })),
    ],
  }),
  rotulo: (s) => ({
    nombre: { fourier: 'Serie de Fourier', legendre: 'Serie de Legendre', chebyshev: 'Serie de Chebyshev', hermite: 'Serie de Hermite' }[s.base],
    apunte: `proyección sobre ${s.N + 1} vectores`,
  }),
  formula: (s) => [
    String.raw`S_N f=\sum_{n=0}^{N}\langle f,\varphi_n\rangle\,\varphi_n`,
    String.raw`\langle f,g\rangle=\int f\,g\,w\,dx`,
    s.base === 'fourier'
      ? String.raw`\varphi_0=\tfrac{1}{\sqrt{2\pi}},\ \ \varphi_{2k-1}=\tfrac{\cos kx}{\sqrt\pi},\ \ \varphi_{2k}=\tfrac{\sin kx}{\sqrt\pi}`
      : s.base === 'legendre'
        ? String.raw`\varphi_n=\sqrt{\tfrac{2n+1}{2}}\,P_n(x),\qquad w=1`
        : s.base === 'chebyshev'
          ? String.raw`\varphi_n\propto T_n(x),\qquad w=\tfrac{1}{\sqrt{1-x^2}}`
          : String.raw`\varphi_n=\tfrac{H_n(x)}{\sqrt{2^n n!\sqrt\pi}},\qquad w=e^{-x^2}`,
    String.raw`\|f\|^2=\sum_{n\ge0}|\langle f,\varphi_n\rangle|^2 \quad(\text{Parseval})`,
  ],
  lecturas: (s) => {
    const c = coeficientes(s)
    const f = objetivo(s)
    if (!f || !c.length) return [['Estado', 'expresión no válida']]
    const x0 = enDominio(s)
    const Sx = c.reduce((acc, cn, n) => acc + cn * base(s, n)(x0), 0)
    const puntual: Array<[string, string]> = [
      ['x₀', x0.toFixed(3)],
      ['f(x₀)', f(x0).toFixed(6)],
      [`S_${s.N}(x₀)`, Sx.toFixed(6)],
      ['|f − S| en x₀', Math.abs(f(x0) - Sx).toExponential(3)],
    ]
    const [a, b] = DOMINIO[s.base]
    const w = peso(s)
    const M = 2000
    let nf = 0
    let err = 0
    for (let i = 0; i < M; i++) {
      const x =
        s.base === 'chebyshev'
          ? Math.cos((Math.PI * (i + 0.5)) / M)
          : a + ((b - a) * (i + 0.5)) / M
      const dx = s.base === 'chebyshev' ? Math.PI / M : (b - a) / M
      const pesoX = s.base === 'chebyshev' ? 1 : w(x)
      const v = f(x)
      const S = c.reduce((acc, cn, n) => acc + cn * base(s, n)(x), 0)
      nf += v * v * pesoX * dx
      err += (v - S) ** 2 * pesoX * dx
    }
    const parseval = c.reduce((acc, cn) => acc + cn * cn, 0)
    return [
      ...puntual,
      ['Términos', `${s.N + 1}`],
      ['‖f‖²', nf.toFixed(6)],
      ['Σ|cₙ|² (Parseval)', parseval.toFixed(6)],
      ['Resto ‖f‖² − Σ|cₙ|²', (nf - parseval).toFixed(6)],
      ['‖f − S_N‖', Math.sqrt(Math.max(0, err)).toFixed(6)],
      ['c₀', c[0].toFixed(5)],
      ['c₁', c[1]?.toFixed(5) ?? '—'],
      ['c_N', c[c.length - 1].toFixed(5)],
    ]
  },
  leyenda: (s) => (
    <>
      <Muestra color="var(--ink-soft)">f</Muestra>
      <Muestra color="var(--accent)">S_N f</Muestra>
      {s.verError && <Muestra color="var(--pos)">f − S_N</Muestra>}
      {s.verTerminos && <Muestra color="var(--neg)">cₙ φₙ</Muestra>}
    </>
  ),
  vista: {
    tipo: '2d',
    navegable: false,
    interaccion: {
      asas(s) {
        const c = coeficientes(s)
        const x0 = enDominio(s)
        const y = c.reduce((acc, cn, n) => acc + cn * base(s, n)(x0), 0)
        return Number.isFinite(y) ? [{ id: 'x0', p: [x0, Math.max(-1.7, Math.min(1.7, y))], color: '--ink', nombre: 'x₀', eje: 'x' as const }] : []
      },
      mover(_id, t, s) {
        const [a, b] = DOMINIO[s.base]
        return { x0: Math.round(Math.max(a, Math.min(b, t.p[0])) * 1000) / 1000 }
      },
    },
    dibujar(g, s) {
      const [a, b] = DOMINIO[s.base]
      g.ventana = { x: [a - 0.1 * (b - a), b + 0.1 * (b - a)], y: [-1.8, 1.8] }
      g.ejes({ etiquetaX: 'x', etiquetaY: 'f' })
      const f = objetivo(s)
      if (!f) {
        g.texto('la expresión no es válida', a, 1.6, g.color('--pos'))
        return
      }
      const c = coeficientes(s)
      const fis = c.map((_, n) => base(s, n))

      const muestreo = (h: (x: number) => number, N = 900): Array<[number, number]> => {
        const pts: Array<[number, number]> = []
        for (let i = 0; i <= N; i++) {
          const x = a + ((b - a) * i) / N
          const y = h(x)
          if (Number.isFinite(y)) pts.push([x, y])
        }
        return pts
      }

      if (s.verTerminos) {
        const neg = g.color('--neg')
        c.forEach((cn, n) => {
          if (Math.abs(cn) < 1e-6) return
          g.curva(muestreo((x) => cn * fis[n](x), 400), neg, 1)
        })
      }

      g.curva(muestreo(f, 1400), g.color('--ink-soft'), 2)
      const S = (x: number) => c.reduce((acc, cn, n) => acc + cn * fis[n](x), 0)
      g.curva(muestreo(S, 1400), g.color('--accent'), 2.4)
      if (s.verError) g.curva(muestreo((x) => f(x) - S(x), 1400), g.color('--pos'), 1.4)
    },
  },
})
