import { definir, type PropsPanel } from '../../nucleo/tipos'
import { Atajos, Expresion, Grupo, Interruptor, Matriz, Muestra, Nota, Rango, Segmentado } from '../../nucleo/controles'
import { compilarCSuave } from '../../lib/expresion'
import * as K from '../../lib/complejo'
import type { Pintor2D } from '../../render/pintor2d'

type Modo = 'dominio' | 'rejilla' | 'polya'

interface S {
  expr: string
  modo: Modo
  resolucion: number
  bandas: boolean
  sonda: number[][]
  fuente: number
}

const EJEMPLOS = [
  { t: 'z²', e: 'z^2' },
  { t: 'z³ − 1', e: 'z^3-1' },
  { t: '1/z', e: '1/z' },
  { t: 'Möbius', e: '(z-1)/(z+1)' },
  { t: 'eᶻ', e: 'exp(z)' },
  { t: 'sen z', e: 'sin(z)' },
  { t: 'log z', e: 'ln(z)' },
  { t: 'z + 1/z', e: 'z+1/z' },
  { t: 'Esencial', e: 'exp(1/z)' },
]

/** HSL → RGB, en [0, 255]. */
function hsl(h: number, s: number, l: number): [number, number, number] {
  const k = (n: number) => (n + h * 12) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => l - a * Math.max(-1, Math.min(Math.min(k(n) - 3, 9 - k(n)), 1))
  return [Math.round(255 * f(0)), Math.round(255 * f(8)), Math.round(255 * f(4))]
}

let auxiliar: HTMLCanvasElement | null = null
function lienzoAuxiliar(w: number, h: number) {
  if (!auxiliar) auxiliar = document.createElement('canvas')
  auxiliar.width = w
  auxiliar.height = h
  return auxiliar
}

function Panel({ s, set }: PropsPanel<S>) {
  return (
    <>
      <Grupo titulo="Función f(z)">
        <Expresion
          etiqueta="f(z) ="
          valor={s.expr}
          variables={['z']}
          onChange={(expr: string) => set({ expr })}
          piezas={['exp(', 'ln(', 'sin(', 'cos(', 'sqrt(', '^', 'pi', '(', ')']}
        />
        <Atajos opciones={EJEMPLOS.map((e) => ({ t: e.t, activo: s.expr === e.e, onClick: () => set({ expr: e.e }) }))} />
      </Grupo>

      <Grupo titulo="Representación">
        <Segmentado
          columnas={3}
          valor={s.modo}
          opciones={[
            { v: 'dominio' as Modo, t: 'Dominio' },
            { v: 'rejilla' as Modo, t: 'Rejilla' },
            { v: 'polya' as Modo, t: 'Pólya' },
          ]}
          onChange={(modo) => set({ modo })}
        />
        <Nota>
          {s.modo === 'dominio' ? (
            <>
              Cada punto del plano se pinta con el <b>color de la fase</b> de f(z) y el brillo de su
              módulo. Un cero recorre el arcoíris una vez por cada orden; un polo, al revés.
            </>
          ) : s.modo === 'rejilla' ? (
            <>
              Se dibuja la <b>imagen de una rejilla</b>. Donde f es holomorfa y f′ ≠ 0, los cortes
              siguen siendo perpendiculares: eso es ser conforme.
            </>
          ) : (
            <>
              El campo de <b>Pólya</b> es el conjugado de f: sus fuentes y sumideros son los polos y
              los ceros, y su circulación cuenta los residuos.
            </>
          )}
        </Nota>
        <Nota>
          El lienzo es el <b>plano de entrada</b>: horizontal = Re z y vertical = Im z. En el mapa,
          el tono codifica arg f(z) y el brillo codifica |f(z)|. La sonda z₀ y su imagen aparecen
          con valores exactos en las lecturas.
        </Nota>
        {s.modo === 'dominio' && (
          <>
            <Rango etiqueta="Resolución" valor={s.resolucion} min={160} max={640} paso={20} formato={(v) => `${v} px`} onChange={(resolucion) => set({ resolucion })} />
            <div className="interruptores">
              <Interruptor activo={s.bandas} onChange={(bandas) => set({ bandas })}>
                Bandas de módulo
              </Interruptor>
            </div>
          </>
        )}
        {s.modo !== 'dominio' && (
          <Rango etiqueta="Tamaño de la rejilla" valor={s.fuente} min={0.5} max={4} paso={0.1} formato={(v) => `±${v.toFixed(1)}`} onChange={(fuente) => set({ fuente })} />
        )}
      </Grupo>

      <Grupo titulo="Punto z₀">
        <Matriz A={s.sonda} onChange={(sonda: number[][]) => set({ sonda })} paso={0.05} filas={[{ nombre: 'z', color: 'var(--ink)' }]} />
        <Nota>Las dos casillas son la parte real y la imaginaria. También puedes pulsar en el lienzo.</Nota>
      </Grupo>
    </>
  )
}

export default definir<S>({
  id: 'complejos',
  area: 'funciones',
  resumen: 'Variable compleja: coloreado del dominio',
  corto: 'Complejos',
  titulo: 'Variable <i>compleja</i>',
  entradilla: 'Una función de C en C no cabe en una gráfica: se pinta el plano con la fase y el módulo.',
  inicial: {
    expr: '(z-1)/(z+1)', modo: 'dominio', resolucion: 380, bandas: true,
    sonda: [[0.6, 0.5]], fuente: 2,
  },
  Panel,
  comparaciones: [{ t: 'Dominio ↔ imagen', a: { modo: 'dominio' }, b: { modo: 'rejilla' } }],
  rotulo: (s) => ({ nombre: 'f : C → C', apunte: s.modo === 'dominio' ? 'color = fase, brillo = módulo' : s.modo === 'rejilla' ? 'imagen de la rejilla' : 'campo de Pólya' }),
  formula: () => [
    String.raw`f(z)=u(x,y)+i\,v(x,y),\qquad z=x+iy`,
    String.raw`u_x=v_y,\qquad u_y=-v_x \quad (\text{Cauchy-Riemann})`,
  ],
  lecturas: (s) => {
    const { f, error } = compilarCSuave(s.expr, ['z'])
    if (!f) return [['Estado', error ?? 'la expresión no es válida']]
    const z: K.C = [s.sonda[0][0], s.sonda[0][1]]
    const w = f(z)
    if (!Number.isFinite(w[0]) || !Number.isFinite(w[1])) return [['f(z₀)', 'no definido ahí']]
    // diferencias centradas: el cociente incremental por las dos direcciones
    const h = 1e-5
    const dx = K.div(K.resta(f([z[0] + h, z[1]]), f([z[0] - h, z[1]])), [2 * h, 0])
    const dy = K.div(K.resta(f([z[0], z[1] + h]), f([z[0], z[1] - h])), [0, 2 * h])
    const desvio = K.abs(K.resta(dx, dy))
    const holo = desvio < 1e-5 * (1 + K.abs(dx))
    const texC = (c: K.C) => `${c[0].toFixed(4)} ${c[1] >= 0 ? '+' : '−'} ${Math.abs(c[1]).toFixed(4)}i`
    return [
      ['z₀', `${z[0].toFixed(3)} ${z[1] >= 0 ? '+' : '−'} ${Math.abs(z[1]).toFixed(3)}i`],
      ['f(z₀)', `${w[0].toFixed(4)} ${w[1] >= 0 ? '+' : '−'} ${Math.abs(w[1]).toFixed(4)}i`],
      ['|f(z₀)|', K.abs(w).toFixed(5)],
      ['arg f(z₀)', `${((K.arg(w) * 180) / Math.PI).toFixed(2)}°`],
      ...(holo
        ? ([["f′(z₀)", texC(dx)]] as Array<[string, string]>)
        : ([
            ['f′(z₀)', 'no existe: depende de la dirección'],
            ['cociente en dirección real', texC(dx)],
            ['cociente en dirección imaginaria', texC(dy)],
          ] as Array<[string, string]>)),
      ['Desvío entre direcciones', desvio.toExponential(2)],
      ['¿Holomorfa aquí?', holo ? 'sí, cumple Cauchy-Riemann' : 'no'],
    ]
  },
  leyenda: (s) =>
    s.modo === 'dominio' ? (
      <>
        <span>
          <span className="rueda" />
          color = arg f(z)
        </span>
        <span>brillo = |f(z)|{s.bandas ? ' · bandas cada duplicación' : ''}</span>
      </>
    ) : s.modo === 'rejilla' ? (
      <>
        <Muestra color="var(--ink-soft)">rejilla de partida</Muestra>
        <Muestra color="var(--pos)">imagen de x = cte</Muestra>
        <Muestra color="var(--aux)">imagen de y = cte</Muestra>
      </>
    ) : (
      <>
        <span>flechas = conjugado de f</span>
        <Muestra color="var(--ink)">z₀</Muestra>
      </>
    ),
  pista: 'Pulsa para mover z₀ · arrastra para desplazar · rueda para zoom',
  vista: {
    tipo: '2d',
    ventana: { x: [-3, 3], y: [-3, 3] },
    alPulsar: (p) => ({ sonda: [[Math.round(p.x * 1000) / 1000, Math.round(p.y * 1000) / 1000]] }),
    interaccion: {
      // en «rejilla» el lienzo es el plano imagen: ahí la sonda no se arrastra
      asas: (s) => (s.modo === 'rejilla' ? [] : [{ id: 'z0', p: s.sonda[0], color: '--ink', nombre: 'z₀' }]),
      mover: (_id, t) => ({ sonda: [[Math.round(t.p[0] * 1000) / 1000, Math.round(t.p[1] * 1000) / 1000]] }),
    },
    dibujar(g, s) {
      const { f } = compilarCSuave(s.expr, ['z'])
      if (!f) {
        g.ejes({ etiquetaX: 'Re z', etiquetaY: 'Im z' })
        g.texto('la expresión no es válida', g.ventana.x[0] + 0.2, g.ventana.y[1] - 0.3, g.color('--pos'))
        return
      }
      if (s.modo === 'dominio') colorearDominio(g, s, f)
      g.ejes({ etiquetaX: 'Re z', etiquetaY: 'Im z', rejilla: true, paso: 1 })
      if (s.modo === 'rejilla') rejillaConforme(g, s, f)
      if (s.modo === 'polya') campoPolya(g, s, f)

      const z = s.sonda[0]
      g.punto(z[0], z[1], g.color('--ink'), 5)
      g.texto('z₀', z[0], z[1], g.color('--ink'), { dx: 8, dy: -9 })
      const w = f([z[0], z[1]])
      void w
    },
  },
})

function colorearDominio(g: Pintor2D, s: S, f: (z: K.C) => K.C) {
  const [xa, xb] = g.ventana.x
  const [ya, yb] = g.ventana.y
  const px = g.X(xb) - g.X(xa)
  const py = g.Y(ya) - g.Y(yb)
  const W = s.resolucion
  const H = Math.max(8, Math.round((W * py) / px))
  const off = lienzoAuxiliar(W, H)
  const octx = off.getContext('2d')!
  const img = octx.createImageData(W, H)
  const datos = img.data
  for (let j = 0; j < H; j++) {
    const y = yb - ((j + 0.5) / H) * (yb - ya)
    for (let i = 0; i < W; i++) {
      const x = xa + ((i + 0.5) / W) * (xb - xa)
      const w = f([x, y])
      const k = 4 * (j * W + i)
      if (!Number.isFinite(w[0]) || !Number.isFinite(w[1])) {
        datos[k] = datos[k + 1] = datos[k + 2] = 0
        datos[k + 3] = 255
        continue
      }
      const m = Math.hypot(w[0], w[1])
      const h = ((Math.atan2(w[1], w[0]) / (2 * Math.PI)) % 1 + 1) % 1
      // el módulo se comprime: 0 → negro, ∞ → blanco, y las bandas marcan cada duplicación
      let l = 0.06 + 0.60 * (m / (1 + m))
      if (s.bandas) {
        const t = Math.log2(1 + m)
        l += 0.06 * (t - Math.floor(t) - 0.5)
      }
      const [r, gg, b] = hsl(h, 0.64, Math.max(0.02, Math.min(0.95, l)))
      datos[k] = r
      datos[k + 1] = gg
      datos[k + 2] = b
      datos[k + 3] = 255
    }
  }
  octx.putImageData(img, 0, 0)
  const ctx = g.ctx
  ctx.save()
  ctx.imageSmoothingEnabled = true
  ctx.drawImage(off, g.X(xa), g.Y(yb), px, py)
  ctx.restore()
}

function rejillaConforme(g: Pintor2D, s: S, f: (z: K.C) => K.C) {
  const R = s.fuente
  const N = 13
  const M = 260
  const suave = g.color('--ink-soft')
  const pos = g.color('--pos')
  const aux = g.color('--aux')
  const trozos = (pts: Array<[number, number]>, color: string) => {
    let tramo: Array<[number, number]> = []
    const lim = 40 * (g.ventana.x[1] - g.ventana.x[0])
    for (const p of pts) {
      if (!Number.isFinite(p[0]) || !Number.isFinite(p[1]) || Math.hypot(p[0], p[1]) > lim) {
        if (tramo.length > 1) g.curva(tramo, color, 1.5)
        tramo = []
        continue
      }
      tramo.push(p)
    }
    if (tramo.length > 1) g.curva(tramo, color, 1.5)
  }
  for (let k = 0; k < N; k++) {
    const c = -R + (2 * R * k) / (N - 1)
    const vert: Array<[number, number]> = []
    const hor: Array<[number, number]> = []
    for (let i = 0; i <= M; i++) {
      const t = -R + (2 * R * i) / M
      const a = f([c, t])
      const b = f([t, c])
      vert.push([a[0], a[1]])
      hor.push([b[0], b[1]])
    }
    g.curva(
      [
        [c, -R],
        [c, R],
      ],
      suave,
      0.7,
      true,
    )
    g.curva(
      [
        [-R, c],
        [R, c],
      ],
      suave,
      0.7,
      true,
    )
    trozos(vert, pos)
    trozos(hor, aux)
  }
}

function campoPolya(g: Pintor2D, s: S, f: (z: K.C) => K.C) {
  const [xa, xb] = g.ventana.x
  const [ya, yb] = g.ventana.y
  const n = 26
  const paso = (xb - xa) / n
  const suave = g.color('--ink-soft')
  let mx = 0
  const datos: Array<[number, number, number, number]> = []
  for (let x = xa; x <= xb; x += paso)
    for (let y = ya; y <= yb; y += paso) {
      const w = f([x, y])
      if (!Number.isFinite(w[0]) || !Number.isFinite(w[1])) continue
      const m = Math.hypot(w[0], w[1])
      if (m < 1e-12) continue
      datos.push([x, y, w[0], -w[1]])
      mx = Math.max(mx, m)
    }
  for (const [x, y, u, v] of datos) {
    const m = Math.hypot(u, v)
    const l = paso * 0.75 * Math.pow(m / mx, 0.3)
    g.flecha(x - ((u / m) * l) / 2, y - ((v / m) * l) / 2, (u / m) * l, (v / m) * l, suave, 1.1, 4)
  }
  void s
}
