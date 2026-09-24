import { definir, type Asa, type PropsPanel } from '../../nucleo/tipos'
import { accion, capaFija, capaVer, coords } from '../../nucleo/menu'
import { Atajos, Boton, Expresion, Grupo, Interruptor, Muestra, Nota, Rango, Segmentado } from '../../nucleo/controles'
import { compilarSuave } from '../../lib/expresion'
import { contorno } from '../../lib/contorno'
import { mapa, type NombreMapa } from '../../render/tema'

interface S {
  expr: string
  a: number
  b: number
  R: number
  color: NombreMapa
  alambre: boolean
  verTangente: boolean
  verCortes: boolean
  verNivel: boolean
  verGradiente: boolean
  /** Más puntos sobre la superficie principal, cada uno con su plano tangente. */
  puntos: number[][]
  /** Otras superficies dibujadas a la vez, en la misma escala. */
  otras: string[]
}

/** Colores de las superficies extra, en orden. */
const TONOS = ['--neg', '--aux', '--pos', '--accent']
const SUB = '₀₁₂₃₄₅₆₇₈₉'
const sub = (n: number) => String(n).split('').map((d) => SUB[+d]).join('')

type F = (x: number, y: number) => number

const memoEscala = new Map<string, { lo: number; hi: number } | null>()
/**
 * Alturas mínima y máxima de todas las superficies juntas: comparten escala
 * vertical para que se puedan comparar a ojo.
 */
function escala(s: S) {
  const clave = `${s.expr}|${s.otras.join('|')}|${s.R}`
  if (memoEscala.has(clave)) return memoEscala.get(clave)!
  let lo = Infinity
  let hi = -Infinity
  for (const src of [s.expr, ...s.otras]) {
    const { f } = compilarSuave(src, ['x', 'y'])
    if (!f) continue
    for (let i = 0; i <= 60; i++)
      for (let j = 0; j <= 60; j++) {
        const v = f(-s.R + (2 * s.R * i) / 60, -s.R + (2 * s.R * j) / 60)
        if (Number.isFinite(v)) {
          lo = Math.min(lo, v)
          hi = Math.max(hi, v)
        }
      }
  }
  const r = Number.isFinite(lo) ? { lo, hi } : null
  if (memoEscala.size > 40) memoEscala.clear()
  memoEscala.set(clave, r)
  return r
}

function escena(s: S) {
  const { f } = compilarSuave(s.expr, ['x', 'y'])
  const e = escala(s)
  if (!f || !e) return null
  const span = Math.max(1e-6, e.hi - e.lo)
  return {
    f: f as F,
    lo: e.lo,
    span,
    Z: (v: number) => ((v - e.lo) / span) * 1.4 - 0.7,
    X: (v: number) => v / s.R,
  }
}

const recorta = (v: number, R: number) => Math.round(Math.max(-R, Math.min(R, v)) * 100) / 100

function asas(s: S): Asa[] {
  const g = escena(s)
  if (!g) return []
  const en = (a: number, b: number) => [g.X(a), g.X(b), g.Z(g.f(a, b))]
  return [
    { id: 'P', p: en(s.a, s.b), color: '--ink', sobre: 'superficie' },
    ...s.puntos.map((q, i): Asa => ({ id: `Q${i}`, p: en(q[0], q[1]), color: '--accent', sobre: 'superficie' })),
  ]
}

const EJEMPLOS = [
  { t: 'Paraboloide', e: 'x*x+y*y' },
  { t: 'Silla', e: 'x*x-y*y' },
  { t: 'Sombrero', e: 'cos(sqrt(x*x+y*y)*3)/(1+x*x+y*y)' },
  { t: 'Gaussiana', e: 'exp(-(x*x+y*y))' },
  { t: 'Silla del mono', e: 'x^3-3*x*y*y' },
  { t: 'Ondas', e: 'sin(2*x)*cos(2*y)' },
  { t: 'Picos', e: '3*(1-x)^2*exp(-x*x-(y+1)^2)-10*(x/5-x^3-y^5)*exp(-x*x-y*y)-exp(-(x+1)^2-y*y)/3' },
]

const NU = 110

export function derivadas(f: (x: number, y: number) => number, a: number, b: number) {
  const h = 1e-4
  const fx = (f(a + h, b) - f(a - h, b)) / (2 * h)
  const fy = (f(a, b + h) - f(a, b - h)) / (2 * h)
  const fxx = (f(a + h, b) - 2 * f(a, b) + f(a - h, b)) / (h * h)
  const fyy = (f(a, b + h) - 2 * f(a, b) + f(a, b - h)) / (h * h)
  const fxy = (f(a + h, b + h) - f(a + h, b - h) - f(a - h, b + h) + f(a - h, b - h)) / (4 * h * h)
  return { fx, fy, fxx, fyy, fxy }
}

function Panel({ s, set }: PropsPanel<S>) {
  return (
    <>
      <Grupo titulo="Superficie">
        <Expresion etiqueta="z =" valor={s.expr} variables={['x', 'y']} onChange={(expr: string) => set({ expr })} />
        <Atajos opciones={EJEMPLOS.map((e) => ({ t: e.t, activo: s.expr === e.e, onClick: () => set({ expr: e.e }) }))} />
        <Rango etiqueta="Alcance" valor={s.R} min={0.5} max={6} paso={0.1} formato={(v) => `±${v.toFixed(1)}`} onChange={(R) => set({ R })} />
      </Grupo>

      <Grupo titulo="Otras superficies">
        {s.otras.map((src, i) => (
          <div className="fila-quitable" key={i}>
            <span className="punto" style={{ background: `var(${TONOS[i % TONOS.length]})` }} />
            <Expresion
              etiqueta={`z${sub(i + 2)} =`}
              valor={src}
              variables={['x', 'y']}
              onChange={(v: string) => set({ otras: s.otras.map((o, k) => (k === i ? v : o)) })}
            />
            <button type="button" className="quitar-fila" aria-label="Quitar superficie" onClick={() => set({ otras: s.otras.filter((_, k) => k !== i) })}>
              ×
            </button>
          </div>
        ))}
        {s.otras.length < 4 && (
          <div className="interruptores">
            <Boton onClick={() => set({ otras: [...s.otras, s.otras.length ? 'x*y/2' : '-(x*x+y*y)/4'] })}>Añadir superficie</Boton>
          </div>
        )}
        {s.otras.length > 0 && <Nota>Todas comparten escala vertical, así que las alturas se comparan tal cual.</Nota>}
      </Grupo>

      <Grupo titulo="Punto P = (a, b)">
        <Rango etiqueta="a" valor={s.a} min={-s.R} max={s.R} paso={0.02} formato={(v) => v.toFixed(2)} onChange={(a) => set({ a })} />
        <Rango etiqueta="b" valor={s.b} min={-s.R} max={s.R} paso={0.02} formato={(v) => v.toFixed(2)} onChange={(b) => set({ b })} />
        <div className="interruptores">
          <Interruptor activo={s.verCortes} onChange={(verCortes) => set({ verCortes })}>
            Curvas x = a, y = b
          </Interruptor>
          <Interruptor activo={s.verTangente} onChange={(verTangente) => set({ verTangente })}>
            Plano tangente
          </Interruptor>
          <Interruptor activo={s.verGradiente} onChange={(verGradiente) => set({ verGradiente })}>
            Gradiente
          </Interruptor>
        </div>
        {s.puntos.length > 0 && (
          <div className="interruptores">
            <Boton onClick={() => set({ puntos: [] })}>Quitar {s.puntos.length === 1 ? 'el punto extra' : `los ${s.puntos.length} puntos extra`}</Boton>
          </div>
        )}
        <Nota>Arrastra P sobre la superficie. Doble clic en ella pone más puntos, cada uno con su plano tangente.</Nota>
      </Grupo>

      <Grupo titulo="Dibujo">
        <Segmentado
          columnas={3}
          valor={s.color}
          opciones={[
            { v: 'altura' as NombreMapa, t: 'Uniforme' },
            { v: 'arcoiris' as NombreMapa, t: 'Arcoíris' },
            { v: 'divergente' as NombreMapa, t: 'Con signo' },
          ]}
          onChange={(color) => set({ color })}
        />
        <div className="interruptores">
          <Interruptor activo={s.alambre} onChange={(alambre) => set({ alambre })}>
            Malla
          </Interruptor>
          <Interruptor activo={s.verNivel} onChange={(verNivel) => set({ verNivel })}>
            Curvas de nivel
          </Interruptor>
        </div>
      </Grupo>
    </>
  )
}

export default definir<S>({
  id: 'superficies',
  area: 'campos',
  resumen: 'Superficies z = f(x, y) y plano tangente',
  corto: 'Superficies z = f(x, y)',
  titulo: 'Superficies y <i>tangentes</i>',
  entradilla: 'Las dos curvas que pasan por P dan las derivadas parciales; sus tangentes generan el plano.',
  inicial: {
    expr: 'cos(sqrt(x*x+y*y)*3)/(1+x*x+y*y)', a: 1.5, b: 0.8, R: 3, color: 'arcoiris',
    alambre: false, verTangente: true, verCortes: true, verNivel: true, verGradiente: true,
    puntos: [], otras: [],
  },
  Panel,
  capas: (s) => [
    capaFija<S>('sup', `z = ${s.expr}`, '--accent'),
    capaVer(s, 'verTangente', 'Plano tangente', '--accent'),
    capaVer(s, 'verCortes', 'Curvas x = a, y = b', '--pos'),
    capaVer(s, 'verNivel', 'Curvas de nivel', '--ink-soft'),
    capaVer(s, 'verGradiente', '∇f en la base', '--aux'),
    capaVer(s, 'alambre', 'Malla de alambre', '--ink-soft'),
    ...s.otras.map((o, i) => ({ id: `O${i}`, nombre: `z = ${o}`, color: '--aux', quitar: (t: S) => ({ otras: t.otras.filter((_, k) => k !== i) }) })),
    ...s.puntos.map((q, i) => ({ id: `P${i}`, nombre: `Punto ${coords(q)}`, color: '--ink', quitar: (t: S) => ({ puntos: t.puntos.filter((_, k) => k !== i) }) })),
  ],
  menu: (s) => ({
    anadir: [accion<S>('Otra superficie z = g(x, y)', (t) => ({ otras: [...t.otras, 'x*y/2'] }))],
    ejemplos: EJEMPLOS.map((e) => ({ t: e.t, tipo: 'radio' as const, activo: s.expr === e.e, hacer: () => ({ expr: e.e }) })),
    acciones: [
      accion<S>('Punto de tangencia al origen', () => ({ a: 0, b: 0 })),
      accion<S>('Quitar los puntos', () => ({ puntos: [] }), !s.puntos.length),
    ],
  }),
  rotulo: (s) => {
    const { f } = compilarSuave(s.expr, ['x', 'y'])
    if (!f) return { nombre: 'Expresión no válida' }
    const { fx, fy, fxx, fyy, fxy } = derivadas(f, s.a, s.b)
    const H = fxx * fyy - fxy * fxy
    const critico = Math.hypot(fx, fy) < 0.02
    if (!critico) return { nombre: 'P = (a, b, c)', apunte: 'arrastra a y b para moverlo' }
    return {
      nombre: H < 0 ? 'Punto de silla' : fxx > 0 ? 'Mínimo local' : 'Máximo local',
      apunte: `∇f ≈ 0, discriminante ${H.toFixed(3)}`,
    }
  },
  formula: () => [
    String.raw`z = f(a,b)+f_x(a,b)(x-a)+f_y(a,b)(y-b)`,
    String.raw`\nabla f=(f_x,f_y)`,
    String.raw`\text{apunta en la dirección de máxima pendiente}`,
    String.raw`H=f_{xx}f_{yy}-f_{xy}^2`,
  ],
  lecturas: (s) => {
    const { f } = compilarSuave(s.expr, ['x', 'y'])
    if (!f) return [['Estado', 'la expresión no es válida']]
    const c = f(s.a, s.b)
    const { fx, fy, fxx, fyy, fxy } = derivadas(f, s.a, s.b)
    const g = Math.hypot(fx, fy)
    return [
      ['f(a, b)', c.toFixed(5)],
      ['f_x', fx.toFixed(5)],
      ['f_y', fy.toFixed(5)],
      ['‖∇f‖', g.toFixed(5)],
      ['Dirección de subida', g > 1e-6 ? `${((Math.atan2(fy, fx) * 180) / Math.PI).toFixed(1)}°` : '—'],
      ['Pendiente máxima', `${((Math.atan(g) * 180) / Math.PI).toFixed(1)}°`],
      ['f_xx', fxx.toFixed(4)],
      ['f_yy', fyy.toFixed(4)],
      ['f_xy', fxy.toFixed(4)],
      ['Discriminante H', (fxx * fyy - fxy * fxy).toFixed(4)],
    ]
  },
  leyenda: (s) => (
    <>
      <span>color = altura</span>
      {s.verCortes && <Muestra color="var(--pos)">curvas x = a, y = b</Muestra>}
      {s.verTangente && <Muestra color="var(--accent)">plano tangente</Muestra>}
      {s.verGradiente && <Muestra color="var(--aux)">∇f en la base</Muestra>}
      {s.verNivel && <span>curvas de nivel abajo</span>}
      {s.otras.map((_, i) => (
        <Muestra key={i} color={`var(${TONOS[i % TONOS.length]})`}>{`z${sub(i + 2)}`}</Muestra>
      ))}
    </>
  ),
  vista: {
    tipo: '3d',
    pesada: true,
    camara: { theta: 0.85, phi: 1.15, r: 3.6 },
    interaccion: {
      asas,
      mover(id, t, s) {
        const a = recorta(t.p[0] * s.R, s.R)
        const b = recorta(t.p[1] * s.R, s.R)
        if (id === 'P') return { a, b }
        const k = +id.slice(1)
        return { puntos: s.puntos.map((q, i) => (i === k ? [a, b] : q)) }
      },
      anadir: (t, s) =>
        t.uv ? { puntos: [...s.puntos, [recorta(t.p[0] * s.R, s.R), recorta(t.p[1] * s.R, s.R)]] } : undefined,
      quitar: (id, s) => (id === 'P' ? undefined : { puntos: s.puntos.filter((_, i) => i !== +id.slice(1)) }),
      pista: 'Arrastra P sobre la superficie · doble clic en ella: otro punto · doble clic o Supr: quitarlo',
    },
    construir(e, s) {
      e.zArriba(true)
      const { f } = compilarSuave(s.expr, ['x', 'y'])
      if (!f) {
        e.ejes(1.2, ['x', 'y', 'z'], { rejilla: true, infinita: true, paso: 0.4 })
        return
      }
      const R = s.R
      // escala vertical común a todas las superficies, normalizada a ±0.7
      const g = escena(s)
      if (!g) return
      const { lo, span, Z, X } = g
      const base = -0.95
      e.ejes(1.25, ['x', 'y', 'z'], { rejilla: true, infinita: true, paso: 0.4 })

      const col = mapa(s.color)
      const sup = e.superficie(NU, NU, { alambre: s.alambre })
      sup.actualizar((i, j) => {
        const x = -R + (2 * R * i) / (NU - 1)
        const y = -R + (2 * R * j) / (NU - 1)
        const v = f(x, y)
        const u = Number.isFinite(v) ? (v - lo) / span : 0
        return [X(x), X(y), Number.isFinite(v) ? Z(v) : 0, col(u)]
      })
      e.agarre = [sup.malla]

      s.otras.forEach((src, n) => {
        const h = compilarSuave(src, ['x', 'y']).f
        if (!h) return
        const tono = e.color(TONOS[n % TONOS.length])
        const otra = e.superficie(70, 70, { opacidad: 0.55 })
        otra.actualizar((i, j) => {
          const x = -R + (2 * R * i) / 69
          const y = -R + (2 * R * j) / 69
          const v = h(x, y)
          return [X(x), X(y), Number.isFinite(v) ? Z(v) : 0, [tono.r, tono.g, tono.b]]
        })
        ;(otra.malla.material as any).depthWrite = false
      })

      const { fx, fy } = derivadas(f, s.a, s.b)
      const c = f(s.a, s.b)
      const k = 1.4 / span
      // el trozo de plano se encoge cuando la pendiente es fuerte: si no, sale de la escena
      const pend = (Math.abs(fx) + Math.abs(fy)) * k
      const d = Math.max(R * 0.15, Math.min(R * 0.4, pend > 1e-9 ? 0.5 / pend : R * 0.4))

      if (s.verNivel) {
        const suave = e.color('--ink-soft')
        const niveles = 9
        for (let k = 1; k < niveles; k++) {
          const nivel = lo + (span * k) / niveles
          for (const [p, q] of contorno(f, { x: [-R, R], y: [-R, R] }, nivel, 90, 90))
            e.linea([[X(p[0]), X(p[1]), base], [X(q[0]), X(q[1]), base]], suave, 0.55)
        }
      }

      if (s.verCortes) {
        const pos = e.color('--pos')
        const c1: Array<[number, number, number]> = []
        const c2: Array<[number, number, number]> = []
        for (let i = 0; i <= 300; i++) {
          const t = -R + (2 * R * i) / 300
          const v1 = f(t, s.b)
          const v2 = f(s.a, t)
          if (Number.isFinite(v1)) c1.push([X(t), X(s.b), Z(v1) + 0.012])
          if (Number.isFinite(v2)) c2.push([X(s.a), X(t), Z(v2) + 0.012])
        }
        e.linea(c1, pos)
        e.linea(c2, pos)
        e.linea(
          [
            [X(s.a - d), X(s.b), Z(c) - fx * d * k],
            [X(s.a + d), X(s.b), Z(c) + fx * d * k],
          ],
          e.color('--ink'),
        )
        e.linea(
          [
            [X(s.a), X(s.b - d), Z(c) - fy * d * k],
            [X(s.a), X(s.b + d), Z(c) + fy * d * k],
          ],
          e.color('--ink'),
        )
        e.rotulo('T₁', [X(s.a + d), X(s.b), Z(c) + fx * d * k], 0.17)
        e.rotulo('T₂', [X(s.a), X(s.b + d), Z(c) + fy * d * k], 0.17)
      }

      const planoTangente = (a: number, b: number) => {
        const { fx, fy } = derivadas(f, a, b)
        const c = f(a, b)
        const pend = (Math.abs(fx) + Math.abs(fy)) * k
        const d = Math.max(R * 0.15, Math.min(R * 0.4, pend > 1e-9 ? 0.5 / pend : R * 0.4))
        const plano = e.superficie(2, 2, {})
        const ac = e.color('--accent')
        plano.actualizar((i, j) => {
          const dx = (i === 0 ? -1 : 1) * d
          const dy = (j === 0 ? -1 : 1) * d
          return [X(a + dx), X(b + dy), Z(c) + (fx * dx + fy * dy) * k, [ac.r, ac.g, ac.b]]
        })
        ;(plano.malla.material as any).transparent = true
        ;(plano.malla.material as any).opacity = 0.3
      }
      if (s.verTangente) planoTangente(s.a, s.b)

      s.puntos.forEach(([a, b], i) => {
        const z = f(a, b)
        if (!Number.isFinite(z)) return
        e.linea([[X(a), X(b), base], [X(a), X(b), Z(z)]], e.color('--ink-soft'), 0.5)
        if (s.verTangente) planoTangente(a, b)
        e.rotulo(`Q${sub(i + 1)}`, [X(a), X(b), Z(z) + 0.15], 0.18)
      })

      // el punto P y su proyección
      e.linea([[X(s.a), X(s.b), base], [X(s.a), X(s.b), Z(c)]], e.color('--ink-soft'), 0.7)
      e.flecha([0, 0, 0.09], e.color('--ink'), [X(s.a), X(s.b), Z(c) - 0.045], 0.018)
      e.rotulo('P', [X(s.a), X(s.b), Z(c) + 0.17], 0.18)

      if (s.verGradiente) {
        const n = Math.hypot(fx, fy)
        if (n > 1e-9) {
          const l = 0.45
          e.flecha([(fx / n) * l, (fy / n) * l, 0], e.color('--aux'), [X(s.a), X(s.b), base], 0.013)
        }
      }
    },
  },
})
