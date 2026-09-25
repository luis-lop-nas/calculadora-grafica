import { definir, type PropsPanel, type Vista } from '../../nucleo/tipos'
import { accion, capaFija, casilla, radios } from '../../nucleo/menu'
import { Atajos, Boton, Grupo, Interruptor, Muestra, Rango, Resultado, Segmentado } from '../../nucleo/controles'
import { cauchy, corteEje, desviacionMinima, desviacionPrisma, focales, imagen, matrizLentes, reflejoEsferico, trazar, type Lente } from '../../lib/rayos'
import { colorLongitud } from '../../lib/optica'
import type { Pintor2D } from '../../render/pintor2d'

type Modo = 'lentes' | 'espejo' | 'prisma'

export interface EstadoGeometrica {
  modo: Modo
  lentes: Lente[]
  z0: number
  h: number
  R: number
  rayos: number
  hmax: number
  A: number
  t1: number
  blanca: boolean
}

const PRESETS: Array<{ t: string; lentes: Lente[]; z0: number }> = [
  { t: 'Lupa', lentes: [{ z: 0, f: 12 }], z0: -8 },
  { t: 'Proyector', lentes: [{ z: 0, f: 12 }], z0: -20 },
  { t: 'Divergente', lentes: [{ z: 0, f: -12 }], z0: -24 },
  { t: 'Kepler (anteojo)', lentes: [{ z: 0, f: 24 }, { z: 32, f: 8 }], z0: -60 },
  { t: 'Galileo', lentes: [{ z: 0, f: 24 }, { z: 16, f: -8 }], z0: -60 },
  { t: 'Microscopio', lentes: [{ z: 0, f: 6 }, { z: 36, f: 10 }], z0: -7 },
]

const grados = (x: number) => `${((x * 180) / Math.PI).toFixed(3)}°`
const f3 = (x: number) => (Number.isFinite(x) ? x.toFixed(3) : '∞')

function Panel({ s, set }: PropsPanel<EstadoGeometrica>) {
  return (
    <>
      <Grupo titulo="Óptica geométrica">
        <Segmentado valor={s.modo} opciones={[{ v: 'lentes', t: 'Lentes (ABCD)' }, { v: 'espejo', t: 'Espejo' }, { v: 'prisma', t: 'Prisma' }]} onChange={(modo) => set({ modo })} />
      </Grupo>
      {s.modo === 'lentes' && (
        <Grupo titulo="Lentes delgadas">
          <Atajos opciones={PRESETS.map((p) => ({ t: p.t, onClick: () => set({ lentes: p.lentes, z0: p.z0 }) }))} />
          {s.lentes.map((l, i) => (
            <Rango key={i} etiqueta={`f${'₁₂₃'[i]}`} valor={l.f} min={-40} max={40} paso={0.5} onChange={(f) => set({ lentes: s.lentes.map((m, j) => (j === i ? { ...m, f: Math.abs(f) < 0.5 ? 0.5 * Math.sign(f || 1) : f } : m)) })} />
          ))}
          <div style={{ display: 'flex', gap: 16 }}>
            {s.lentes.length < 3 && <Boton onClick={() => set({ lentes: [...s.lentes, { z: Math.max(...s.lentes.map((l) => l.z)) + 15, f: 10 }] })}>Añadir lente</Boton>}
            {s.lentes.length > 1 && <Boton onClick={() => set({ lentes: s.lentes.slice(0, -1) })}>Quitar la última</Boton>}
          </div>
          <Rango etiqueta="altura del objeto" valor={s.h} min={-8} max={8} paso={0.1} onChange={(h) => set({ h })} />
        </Grupo>
      )}
      {s.modo === 'espejo' && (
        <Grupo titulo="Espejo esférico cóncavo">
          <Rango etiqueta="radio R" valor={s.R} min={4} max={30} paso={0.1} onChange={(R) => set({ R })} />
          <Rango etiqueta="apertura (altura máxima / R)" valor={s.hmax} min={0.05} max={0.98} paso={0.01} onChange={(hmax) => set({ hmax })} />
          <Rango etiqueta="número de rayos" valor={s.rayos} min={3} max={60} paso={1} formato={(v) => String(v)} onChange={(rayos) => set({ rayos: Math.round(rayos) })} />
        </Grupo>
      )}
      {s.modo === 'prisma' && (
        <Grupo titulo="Prisma de vidrio (Cauchy)">
          <Rango etiqueta="ángulo del prisma A" valor={s.A} min={0.2} max={1.4} paso={0.01} formato={grados} onChange={(A) => set({ A })} />
          <Rango etiqueta="incidencia θ₁" valor={s.t1} min={0} max={1.5} paso={0.002} formato={grados} onChange={(t1) => set({ t1 })} />
          <Interruptor activo={s.blanca} onChange={(blanca) => set({ blanca })}>Luz blanca (varias λ)</Interruptor>
          <Atajos opciones={[{ t: 'Ir a la desviación mínima', onClick: () => set({ t1: Math.asin(cauchy(550) * Math.sin(s.A / 2)) }) }]} />
        </Grupo>
      )}
      <Resultado />
    </>
  )
}

/* ── lentes ── */

function marco(s: EstadoGeometrica) {
  const zs = [s.z0, ...s.lentes.map((l) => l.z)]
  const im = imagen(s.lentes, s.z0)
  if (Number.isFinite(im.z) && Math.abs(im.z) < 400) zs.push(im.z)
  const zmin = Math.min(...zs) - 12
  const zmax = Math.max(...zs) + 20
  return { zmin, zmax }
}

function flechaVertical(g: Pintor2D, z: number, h: number, color: string, discontinua = false) {
  g.curva([[z, 0], [z, h]], color, 2.4, discontinua)
  g.flecha(z, h * 0.999, 0, h * 0.001, color, 2.4, 9)
}

function dibujarLentes(g: Pintor2D, s: EstadoGeometrica) {
  const { zmin, zmax } = marco(s)
  const H = Math.max(10, Math.abs(s.h) * 2.2)
  g.ventana = { x: [zmin, zmax], y: [-H, H] }
  g.igualarEscala()
  g.ejes({ etiquetaX: 'z' })
  const ls = [...s.lentes].sort((a, b) => a.z - b.z)
  const hl = 0.8 * H
  for (const l of ls) {
    const c = g.color('--accent')
    g.curva([[l.z, -hl], [l.z, hl]], c, 2)
    // puntas hacia fuera si converge, hacia dentro si diverge
    const k = 0.04 * H * (l.f > 0 ? 1 : -1)
    g.curva([[l.z - Math.abs(k), hl - k], [l.z, hl], [l.z + Math.abs(k), hl - k]], c, 2)
    g.curva([[l.z - Math.abs(k), -hl + k], [l.z, -hl], [l.z + Math.abs(k), -hl + k]], c, 2)
    g.punto(l.z - l.f, 0, g.color('--ink-soft'), 3)
    g.punto(l.z + l.f, 0, g.color('--ink-soft'), 3)
  }
  flechaVertical(g, s.z0, s.h, g.color('--pos'))
  const im = imagen(ls, s.z0)
  // rayos desde la punta del objeto: paralelo, por el centro de la primera lente y por su foco anterior
  const l1 = ls[0]
  const pendientes = [0, -s.h / (l1.z - s.z0), l1.z - l1.f - s.z0 !== 0 ? -s.h / (l1.z - l1.f - s.z0) : 0.2]
  const colores = ['--ocre', '--aux', '--rosa']
  pendientes.forEach((t, i) => {
    const pts = trazar(ls, s.z0, [s.h, t], zmax)
    g.curva(pts, g.color(colores[i]), 1.5)
    // prolongación hacia atrás desde la última lente, para ver una imagen virtual
    if (!im.real) {
      const a = pts[pts.length - 2]
      const b = pts[pts.length - 1]
      const m = (b[1] - a[1]) / (b[0] - a[0])
      g.curva([a, [zmin, a[1] + m * (zmin - a[0])]], g.color(colores[i]), 0.8, true)
    }
  })
  if (Number.isFinite(im.z) && Math.abs(im.m) < 50) flechaVertical(g, im.z, s.h * im.m, g.color('--pos'), !im.real)
}

/* ── espejo ── */

function dibujarEspejo(g: Pintor2D, s: EstadoGeometrica) {
  const R = s.R
  const hm = s.hmax * R
  g.ventana = { x: [-1.2 * R, 0.35 * R], y: [-0.75 * R, 0.75 * R] }
  g.igualarEscala()
  g.ejes({ etiquetaX: 'z' })
  const arco: Array<[number, number]> = []
  for (let i = 0; i <= 200; i++) {
    const h = -hm * 1.05 + (2.1 * hm * i) / 200
    if (Math.abs(h) < R) arco.push([-R + Math.sqrt(R * R - h * h), h])
  }
  g.curva(arco, g.color('--ink'), 3)
  for (let k = 0; k < s.rayos; k++) {
    const h = -hm + (2 * hm * (k + 0.5)) / s.rayos
    const r = reflejoEsferico(R, h)
    if (!r) continue
    const largo = 1.1 * R
    g.curva([[-1.2 * R, h], r.p, [r.p[0] + largo * r.d[0], r.p[1] + largo * r.d[1]]], g.color('--ocre'), 1, false)
  }
  g.punto(-R / 2, 0, g.color('--pos'), 5)
  g.texto('F paraxial', -R / 2, 0, g.color('--pos'), { dy: -12, alinea: 'center' })
  g.punto(-R, 0, g.color('--ink-soft'), 4)
  g.texto('C', -R, 0, g.color('--ink-soft'), { dy: -12 })
}

/* ── prisma ── */

type V = [number, number]
const norm = (v: V): V => {
  const n = Math.hypot(v[0], v[1])
  return [v[0] / n, v[1] / n]
}

/** Snell vectorial: d incidente unitario, n normal unitaria contra la que llega (n·d < 0). */
function refractar(d: V, n: V, n1: number, n2: number): V | null {
  const c = -(d[0] * n[0] + d[1] * n[1])
  const r = n1 / n2
  const k = 1 - r * r * (1 - c * c)
  if (k < 0) return null
  const f = r * c - Math.sqrt(k)
  return [r * d[0] + f * n[0], r * d[1] + f * n[1]]
}

function cortar(p: V, d: V, a: V, b: V): V | null {
  const e: V = [b[0] - a[0], b[1] - a[1]]
  const den = d[0] * e[1] - d[1] * e[0]
  if (Math.abs(den) < 1e-14) return null
  const t = ((a[0] - p[0]) * e[1] - (a[1] - p[1]) * e[0]) / den
  const u = ((a[0] - p[0]) * d[1] - (a[1] - p[1]) * d[0]) / den
  return t > 1e-9 && u >= 0 && u <= 1 ? [p[0] + t * d[0], p[1] + t * d[1]] : null
}

function dibujarPrisma(g: Pintor2D, s: EstadoGeometrica) {
  g.region(0, 0, 0.58, 1)
  g.ventana = { x: [-2.6, 2.6], y: [-1.4, 2.2] }
  g.igualarEscala()
  const H = 1.8
  const b = H * Math.tan(s.A / 2)
  const [P0, P1, P2]: V[] = [[-b, 0], [0, H], [b, 0]]
  g.rellenar([P0, P1, P2], g.color('--accent'), 0.18)
  g.curva([P0, P1, P2, P0], g.color('--accent'), 1.6)
  // cara izquierda: normal exterior
  const nI = norm([-(P1[1] - P0[1]), P1[0] - P0[0]])
  const entrada: V = [P0[0] + 0.45 * (P1[0] - P0[0]), P0[1] + 0.45 * (P1[1] - P0[1])]
  // dirección incidente: −n girada θ₁ hacia abajo (llega desde abajo a la izquierda)
  const c = Math.cos(s.t1)
  const sn = Math.sin(s.t1)
  const menosN: V = [-nI[0], -nI[1]]
  const din: V = [menosN[0] * c - menosN[1] * sn, menosN[0] * sn + menosN[1] * c]
  g.curva([[entrada[0] - 2.5 * din[0], entrada[1] - 2.5 * din[1]], entrada], g.color('--ink'), 2.2)
  g.curva([entrada, [entrada[0] + 0.6 * nI[0], entrada[1] + 0.6 * nI[1]]], g.color('--ink-soft'), 0.8, true)
  const lambdas = s.blanca ? [420, 460, 500, 540, 580, 620, 680] : [550]
  for (const l of lambdas) {
    const n = cauchy(l)
    const d1 = refractar(din, nI, 1, n)
    if (!d1) continue
    const q = cortar(entrada, d1, P1, P2)
    const col = `rgb(${colorLongitud(l).map((v) => Math.round(v * 255)).join(',')})`
    if (!q) continue
    g.curva([entrada, q], col, 1.4)
    const nD = norm([P2[1] - P1[1], -(P2[0] - P1[0])])
    const d2 = refractar(d1, nD, n, 1)
    if (!d2) {
      g.texto('reflexión total', q[0], q[1], g.color('--rosa'), { dx: 6 })
      continue
    }
    g.curva([q, [q[0] + 2.6 * d2[0], q[1] + 2.6 * d2[1]]], col, 1.8)
  }
  g.finRegion()
  // δ(θ₁) con su mínimo
  g.region(0.6, 0.08, 0.4, 0.84)
  const n = cauchy(550)
  const ds: Array<[number, number]> = []
  for (let i = 0; i <= 400; i++) {
    const t = (1.55 * i) / 400
    const d = desviacionPrisma(s.A, n, t)
    if (d !== null) ds.push([(t * 180) / Math.PI, (d * 180) / Math.PI])
  }
  const ys = ds.map((p) => p[1])
  const ymin = Math.min(...ys, 0)
  const ymax = Math.max(...ys, 10)
  g.ventana = { x: [0, 90], y: [ymin - 3, ymax + 5] }
  g.ejes({ etiquetaX: 'θ₁ (°)', etiquetaY: 'δ (°)' })
  g.curva(ds, g.color('--accent'), 2)
  const dm = (desviacionMinima(s.A, n) * 180) / Math.PI
  g.curva([[0, dm], [90, dm]], g.color('--pos'), 1, true)
  const dAct = desviacionPrisma(s.A, n, s.t1)
  if (dAct !== null) g.punto((s.t1 * 180) / Math.PI, (dAct * 180) / Math.PI, g.color('--ink'), 4)
  g.finRegion()
}

const VISTAS: Record<Modo, Vista<EstadoGeometrica>> = {
  lentes: {
    tipo: '2d',
    clave: 'lentes',
    navegable: false,
    interaccion: {
      asas: (st) => [
        { id: 'objeto', p: [st.z0, st.h], color: '--pos', nombre: 'objeto' },
        ...st.lentes.map((l, i) => ({ id: `l${i}`, p: [l.z, 0], color: '--accent', eje: 'x' as const, nombre: `L${i + 1}` })),
      ],
      mover: (id, t, st) => {
        if (id === 'objeto') {
          const zPrimera = Math.min(...st.lentes.map((l) => l.z))
          return { z0: Math.min(t.p[0], zPrimera - 0.5), h: t.p[1] }
        }
        const i = Number(id.slice(1))
        return { lentes: st.lentes.map((l, j) => (j === i ? { ...l, z: Math.max(t.p[0], st.z0 + 0.5) } : l)) }
      },
      pista: 'Arrastra el objeto y las lentes',
    },
    dibujar: (g, st) => dibujarLentes(g, st),
  },
  espejo: { tipo: '2d', clave: 'espejo', navegable: false, dibujar: (g, st) => dibujarEspejo(g, st) },
  prisma: { tipo: '2d', clave: 'prisma', navegable: false, dibujar: (g, st) => dibujarPrisma(g, st) },
}

function lecturas(s: EstadoGeometrica): Array<[string, string]> {
  if (s.modo === 'lentes') {
    const im = imagen(s.lentes, s.z0)
    const F = focales(s.lentes)
    const filas: Array<[string, string]> = [
      ['Imagen en z', f3(im.z)],
      ['Aumento lateral m', f3(im.m)],
      ['Imagen', `${im.real ? 'real' : 'virtual'}, ${im.m < 0 ? 'invertida' : 'derecha'}`],
    ]
    if (s.lentes.length > 1) {
      const escala = Math.max(...s.lentes.map((l) => 1 / Math.abs(l.f)))
      // un sistema afocal (C = 0) no tiene focal: manda haces paralelos a haces paralelos
      if (!Number.isFinite(F.f) || Math.abs(1 / F.f) < 1e-9 * escala) {
        const M = matrizLentes(s.lentes)
        filas.push(['Sistema', 'afocal (focal ∞)'], ['Aumento angular D', f3(M[1][1])])
      } else filas.push(['Focal efectiva del sistema', f3(F.f)], ['Foco posterior (desde la última lente)', f3(F.posterior)])
    }
    else filas.push(['Comprobación 1/s + 1/s′', `${f3(1 / (s.lentes[0].z - s.z0) + 1 / (im.z - s.lentes[0].z))} = 1/f = ${f3(1 / s.lentes[0].f)}`])
    return filas
  }
  if (s.modo === 'espejo') {
    const hm = s.hmax * s.R
    const zb = corteEje(s.R, hm)
    return [
      ['Foco paraxial (distancia al vértice) R/2', f3(s.R / 2)],
      ['Corte del rayo más alto (distancia al vértice)', f3(-zb)],
      ['Fórmula R − R/(2 cos α)', f3(s.R - s.R / (2 * Math.cos(Math.asin(s.hmax))))],
      ['Aberración longitudinal', f3(s.R / 2 + zb)],
    ]
  }
  const n = cauchy(550)
  const d = desviacionPrisma(s.A, n, s.t1)
  return [
    ['n(550 nm) (Cauchy)', n.toFixed(5)],
    ['Desviación δ', d === null ? 'reflexión total en la 2.ª cara' : grados(d)],
    ['Desviación mínima (fórmula)', grados(desviacionMinima(s.A, n))],
    ['Dispersión δ(420) − δ(680) en el mínimo', grados(desviacionMinima(s.A, cauchy(420)) - desviacionMinima(s.A, cauchy(680)))],
  ]
}

export default definir<EstadoGeometrica>({
  id: 'geometrica',
  area: 'fisica',
  resumen: 'Óptica geométrica: sistemas de lentes con matrices ABCD, aberración de un espejo esférico y dispersión en un prisma',
  corto: 'Óptica geométrica',
  titulo: 'Óptica <i>geométrica</i>',
  entradilla: 'Arrastra objeto y lentes: la imagen sale de la matriz ABCD y los rayos, de trazarlos.',
  inicial: { modo: 'lentes', lentes: PRESETS[1].lentes, z0: PRESETS[1].z0, h: 4, R: 16, rayos: 21, hmax: 0.8, A: Math.PI / 3, t1: 0.85, blanca: true },
  Panel,
  capas: (s) =>
    s.modo === 'lentes'
      ? [
          capaFija<EstadoGeometrica>('obj', 'Objeto e imagen', '--pos'),
          ...s.lentes.map((l, i) => ({
            id: `L${i}`,
            nombre: `Lente ${i + 1}`,
            color: '--accent',
            detalle: `f = ${String(l.f).replace('.', ',')} en z = ${String(Math.round(l.z * 100) / 100).replace('.', ',')}`,
            quitar: s.lentes.length > 1 ? (t: EstadoGeometrica) => ({ lentes: t.lentes.filter((_, k) => k !== i) }) : undefined,
          })),
        ]
      : [],
  menu: (s) => ({
    anadir: s.modo === 'lentes' ? [accion<EstadoGeometrica>('Lente convergente f = 10', (t) => ({ lentes: [...t.lentes, { z: (t.lentes.at(-1)?.z ?? 0) + 15, f: 10 }] }), s.lentes.length >= 3)] : [],
    ejemplos: PRESETS.map((p) => accion<EstadoGeometrica>(p.t, () => ({ modo: 'lentes', lentes: p.lentes, z0: p.z0 }))),
    acciones: [
      radios<EstadoGeometrica, Modo>('Experimento', [{ v: 'lentes', t: 'Sistema de lentes (ABCD)' }, { v: 'espejo', t: 'Espejo esférico' }, { v: 'prisma', t: 'Prisma' }], s.modo, (modo) => ({ modo })),
      casilla<EstadoGeometrica>('Luz blanca en el prisma', s.blanca, (blanca) => ({ blanca })),
    ],
  }),
  resultadoEnPanel: true,
  rotulo: (s) => ({ nombre: { lentes: `${s.lentes.length} lente${s.lentes.length > 1 ? 's' : ''}`, espejo: 'Espejo esférico', prisma: 'Prisma' }[s.modo], apunte: '' }),
  formula: (s) =>
    s.modo === 'lentes'
      ? [String.raw`\begin{pmatrix}y'\\\theta'\end{pmatrix}=\begin{pmatrix}A&B\\C&D\end{pmatrix}\begin{pmatrix}y\\\theta\end{pmatrix},\quad L_f=\begin{pmatrix}1&0\\-1/f&1\end{pmatrix}`, String.raw`\frac1s+\frac1{s'}=\frac1f,\qquad \frac1f=\frac1{f_1}+\frac1{f_2}-\frac{d}{f_1f_2}`]
      : s.modo === 'espejo'
        ? [String.raw`z_{\rm corte}=R-\frac{R}{2\cos\alpha},\quad \sin\alpha=\frac hR\ \xrightarrow{h\to0}\ \frac R2`]
        : [String.raw`\delta=\theta_1+\theta_2'-A,\qquad n=\frac{\sin\frac{A+\delta_{\min}}2}{\sin\frac A2}`, String.raw`n(\lambda)=a+\frac{b}{\lambda^2}`],
  lecturas,
  leyenda: (s) =>
    s.modo === 'lentes' ? (
      <>
        <Muestra color="var(--pos)">objeto e imagen</Muestra>
        <Muestra color="var(--ocre)">rayo paralelo</Muestra>
        <Muestra color="var(--aux)">por el centro</Muestra>
        <Muestra color="var(--rosa)">por el foco</Muestra>
      </>
    ) : s.modo === 'espejo' ? (
      <>
        <Muestra color="var(--ocre)">rayos exactos (cáustica)</Muestra>
        <Muestra color="var(--pos)">foco paraxial</Muestra>
      </>
    ) : (
      <>
        <Muestra color="var(--accent)">δ(θ₁) a 550 nm</Muestra>
        <Muestra color="var(--pos)">mínima desviación</Muestra>
      </>
    ),
  comparaciones: [{ t: 'Kepler frente a Galileo', a: { modo: 'lentes', lentes: PRESETS[3].lentes, z0: -60 }, b: { modo: 'lentes', lentes: PRESETS[4].lentes, z0: -60 } }],
  vista: (s) => VISTAS[s.modo],
})
