import { definir, type Asa, type PropsPanel } from '../../nucleo/tipos'
import { accion, capaVer, coords } from '../../nucleo/menu'
import { Atajos, Expresion, Grupo, Interruptor, Matriz, Muestra, Nota, Rango } from '../../nucleo/controles'
import { compilarSuave } from '../../lib/expresion'
import { altura } from '../../render/tema'

interface S {
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

function campo(s: S) {
  const a = compilarSuave(s.P, ['x', 'y', 'z'])
  const b = compilarSuave(s.Q, ['x', 'y', 'z'])
  const c = compilarSuave(s.R, ['x', 'y', 'z'])
  const error = a.error ?? b.error ?? c.error
  if (!a.f || !b.f || !c.f) return { F: null, error }
  const F = (x: number, y: number, z: number): [number, number, number] => [a.f!(x, y, z), b.f!(x, y, z), c.f!(x, y, z)]
  return { F, error: null as string | null }
}

function divRot(F: (x: number, y: number, z: number) => number[], p: number[]) {
  const h = 1e-4
  const d = (k: number, c: number) => {
    const a = p.slice()
    const b = p.slice()
    a[c] += h
    b[c] -= h
    return (F(a[0], a[1], a[2])[k] - F(b[0], b[1], b[2])[k]) / (2 * h)
  }
  const div = d(0, 0) + d(1, 1) + d(2, 2)
  const rot = [d(2, 1) - d(1, 2), d(0, 2) - d(2, 0), d(1, 0) - d(0, 1)]
  return { div, rot }
}

function Panel({ s, set }: PropsPanel<S>) {
  return (
    <>
      <Grupo titulo="Campo F(x, y, z)">
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

export default definir<S>({
  id: 'vectorial',
  area: 'campos',
  resumen: 'Campos vectoriales, divergencia y rotacional',
  corto: 'Campos vectoriales',
  titulo: 'Campos <i>vectoriales</i>',
  entradilla: 'La divergencia dice si el punto es fuente o sumidero; el rotacional, cuánto gira a su alrededor.',
  inicial: {
    P: PRESETS[4].P, Q: PRESETS[4].Q, R: PRESETS[4].R,
    n: 7, escala: 1, verFlechas: true, verLineas: true, sonda: [[0.5, 0.3, 0.4]],
    verLineaSonda: true, verRot: true,
  },
  Panel,
  capas: (s) => [
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
    const p = PRESETS.find((q) => q.P === s.P && q.Q === s.Q && q.R === s.R)
    return { nombre: p?.t ?? 'Campo propio', apunte: 'F = (P, Q, R)' }
  },
  formula: () => [
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
    return [
      ['F(p)', `(${v.map((c) => c.toFixed(2)).join(', ')})`],
      ['‖F(p)‖', Math.hypot(...v).toFixed(5)],
      ['div F', div.toFixed(5)],
      ['‖rot F‖', nr.toFixed(5)],
      ['rot F', `(${rot.map((c) => c.toFixed(2)).join(', ')})`],
      ['¿Solenoidal aquí?', Math.abs(div) < 1e-3 ? 'sí (div ≈ 0)' : 'no'],
      ['¿Irrotacional aquí?', nr < 1e-3 ? 'sí (rot ≈ 0)' : 'no'],
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
      <span>color = ‖F‖</span>
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
      e.ejes(1.2, ['x', 'y', 'z'])
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
