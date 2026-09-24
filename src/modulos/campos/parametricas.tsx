import { definir, type Asa, type PropsPanel } from '../../nucleo/tipos'
import { Atajos, Boton, Expresion, Grupo, Interruptor, Matriz, Muestra, Nota, Rango, Segmentado } from '../../nucleo/controles'
import { aLatex, compilarSuave } from '../../lib/expresion'
import { mapa, type NombreMapa } from '../../render/tema'

interface S {
  x: string
  y: string
  z: string
  rango: number[][]
  malla: number
  color: NombreMapa
  alambre: boolean
  verCurvas: boolean
  /** Puntos (u, v) marcados sobre la superficie. */
  puntos: number[][]
  verMarco: boolean
}

const P = Math.PI
const PRESETS: Array<{ t: string; x: string; y: string; z: string; r: number[][] }> = [
  { t: 'Esfera', x: 'sin(v)*cos(u)', y: 'sin(v)*sin(u)', z: 'cos(v)', r: [[0, 2 * P], [0, P]] },
  { t: 'Toro', x: '(2+cos(v))*cos(u)', y: '(2+cos(v))*sin(u)', z: 'sin(v)', r: [[0, 2 * P], [0, 2 * P]] },
  { t: 'Astroide', x: '(cos(u)*cos(v))^3', y: '(sin(u)*cos(v))^3', z: '(sin(v))^3', r: [[0, 2 * P], [-P / 2, P / 2]] },
  { t: 'Möbius', x: '(1+v*cos(u/2)/2)*cos(u)', y: '(1+v*cos(u/2)/2)*sin(u)', z: 'v*sin(u/2)/2', r: [[0, 2 * P], [-1, 1]] },
  { t: 'Helicoide', x: 'v*cos(u)', y: 'v*sin(u)', z: '0.35*u', r: [[0, 4 * P], [-1, 1]] },
  { t: 'Catenoide', x: 'cosh(v)*cos(u)', y: 'cosh(v)*sin(u)', z: 'v', r: [[0, 2 * P], [-1.2, 1.2]] },
  { t: 'Klein', x: '(2+cos(v/2)*sin(u)-sin(v/2)*sin(2*u))*cos(v)', y: '(2+cos(v/2)*sin(u)-sin(v/2)*sin(2*u))*sin(v)', z: 'sin(v/2)*sin(u)+cos(v/2)*sin(2*u)', r: [[0, 2 * P], [0, 2 * P]] },
  { t: 'Silla del mono', x: 'u', y: 'v', z: 'u^3-3*u*v*v', r: [[-1.2, 1.2], [-1.2, 1.2]] },
]

/** LaTeX de una expresión, o la propia cadena si no compila. */
const aTex = (src: string) => aLatex(src) ?? src

function piezas(s: S) {
  const fx = compilarSuave(s.x, ['u', 'v'])
  const fy = compilarSuave(s.y, ['u', 'v'])
  const fz = compilarSuave(s.z, ['u', 'v'])
  return { fx: fx.f, fy: fy.f, fz: fz.f, error: fx.error ?? fy.error ?? fz.error }
}

const SUB = '₀₁₂₃₄₅₆₇₈₉'
const sub = (n: number) => String(n).split('').map((d) => SUB[+d]).join('')

type Encuadre = { r: (u: number, v: number) => number[]; T: (p: number[]) => [number, number, number]; mn: number[]; mx: number[] }
const memoEncuadre = new Map<string, Encuadre | null>()
/**
 * La parametrización y la transformación que mete la superficie en el cubo
 * unidad. Se guarda porque las asas la necesitan fuera de `construir`.
 */
function encuadre(s: S): Encuadre | null {
  const clave = `${s.x}|${s.y}|${s.z}|${s.rango.join(';')}|${s.malla}`
  if (memoEncuadre.has(clave)) return memoEncuadre.get(clave)!
  const { fx, fy, fz } = piezas(s)
  let out: Encuadre | null = null
  if (fx && fy && fz) {
    const r = (u: number, v: number) => [fx(u, v), fy(u, v), fz(u, v)]
    const N = s.malla
    const [u0, u1] = s.rango[0]
    const [v0, v1] = s.rango[1]
    const mn = [Infinity, Infinity, Infinity]
    const mx = [-Infinity, -Infinity, -Infinity]
    for (let i = 0; i < N; i += 2)
      for (let j = 0; j < N; j += 2) {
        const p = r(u0 + ((u1 - u0) * i) / (N - 1), v0 + ((v1 - v0) * j) / (N - 1))
        if (!p.every(Number.isFinite)) continue
        for (let k = 0; k < 3; k++) {
          mn[k] = Math.min(mn[k], p[k])
          mx[k] = Math.max(mx[k], p[k])
        }
      }
    if (mn.every(Number.isFinite)) {
      const centro = [0, 1, 2].map((k) => (mn[k] + mx[k]) / 2)
      const esc = 2 / Math.max(1e-6, Math.max(...[0, 1, 2].map((k) => mx[k] - mn[k])))
      const T = (p: number[]): [number, number, number] => [
        (p[0] - centro[0]) * esc,
        (p[1] - centro[1]) * esc,
        (p[2] - centro[2]) * esc,
      ]
      out = { r, T, mn, mx }
    }
  }
  if (memoEncuadre.size > 30) memoEncuadre.clear()
  memoEncuadre.set(clave, out)
  return out
}

/** r_u, r_v y la normal unitaria en (u, v), por diferencias centradas. */
function marco(r: (u: number, v: number) => number[], u: number, v: number) {
  const h = 1e-4
  const ru = r(u + h, v).map((c, k) => (c - r(u - h, v)[k]) / (2 * h))
  const rv = r(u, v + h).map((c, k) => (c - r(u, v - h)[k]) / (2 * h))
  const n = [ru[1] * rv[2] - ru[2] * rv[1], ru[2] * rv[0] - ru[0] * rv[2], ru[0] * rv[1] - ru[1] * rv[0]]
  return { ru, rv, n, area: Math.hypot(...n) }
}

/** uv de la malla (0..1, con v invertida por PlaneGeometry) → parámetros. */
function desdeUV(s: S, uv: [number, number]) {
  const [u0, u1] = s.rango[0]
  const [v0, v1] = s.rango[1]
  const r3 = (x: number) => Math.round(x * 1000) / 1000
  return [r3(u0 + (u1 - u0) * uv[0]), r3(v0 + (v1 - v0) * (1 - uv[1]))]
}

function asas(s: S): Asa[] {
  const g = encuadre(s)
  if (!g) return []
  return s.puntos.flatMap(([u, v], i): Asa[] => {
    const p = g.r(u, v)
    return p.every(Number.isFinite) ? [{ id: `Q${i}`, p: g.T(p), color: '--ink', sobre: 'superficie' }] : []
  })
}

function Panel({ s, set }: PropsPanel<S>) {
  return (
    <>
      <Grupo titulo="Parametrización r(u, v)">
        <Expresion etiqueta="x =" valor={s.x} variables={['u', 'v']} onChange={(x: string) => set({ x })} />
        <Expresion etiqueta="y =" valor={s.y} variables={['u', 'v']} onChange={(y: string) => set({ y })} />
        <Expresion etiqueta="z =" valor={s.z} variables={['u', 'v']} onChange={(z: string) => set({ z })} />
        <Atajos
          opciones={PRESETS.map((p) => ({
            t: p.t,
            activo: s.x === p.x && s.y === p.y && s.z === p.z,
            onClick: () =>
              set({
                x: p.x, y: p.y, z: p.z, rango: p.r.map((f) => f.slice()),
                // los puntos siguen siendo (u, v): se recortan al dominio nuevo
                puntos: s.puntos.map((q) => q.map((c, k) => Math.max(p.r[k][0], Math.min(p.r[k][1], c)))),
              }),
          }))}
        />
      </Grupo>

      <Grupo titulo="Dominio de los parámetros">
        <Matriz
          A={s.rango}
          onChange={(rango: number[][]) => set({ rango })}
          paso={0.05}
          filas={[{ nombre: 'u' }, { nombre: 'v' }]}
        />
      </Grupo>

      <Grupo titulo="Puntos sobre la superficie">
        {s.puntos.length > 0 && (
          <Matriz
            A={s.puntos}
            onChange={(puntos: number[][]) => set({ puntos })}
            paso={0.02}
            filas={s.puntos.map((_, i) => ({ nombre: `Q${sub(i + 1)}`, color: 'var(--ink)' }))}
            quitar={(i) => set({ puntos: s.puntos.filter((_, k) => k !== i) })}
          />
        )}
        <div className="interruptores">
          <Interruptor activo={s.verMarco} onChange={(verMarco) => set({ verMarco })}>
            rᵤ, rᵥ y normal
          </Interruptor>
          {s.puntos.length > 0 && <Boton onClick={() => set({ puntos: [] })}>Quitar todos</Boton>}
        </div>
        <Nota>Doble clic sobre la superficie pone un punto (u, v); arrástralo y se desliza por ella.</Nota>
      </Grupo>

      <Grupo titulo="Dibujo">
        <Rango etiqueta="Resolución" valor={s.malla} min={24} max={200} paso={4} formato={(v) => `${v}×${v}`} onChange={(malla) => set({ malla })} />
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
          <Interruptor activo={s.verCurvas} onChange={(verCurvas) => set({ verCurvas })}>
            Curvas coordenadas
          </Interruptor>
        </div>
      </Grupo>
    </>
  )
}

export default definir<S>({
  id: 'parametricas',
  area: 'campos',
  resumen: 'Superficies paramétricas r(u, v)',
  corto: 'Superficies paramétricas',
  titulo: 'Superficies <i>paramétricas</i>',
  entradilla: 'Dos parámetros y tres funciones: la carta que convierte un rectángulo en una superficie.',
  inicial: {
    x: PRESETS[2].x, y: PRESETS[2].y, z: PRESETS[2].z, rango: PRESETS[2].r.map((f) => f.slice()),
    malla: 120, color: 'arcoiris', alambre: true, verCurvas: false,
    puntos: [[0.8, 0.4]], verMarco: true,
  },
  Panel,
  rotulo: (s) => {
    const p = PRESETS.find((q) => q.x === s.x && q.y === s.y && q.z === s.z)
    return { nombre: p?.t ?? 'Superficie propia', apunte: 'r(u, v) ⊂ R³' }
  },
  formula: (s) => [
    String.raw`\mathbf r(u,v)=\big(${aTex(s.x)},\ ${aTex(s.y)},\ ${aTex(s.z)}\big)`,
    String.raw`\mathbf n = \mathbf r_u \times \mathbf r_v`,
  ],
  lecturas: (s) => {
    const { fx, fy, fz, error } = piezas(s)
    if (!fx || !fy || !fz) return [['Estado', error ?? 'expresión no válida']]
    const r = (u: number, v: number) => [fx(u, v), fy(u, v), fz(u, v)]
    const enPuntos: Array<[string, string]> = s.puntos.flatMap(([u, v], i): Array<[string, string]> => {
      const { n, area } = marco(r, u, v)
      const f = (x: number[]) => `(${x.map((c) => c.toFixed(3)).join(', ')})`
      return [
        [`Q${sub(i + 1)} = r(${u.toFixed(2)}, ${v.toFixed(2)})`, f(r(u, v))],
        [`n en Q${sub(i + 1)}`, area > 1e-9 ? f(n.map((c) => c / area)) : 'singular (rᵤ ∥ rᵥ)'],
      ]
    })
    const [u0, u1] = s.rango[0]
    const [v0, v1] = s.rango[1]
    let area = 0
    let lo = Infinity
    let hi = -Infinity
    const N = 60
    const h = 1e-4
    for (let i = 0; i < N; i++)
      for (let j = 0; j < N; j++) {
        const u = u0 + ((u1 - u0) * (i + 0.5)) / N
        const v = v0 + ((v1 - v0) * (j + 0.5)) / N
        const ru = [(fx(u + h, v) - fx(u - h, v)) / (2 * h), (fy(u + h, v) - fy(u - h, v)) / (2 * h), (fz(u + h, v) - fz(u - h, v)) / (2 * h)]
        const rv = [(fx(u, v + h) - fx(u, v - h)) / (2 * h), (fy(u, v + h) - fy(u, v - h)) / (2 * h), (fz(u, v + h) - fz(u, v - h)) / (2 * h)]
        const n = Math.hypot(
          ru[1] * rv[2] - ru[2] * rv[1],
          ru[2] * rv[0] - ru[0] * rv[2],
          ru[0] * rv[1] - ru[1] * rv[0],
        )
        if (Number.isFinite(n)) area += n
        const z = fz(u, v)
        if (Number.isFinite(z)) {
          lo = Math.min(lo, z)
          hi = Math.max(hi, z)
        }
      }
    area *= ((u1 - u0) * (v1 - v0)) / (N * N)
    return [
      ['Dominio u', `[${s.rango[0][0].toFixed(2)}, ${s.rango[0][1].toFixed(2)}]`],
      ['Dominio v', `[${s.rango[1][0].toFixed(2)}, ${s.rango[1][1].toFixed(2)}]`],
      ['Área ∬‖rᵤ×r ᵥ‖', area.toFixed(4)],
      ['z mínimo', Number.isFinite(lo) ? lo.toFixed(4) : '—'],
      ['z máximo', Number.isFinite(hi) ? hi.toFixed(4) : '—'],
      ['Vértices', `${s.malla * s.malla}`],
      ...enPuntos,
    ]
  },
  leyenda: (s) => (
    <>
      <span>color = altura</span>
      {s.puntos.length > 0 && s.verMarco && (
        <>
          <Muestra color="var(--pos)">rᵤ</Muestra>
          <Muestra color="var(--aux)">rᵥ</Muestra>
          <Muestra color="var(--accent)">n</Muestra>
        </>
      )}
      {s.verCurvas && (
        <>
          <Muestra color="var(--pos)">u constante</Muestra>
          <Muestra color="var(--aux)">v constante</Muestra>
        </>
      )}
    </>
  ),
  vista: {
    tipo: '3d',
    pesada: true,
    camara: { theta: 0.9, phi: 1.15, r: 3.7 },
    interaccion: {
      asas,
      mover(id, t, s) {
        if (!t.uv) return
        const k = +id.slice(1)
        return { puntos: s.puntos.map((q, i) => (i === k ? desdeUV(s, t.uv!) : q)) }
      },
      anadir: (t, s) => (t.uv ? { puntos: [...s.puntos, desdeUV(s, t.uv)] } : undefined),
      quitar: (id, s) => ({ puntos: s.puntos.filter((_, i) => i !== +id.slice(1)) }),
      pista: 'Arrastra los puntos por la superficie · doble clic en ella: punto nuevo · doble clic o Supr: quitarlo',
    },
    construir(e, s) {
      e.zArriba(true)
      e.ejes(1.3, ['x', 'y', 'z'], { rejilla: true, infinita: true, paso: 0.4 })
      const g = encuadre(s)
      if (!g) return
      const { fx, fy, fz } = piezas(s)
      if (!fx || !fy || !fz) return
      const { T, mn, mx } = g
      const N = s.malla
      const [u0, u1] = s.rango[0]
      const [v0, v1] = s.rango[1]
      const U = (i: number) => u0 + ((u1 - u0) * i) / (N - 1)
      const V = (j: number) => v0 + ((v1 - v0) * j) / (N - 1)
      const col = mapa(s.color)
      const spanZ = Math.max(1e-6, mx[2] - mn[2])

      const sup = e.superficie(N, N, { alambre: s.alambre })
      sup.actualizar((i, j) => {
        const u = U(i)
        const v = V(j)
        const p = [fx(u, v), fy(u, v), fz(u, v)]
        if (!p.every(Number.isFinite)) return [0, 0, 0, [0.5, 0.5, 0.5]]
        const q = T(p)
        return [q[0], q[1], q[2], col((p[2] - mn[2]) / spanZ)]
      })
      e.agarre = [sup.malla]

      s.puntos.forEach(([u, v], i) => {
        const p = g.r(u, v)
        if (!p.every(Number.isFinite)) return
        const q = T(p)
        e.rotulo(`Q${sub(i + 1)}`, [q[0], q[1], q[2] + 0.14], 0.18)
        if (!s.verMarco) return
        const { ru, rv, n, area } = marco(g.r, u, v)
        // mismas proporciones que en R³ pero a una escala que se lea
        const largo = (w: number[]) => {
          const l = Math.hypot(...w)
          return l > 1e-9 ? w.map((c) => (c / l) * 0.38) : null
        }
        const a = largo(ru)
        const b = largo(rv)
        if (a) e.flecha(a as [number, number, number], e.color('--pos'), q, 0.009)
        if (b) e.flecha(b as [number, number, number], e.color('--aux'), q, 0.009)
        if (area > 1e-9) e.flecha(n.map((c) => (c / area) * 0.45) as [number, number, number], e.color('--accent'), q, 0.011)
      })

      if (s.verCurvas) {
        const pos = e.color('--pos')
        const aux = e.color('--aux')
        const M = 9
        for (let k = 0; k < M; k++) {
          const cu: Array<[number, number, number]> = []
          const cv: Array<[number, number, number]> = []
          const uk = u0 + ((u1 - u0) * k) / (M - 1)
          const vk = v0 + ((v1 - v0) * k) / (M - 1)
          for (let i = 0; i < 240; i++) {
            const a = v0 + ((v1 - v0) * i) / 239
            const b = u0 + ((u1 - u0) * i) / 239
            const p1 = [fx(uk, a), fy(uk, a), fz(uk, a)]
            const p2 = [fx(b, vk), fy(b, vk), fz(b, vk)]
            if (p1.every(Number.isFinite)) cu.push(T(p1))
            if (p2.every(Number.isFinite)) cv.push(T(p2))
          }
          if (cu.length > 1) e.linea(cu, pos, 0.85)
          if (cv.length > 1) e.linea(cv, aux, 0.85)
        }
      }
    },
  },
})
