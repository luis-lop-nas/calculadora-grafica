import { definir, type PropsPanel } from '../../nucleo/tipos'
import { capaFija, capaVer, casilla, coords, radios } from '../../nucleo/menu'
import { Eleccion, Grupo, Interruptor, Nota, Rango } from '../../nucleo/controles'
import type { Pintor2D } from '../../render/pintor2d'

type Metrica = 'euclidea' | 'ponderada' | 'manhattan' | 'minkowski' | 'hiperbolica'

interface S {
  metricaA: Metrica
  metricaB: Metrica
  comparar: boolean
  p: [number, number]
  q: [number, number]
  pesoX: number
  pesoY: number
  orden: number
}

const NOMBRES: Record<Metrica, string> = {
  euclidea: 'Euclídea',
  ponderada: 'Euclídea ponderada',
  manhattan: 'Manhattan',
  minkowski: 'Minkowski',
  hiperbolica: 'Poincaré',
}

function distancia(m: Metrica, p: [number, number], q: [number, number], s: S) {
  const dx = q[0] - p[0]
  const dy = q[1] - p[1]
  if (m === 'euclidea') return Math.hypot(dx, dy)
  if (m === 'ponderada') return Math.hypot(s.pesoX * dx, s.pesoY * dy)
  if (m === 'manhattan') return Math.abs(dx) + Math.abs(dy)
  if (m === 'minkowski') return (Math.abs(dx) ** s.orden + Math.abs(dy) ** s.orden) ** (1 / s.orden)
  const np = Math.hypot(...p)
  const nq = Math.hypot(...q)
  const den = (1 - np * np) * (1 - nq * nq)
  const argumento = 1 + (2 * (dx * dx + dy * dy)) / Math.max(1e-12, den)
  return Math.acosh(Math.max(1, argumento))
}

function radioUnitario(m: Metrica, angulo: number, s: S) {
  const c = Math.cos(angulo)
  const d = Math.sin(angulo)
  if (m === 'euclidea') return 1
  if (m === 'ponderada') return 1 / Math.hypot(s.pesoX * c, s.pesoY * d)
  if (m === 'manhattan') return 1 / (Math.abs(c) + Math.abs(d))
  if (m === 'minkowski') return 1 / (Math.abs(c) ** s.orden + Math.abs(d) ** s.orden) ** (1 / s.orden)
  // En el modelo de Poincare, d(0,v)=2 atanh(|v|), así que d=1
  // corresponde a |v|=tanh(1/2). La frontera del disco es el infinito.
  return Math.tanh(0.5)
}

function puntoTexto(p: [number, number]) {
  return `(${p[0].toFixed(2)}, ${p[1].toFixed(2)})`
}

function Panel({ s, set }: PropsPanel<S>) {
  const opciones = Object.entries(NOMBRES).map(([v, t]) => ({ v: v as Metrica, t }))
  return (
    <>
      <Grupo titulo="Espacio y métrica">
        <Eleccion etiqueta="Métrica A" valor={s.metricaA} opciones={opciones} onChange={(metricaA) => set({ metricaA })} />
        <Interruptor activo={s.comparar} onChange={(comparar) => set({ comparar })}>
          Comparar con otra métrica
        </Interruptor>
        {s.comparar && <Eleccion etiqueta="Métrica B" valor={s.metricaB} opciones={opciones} onChange={(metricaB) => set({ metricaB })} />}
        <Nota>
          Una métrica define la distancia entre puntos. La bola unidad muestra todos los vectores de
          distancia 1; su forma cambia cuando cambia la geometría del espacio.
        </Nota>
      </Grupo>

      <Grupo titulo="Parámetros de la métrica">
        {(s.metricaA === 'ponderada' || s.metricaB === 'ponderada') && (
          <>
            <Rango etiqueta="Peso x" valor={s.pesoX} min={0.25} max={4} paso={0.05} formato={(v) => v.toFixed(2)} onChange={(pesoX) => set({ pesoX })} />
            <Rango etiqueta="Peso y" valor={s.pesoY} min={0.25} max={4} paso={0.05} formato={(v) => v.toFixed(2)} onChange={(pesoY) => set({ pesoY })} />
          </>
        )}
        {(s.metricaA === 'minkowski' || s.metricaB === 'minkowski') && (
          <Rango etiqueta="Orden p" valor={s.orden} min={1} max={6} paso={0.1} formato={(v) => v.toFixed(1)} onChange={(orden) => set({ orden })} />
        )}
      </Grupo>

      <Grupo titulo="Puntos a comparar">
        <Rango etiqueta="pₓ" valor={s.p[0]} min={-0.9} max={0.9} paso={0.01} formato={(v) => v.toFixed(2)} onChange={(x) => set({ p: [x, s.p[1]] })} />
        <Rango etiqueta="pᵧ" valor={s.p[1]} min={-0.9} max={0.9} paso={0.01} formato={(v) => v.toFixed(2)} onChange={(y) => set({ p: [s.p[0], y] })} />
        <Rango etiqueta="qₓ" valor={s.q[0]} min={-0.9} max={0.9} paso={0.01} formato={(v) => v.toFixed(2)} onChange={(x) => set({ q: [x, s.q[1]] })} />
        <Rango etiqueta="qᵧ" valor={s.q[1]} min={-0.9} max={0.9} paso={0.01} formato={(v) => v.toFixed(2)} onChange={(y) => set({ q: [s.q[0], y] })} />
      </Grupo>
    </>
  )
}

export default definir<S>({
  id: 'espacios',
  area: 'algebra',
  resumen: 'Espacios métricos euclídeos y no euclídeos',
  corto: 'Espacios métricos',
  titulo: 'Espacios <i>métricos</i>',
  entradilla: 'Compara distancias, bolas unidad y geometrías en espacios euclídeos y no euclídeos.',
  inicial: {
    metricaA: 'euclidea', metricaB: 'manhattan', comparar: true,
    p: [-0.55, -0.3], q: [0.5, 0.45], pesoX: 1.8, pesoY: 0.8, orden: 3,
  },
  Panel,
  capas: (s) => [
    capaFija<S>('A', `Bola unidad · ${NOMBRES[s.metricaA]}`, '--accent'),
    { ...capaVer(s, 'comparar', `Bola unidad · ${NOMBRES[s.metricaB]}`, '--pos') },
    capaFija<S>('p', 'p', '--ink', coords(s.p)),
    capaFija<S>('q', 'q', '--ink', coords(s.q)),
  ],
  menu: (s) => {
    const opciones = (Object.keys(NOMBRES) as Metrica[]).map((v) => ({ v, t: NOMBRES[v] }))
    return {
      acciones: [
        radios<S, Metrica>('Métrica A', opciones, s.metricaA, (metricaA) => ({ metricaA })),
        casilla<S>('Comparar con otra métrica', s.comparar, (comparar) => ({ comparar })),
        radios<S, Metrica>('Métrica B', opciones, s.metricaB, (metricaB) => ({ metricaB, comparar: true })),
      ],
    }
  },
  comparaciones: [
    { t: 'Otra métrica', a: { metricaA: 'euclidea', comparar: false }, b: { metricaA: 'manhattan', comparar: false } },
    { t: 'Euclídea / Poincaré', a: { metricaA: 'euclidea', comparar: false }, b: { metricaA: 'hiperbolica', comparar: false } },
  ],
  rotulo: (s) => ({ nombre: NOMBRES[s.metricaA], apunte: s.comparar ? `comparada con ${NOMBRES[s.metricaB]}` : 'métrica principal' }),
  formula: (s) => [
    s.metricaA === 'hiperbolica'
      ? String.raw`d_{\mathbb D}(p,q)=\operatorname{arcosh}\left(1+\frac{2\lVert p-q\rVert^2}{(1-\lVert p\rVert^2)(1-\lVert q\rVert^2)}\right)`
      : String.raw`d(p,q)=\lVert q-p\rVert_{${s.metricaA === 'manhattan' ? '1' : s.metricaA === 'minkowski' ? `p=${s.orden.toFixed(1)}` : '2'}}`,
    String.raw`B_d(0,1)=\{v:d(0,v)\le1\}`,
  ],
  lecturas: (s) => {
    const filas: Array<[string, string]> = [
      ['p', puntoTexto(s.p)], ['q', puntoTexto(s.q)],
      [`d_A(p,q)`, distancia(s.metricaA, s.p, s.q, s).toFixed(5)],
    ]
    if (s.comparar) filas.push([`d_B(p,q)`, distancia(s.metricaB, s.p, s.q, s).toFixed(5)])
    return filas
  },
  leyenda: (s) => (
    <>
      <span><span className="sw" style={{ background: 'var(--accent)' }} />bola unidad {NOMBRES[s.metricaA]}</span>
      {s.comparar && <span><span className="sw" style={{ background: 'var(--pos)' }} />bola unidad {NOMBRES[s.metricaB]}</span>}
      <span>p y q: {puntoTexto(s.p)} y {puntoTexto(s.q)}</span>
    </>
  ),
  pista: 'Arrastra para desplazar · rueda para ampliar',
  vista: {
    tipo: '2d',
    ventana: { x: [-1.25, 1.25], y: [-1.25, 1.25] },
    interaccion: {
      asas: (s) => [
        { id: 'p', p: s.p, color: '--accent', nombre: 'p' },
        { id: 'q', p: s.q, color: '--pos', nombre: 'q' },
      ],
      mover(id, t, s) {
        // en el disco de Poincaré los puntos no pueden salir del disco
        const hiper = s.metricaA === 'hiperbolica' || (s.comparar && s.metricaB === 'hiperbolica')
        let [x, y] = t.p.map((v) => Math.max(-0.95, Math.min(0.95, v)))
        const r = Math.hypot(x, y)
        if (hiper && r > 0.95) [x, y] = [(x * 0.95) / r, (y * 0.95) / r]
        return { [id]: [Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000] as [number, number] }
      },
    },
    dibujar(g: Pintor2D, s) {
      g.ejes({ etiquetaX: 'x', etiquetaY: 'y', paso: 0.5 })
      const dibujaBola = (m: Metrica, color: string, discontinua = false) => {
        const pts: Array<[number, number]> = []
        for (let i = 0; i <= 360; i++) {
          const t = (2 * Math.PI * i) / 360
          const r = radioUnitario(m, t, s)
          pts.push([r * Math.cos(t), r * Math.sin(t)])
        }
        g.curva(pts, color, 2.2, discontinua)
      }
      dibujaBola(s.metricaA, g.color('--accent'))
      if (s.comparar) dibujaBola(s.metricaB, g.color('--pos'), true)
      g.curva([s.p, s.q], g.color('--ink-soft'), 1.5, true)
      g.punto(s.p[0], s.p[1], g.color('--accent'), 5)
      g.punto(s.q[0], s.q[1], g.color('--pos'), 5)
      g.texto('p', s.p[0], s.p[1], g.color('--accent'), { dx: 8, dy: -9 })
      g.texto('q', s.q[0], s.q[1], g.color('--pos'), { dx: 8, dy: -9 })
    },
  },
})
