import * as THREE from 'three'
import { definir, type Asa, type PropsPanel } from '../../nucleo/tipos'
import { Atajos, Boton, Expresion, Grupo, Rango } from '../../nucleo/controles'
import type { Escena3D } from '../../render/escena3d'
import { construirRejilla, marching } from '../../lib/mallado'
import type { Param } from '../../lib/objetos2d'
import { analizarFilas3, circunradio, cortarMalla, recortarACaja, type Analisis3, type Objeto3, type V3 } from '../../lib/objetos3d'

interface S {
  filas: Array<{ src: string; visible: boolean }>
  params: Record<string, Param>
  /** Semilado de la caja [−L, L]³ donde se dibujan las superficies. */
  L: number
  /** Resolución de las superficies implícitas. */
  detalle: number
}

const COLORES = ['--accent', '--aux', '--rosa', '--morado', '--ocre', '--neg']
const colorDe = (i: number) => COLORES[i % COLORES.length]
const fmt = (v: number, d = 3) => String(+v.toFixed(d))

const EJEMPLOS = [
  { t: 'Esfera y plano', f: ['x^2+y^2+z^2=4', 'x+y+z=1', 'corte(1, 2)'] },
  { t: 'Paraboloide', f: ['x^2+y^2', 'z = 2', 'corte(1, 2)'] },
  { t: 'Silla', f: ['x^2 - y^2'] },
  { t: 'Toro', f: ['((2+cos(v))cos(u), (2+cos(v))sin(u), sin(v))'] },
  { t: 'Hélice', f: ['(2cos(t), 2sin(t), t/4), -12 < t < 12'] },
  { t: 'Revolución', f: ['revolucion(sqrt(x), 0, 3)'] },
  { t: 'Sólidos', f: ['cubo((-2,-2,0), 1.5)', 'cono((2,-2,-1), 1, 2)', 'cilindro((2,2,-1), 0.8, 2)', 'piramide((-2,2,-1), 4, 1, 2)', 'icosaedro((0,0,0), 1.2)'] },
  { t: 'Recta y plano', f: ['A = (1, 1, 2)', 'B = (-1, 0, -1)', 'recta(A, B)', 'C = (2, -1, 0)', 'plano(A, B, C)'] },
  { t: 'Cilindro ∩ esfera', f: ['x^2+y^2=1', 'x^2+y^2+z^2=4', 'corte(1, 2)'] },
]

const PIEZAS = ['x', 'y', 'z', '=', '^', '(', ')', 'sqrt(', 'sin(', 'cos(', 'pi', 't', 'u', 'v', 'esfera(', 'plano(', 'recta(', 'corte(']

let cache: { clave: string; an: Analisis3 } | null = null
function analisis(s: S): Analisis3 {
  const clave = JSON.stringify([s.filas.map((f) => f.src), s.params])
  if (cache?.clave !== clave) cache = { clave, an: analizarFilas3(s.filas.map((f) => f.src), s.params) }
  return cache.an
}

/** Lo que no es un número real (√ de un negativo) cuenta como «fuera»: marching necesita un signo. */
const sano = (F: (x: number, y: number, z: number) => number) => (x: number, y: number, z: number) => {
  const v = F(x, y, z)
  return Number.isFinite(v) ? v : 1e6
}

function tubo(e: Escena3D, pts: V3[], color: THREE.Color, r: number) {
  if (pts.length < 2) return
  const curva = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)))
  const malla = new THREE.Mesh(
    new THREE.TubeGeometry(curva, Math.min(800, pts.length * 2), r, 8, false),
    new THREE.MeshStandardMaterial({ color, roughness: 0.45 }),
  )
  e.add(malla)
}

function solido(e: Escena3D, o: Extract<Objeto3, { k: 'solido' }>, color: THREE.Color) {
  let geo: THREE.BufferGeometry
  // three.js tiene el eje de conos y cilindros en y; aquí va en z y la base en c
  let deBase = false
  switch (o.forma) {
    case 'cubo':
      geo = new THREE.BoxGeometry(o.a, o.a, o.a)
      break
    case 'cono':
      geo = new THREE.ConeGeometry(o.a, o.h, o.n)
      deBase = true
      break
    case 'cilindro':
      geo = new THREE.CylinderGeometry(o.a, o.a, o.h, o.n)
      deBase = true
      break
    case 'piramide':
      geo = new THREE.ConeGeometry(o.a, o.h, o.n)
      deBase = true
      break
    case 'prisma':
      geo = new THREE.CylinderGeometry(o.a, o.a, o.h, o.n)
      deBase = true
      break
    case 'tetraedro':
      geo = new THREE.TetrahedronGeometry(circunradio('tetraedro', o.a))
      break
    case 'octaedro':
      geo = new THREE.OctahedronGeometry(circunradio('octaedro', o.a))
      break
    case 'dodecaedro':
      geo = new THREE.DodecahedronGeometry(circunradio('dodecaedro', o.a))
      break
    case 'icosaedro':
      geo = new THREE.IcosahedronGeometry(circunradio('icosaedro', o.a))
      break
  }
  const grupo = new THREE.Group()
  const cuerpo = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ color, roughness: 0.5, transparent: true, opacity: 0.72, side: THREE.DoubleSide, flatShading: o.forma !== 'cono' && o.forma !== 'cilindro' }),
  )
  const aristas = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 20), new THREE.LineBasicMaterial({ color: color.clone().multiplyScalar(0.6) }))
  grupo.add(cuerpo, aristas)
  if (deBase) grupo.rotation.x = Math.PI / 2
  grupo.position.set(o.c[0], o.c[1], o.c[2] + (deBase ? o.h / 2 : 0))
  e.add(grupo)
}

function construir(e: Escena3D, s: S) {
  const an = analisis(s)
  const L = s.L
  e.escala = L / 1.5
  e.ejes(L, ['x', 'y', 'z'], { caja: true, rejilla: true, paso: L / 4 })
  const N = s.detalle
  const mallas = new Map<number, Float32Array>()
  const mallaDe = (i: number) => {
    if (!mallas.has(i)) {
      const o = an.objetos[i]
      if (o?.k !== 'implicita') return null
      mallas.set(i, marching(construirRejilla(sano(o.F), L, N), 1, 0).pos)
    }
    return mallas.get(i)!
  }
  const grosor = 0.012 * L

  an.objetos.forEach((o, i) => {
    if (!s.filas[i].visible) return
    const color = e.color(colorDe(i))
    switch (o.k) {
      case 'implicita': {
        const { pos, nor } = marching(construirRejilla(sano(o.F), L, N), 1, 0)
        mallas.set(i, pos)
        e.malla(pos, nor, color, { opacidad: 0.82 })
        break
      }
      case 'param': {
        const n = 72
        const { actualizar } = e.superficie(n, n, { opacidad: 0.85 })
        const c: [number, number, number] = [color.r, color.g, color.b]
        actualizar((a, b) => {
          const u = o.du[0] + ((o.du[1] - o.du[0]) * a) / (n - 1)
          const v = o.dv[0] + ((o.dv[1] - o.dv[0]) * b) / (n - 1)
          const p = o.f(u, v)
          return [...(p.map((q) => (Number.isFinite(q) ? q : 0)) as V3), c]
        })
        break
      }
      case 'curva': {
        const pts: V3[] = []
        for (let k = 0; k <= 600; k++) {
          const p = o.f(o.dom[0] + ((o.dom[1] - o.dom[0]) * k) / 600)
          if (p.every(Number.isFinite)) pts.push(p)
        }
        tubo(e, pts, color, grosor)
        break
      }
      case 'linea': {
        if (o.tipo === 'vector') {
          e.flecha([o.b[0] - o.a[0], o.b[1] - o.a[1], o.b[2] - o.a[2]], color, o.a, grosor)
          break
        }
        const r = o.tipo === 'recta' ? recortarACaja(o.a, o.b, L) : [0, 1]
        if (!r) break
        const en = (t: number): V3 => [0, 1, 2].map((k) => o.a[k] + t * (o.b[k] - o.a[k])) as V3
        tubo(e, [en(r[0]), en(r[1])], color, grosor)
        break
      }
      case 'solido':
        solido(e, o, color)
        break
      case 'punto':
        e.punto(o.p, color, 0.03 * L)
        if (o.nombre) e.rotulo(o.nombre, [o.p[0], o.p[1], o.p[2] + 0.09 * L], 0.12 * L)
        break
    }
  })

  // los cortes, al final: necesitan las mallas de las dos superficies
  an.objetos.forEach((o, i) => {
    if (o.k !== 'corte' || !s.filas[i].visible) return
    const a = mallaDe(o.i)
    const b = an.objetos[o.j]
    if (!a || b?.k !== 'implicita') return
    const seg = cortarMalla(a, b.F)
    const col = new Float32Array(seg.length)
    const c = e.color(colorDe(i))
    for (let k = 0; k < col.length; k += 3) col.set([c.r, c.g, c.b], k)
    e.segmentos(seg, col)
    // el trazo de 1 px se pierde sobre la superficie: se refuerza con puntos
    const m = Math.min(seg.length / 3, 3000)
    const paso = Math.max(1, Math.floor(seg.length / 3 / m))
    const pos: number[] = []
    for (let k = 0; k < seg.length / 3; k += paso) pos.push(seg[3 * k], seg[3 * k + 1], seg[3 * k + 2])
    const cols = new Float32Array(pos.length)
    for (let k = 0; k < cols.length; k += 3) cols.set([c.r, c.g, c.b], k)
    e.nube(new Float32Array(pos), cols, 0.05 * L, 1)
  })
}

/* ---------- puntos arrastrables ---------- */

function asas(s: S): Asa[] {
  const an = analisis(s)
  return an.objetos.flatMap((o, i) =>
    o.k === 'punto' && o.libre && s.filas[i].visible ? [{ id: `P${i}`, p: o.p, color: colorDe(i), nombre: o.nombre ?? undefined }] : [],
  )
}

function mover(id: string, t: { p: number[] }, s: S): Partial<S> {
  const i = +id.slice(1)
  const src = s.filas[i].src
  const nombre = src.match(/^\s*([A-Za-z][A-Za-z0-9_]*)\s*=/)?.[1]
  const L = s.L
  const p = t.p.map((q) => fmt(Math.max(-L, Math.min(L, q)), 2))
  const nuevo = `${nombre ? `${nombre} = ` : ''}(${p.join(', ')})`
  return { filas: s.filas.map((f, k) => (k === i ? { ...f, src: nuevo } : f)) }
}

/* ---------- panel ---------- */

function Panel({ s, set }: PropsPanel<S>) {
  const an = analisis(s)
  const setFila = (i: number, parche: Partial<S['filas'][number]>) => set({ filas: s.filas.map((f, k) => (k === i ? { ...f, ...parche } : f)) })
  return (
    <>
      <Grupo titulo="Objetos">
        <div className="objetos">
          {s.filas.map((f, i) => {
            const o = an.objetos[i]
            return (
              <div className="objeto" key={i}>
                <button
                  type="button"
                  className="ver"
                  style={{ ['--c' as string]: `var(${colorDe(i)})` }}
                  aria-pressed={f.visible}
                  aria-label={f.visible ? 'Ocultar' : 'Mostrar'}
                  onClick={() => setFila(i, { visible: !f.visible })}
                />
                <Expresion
                  etiqueta={<span className="cas-n">{i + 1}</span>}
                  valor={f.src}
                  variables={[]}
                  piezas={PIEZAS}
                  comprobar={() => (o?.k === 'error' ? o.error : null)}
                  previa={() => o?.tex ?? null}
                  onChange={(src) => setFila(i, { src })}
                />
                <button type="button" className="quitar-fila" aria-label="Quitar" onClick={() => set({ filas: s.filas.filter((_, k) => k !== i) })}>
                  ×
                </button>
              </div>
            )
          })}
        </div>
        <Boton onClick={() => set({ filas: [...s.filas, { src: '', visible: true }] })}>Añadir objeto</Boton>
        <Atajos opciones={EJEMPLOS.map((e) => ({ t: e.t, onClick: () => set({ filas: e.f.map((src) => ({ src, visible: true })) }) }))} />
      </Grupo>

      {an.parametros.length > 0 && (
        <Grupo titulo="Deslizadores">
          {an.parametros.map((p) => {
            const P = s.params[p] ?? { v: 1, min: -5, max: 5 }
            return <Rango key={p} etiqueta={p} valor={P.v} min={P.min} max={P.max} paso={0.01} formato={(v) => fmt(v, 2)} onChange={(v) => set({ params: { ...s.params, [p]: { ...P, v } } })} />
          })}
        </Grupo>
      )}

      <Grupo titulo="Caja">
        <Rango etiqueta="Caja [−L, L]³" valor={s.L} min={1} max={10} paso={0.5} formato={(v) => `L = ${v}`} onChange={(L) => set({ L })} />
        <Rango etiqueta="Detalle" valor={s.detalle} min={24} max={96} paso={8} formato={(v) => `${v}³`} onChange={(detalle) => set({ detalle })} />
      </Grupo>
    </>
  )
}

export default definir<S>({
  id: 'espacio',
  area: 'geometria',
  resumen: 'Geometría en el espacio: superficies, sólidos y cortes',
  corto: 'Espacio',
  titulo: 'Geometría en el <i>espacio</i>',
  entradilla: 'Superficies implícitas, planos, rectas, curvas, sólidos y la curva donde se cortan dos superficies.',
  inicial: {
    filas: EJEMPLOS[0].f.map((src) => ({ src, visible: true })),
    params: {},
    L: 3,
    detalle: 56,
  },
  Panel,
  lecturas: (s) => {
    const an = analisis(s)
    const filas: Array<[string, string]> = []
    an.objetos.forEach((o, i) => {
      if ((o.k === 'solido' || o.k === 'implicita') && o.medidas) {
        const nombre = o.k === 'solido' ? o.forma : 'esfera'
        filas.push([`${i + 1} · volumen del ${nombre}`, fmt(o.medidas.volumen, 4)], [`${i + 1} · área`, fmt(o.medidas.area, 4)])
      }
      if (o.k === 'error') filas.push([`fila ${i + 1}`, o.error])
    })
    return filas
  },
  vista: {
    tipo: '3d',
    camara: { theta: 0.85, phi: 1.1, r: 13 },
    pesada: true,
    construir,
    interaccion: {
      asas,
      mover,
      pista: 'Arrastra los puntos libres; con ⌥, en vertical',
    },
  },
})
