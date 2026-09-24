import { definir, type Asa, type PropsPanel } from '../../nucleo/tipos'
import { Atajos, Boton, Grupo, Interruptor, Rango } from '../../nucleo/controles'
import type { Pintor2D } from '../../render/pintor2d'
import { varCss } from '../../render/tema'
import { contorno, encadenar } from '../../lib/contorno'
import {
  dependientes, describir, distancia, encaja, evalConica, evaluar, GRUPOS, HERRAMIENTAS, nombreNuevo, proyectar, sobre, tipoDeDef,
  type Hueco, type Obj, type P, type Valor,
} from '../../lib/geometria'

interface S {
  objs: Obj[]
  herramienta: string
  grupo: string
  /** Lo ya elegido para la herramienta en curso. */
  pendientes: string[]
  /** Radio, ángulo, lados o razón de cada herramienta que los pida. */
  params: Record<string, number>
  ajustar: boolean
  etiquetas: boolean
  ejes: boolean
}

/* ---------- construcciones de ejemplo ---------- */

const libre = (id: string, x: number, y: number): Obj => ({ id, def: 'libre', args: '', x, y, v: 0, visible: true })
const def = (id: string, d: string, args: string, v = 0): Obj => ({ id, def: d, args, x: 0, y: 0, v, visible: true })

const EJEMPLOS: Array<{ t: string; objs: Obj[] }> = [
  {
    t: 'Circuncentro',
    objs: [
      libre('A', -3, -1.5), libre('B', 3, -2), libre('C', 0.5, 2.5),
      def('a', 'poligono', 'A,B,C'), def('b', 'mediatriz', 'A,B'), def('c', 'mediatriz', 'B,C'),
      def('O', 'interseccion', 'b,c', 0), def('d', 'circ_cp', 'O,A'),
    ],
  },
  {
    t: 'Tangentes',
    objs: [libre('O', 0, 0), libre('A', 2.5, 0), def('c', 'circ_cp', 'O,A'), libre('P', 5, 2), def('a', 'tangente', 'P,c', 0), def('b', 'tangente', 'P,c', 1)],
  },
  {
    t: 'Elipse',
    objs: [libre('F', -3, 0), libre('G', 3, 0), libre('P', 1, 2.5), def('c', 'elipse', 'F,G,P'), def('a', 'segmento', 'F,P'), def('b', 'segmento', 'G,P')],
  },
  {
    t: 'Lugar',
    objs: [
      libre('O', 0, 0), def('c', 'circ_cr', 'O', 3), def('P', 'sobre', 'c', 0.8), libre('A', 5, 1),
      def('a', 'segmento', 'A,P'), def('M', 'medio', 'A,P'), def('b', 'lugar', 'M,P'),
    ],
  },
  {
    t: 'Simetría',
    objs: [
      libre('A', -4, 0.5), libre('B', -1.5, 1), libre('C', -2.5, 3), def('a', 'poligono', 'A,B,C'),
      libre('D', 0, -3), libre('E', 0.5, 3), def('b', 'recta', 'D,E'), def('c', 'simetria_axial', 'a,b'),
    ],
  },
  {
    t: 'Ángulo inscrito',
    objs: [
      libre('O', 0, 0), def('c', 'circ_cr', 'O', 3), def('A', 'sobre', 'c', 3.6), def('B', 'sobre', 'c', -0.3), def('P', 'sobre', 'c', 1.6),
      def('a', 'segmento', 'A,P'), def('b', 'segmento', 'B,P'), def('d', 'segmento', 'A,O'), def('e', 'segmento', 'B,O'),
      def('α', 'angulo', 'B,P,A'), def('β', 'angulo', 'B,O,A'),
    ],
  },
]

/* ---------- evaluación con caché ---------- */

let cache: { clave: string; vals: Map<string, Valor> } | null = null
function valores(s: S) {
  const clave = JSON.stringify(s.objs)
  if (cache?.clave !== clave) cache = { clave, vals: evaluar(s.objs) }
  return cache.vals
}

/** Escala del último dibujo: el clic necesita saber cuántas unidades son 10 px. */
let escalaActual = 50

const ajustar = (s: S, p: P): P => (s.ajustar ? { x: Math.round(p.x * 2) / 2, y: Math.round(p.y * 2) / 2 } : p)
const redondeo = (v: number) => Math.round(v * 1000) / 1000

/** Lo que hay bajo el ratón: primero los puntos, luego lo demás. */
function bajo(s: S, p: P, filtro: (v: Valor, o: Obj) => boolean = () => true): string | null {
  const vals = valores(s)
  const tol = 10 / escalaActual
  let mejor: string | null = null
  let dmin = tol
  for (const pasada of ['punto', 'resto']) {
    for (const o of s.objs) {
      const v = vals.get(o.id)
      if (!v || !o.visible || (pasada === 'punto') !== (v.k === 'punto') || !filtro(v, o)) continue
      const d = distancia(v, p)
      if (d < dmin) {
        dmin = d
        mejor = o.id
      }
    }
    if (mejor) return mejor
  }
  return null
}

/** Qué huecos de la herramienta quedan libres con lo ya elegido. */
function libres(huecos: Hueco[], elegidos: Valor[], ordenada: boolean): Hueco[] {
  if (ordenada) return huecos.slice(elegidos.length, elegidos.length + 1)
  const quedan = [...huecos]
  for (const v of elegidos) {
    const i = quedan.findIndex((h) => encaja(h, v))
    if (i >= 0) quedan.splice(i, 1)
  }
  return quedan
}

function borrar(s: S, id: string): Partial<S> {
  const fuera = dependientes(s.objs, id)
  return { objs: s.objs.filter((o) => !fuera.has(o.id)), pendientes: s.pendientes.filter((p) => !fuera.has(p)) }
}

/** Con todo elegido, crea el objeto (o los objetos: dos tangentes, varias intersecciones). */
function completar(s: S, objs: Obj[], args: string[]): Partial<S> {
  const h = HERRAMIENTAS[s.herramienta]
  const v = s.params[s.herramienta] ?? h.param?.defecto ?? 0
  const nuevos: Obj[] = []
  const tipo = tipoDeDef(h.def)
  for (let k = 0; k < (h.soluciones ?? 1); k++) {
    const o: Obj = { id: nombreNuevo([...objs, ...nuevos], tipo), def: h.def, args: args.join(','), x: 0, y: 0, v: h.soluciones ? k : v, visible: true }
    // de las soluciones posibles se quedan las que existen ahora (dos rectas se cortan una vez)
    if (h.soluciones && evaluar([...objs, o]).get(o.id)?.k === 'nada' && (k > 0 || nuevos.length)) continue
    nuevos.push(o)
  }
  return { objs: [...objs, ...nuevos], pendientes: [] }
}

function alPulsar(p0: P, s: S): Partial<S> | void {
  const h = HERRAMIENTAS[s.herramienta]
  if (!h || s.herramienta === 'mover') return
  const vals = valores(s)
  const p = ajustar(s, p0)

  if (s.herramienta === 'borrar') {
    const id = bajo(s, p0)
    return id ? borrar(s, id) : undefined
  }

  let objs = s.objs
  const elegidos = s.pendientes.map((id) => vals.get(id)!).filter(Boolean)

  // el polígono admite vértices sin fin y se cierra pulsando el primero
  if (s.herramienta === 'poligono') {
    const id = bajo(s, p0, (v) => v.k === 'punto')
    if (id && id === s.pendientes[0] && s.pendientes.length >= 3) return completar(s, objs, s.pendientes)
    if (id) return s.pendientes.includes(id) ? undefined : { pendientes: [...s.pendientes, id] }
    const nuevo = crearPunto(s, p0, p)
    return { objs: [...objs, nuevo], pendientes: [...s.pendientes, nuevo.id] }
  }

  const quedan = libres(h.huecos, elegidos, !!h.ordenada)
  const cabe = (v: Valor) => quedan.some((hh) => encaja(hh, v))
  const id = bajo(s, p0, (v, o) => cabe(v) && !s.pendientes.includes(o.id))
  let elegido = id
  if (!elegido) {
    if (!quedan.includes('punto')) return
    const nuevo = crearPunto(s, p0, p)
    objs = [...objs, nuevo]
    elegido = nuevo.id
    // la herramienta Punto termina aquí: el punto es el resultado
    if (s.herramienta === 'punto') return { objs, pendientes: [] }
  } else if (s.herramienta === 'punto') {
    return { pendientes: [] }
  }
  const pendientes = [...s.pendientes, elegido]
  if (pendientes.length < h.huecos.length) return { objs, pendientes }
  return completar(s, objs, pendientes)
}

/** Punto nuevo: sobre la línea o circunferencia que haya debajo, o libre. */
function crearPunto(s: S, p0: P, p: P): Obj {
  const vals = valores(s)
  const soporte = bajo(s, p0, (v) => v.k === 'linea' || v.k === 'circ' || v.k === 'arco' || v.k === 'poligono')
  const id = nombreNuevo(s.objs, 'punto')
  if (soporte) return { id, def: 'sobre', args: soporte, x: 0, y: 0, v: proyectar(vals.get(soporte)!, p0), visible: true }
  return { id, def: 'libre', args: '', x: redondeo(p.x), y: redondeo(p.y), v: 0, visible: true }
}

/* ---------- interacción de arrastre (herramienta Mover) ---------- */

function asas(s: S): Asa[] {
  if (s.herramienta !== 'mover') return []
  const vals = valores(s)
  return s.objs.flatMap((o) => {
    const v = vals.get(o.id)
    if (!o.visible || v?.k !== 'punto' || (o.def !== 'libre' && o.def !== 'sobre')) return []
    return [{ id: o.id, p: [v.p.x, v.p.y], color: o.def === 'libre' ? '--accent' : '--aux', nombre: s.etiquetas ? o.id : undefined }]
  })
}

function mover(id: string, t: { p: number[] }, s: S): Partial<S> | void {
  const vals = valores(s)
  return {
    objs: s.objs.map((o) => {
      if (o.id !== id) return o
      if (o.def === 'libre') {
        const p = ajustar(s, { x: t.p[0], y: t.p[1] })
        return { ...o, x: redondeo(p.x), y: redondeo(p.y) }
      }
      const base = vals.get(o.args)
      return base ? { ...o, v: proyectar(base, { x: t.p[0], y: t.p[1] }) } : o
    }),
  }
}

/* ---------- dibujo ---------- */

const COLOR: Record<string, string> = {
  punto: '--ink', linea: '--ink', circ: '--aux', arco: '--aux', conica: '--morado', poligono: '--rosa', medida: '--ocre', lugar: '--pos',
}

function linea(g: Pintor2D, v: Extract<Valor, { k: 'linea' }>, color: string, grosor: number) {
  const d = { x: v.b.x - v.a.x, y: v.b.y - v.a.y }
  const L = Math.hypot(d.x, d.y)
  const diag = Math.hypot(g.ventana.x[1] - g.ventana.x[0], g.ventana.y[1] - g.ventana.y[0])
  const T = (diag + Math.hypot(v.a.x - (g.ventana.x[0] + g.ventana.x[1]) / 2, v.a.y - (g.ventana.y[0] + g.ventana.y[1]) / 2)) / L
  const [t0, t1] = v.tipo === 'recta' ? [-T, T] : v.tipo === 'semirrecta' ? [0, T] : [0, 1]
  if (v.tipo === 'vector') {
    g.flecha(v.a.x, v.a.y, d.x, d.y, color, grosor, 8)
    return
  }
  g.curva([[v.a.x + t0 * d.x, v.a.y + t0 * d.y], [v.a.x + t1 * d.x, v.a.y + t1 * d.y]], color, grosor)
}

function dibujarValor(g: Pintor2D, v: Valor, color: string, grosor: number) {
  const { ctx } = g
  switch (v.k) {
    case 'linea':
      linea(g, v, color, grosor)
      break
    case 'circ':
    case 'arco':
      ctx.save()
      ctx.strokeStyle = color
      ctx.lineWidth = grosor
      ctx.beginPath()
      // en el lienzo la y crece hacia abajo: el sentido antihorario del mundo es el horario del canvas
      if (v.k === 'circ') ctx.arc(g.X(v.c.x), g.Y(v.c.y), v.r * g.escalaX, 0, 2 * Math.PI)
      else ctx.arc(g.X(v.c.x), g.Y(v.c.y), v.r * g.escalaX, -v.a0, -v.a1, true)
      ctx.stroke()
      ctx.restore()
      break
    case 'conica': {
      const segs = contorno((x, y) => evalConica(v.q, { x, y }), g.ventana, 1e-11, Math.round(g.ancho / 4), Math.round(g.alto / 4))
      ctx.save()
      ctx.strokeStyle = color
      ctx.lineWidth = grosor
      ctx.lineJoin = 'round'
      ctx.beginPath()
      for (const l of encadenar(segs, (g.ventana.x[1] - g.ventana.x[0]) * 1e-9)) {
        ctx.moveTo(g.X(l[0][0]), g.Y(l[0][1]))
        for (const q of l.slice(1)) ctx.lineTo(g.X(q[0]), g.Y(q[1]))
      }
      ctx.stroke()
      ctx.restore()
      break
    }
    case 'poligono':
      ctx.save()
      ctx.fillStyle = color
      ctx.globalAlpha = 0.18
      ctx.beginPath()
      v.pts.forEach((q, i) => ctx[i ? 'lineTo' : 'moveTo'](g.X(q.x), g.Y(q.y)))
      ctx.closePath()
      ctx.fill()
      ctx.restore()
      g.curva([...v.pts, v.pts[0]].map((q) => [q.x, q.y]), color, grosor)
      break
    case 'lugar': {
      let tramo: Array<[number, number]> = []
      for (const q of v.pts) {
        if (!Number.isFinite(q.x)) {
          g.curva(tramo, color, grosor)
          tramo = []
        } else tramo.push([q.x, q.y])
      }
      g.curva(tramo, color, grosor)
      break
    }
  }
}

function dibujar(g: Pintor2D, s: S) {
  escalaActual = g.escalaX
  if (s.ejes) g.ejes({ etiquetaX: 'x', etiquetaY: 'y' })
  const vals = valores(s)
  const elegidos = new Set(s.pendientes)
  const orden = ['poligono', 'lugar', 'conica', 'circ', 'arco', 'linea']
  for (const k of orden) {
    for (const o of s.objs) {
      const v = vals.get(o.id)!
      if (!o.visible || v.k !== k) continue
      const sel = elegidos.has(o.id)
      dibujarValor(g, v, g.color(sel ? '--pos' : COLOR[k]), sel ? 3.2 : 1.8)
      if (s.etiquetas && k !== 'poligono' && k !== 'lugar') {
        const q = etiquetaEn(v)
        if (q) g.texto(o.id, q.x, q.y, g.color(COLOR[k]), { dx: 6, dy: -8, fuente: `italic 16px ${varCss('--serif') || 'serif'}` })
      }
    }
  }
  // medidas: arco del ángulo y valor
  for (const o of s.objs) {
    const v = vals.get(o.id)!
    if (!o.visible || v.k !== 'medida') continue
    const color = g.color(COLOR.medida)
    if (v.arco) {
      const { ctx } = g
      ctx.save()
      ctx.strokeStyle = color
      ctx.fillStyle = color
      ctx.globalAlpha = 0.25
      ctx.beginPath()
      ctx.moveTo(g.X(v.arco.c.x), g.Y(v.arco.c.y))
      ctx.arc(g.X(v.arco.c.x), g.Y(v.arco.c.y), 24, -v.arco.a0, -v.arco.a1, true)
      ctx.closePath()
      ctx.fill()
      ctx.restore()
      const m = (v.arco.a0 + v.arco.a1) / 2
      g.texto(`${o.id} = ${describir(v)}`, v.arco.c.x, v.arco.c.y, color, { dx: 34 * Math.cos(m), dy: -34 * Math.sin(m), alinea: Math.cos(m) < 0 ? 'right' : 'left' })
    } else g.texto(`${o.id} = ${describir(v)}`, v.en.x, v.en.y, color, { dx: 8, dy: -10 })
  }
  // puntos encima de todo; en Mover los libres los pinta el armazón como asas
  for (const o of s.objs) {
    const v = vals.get(o.id)!
    if (!o.visible || v.k !== 'punto') continue
    const arrastrable = o.def === 'libre' || o.def === 'sobre'
    const sel = elegidos.has(o.id)
    if (!(s.herramienta === 'mover' && arrastrable) || sel) {
      g.punto(v.p.x, v.p.y, g.color('--panel'), sel ? 7 : 5.5)
      g.punto(v.p.x, v.p.y, g.color(sel ? '--pos' : arrastrable ? (o.def === 'libre' ? '--accent' : '--aux') : '--ink'), sel ? 5 : 4)
    }
    if (s.etiquetas && !(s.herramienta === 'mover' && arrastrable)) g.texto(o.id, v.p.x, v.p.y, g.color('--ink'), { dx: 8, dy: -10, fuente: `italic 17px ${varCss('--serif') || 'serif'}` })
  }
}

function etiquetaEn(v: Valor): P | null {
  switch (v.k) {
    case 'linea':
      return { x: v.a.x + (v.b.x - v.a.x) * 0.5, y: v.a.y + (v.b.y - v.a.y) * 0.5 }
    case 'circ':
      return { x: v.c.x + v.r * Math.cos(0.8), y: v.c.y + v.r * Math.sin(0.8) }
    case 'arco':
      return sobre(v, 0.5)
    default:
      return null
  }
}

/* ---------- panel ---------- */

const NOMBRE_DEF: Record<string, string> = Object.fromEntries(
  Object.values(HERRAMIENTAS).filter((h) => h.def).map((h) => [h.def, h.nombre.toLowerCase()]),
)
NOMBRE_DEF.libre = 'punto libre'
NOMBRE_DEF.sobre = 'punto sobre'

function Panel({ s, set }: PropsPanel<S>) {
  const vals = valores(s)
  const h = HERRAMIENTAS[s.herramienta]
  const herramientas = Object.entries(HERRAMIENTAS).filter(([, x]) => x.grupo === s.grupo)
  const elegir = (herramienta: string) => set({ herramienta, pendientes: [] })
  return (
    <>
      <Grupo titulo="Herramientas">
        <div className="dos-desplegables">
          <select
            className="desplegable"
            aria-label="Grupo de herramientas"
            value={s.grupo}
            onChange={(e) => {
              const g = e.target.value
              const primera = Object.entries(HERRAMIENTAS).find(([, x]) => x.grupo === g)![0]
              set({ grupo: g, herramienta: primera, pendientes: [] })
            }}
          >
            {GRUPOS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
          {herramientas.length > 1 && (
            <select className="desplegable" aria-label="Herramienta" value={s.herramienta} onChange={(e) => elegir(e.target.value)}>
              {herramientas.map(([k, x]) => (
                <option key={k} value={k}>
                  {x.nombre}
                </option>
              ))}
            </select>
          )}
        </div>
        {h.param && (
          <Rango
            etiqueta={h.param.nombre}
            valor={s.params[s.herramienta] ?? h.param.defecto}
            min={h.param.min}
            max={h.param.max}
            paso={h.param.paso}
            formato={(v) => String(+v.toFixed(2))}
            onChange={(v) => set({ params: { ...s.params, [s.herramienta]: v } })}
          />
        )}
        <p className="pista-geo">
          {h.pista}
          {s.pendientes.length > 0 && ` · elegido: ${s.pendientes.join(', ')}`}
        </p>
        {s.pendientes.length > 0 && <Boton onClick={() => set({ pendientes: [] })}>Cancelar</Boton>}
      </Grupo>

      <Grupo titulo="Objetos">
        {s.objs.length > 0 && (
          <div className="lista-marcas lista-geo">
            {s.objs.map((o) => {
              const v = vals.get(o.id)!
              const color = v.k === 'punto' ? (o.def === 'libre' ? '--accent' : o.def === 'sobre' ? '--aux' : '--ink') : COLOR[v.k] ?? '--ink-soft'
              return (
                <div className="fila-quitable" key={o.id}>
                  <button
                    type="button"
                    className="punto"
                    aria-label={o.visible ? `Ocultar ${o.id}` : `Mostrar ${o.id}`}
                    style={{ background: o.visible ? `var(${color})` : 'transparent', border: `2px solid var(${color})`, padding: 0, cursor: 'pointer' }}
                    onClick={() => set({ objs: s.objs.map((x) => (x.id === o.id ? { ...x, visible: !x.visible } : x)) })}
                  />
                  <span className="marca">
                    <b>{o.id}</b> = {describir(v)}
                    <small> · {NOMBRE_DEF[o.def] ?? o.def}{o.args ? ` ${o.args.split(',').join(', ')}` : ''}</small>
                  </span>
                  <button type="button" className="quitar-fila" aria-label={`Borrar ${o.id}`} onClick={() => set(borrar(s, o.id))}>
                    ×
                  </button>
                </div>
              )
            })}
          </div>
        )}
        <div className="interruptores">
          <Interruptor activo={s.ajustar} onChange={(ajustar) => set({ ajustar })}>
            Ajustar a la rejilla
          </Interruptor>
          <Interruptor activo={s.etiquetas} onChange={(etiquetas) => set({ etiquetas })}>
            Nombres
          </Interruptor>
          <Interruptor activo={s.ejes} onChange={(ejes) => set({ ejes })}>
            Ejes
          </Interruptor>
        </div>
        <div className="fila-botones">
          {s.objs.length > 0 && <Boton onClick={() => set(borrar(s, s.objs[s.objs.length - 1].id))}>Deshacer</Boton>}
          {s.objs.length > 0 && <Boton onClick={() => set({ objs: [], pendientes: [] })}>Borrar todo</Boton>}
        </div>
        <Atajos opciones={EJEMPLOS.map((e) => ({ t: e.t, onClick: () => set({ objs: e.objs, pendientes: [], herramienta: 'mover', grupo: 'Mover' }) }))} />
      </Grupo>
    </>
  )
}

export default definir<S>({
  id: 'geometria',
  area: 'geometria',
  resumen: 'Geometría con regla y compás',
  corto: 'Plano',
  titulo: 'Regla y <i>compás</i>',
  entradilla: 'Construcciones que se mantienen al mover los puntos libres.',
  inicial: {
    objs: EJEMPLOS[0].objs,
    herramienta: 'mover',
    grupo: 'Mover',
    pendientes: [],
    params: {},
    ajustar: false,
    etiquetas: true,
    ejes: true,
  },
  Panel,
  vista: {
    tipo: '2d',
    ventana: { x: [-7, 7], y: [-5, 5] },
    alPulsar,
    interaccion: {
      asas,
      mover,
      quitar: (id, s) => borrar(s, id),
      pista: 'Con Mover, arrastra los puntos libres (azules) y los que van sobre un objeto (verdes)',
    },
    dibujar,
  },
})
