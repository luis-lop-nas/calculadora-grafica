import { definir, type PropsPanel } from '../../nucleo/tipos'
import { accion, capaFija, capaVer, casilla, coords, radios } from '../../nucleo/menu'
import { Atajos, Grupo, Interruptor, Muestra, Rango, Resultado, Segmentado } from '../../nucleo/controles'
import { contorno } from '../../lib/contorno'
import { campo, dentro, flujoEsfera, imagenes, lineaDeCampo, momentoDipolar, potencial, type Carga, type Conductor } from '../../lib/electro'
import type { Pintor2D } from '../../render/pintor2d'

export interface EstadoElectro {
  cargas: Carga[]
  conductor: Conductor
  R: number
  lineas: number
  equipotenciales: boolean
  verImagenes: boolean
  sonda: { x: number; y: number }
  rho: number
}

const MARCO = { x: [-4, 4] as [number, number], y: [-3, 3] as [number, number] }
const NIVELES = [-4, -2, -1, -0.5, -0.25, 0.25, 0.5, 1, 2, 4]

const PRESETS: Array<{ t: string; v: Partial<EstadoElectro> }> = [
  { t: 'Dipolo', v: { cargas: [{ q: 1, x: -1, y: 0 }, { q: -1, x: 1, y: 0 }], conductor: 'ninguno' } },
  { t: '+q y −2q', v: { cargas: [{ q: 1, x: -1, y: 0 }, { q: -2, x: 1, y: 0 }], conductor: 'ninguno' } },
  { t: 'Cuadrupolo', v: { cargas: [{ q: 1, x: -1, y: -1 }, { q: -1, x: 1, y: -1 }, { q: 1, x: 1, y: 1 }, { q: -1, x: -1, y: 1 }], conductor: 'ninguno' } },
  { t: 'Carga y plano', v: { cargas: [{ q: 1, x: 1.2, y: 0 }], conductor: 'plano' } },
  { t: 'Carga y esfera', v: { cargas: [{ q: 1, x: 2.2, y: 0.4 }], conductor: 'esfera', R: 1 } },
]

/** Cargas reales que respetan el conductor (fuera de él). */
function reales(s: EstadoElectro): Carga[] {
  return s.cargas.filter((c) => !dentro(s.conductor, s.R, c.x, c.y) && Math.hypot(c.x, c.y) > (s.conductor === 'esfera' ? s.R * 1.02 : 0))
}

function todas(s: EstadoElectro): { reales: Carga[]; imgs: Carga[]; todas: Carga[] } {
  const r = reales(s)
  const imgs = imagenes(r, s.conductor, s.R)
  return { reales: r, imgs, todas: [...r, ...imgs] }
}

function Panel({ s, set }: PropsPanel<EstadoElectro>) {
  return (
    <>
      <Grupo titulo="Cargas">
        <Atajos opciones={PRESETS.map((p) => ({ t: p.t, onClick: () => set(p.v) }))} />
        {s.cargas.map((c, i) => (
          <Rango
            key={i}
            etiqueta={`q${'₁₂₃₄₅₆₇₈'[i] ?? i + 1}`}
            valor={c.q}
            min={-3}
            max={3}
            paso={0.1}
            onChange={(q) => set({ cargas: s.cargas.map((d, j) => (j === i ? { ...d, q: Math.abs(q) < 1e-9 ? 0.1 : q } : d)) })}
          />
        ))}
      </Grupo>
      <Grupo titulo="Conductor a tierra">
        <Segmentado columnas={3} valor={s.conductor} opciones={[{ v: 'ninguno', t: 'Ninguno' }, { v: 'plano', t: 'Plano x = 0' }, { v: 'esfera', t: 'Esfera' }]} onChange={(conductor) => set({ conductor })} />
        {s.conductor === 'esfera' && <Rango etiqueta="radio R" valor={s.R} min={0.3} max={2} paso={0.05} onChange={(R) => set({ R })} />}
        {s.conductor !== 'ninguno' && <Interruptor activo={s.verImagenes} onChange={(verImagenes) => set({ verImagenes })}>Ver las cargas imagen</Interruptor>}
      </Grupo>
      <Grupo titulo="Dibujo">
        <Rango etiqueta="líneas por unidad de carga" valor={s.lineas} min={2} max={24} paso={1} formato={(v) => String(v)} onChange={(lineas) => set({ lineas: Math.round(lineas) })} />
        <Interruptor activo={s.equipotenciales} onChange={(equipotenciales) => set({ equipotenciales })}>Equipotenciales</Interruptor>
        <Rango etiqueta="radio de la esfera de Gauss ρ" valor={s.rho} min={0.1} max={3} paso={0.05} onChange={(rho) => set({ rho })} />
      </Grupo>
      <Resultado />
    </>
  )
}

/** Las líneas se cachean: trazarlas es lo caro y el estado cambia a cada arrastre. */
let cacheClave = ''
let cacheLineas: Array<Array<[number, number]>> = []

function lineas(s: EstadoElectro): Array<Array<[number, number]>> {
  const clave = JSON.stringify([s.cargas, s.conductor, s.R, s.lineas])
  if (clave === cacheClave) return cacheLineas
  const { reales: rs, todas: ts } = todas(s)
  const paraEn = (x: number, y: number) => dentro(s.conductor, s.R, x, y)
  const out: Array<Array<[number, number]>> = []
  const r0 = 0.05
  rs.forEach((c) => {
    const n = Math.max(1, Math.round(s.lineas * Math.abs(c.q)))
    const sentido = c.q > 0 ? 1 : -1
    for (let k = 0; k < n; k++) {
      const a = ((k + 0.5) * 2 * Math.PI) / n
      const l = lineaDeCampo(ts, c.x + r0 * Math.cos(a), c.y + r0 * Math.sin(a), sentido, MARCO, paraEn)
      // desde las negativas solo se dibujan las que no acaban en una positiva (esas ya salieron de ella)
      if (sentido < 0 && l.fin >= 0 && l.fin < rs.length) continue
      out.push([[c.x, c.y], ...l.pts])
    }
  })
  cacheClave = clave
  cacheLineas = out
  return out
}

function dibujar(g: Pintor2D, s: EstadoElectro) {
  g.ventana = { ...MARCO }
  g.igualarEscala()
  g.ejes({ rejilla: true })
  const { imgs, todas: ts } = todas(s)
  const fuera = (x: number, y: number) => !dentro(s.conductor, s.R, x, y)
  // conductor
  if (s.conductor === 'plano') g.rellenar([[-50, -50], [0, -50], [0, 50], [-50, 50]], g.color('--ink-soft'), 0.18)
  if (s.conductor === 'esfera') {
    const c: Array<[number, number]> = []
    for (let i = 0; i <= 96; i++) c.push([s.R * Math.cos((i / 96) * 2 * Math.PI), s.R * Math.sin((i / 96) * 2 * Math.PI)])
    g.rellenar(c, g.color('--ink-soft'), 0.25)
    g.curva(c, g.color('--ink-soft'), 1.4)
  }
  if (s.equipotenciales) {
    const vista = { x: g.ventana.x, y: g.ventana.y }
    const V = (x: number, y: number) => (fuera(x, y) ? potencial(ts, x, y) : 0)
    for (const nivel of NIVELES)
      for (const [a, b] of contorno(V, vista, nivel, 180, 140)) g.curva([a, b], g.color(nivel > 0 ? '--pos' : '--neg'), 0.9)
  }
  for (const l of lineas(s)) {
    g.curva(l, g.color('--ink-soft'), 1.1)
    // flecha a media línea en el sentido de E
    const m = Math.floor(l.length / 2)
    if (m > 2) {
      const [x, y] = l[m]
      const [ex, ey] = campo(ts, x, y)
      const n = Math.hypot(ex, ey)
      if (n > 0) g.flecha(x, y, (0.001 * ex) / n, (0.001 * ey) / n, g.color('--ink-soft'), 1.1, 6)
    }
  }
  // esfera de Gauss alrededor de la sonda
  const circ: Array<[number, number]> = []
  for (let i = 0; i <= 72; i++) circ.push([s.sonda.x + s.rho * Math.cos((i / 72) * 2 * Math.PI), s.sonda.y + s.rho * Math.sin((i / 72) * 2 * Math.PI)])
  g.curva(circ, g.color('--aux'), 1.3, true)
  if (fuera(s.sonda.x, s.sonda.y)) {
    const [ex, ey] = campo(ts, s.sonda.x, s.sonda.y)
    const n = Math.hypot(ex, ey)
    if (n > 0) {
      const largo = Math.min(0.9, 0.35 * Math.log1p(n) + 0.15)
      g.flecha(s.sonda.x, s.sonda.y, (largo * ex) / n, (largo * ey) / n, g.color('--aux'), 2, 8)
    }
  }
  if (s.verImagenes) for (const c of imgs) g.punto(c.x, c.y, g.color(c.q > 0 ? '--pos' : '--neg'), 4)
}

const flujo = (s: EstadoElectro) => {
  const { todas: ts } = todas(s)
  return flujoEsfera(ts, s.sonda.x, s.sonda.y, s.rho, 16)
}

const cortaConductor = (s: EstadoElectro) =>
  s.conductor === 'plano' ? s.sonda.x - s.rho < 0 : s.conductor === 'esfera' ? Math.hypot(s.sonda.x, s.sonda.y) - s.rho < s.R : false

export default definir<EstadoElectro>({
  id: 'electrostatica',
  area: 'fisica',
  resumen: 'Electrostática: cargas arrastrables, líneas de campo, equipotenciales, Gauss y cargas imagen en plano y esfera',
  corto: 'Electrostática',
  titulo: 'Electro<i>stática</i>',
  entradilla: 'Arrastra las cargas; doble clic añade una (+1, o −1 con Mayús) y doble clic sobre ella la quita.',
  inicial: {
    cargas: [{ q: 1, x: -1, y: 0 }, { q: -1, x: 1, y: 0 }],
    conductor: 'ninguno',
    R: 1,
    lineas: 10,
    equipotenciales: true,
    verImagenes: true,
    sonda: { x: 0.2, y: 1.6 },
    rho: 0.6,
  },
  Panel,
  capas: (s) => [
    ...s.cargas.map((c, i) => ({
      id: `q${i}`,
      nombre: `Carga ${c.q > 0 ? '+' : c.q < 0 ? '−' : ''}${Math.abs(c.q)}`,
      color: c.q >= 0 ? '--pos' : '--neg',
      detalle: coords([c.x, c.y]),
      quitar: s.cargas.length > 1 ? (t: EstadoElectro) => ({ cargas: t.cargas.filter((_, k) => k !== i) }) : undefined,
    })),
    capaFija<EstadoElectro>('lineas', 'Líneas de campo', '--ink-soft'),
    capaVer(s, 'equipotenciales', 'Equipotenciales', '--pos'),
    capaVer(s, 'verImagenes', 'Cargas imagen', '--aux'),
    capaFija<EstadoElectro>('sonda', 'Sonda y esfera de Gauss', '--aux', coords([s.sonda.x, s.sonda.y])),
  ],
  menu: (s) => ({
    anadir: [
      accion<EstadoElectro>('Carga +1', (t) => ({ cargas: [...t.cargas, { q: 1, x: 0, y: 1.5 }] }), s.cargas.length >= 8),
      accion<EstadoElectro>('Carga −1', (t) => ({ cargas: [...t.cargas, { q: -1, x: 0, y: -1.5 }] }), s.cargas.length >= 8),
    ],
    ejemplos: PRESETS.map((p) => accion<EstadoElectro>(p.t, () => p.v)),
    acciones: [
      radios<EstadoElectro, Conductor>('Conductor a tierra', [{ v: 'ninguno', t: 'Ninguno' }, { v: 'plano', t: 'Plano' }, { v: 'esfera', t: 'Esfera' }], s.conductor, (conductor) => ({ conductor })),
      casilla<EstadoElectro>('Equipotenciales', s.equipotenciales, (equipotenciales) => ({ equipotenciales })),
      accion<EstadoElectro>('Invertir todas las cargas', (t) => ({ cargas: t.cargas.map((c) => ({ ...c, q: -c.q })) })),
    ],
  }),
  resultadoEnPanel: true,
  rotulo: (s) => ({ nombre: `${s.cargas.length} carga${s.cargas.length === 1 ? '' : 's'}`, apunte: s.conductor === 'ninguno' ? 'vacío' : `${s.conductor} a tierra` }),
  formula: () => [
    String.raw`\mathbf E=\sum_i \frac{q_i\,(\mathbf r-\mathbf r_i)}{|\mathbf r-\mathbf r_i|^3}\quad(k=1)`,
    String.raw`V=\sum_i\frac{q_i}{|\mathbf r-\mathbf r_i|}`,
    String.raw`\oint \mathbf E\cdot d\mathbf S=4\pi\,q_{\rm enc}`,
  ],
  lecturas: (s) => {
    const { reales: rs, imgs, todas: ts } = todas(s)
    const filas: Array<[string, string]> = []
    if (rs.length < s.cargas.length) filas.push(['Aviso', 'las cargas dentro del conductor no cuentan'])
    const { x, y } = s.sonda
    if (dentro(s.conductor, s.R, x, y)) filas.push(['En la sonda', 'dentro del conductor: V = 0, E = 0'])
    else {
      const [ex, ey] = campo(ts, x, y)
      filas.push(['V en la sonda', potencial(ts, x, y).toFixed(6)], ['|E| en la sonda', Math.hypot(ex, ey).toFixed(6)])
    }
    const qtot = rs.reduce((a, c) => a + c.q, 0)
    filas.push(['Carga total', qtot.toFixed(3)])
    const p = momentoDipolar(rs)
    filas.push(['Momento dipolar p', `(${p[0].toFixed(3)}, ${p[1].toFixed(3)})`])
    if (cortaConductor(s)) filas.push(['Gauss', 'la esfera corta el conductor'])
    else {
      const enc = ts.filter((c) => Math.hypot(c.x - x, c.y - y) < s.rho).reduce((a, c) => a + c.q, 0)
      filas.push(['Flujo / 4π (integrado)', (flujo(s) / (4 * Math.PI)).toFixed(8)], ['Carga encerrada', enc.toFixed(8)])
    }
    if (imgs.length) filas.push(['Carga inducida en el conductor', imgs.reduce((a, c) => a + c.q, 0).toFixed(6)])
    return filas
  },
  leyenda: () => (
    <>
      <Muestra color="var(--ink-soft)">líneas de campo</Muestra>
      <Muestra color="var(--pos)">V &gt; 0</Muestra>
      <Muestra color="var(--neg)">V &lt; 0</Muestra>
      <Muestra color="var(--aux)">sonda y esfera de Gauss</Muestra>
    </>
  ),
  comparaciones: [{ t: 'Carga sola frente a carga con plano', a: { cargas: [{ q: 1, x: 1.2, y: 0 }], conductor: 'ninguno' }, b: { cargas: [{ q: 1, x: 1.2, y: 0 }], conductor: 'plano' } }],
  vista: {
    tipo: '2d',
    navegable: false,
    interaccion: {
      asas: (st) => [
        ...st.cargas.map((c, i) => ({ id: `q${i}`, p: [c.x, c.y], color: c.q > 0 ? '--pos' : '--neg', nombre: `${c.q > 0 ? '+' : '−'}${Math.abs(c.q).toFixed(1)}` })),
        { id: 'sonda', p: [st.sonda.x, st.sonda.y], color: '--aux', nombre: 'P' },
      ],
      mover: (id, t, st) => {
        const [x, y] = t.p
        if (id === 'sonda') return { sonda: { x, y } }
        const i = Number(id.slice(1))
        return { cargas: st.cargas.map((c, j) => (j === i ? { ...c, x, y } : c)) }
      },
      anadir: (t, st) => (st.cargas.length < 8 ? { cargas: [...st.cargas, { q: t.mayus ? -1 : 1, x: t.p[0], y: t.p[1] }] } : undefined),
      quitar: (id, st) => (id === 'sonda' || st.cargas.length <= 1 ? undefined : { cargas: st.cargas.filter((_c, j) => `q${j}` !== id) }),
    },
    dibujar,
  },
})
