import { definir, type Asa, type PropsPanel } from '../../nucleo/tipos'
import { accion, capaVer, coords } from '../../nucleo/menu'
import { Atajos, Expresion, Grupo, Interruptor, Matriz, Muestra, Nota, Rango, Segmentado } from '../../nucleo/controles'
import { compilarSuave } from '../../lib/expresion'
import { altura } from '../../render/tema'
import { divergencia, escalarSimbolico, laplaciano, norma, rotacional } from '../../lib/operadores'
import { construirRejilla, marching } from '../../lib/mallado'
import { tex } from '../../lib/cas/tex'

interface S {
  /** Campo vectorial escrito o gradiente de un campo escalar φ. */
  modo: 'vectorial' | 'escalar'
  phi: string
  /** Superficie de nivel de φ que pasa por la primera sonda. */
  verNivel: boolean
  /** Dirección û: derivada direccional y proyección de F sobre ella. */
  dir: number[]
  verDir: boolean
  P: string
  Q: string
  R: string
  n: number
  escala: number
  verFlechas: boolean
  verLineas: boolean
  sonda: number[][]
  /** Por cada sonda: la línea de campo que pasa por ella y el rotacional. */
  verLineaSonda: boolean
  verRot: boolean
}

const SUB = '₀₁₂₃₄₅₆₇₈₉'
const sub = (n: number) => String(n).split('').map((d) => SUB[+d]).join('')
const dentro = (p: number[]) => p.map((c) => Math.round(Math.max(-1.1, Math.min(1.1, c)) * 100) / 100)

/** Línea de campo por p, hacia delante y hacia atrás, con paso de longitud fija. */
function lineaPor(F: (x: number, y: number, z: number) => number[], p0: number[]) {
  const trozos: Array<Array<[number, number, number]>> = []
  for (const signo of [1, -1]) {
    const pts: Array<[number, number, number]> = []
    let p = p0.slice() as [number, number, number]
    for (let i = 0; i < 500; i++) {
      const v = F(p[0], p[1], p[2])
      const m = Math.hypot(...v)
      if (!v.every(Number.isFinite) || m < 1e-9) break
      pts.push(p)
      const h = 0.01 * signo
      p = [p[0] + (v[0] / m) * h, p[1] + (v[1] / m) * h, p[2] + (v[2] / m) * h]
      if (Math.max(Math.abs(p[0]), Math.abs(p[1]), Math.abs(p[2])) > 1.15) break
    }
    if (pts.length > 1) trozos.push(pts)
  }
  return trozos
}

const PRESETS: Array<{ t: string; P: string; Q: string; R: string }> = [
  { t: 'Uniforme', P: '0', Q: '0', R: '1' },
  { t: 'Radial 1/r²', P: 'x/(x*x+y*y+z*z)^1.5', Q: 'y/(x*x+y*y+z*z)^1.5', R: 'z/(x*x+y*y+z*z)^1.5' },
  { t: 'Torbellino', P: '-y', Q: 'x', R: '0' },
  { t: 'Hilo con corriente', P: '-y/(x*x+y*y)', Q: 'x/(x*x+y*y)', R: '0' },
  { t: 'Dipolo', P: '3*x*z/(x*x+y*y+z*z)^2.5', Q: '3*y*z/(x*x+y*y+z*z)^2.5', R: '(2*z*z-x*x-y*y)/(x*x+y*y+z*z)^2.5' },
  { t: 'Gradiente de r²', P: '2*x', Q: '2*y', R: '2*z' },
  { t: 'Silla', P: 'x', Q: '-y', R: '0' },
  { t: 'Espiral', P: '-y+x/4', Q: 'x+y/4', R: '-z/2' },
]

export const ESCALARES: Array<{ t: string; phi: string }> = [
  { t: 'r² = x² + y² + z²', phi: 'x^2 + y^2 + z^2' },
  { t: 'Potencial de una carga 1/r', phi: '1/sqrt(x^2 + y^2 + z^2)' },
  { t: 'Silla x² − y²', phi: 'x^2 - y^2' },
  { t: 'xyz', phi: 'x*y*z' },
  { t: 'Gaussiana e^(−r²)', phi: 'exp(-2*(x^2 + y^2 + z^2))' },
  { t: 'Ondulado sin x · cos y', phi: 'sin(3*x)*cos(3*y) + z' },
  { t: 'Plano inclinado', phi: 'x + 2*y - z' },
]

let cacheEscalar: { src: string; v: ReturnType<typeof escalarSimbolico> | { error: string } } | null = null
export function escalar(src: string) {
  if (cacheEscalar?.src === src) return cacheEscalar.v
  let v: ReturnType<typeof escalarSimbolico> | { error: string }
  try {
    v = escalarSimbolico(src)
  } catch (e) {
    v = { error: (e as Error).message }
  }
  cacheEscalar = { src, v }
  return v
}

export function campo(s: S) {
  if (s.modo === 'escalar') {
    const e = escalar(s.phi)
    if ('error' in e) return { F: null, error: e.error }
    return { F: e.F, error: null as string | null }
  }
  const a = compilarSuave(s.P, ['x', 'y', 'z'])
  const b = compilarSuave(s.Q, ['x', 'y', 'z'])
  const c = compilarSuave(s.R, ['x', 'y', 'z'])
  const error = a.error ?? b.error ?? c.error
  if (!a.f || !b.f || !c.f) return { F: null, error }
  const F = (x: number, y: number, z: number): [number, number, number] => [a.f!(x, y, z), b.f!(x, y, z), c.f!(x, y, z)]
  return { F, error: null as string | null }
}

function divRot(F: (x: number, y: number, z: number) => number[], p: number[]) {
  return { div: divergencia(F, p), rot: rotacional(F, p) }
}

const f2 = (v: number) => (Math.abs(v) < 5e-6 ? '0' : v.toFixed(Math.abs(v) >= 100 ? 1 : 3))
const vec = (v: number[]) => `(${v.map(f2).join(', ')})`

function Panel({ s, set }: PropsPanel<S>) {
  return (
    <>
      <Grupo titulo="Campo">
        <Segmentado
          valor={s.modo}
          opciones={[
            { v: 'vectorial', t: 'Vectorial F' },
            { v: 'escalar', t: 'Escalar φ y ∇φ' },
          ]}
          onChange={(modo) => set({ modo })}
        />
        {s.modo === 'vectorial' ? (
          <>
            <Expresion etiqueta="P =" valor={s.P} variables={['x', 'y', 'z']} onChange={(P: string) => set({ P })} />
            <Expresion etiqueta="Q =" valor={s.Q} variables={['x', 'y', 'z']} onChange={(Q: string) => set({ Q })} />
            <Expresion etiqueta="R =" valor={s.R} variables={['x', 'y', 'z']} onChange={(R: string) => set({ R })} />
            <Atajos
              opciones={PRESETS.map((p) => ({
                t: p.t,
                activo: s.P === p.P && s.Q === p.Q && s.R === p.R,
                onClick: () => set({ P: p.P, Q: p.Q, R: p.R }),
              }))}
            />
          </>
        ) : (
          <>
            <Expresion etiqueta="φ =" valor={s.phi} variables={['x', 'y', 'z']} onChange={(phi: string) => set({ phi })} />
            <Atajos opciones={ESCALARES.map((p) => ({ t: p.t, activo: s.phi === p.phi, onClick: () => set({ phi: p.phi }) }))} />
            <Interruptor activo={s.verNivel} onChange={(verNivel) => set({ verNivel })}>
              Superficie de nivel por p₁
            </Interruptor>
            <Nota>Las flechas son ∇φ: perpendiculares a las superficies de nivel y hacia donde φ crece más deprisa.</Nota>
          </>
        )}
      </Grupo>
      <Grupo titulo="Dirección û">
        <Matriz A={[s.dir]} onChange={(A: number[][]) => set({ dir: A[0] })} paso={0.05} filas={[{ nombre: 'u', color: 'var(--pos)' }]} />
        <Interruptor activo={s.verDir} onChange={(verDir) => set({ verDir })}>
          {s.modo === 'escalar' ? 'Derivada direccional en p₁' : 'Proyección de F sobre û en p₁'}
        </Interruptor>
      </Grupo>

      <Grupo titulo="Sondas">
        <Matriz
          A={s.sonda}
          onChange={(sonda: number[][]) => set({ sonda })}
          paso={0.05}
          filas={s.sonda.map((_, i) => ({ nombre: `p${sub(i + 1)}`, color: 'var(--ink)' }))}
          quitar={s.sonda.length > 1 ? (i) => set({ sonda: s.sonda.filter((_, k) => k !== i) }) : undefined}
        />
        <div className="interruptores">
          <Interruptor activo={s.verLineaSonda} onChange={(verLineaSonda) => set({ verLineaSonda })}>
            Línea de campo por cada sonda
          </Interruptor>
          <Interruptor activo={s.verRot} onChange={(verRot) => set({ verRot })}>
            rot F
          </Interruptor>
        </div>
        <Nota>Arrastra las sondas por el espacio (⌥: en vertical). Doble clic en el suelo pone otra.</Nota>
      </Grupo>

      <Grupo titulo="Dibujo">
        <Rango etiqueta="Densidad" valor={s.n} min={3} max={11} paso={2} formato={(v) => `${v}³ = ${v ** 3}`} onChange={(n) => set({ n })} />
        <Rango etiqueta="Longitud de las flechas" valor={s.escala} min={0.3} max={2} paso={0.05} formato={(v) => `${v.toFixed(2)}×`} onChange={(escala) => set({ escala })} />
        <div className="interruptores">
          <Interruptor activo={s.verFlechas} onChange={(verFlechas) => set({ verFlechas })}>
            Flechas
          </Interruptor>
          <Interruptor activo={s.verLineas} onChange={(verLineas) => set({ verLineas })}>
            Líneas de campo
          </Interruptor>
        </div>
      </Grupo>
    </>
  )
}

/** ¿∇²φ = 0? El CAS no siempre lo reduce (1/r): se mira en puntos cualesquiera. */
function armonica(e: ReturnType<typeof escalarSimbolico>): boolean {
  const pts = [[0.31, -0.52, 0.77], [-0.64, 0.23, 0.45], [0.12, 0.86, -0.39], [-0.9, -0.4, -0.2], [0.55, 0.61, 0.08]]
  return pts.every(([x, y, z]) => {
    const l = e.L(x, y, z)
    const esc = Math.max(1, Math.abs(e.f(x, y, z)), Math.hypot(...e.F(x, y, z)))
    return Number.isFinite(l) && Math.abs(l) < 1e-9 * esc
  })
}

function formulasEscalar(s: S): string[] {
  const e = escalar(s.phi)
  if ('error' in e) return [String.raw`\nabla\varphi=\left(\varphi_x,\ \varphi_y,\ \varphi_z\right)`]
  return [
    String.raw`\varphi=${tex(e.phi)}`,
    String.raw`\nabla\varphi=\left(${e.grad.map(tex).join(',\\ ')}\right)`,
    String.raw`\nabla^2\varphi=\nabla\cdot\nabla\varphi=${armonica(e) ? String.raw`0\quad(\varphi\ \text{es armónica})` : tex(e.lap)}`,
    String.raw`D_{\hat u}\varphi=\nabla\varphi\cdot\hat u,\qquad \nabla\times\nabla\varphi=\mathbf 0`,
  ]
}

export default definir<S>({
  id: 'vectorial',
  area: 'campos',
  resumen: 'Campos vectoriales y escalares: módulo, gradiente, divergencia, rotacional, laplaciano y derivada direccional',
  corto: 'Campos vectoriales',
  titulo: 'Campos <i>vectoriales</i>',
  entradilla: 'La divergencia dice si el punto es fuente o sumidero; el rotacional, cuánto gira a su alrededor.',
  inicial: {
    modo: 'vectorial',
    phi: ESCALARES[0].phi,
    verNivel: true,
    dir: [1, 0, 0],
    verDir: true,
    P: PRESETS[4].P, Q: PRESETS[4].Q, R: PRESETS[4].R,
    n: 7, escala: 1, verFlechas: true, verLineas: true, sonda: [[0.5, 0.3, 0.4]],
    verLineaSonda: true, verRot: true,
  },
  Panel,
  capas: (s) => [
    ...(s.modo === 'escalar' ? [capaVer(s, 'verNivel', 'Superficie de nivel', '--pos')] : []),
    capaVer(s, 'verDir', 'Dirección û y proyección', '--aux'),
    capaVer(s, 'verFlechas', 'Flechas coloreadas por ‖F‖', '--accent'),
    capaVer(s, 'verLineas', 'Líneas de campo', '--accent'),
    capaVer(s, 'verLineaSonda', 'Línea por la sonda', '--accent'),
    capaVer(s, 'verRot', 'rot F en la sonda', '--neg'),
    ...s.sonda.map((q, i) => ({ id: `S${i}`, nombre: `Sonda ${i + 1}`, color: '--ink', detalle: coords(q), quitar: s.sonda.length > 1 ? (t: S) => ({ sonda: t.sonda.filter((_, k) => k !== i) }) : undefined })),
  ],
  menu: (s) => ({
    anadir: [accion<S>('Sonda', (t) => ({ sonda: [...t.sonda, [0.5, 0.5, 0.5]] }))],
    ejemplos: PRESETS.map((p) => ({ t: p.t, tipo: 'radio' as const, activo: s.P === p.P && s.Q === p.Q && s.R === p.R, hacer: () => ({ P: p.P, Q: p.Q, R: p.R }) })),
  }),
  rotulo: (s) => {
    if (s.modo === 'escalar') return { nombre: ESCALARES.find((q) => q.phi === s.phi)?.t ?? 'Campo escalar propio', apunte: 'F = ∇φ' }
    const p = PRESETS.find((q) => q.P === s.P && q.Q === s.Q && q.R === s.R)
    return { nombre: p?.t ?? 'Campo propio', apunte: 'F = (P, Q, R)' }
  },
  formula: (s) => s.modo === 'escalar' ? formulasEscalar(s) : [
    String.raw`\operatorname{div}\mathbf F=\nabla\!\cdot\!\mathbf F=P_x+Q_y+R_z`,
    String.raw`\operatorname{rot}\mathbf F=\nabla\times\mathbf F=(R_y-Q_z,\;P_z-R_x,\;Q_x-P_y)`,
    String.raw`\operatorname{div}(\operatorname{rot}\mathbf F)=0,\qquad \operatorname{rot}(\nabla f)=\mathbf 0`,
  ],
  lecturas: (s) => {
    const { F, error } = campo(s)
    if (!F) return [['Estado', error ?? 'expresión no válida']]
    const p = s.sonda[0]
    const v = F(p[0], p[1], p[2])
    if (!v.every(Number.isFinite)) return [['F en p', 'no definido en ese punto']]
    const { div, rot } = divRot(F, p)
    const nr = Math.hypot(...rot)
    const nu = norma(s.dir)
    const u = nu > 1e-12 ? s.dir.map((c) => c / nu) : null
    const Fu = u ? v[0] * u[0] + v[1] * u[1] + v[2] * u[2] : NaN
    const esc = s.modo === 'escalar' ? escalar(s.phi) : null
    const propias: Array<[string, string]> =
      esc && !('error' in esc)
        ? [
            ['φ(p₁)', f2(esc.f(p[0], p[1], p[2]))],
            ['∇φ(p₁)', vec(v)],
            ['‖∇φ‖ (ritmo máximo de subida)', f2(norma(v))],
            ['∇²φ (exacto · numérico)', `${f2(esc.L(p[0], p[1], p[2]))} · ${f2(laplaciano(esc.f, p))}`],
            ...(u ? ([['D_û φ = ∇φ · û', f2(Fu)]] as Array<[string, string]>) : []),
            ['‖rot ∇φ‖ (siempre 0)', f2(nr)],
          ]
        : [
            ['F(p₁)', vec(v)],
            ['‖F(p₁)‖', f2(norma(v))],
            ['div F', f2(div)],
            ['rot F', vec(rot)],
            ['‖rot F‖', f2(nr)],
            ...(u
              ? ([
                  ['F · û (componente sobre û)', f2(Fu)],
                  ['Proyección (F · û) û', vec(u.map((c) => Fu * c))],
                  ['Parte perpendicular ‖F − (F · û) û‖', f2(norma(v.map((c, i) => c - Fu * u[i])))],
                ] as Array<[string, string]>)
              : []),
            ['¿Solenoidal aquí?', Math.abs(div) < 1e-3 ? 'sí (div ≈ 0)' : 'no'],
            ['¿Irrotacional aquí?', nr < 1e-3 ? 'sí (rot ≈ 0)' : 'no'],
          ]
    return [
      ...propias,
      ...s.sonda.slice(1).flatMap((q, i): Array<[string, string]> => {
        const w = F(q[0], q[1], q[2])
        if (!w.every(Number.isFinite)) return [[`p${sub(i + 2)}`, 'no definido']]
        const dr = divRot(F, q)
        return [[`p${sub(i + 2)}: div · ‖rot‖`, `${dr.div.toFixed(4)} · ${Math.hypot(...dr.rot).toFixed(4)}`]]
      }),
    ]
  },
  leyenda: (s) => (
    <>
      <span>color = ‖{s.modo === 'escalar' ? '∇φ' : 'F'}‖</span>
      {s.modo === 'escalar' && s.verNivel && <Muestra color="var(--pos)">φ = φ(p₁)</Muestra>}
      {s.verDir && <Muestra color="var(--aux)">{s.modo === 'escalar' ? '(∇φ · û) û' : '(F · û) û'}</Muestra>}
      {s.verLineas && <Muestra color="var(--accent)">líneas de campo</Muestra>}
      <Muestra color="var(--ink)">sondas y F</Muestra>
      {s.verLineaSonda && <Muestra color="var(--accent)">línea por la sonda</Muestra>}
      {s.verRot && <Muestra color="var(--neg)">rot F</Muestra>}
    </>
  ),
  vista: {
    tipo: '3d',
    pesada: true,
    camara: { theta: 0.85, phi: 1.1, r: 3.6 },
    interaccion: {
      asas: (s): Asa[] => s.sonda.map((p, i) => ({ id: `S${i}`, p, color: '--ink' })),
      mover(id, t, s) {
        const k = +id.slice(1)
        return { sonda: s.sonda.map((p, i) => (i === k ? dentro(t.p) : p)) }
      },
      anadir: (t, s) => ({ sonda: [...s.sonda, dentro(t.p)] }),
      quitar: (id, s) => (s.sonda.length > 1 ? { sonda: s.sonda.filter((_, i) => i !== +id.slice(1)) } : undefined),
    },
    construir(e, s) {
      e.zArriba(true)
      e.ejes(1.2, ['x', 'y', 'z'], { rejilla: true, infinita: true, paso: 0.4 })
      const { F } = campo(s)
      if (!F) return

      const n = s.n
      const paso = 2 / n
      const puntos: Array<[number, number, number]> = []
      const valores: Array<[number, number, number]> = []
      let mx = 0
      for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++)
          for (let k = 0; k < n; k++) {
            const p: [number, number, number] = [
              -1 + paso * (i + 0.5),
              -1 + paso * (j + 0.5),
              -1 + paso * (k + 0.5),
            ]
            const v = F(p[0], p[1], p[2])
            if (!v.every(Number.isFinite)) continue
            const m = Math.hypot(...v)
            if (m < 1e-9) continue
            puntos.push(p)
            valores.push(v as [number, number, number])
            mx = Math.max(mx, m)
          }
      if (!mx) return

      if (s.verFlechas) {
        const pos = new Float32Array(puntos.length * 6)
        const col = new Float32Array(puntos.length * 6)
        puntos.forEach((p, idx) => {
          const v = valores[idx]
          const m = Math.hypot(...v)
          // la raíz comprime el rango: si no, un 1/r² solo se ve cerca del origen
          const l = paso * 0.85 * s.escala * Math.pow(m / mx, 0.35)
          const c = altura(Math.pow(m / mx, 0.35))
          for (let t = 0; t < 2; t++) {
            const k = (2 * idx + t) * 3
            for (let d = 0; d < 3; d++) pos[k + d] = p[d] + ((v[d] / m) * l * (t === 0 ? -0.5 : 0.5))
            // la cola va apagada y la punta encendida: así se ve el sentido
            for (let d = 0; d < 3; d++) col[k + d] = c[d] * (t === 0 ? 0.25 : 1)
          }
        })
        e.segmentos(pos, col)
      }

      if (s.verLineas) {
        const acento = e.color('--accent')
        const semillas: Array<[number, number, number]> = []
        const M = 14
        for (let i = 0; i < M; i++) {
          // puntos repartidos por una esfera, con la espiral de Fibonacci
          const y = 1 - (2 * (i + 0.5)) / M
          const r = Math.sqrt(Math.max(0, 1 - y * y))
          const th = Math.PI * (1 + Math.sqrt(5)) * i
          semillas.push([0.75 * r * Math.cos(th), 0.75 * y, 0.75 * r * Math.sin(th)])
        }
        for (const semilla of semillas) {
          for (const signo of [1, -1]) {
            const pts: number[] = []
            const cols: number[] = []
            let p = semilla.slice() as [number, number, number]
            for (let i = 0; i < 400; i++) {
              const v = F(p[0], p[1], p[2])
              if (!v.every(Number.isFinite)) break
              const m = Math.hypot(...v)
              if (m < 1e-9 || !Number.isFinite(m)) break
              pts.push(p[0], p[1], p[2])
              const c = altura(Math.pow(Math.min(1, m / mx), 0.35))
              cols.push(c[0], c[1], c[2])
              const h = 0.012 * signo
              p = [p[0] + (v[0] / m) * h, p[1] + (v[1] / m) * h, p[2] + (v[2] / m) * h]
              if (Math.max(Math.abs(p[0]), Math.abs(p[1]), Math.abs(p[2])) > 1.15) break
            }
            if (pts.length >= 6) e.lineaColor(new Float32Array(pts), new Float32Array(cols))
          }
        }
        void acento
      }

      // superficie de nivel de φ por la primera sonda
      const esc = s.modo === 'escalar' ? escalar(s.phi) : null
      if (esc && !('error' in esc) && s.verNivel) {
        const p0 = s.sonda[0]
        const c0 = esc.f(p0[0], p0[1], p0[2])
        if (Number.isFinite(c0)) {
          const { pos, nor } = marching(construirRejilla((x, y, z) => {
            const v = esc.f(x, y, z) - c0
            return Number.isFinite(v) ? v : 1e6
          }, 1.1, 44), 1, 0)
          if (pos.length) e.malla(pos, nor, e.color('--pos'), { opacidad: 0.35 })
        }
      }
      // dirección û en la primera sonda: derivada direccional o proyección de F
      const nu = norma(s.dir)
      if (s.verDir && nu > 1e-9) {
        const p0 = s.sonda[0] as [number, number, number]
        const u = s.dir.map((c) => c / nu)
        e.flecha([u[0] * 0.45, u[1] * 0.45, u[2] * 0.45], e.color('--pos'), p0, 0.007)
        e.rotulo('û', [p0[0] + u[0] * 0.52, p0[1] + u[1] * 0.52, p0[2] + u[2] * 0.52], 0.15)
        const v = F(p0[0], p0[1], p0[2])
        const m = norma(v)
        if (m > 1e-9 && v.every(Number.isFinite)) {
          const k = (v[0] * u[0] + v[1] * u[1] + v[2] * u[2]) / m
          const pr: [number, number, number] = [u[0] * k * 0.4, u[1] * k * 0.4, u[2] * k * 0.4]
          if (Math.abs(k) > 1e-3) e.flecha(pr, e.color('--aux'), p0, 0.009)
          // la perpendicular, de la punta de F a la de su proyección
          const tip: [number, number, number] = [p0[0] + (v[0] / m) * 0.4, p0[1] + (v[1] / m) * 0.4, p0[2] + (v[2] / m) * 0.4]
          e.linea([tip, [p0[0] + pr[0], p0[1] + pr[1], p0[2] + pr[2]]], e.color('--aux'), 0.6)
        }
      }

      s.sonda.forEach((p, i) => {
        if (!p.every(Number.isFinite)) return
        const v = F(p[0], p[1], p[2])
        const q = p as [number, number, number]
        e.rotulo(`p${sub(i + 1)}`, [p[0], p[1], p[2] + 0.16], 0.17)
        if (!v.every(Number.isFinite)) return
        const m = Math.hypot(...v)
        if (m > 1e-9) e.flecha([(v[0] / m) * 0.4, (v[1] / m) * 0.4, (v[2] / m) * 0.4], e.color('--ink'), q, 0.008)
        if (s.verRot) {
          const { rot } = divRot(F, p)
          const nr = Math.hypot(...rot)
          // el eje de giro local; su largo sigue a ‖rot‖ con techo
          if (nr > 1e-6) {
            const l = Math.min(0.5, 0.12 + 0.1 * nr)
            e.flecha([(rot[0] / nr) * l, (rot[1] / nr) * l, (rot[2] / nr) * l], e.color('--neg'), q, 0.007)
          }
        }
        if (s.verLineaSonda) for (const trozo of lineaPor(F, p)) e.linea(trozo, e.color('--accent'))
      })
    },
  },
})
