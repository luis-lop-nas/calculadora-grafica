import { definir, type PropsPanel } from '../../nucleo/tipos'
import { Atajos, Expresion, Grupo, Interruptor, Muestra, Rango, Resultado } from '../../nucleo/controles'
import { compilar } from '../../lib/expresion'
import { campoPoligonal, circulacion, lineaB, poligonal, type P3 } from '../../lib/magneto'
import type { Escena3D } from '../../render/escena3d'

interface Curva {
  x: string
  y: string
  z: string
  a: string
  b: string
}

type Preset = 'espira' | 'helmholtz' | 'solenoide' | 'hilo' | 'propia'

export interface EstadoMagneto {
  preset: Preset
  curvas: Curva[]
  I: number
  P: { x: number; y: number; z: number }
  rho: number
  lineas: boolean
  flechas: boolean
}

const PRESETS: Array<{ t: string; v: Preset; curvas: Curva[] }> = [
  { t: 'Espira', v: 'espira', curvas: [{ x: 'cos(s)', y: 'sin(s)', z: '0', a: '0', b: '2*pi' }] },
  {
    t: 'Helmholtz',
    v: 'helmholtz',
    curvas: [
      { x: 'cos(s)', y: 'sin(s)', z: '-0.5', a: '0', b: '2*pi' },
      { x: 'cos(s)', y: 'sin(s)', z: '0.5', a: '0', b: '2*pi' },
    ],
  },
  { t: 'Solenoide', v: 'solenoide', curvas: [{ x: '0.5*cos(s)', y: '0.5*sin(s)', z: '-1.5 + 0.15*s/(2*pi)', a: '0', b: '40*pi' }] },
  { t: 'Hilo recto', v: 'hilo', curvas: [{ x: '0', y: '0', z: 's', a: '-4', b: '4' }] },
  { t: 'Nudo de trébol', v: 'propia', curvas: [{ x: '(2 + cos(3*s))*cos(2*s)/2', y: '(2 + cos(3*s))*sin(2*s)/2', z: 'sin(3*s)/2', a: '0', b: '2*pi' }] },
]

interface Geometria {
  pts: P3[][]
  ext: number
}

const memo = new Map<string, Geometria | { error: string }>()
function geometria(s: EstadoMagneto): Geometria | { error: string } {
  const clave = JSON.stringify(s.curvas)
  let g = memo.get(clave)
  if (!g) {
    try {
      const pts = s.curvas.map((c) => {
        const fx = compilar(c.x, ['s'])
        const fy = compilar(c.y, ['s'])
        const fz = compilar(c.z, ['s'])
        const a = compilar(c.a, [])()
        const b = compilar(c.b, [])()
        if (!(b > a)) throw new Error('el intervalo de s tiene que ir de menor a mayor')
        const N = Math.min(6000, Math.max(200, Math.round((64 * (b - a)) / (2 * Math.PI))))
        const p = poligonal((u) => [fx(u), fy(u), fz(u)], a, b, N)
        if (p.some((q) => q.some((v) => !Number.isFinite(v)))) throw new Error('la curva no es finita en todo el intervalo')
        return p
      })
      const ext = Math.max(0.5, ...pts.flat().map((q) => Math.max(Math.abs(q[0]), Math.abs(q[1]), Math.abs(q[2]))))
      g = { pts, ext }
    } catch (e) {
      g = { error: (e as Error).message }
    }
    if (memo.size > 30) memo.clear()
    memo.set(clave, g)
  }
  return g
}

const campoDe = (geo: Geometria, I: number) => (p: P3): P3 => {
  const B: P3 = [0, 0, 0]
  for (const c of geo.pts) {
    const d = campoPoligonal(c, p, I)
    B[0] += d[0]
    B[1] += d[1]
    B[2] += d[2]
  }
  return B
}

const cerrada = (c: P3[]) => Math.hypot(c[0][0] - c[c.length - 1][0], c[0][1] - c[c.length - 1][1], c[0][2] - c[c.length - 1][2]) < 1e-9

function Panel({ s, set }: PropsPanel<EstadoMagneto>) {
  const geo = geometria(s)
  return (
    <>
      <Grupo titulo="Corriente">
        <Atajos opciones={PRESETS.map((p) => ({ t: p.t, activo: JSON.stringify(s.curvas) === JSON.stringify(p.curvas), onClick: () => set({ preset: p.v, curvas: p.curvas }) }))} />
        {s.curvas.map((c, i) => (
          <div key={i}>
            {(['x', 'y', 'z'] as const).map((k) => (
              <Expresion key={k} etiqueta={`${k}(s) =`} valor={c[k]} variables={['s']} onChange={(v) => set({ preset: 'propia', curvas: s.curvas.map((d, j) => (j === i ? { ...d, [k]: v } : d)) })} />
            ))}
            <Expresion etiqueta="s desde" valor={c.a} variables={[]} onChange={(v) => set({ preset: 'propia', curvas: s.curvas.map((d, j) => (j === i ? { ...d, a: v } : d)) })} />
            <Expresion etiqueta="hasta" valor={c.b} variables={[]} onChange={(v) => set({ preset: 'propia', curvas: s.curvas.map((d, j) => (j === i ? { ...d, b: v } : d)) })} />
          </div>
        ))}
        {'error' in geo && <p className="aviso">{geo.error}</p>}
        <Rango etiqueta="I" valor={s.I} min={-3} max={3} paso={0.1} onChange={(I) => set({ I })} />
      </Grupo>
      <Grupo titulo="Sonda P y camino de Ampère (plano xz)">
        <Rango etiqueta="x" valor={s.P.x} min={-3} max={3} paso={0.01} onChange={(x) => set({ P: { ...s.P, x } })} />
        <Rango etiqueta="y" valor={s.P.y} min={-3} max={3} paso={0.01} onChange={(y) => set({ P: { ...s.P, y } })} />
        <Rango etiqueta="z" valor={s.P.z} min={-3} max={3} paso={0.01} onChange={(z) => set({ P: { ...s.P, z } })} />
        <Rango etiqueta="radio ρ" valor={s.rho} min={0.05} max={3} paso={0.01} onChange={(rho) => set({ rho })} />
        <Interruptor activo={s.lineas} onChange={(lineas) => set({ lineas })}>Líneas de B</Interruptor>
        <Interruptor activo={s.flechas} onChange={(flechas) => set({ flechas })}>B en el plano xz</Interruptor>
      </Grupo>
      <Resultado />
    </>
  )
}

function construir(e: Escena3D, s: EstadoMagneto) {
  e.zArriba(true)
  const geo = geometria(s)
  if ('error' in geo) {
    e.ejes(1.1)
    return
  }
  // todo se pinta escalado para que la corriente quepa en el cubo unidad
  const k = 1.1 / geo.ext
  const K = (p: P3): [number, number, number] => [p[0] * k, p[1] * k, p[2] * k]
  e.ejes(1.3, ['x', 'y', 'z'])
  const B = campoDe(geo, s.I)
  const colI = e.color('--pos')
  for (const c of geo.pts) {
    e.linea(c.map(K), colI)
    // sentido de la corriente
    for (const f of [0.13, 0.38, 0.63, 0.88]) {
      const i = Math.floor(f * (c.length - 2))
      const d: P3 = [c[i + 1][0] - c[i][0], c[i + 1][1] - c[i][1], c[i + 1][2] - c[i][2]]
      const n = Math.hypot(...d)
      if (n > 0) e.flecha([(0.12 * d[0] * Math.sign(s.I || 1)) / n, (0.12 * d[1] * Math.sign(s.I || 1)) / n, (0.12 * d[2] * Math.sign(s.I || 1)) / n], colI, K(c[i]), 0.012)
    }
  }
  if (s.flechas && s.I !== 0) {
    const n = 17
    const pos: number[] = []
    const col: number[] = []
    const muestras: Array<{ p: P3; b: P3; m: number }> = []
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        const p: P3 = [geo.ext * (-1.2 + (2.4 * i) / (n - 1)), 0, geo.ext * (-1.2 + (2.4 * j) / (n - 1))]
        const dmin = Math.min(...geo.pts.flatMap((c) => c.filter((_q, t) => t % 4 === 0).map((q) => Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]))))
        if (dmin < 0.06 * geo.ext) continue
        const b = B(p)
        muestras.push({ p, b, m: Math.hypot(...b) })
      }
    const orden = muestras.map((q) => q.m).sort((a, b) => a - b)
    const ref = orden[Math.floor(0.9 * (orden.length - 1))] || 1
    const c0 = e.color('--ink-soft')
    const c1 = e.color('--accent')
    for (const q of muestras) {
      const largo = (0.13 * Math.min(1, q.m / ref)) / Math.max(q.m, 1e-300)
      const a = K(q.p)
      pos.push(a[0], a[1], a[2], a[0] + q.b[0] * largo, a[1] + q.b[1] * largo, a[2] + q.b[2] * largo)
      const c = c0.clone().lerp(c1, Math.min(1, q.m / ref))
      col.push(c.r, c.g, c.b, c.r, c.g, c.b)
    }
    e.segmentos(new Float32Array(pos), new Float32Array(col))
  }
  if (s.lineas && s.I !== 0) {
    // semillas en el plano xz, entre el centro y la curva
    const c0 = geo.pts[0]
    const cm = [0, 1, 2].map((j) => geo.pts.flat().reduce((a, q) => a + q[j], 0) / geo.pts.flat().length) as P3
    const r = Math.max(0.1 * geo.ext, Math.hypot(c0[0][0] - cm[0], c0[0][1] - cm[1]) || 0.5 * geo.ext)
    const col = e.color('--aux')
    for (const f of [-0.8, -0.55, -0.3, 0.3, 0.55, 0.8]) {
      const semilla: P3 = [cm[0] + f * r, 0, cm[2]]
      const linea = lineaB(B, semilla, 0.02 * geo.ext, 2.2 * geo.ext, 700)
      e.linea(linea.map(K), col, 0.85)
    }
  }
  // sonda y camino de Ampère
  const P: P3 = [s.P.x, s.P.y, s.P.z]
  e.punto(K(P), e.color('--ink'), 0.03)
  const circ: Array<[number, number, number]> = []
  for (let i = 0; i <= 96; i++) {
    const t = (i / 96) * 2 * Math.PI
    circ.push(K([P[0] + s.rho * Math.cos(t), P[1], P[2] + s.rho * Math.sin(t)]))
  }
  e.linea(circ, e.color('--ocre'))
  const bP = B(P)
  const m = Math.hypot(...bP)
  if (m > 0 && Number.isFinite(m)) e.flecha([(0.35 * bP[0]) / m, (0.35 * bP[1]) / m, (0.35 * bP[2]) / m], e.color('--ink'), K(P), 0.014)
}

function lecturas(s: EstadoMagneto): Array<[string, string]> {
  const geo = geometria(s)
  if ('error' in geo) return [['No se puede', geo.error]]
  const B = campoDe(geo, s.I)
  const P: P3 = [s.P.x, s.P.y, s.P.z]
  const b = B(P)
  const filas: Array<[string, string]> = [
    ['B en P', `(${b.map((v) => v.toFixed(5)).join(', ')})`],
    ['|B| en P', Math.hypot(...b).toFixed(6)],
  ]
  const circ = circulacion(B, P, s.rho, [0, 1, 0], 24)
  filas.push(['∮ B·dl (camino, sentido x → z)', circ.toFixed(6)])
  if (s.I !== 0) filas.push(['∮ B·dl / (μ₀I) = vueltas enlazadas', (circ / s.I).toFixed(6)])
  if (!geo.pts.every(cerrada)) filas.push(['Ojo', 'la corriente no es cerrada: Ampère no tiene por qué cumplirse'])
  if (s.preset === 'espira') {
    const z = s.P.z
    filas.push(['En el eje a la altura de P (numérico)', B([0, 0, z])[2].toFixed(8)], ['Fórmula IR²/(2(R² + z²)^{3/2})', (s.I / (2 * (1 + z * z) ** 1.5)).toFixed(8)])
  } else if (s.preset === 'helmholtz') {
    filas.push(['Centro (numérico)', B([0, 0, 0])[2].toFixed(8)], ['Fórmula (4/5)^{3/2} I/R', (0.8 ** 1.5 * s.I).toFixed(8)])
  } else if (s.preset === 'solenoide') {
    const n = 20 / 3
    filas.push(['Centro (numérico)', B([0, 0, 0])[2].toFixed(6)], ['Lámina finita n I (L/2)/√(R² + L²/4)', ((n * s.I * 1.5) / Math.hypot(0.5, 1.5)).toFixed(6)], ['Infinito μ₀ n I', (n * s.I).toFixed(6)])
  } else if (s.preset === 'hilo') {
    const d = Math.hypot(s.P.x, s.P.y)
    const L = 4
    filas.push(['Hilo de largo 2L: (I/4πd)·2 cos α', ((s.I / (4 * Math.PI * d)) * ((L - s.P.z) / Math.hypot(L - s.P.z, d) + (L + s.P.z) / Math.hypot(L + s.P.z, d))).toFixed(8)], ['Infinito I/(2πd)', (s.I / (2 * Math.PI * d)).toFixed(8)])
  }
  return filas
}

export default definir<EstadoMagneto>({
  id: 'magnetostatica',
  area: 'fisica',
  resumen: 'Magnetostática: Biot–Savart sobre curvas escritas (espira, Helmholtz, solenoide, hilo), líneas de B y Ampère',
  corto: 'Magnetostática',
  titulo: 'Magneto<i>stática</i>',
  entradilla: 'Escribe la curva por la que pasa la corriente: sale su campo por Biot–Savart, con μ₀ = 1.',
  inicial: { preset: 'espira', curvas: PRESETS[0].curvas, I: 1, P: { x: 1, y: 0, z: 0.3 }, rho: 0.6, lineas: true, flechas: true },
  Panel,
  resultadoEnPanel: true,
  rotulo: (s) => ({ nombre: `I = ${s.I.toFixed(1)}`, apunte: s.preset }),
  formula: () => [
    String.raw`\mathbf B(\mathbf r)=\frac{\mu_0 I}{4\pi}\oint\frac{d\mathbf l\times(\mathbf r-\mathbf r')}{|\mathbf r-\mathbf r'|^3}\quad(\mu_0=1)`,
    String.raw`\oint_C\mathbf B\cdot d\mathbf l=\mu_0\,I_{\rm enl}`,
  ],
  lecturas,
  leyenda: () => (
    <>
      <Muestra color="var(--pos)">corriente</Muestra>
      <Muestra color="var(--accent)">B en el plano xz</Muestra>
      <Muestra color="var(--aux)">líneas de B</Muestra>
      <Muestra color="var(--ocre)">camino de Ampère</Muestra>
    </>
  ),
  comparaciones: [{ t: 'Espira frente a Helmholtz', a: { preset: 'espira', curvas: PRESETS[0].curvas }, b: { preset: 'helmholtz', curvas: PRESETS[1].curvas } }],
  vista: {
    tipo: '3d',
    camara: { theta: 0.5, phi: 1.2, r: 4.2 },
    pesada: true,
    construir,
    interaccion: {
      asas: (st) => {
        const geo = geometria(st)
        const k = 'error' in geo ? 1 : 1.1 / geo.ext
        return [{ id: 'P', p: [st.P.x * k, st.P.y * k, st.P.z * k], color: '--ink', nombre: 'P' }]
      },
      mover: (_id, t, st) => {
        const geo = geometria(st)
        const k = 'error' in geo ? 1 : 1.1 / geo.ext
        return { P: { x: t.p[0] / k, y: t.p[1] / k, z: t.p[2] / k } }
      },
    },
  },
})
