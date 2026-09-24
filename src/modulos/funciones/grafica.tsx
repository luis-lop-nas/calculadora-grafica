import { useEffect, useRef } from 'react'
import { definir, type Asa, type PropsPanel } from '../../nucleo/tipos'
import { Atajos, Boton, Expresion, Grupo, Interruptor, Muestra, Rango, Segmentado } from '../../nucleo/controles'
import type { Pintor2D } from '../../render/pintor2d'
import { contorno, encadenar } from '../../lib/contorno'
import {
  analizarFilas, asintotas, ceros, cortes, derivada, extremos, inflexiones, integral, nombrePunto, segunda, valorOLimite,
  type Analisis, type Condicion, type Fila, type Objeto, type Param,
} from '../../lib/objetos2d'

type F1 = (x: number) => number

interface S {
  filas: Fila[]
  params: Record<string, Param>
  /** Fila de la función que se analiza (x₀, tangente, área, puntos notables). */
  activa: number
  x0: number
  verTangente: boolean
  verDerivada: boolean
  area: 'no' | 'bajo' | 'entre'
  /** Límite inferior del área; el superior es x₀. */
  a: number
  verRaices: boolean
  verExtremos: boolean
  verInflexion: boolean
  verAsintotas: boolean
  verCortes: boolean
  /** Puntos marcados: [x, fila de la función]. */
  marcas: number[][]
  verProyecciones: boolean
  verTabla: boolean
  tablaDesde: number
  tablaPaso: number
}

const COLORES = ['--accent', '--aux', '--rosa', '--morado', '--ocre', '--neg']
const colorDe = (i: number) => COLORES[i % COLORES.length]
const SUB = '₀₁₂₃₄₅₆₇₈₉'
const sub = (n: number) => String(n).split('').map((d) => SUB[+d]).join('')
const fmt = (v: number, d = 4) => (Number.isFinite(v) ? String(+v.toFixed(d)) : '—')
/** Rango fijo de las lecturas: el panel no se entera del paneo del lienzo. */
const LECTURA: [number, number] = [-12, 12]

const EJEMPLOS = [
  { t: 'Polinomio', e: 'x^3-3x' },
  { t: 'Racional', e: '(2x^2+1)/(x^2-1)' },
  { t: 'A trozos', e: 'if(x<0, -x, x^2/2)' },
  { t: 'Deslizadores', e: 'a sin(bx+c)' },
  { t: 'Circunferencia', e: 'x^2+y^2=9' },
  { t: 'Región', e: 'y < sin(x)' },
  { t: 'Paramétrica', e: '(cos(3t), sin(2t))' },
  { t: 'Polar', e: 'r = 1+cos(θ)' },
  { t: 'Punto', e: 'A = (2, 1)' },
]

const PIEZAS = ['x', 'y', '=', '<', '^', '(', ')', 'sqrt(', 'sin(', 'cos(', 'exp(', 'ln(', 'pi', 't', 'θ', 'if(']

/* ---------- análisis con caché: dibujar se llama en cada fotograma de paneo ---------- */

let cache: { clave: string; an: Analisis } | null = null
function analisis(s: S): Analisis {
  const clave = JSON.stringify([s.filas, s.params])
  if (cache?.clave !== clave) cache = { clave, an: analizarFilas(s.filas, s.params) }
  return cache.an
}

type Funcion = Extract<Objeto, { k: 'funcion' }>

/** Funciones explícitas visibles, con su fila. */
function funciones(s: S, an: Analisis) {
  return an.objetos.flatMap((o, i) => (o.k === 'funcion' && s.filas[i].visible ? [{ i, o }] : []))
}

function activa(s: S, an: Analisis): { i: number; o: Funcion } | null {
  const fs = funciones(s, an)
  return fs.find((f) => f.i === s.activa) ?? fs[0] ?? null
}

/** La otra curva del área entre dos: la primera función visible que no es la activa. */
function otra(s: S, an: Analisis, i: number) {
  return funciones(s, an).find((f) => f.i !== i) ?? null
}

/* ---------- deslizadores ---------- */

function param(s: S, an: Analisis, p: string): Param {
  const guardado = s.params[p]
  const fila = an.definidos[p]
  const escrito = fila !== undefined ? Number(s.filas[fila].src.split('=')[1].replace(/\s+/g, '')) : NaN
  const v = Number.isFinite(escrito) ? escrito : guardado?.v ?? 1
  return { v, min: Math.min(guardado?.min ?? -5, v), max: Math.max(guardado?.max ?? 5, v), anim: guardado?.anim }
}

function fijar(s: S, an: Analisis, p: string, parche: Partial<Param>): Partial<S> {
  const P = { ...param(s, an, p), ...parche }
  const out: Partial<S> = { params: { ...s.params, [p]: P } }
  const fila = an.definidos[p]
  if (fila !== undefined && parche.v !== undefined) {
    const nombre = s.filas[fila].src.split('=')[0].trim()
    out.filas = s.filas.map((f, i) => (i === fila ? { ...f, src: `${nombre} = ${fmt(P.v, 3)}` } : f))
  }
  return out
}

/* ---------- filas ---------- */

function quitarFila(s: S, i: number): Partial<S> {
  return {
    filas: s.filas.filter((_, k) => k !== i),
    marcas: s.marcas.filter((m) => m[1] !== i).map(([x, c]) => [x, c > i ? c - 1 : c]),
    activa: s.activa > i ? s.activa - 1 : s.activa,
  }
}

function anadirFila(s: S, src: string): Partial<S> {
  const ultima = s.filas[s.filas.length - 1]
  if (ultima && !ultima.src.trim()) return { filas: s.filas.map((f, i) => (i === s.filas.length - 1 ? { ...f, src } : f)) }
  return { filas: [...s.filas, { src, visible: true }] }
}

/** Escribe un punto libre movido, conservando su nombre. */
function moverPunto(src: string, x: number, y: number) {
  const nombre = src.match(/^\s*([A-Za-z][A-Za-z0-9_]*)\s*=/)?.[1]
  const p = `(${fmt(x, 2)}, ${fmt(y, 2)})`
  return nombre ? `${nombre} = ${p}` : p
}

/* ---------- interacción ---------- */

let ventanaActual = { x: [-6, 6] as [number, number], y: [-4, 4] as [number, number] }

function asas(s: S): Asa[] {
  const an = analisis(s)
  const out: Asa[] = []
  const fa = activa(s, an)
  if (fa && Number.isFinite(fa.o.f(s.x0))) out.push({ id: 'x0', p: [s.x0, fa.o.f(s.x0)], color: '--ink', nombre: 'x₀' })
  s.marcas.forEach(([x, c], k) => {
    const o = an.objetos[c]
    const y = o?.k === 'funcion' && s.filas[c].visible ? o.f(x) : NaN
    if (Number.isFinite(y)) out.push({ id: `M${k}`, p: [x, y], color: colorDe(c) })
  })
  an.objetos.forEach((o, i) => {
    if (o.k === 'punto' && o.libre && s.filas[i].visible) out.push({ id: `L${i}`, p: [o.x, o.y], color: colorDe(i), nombre: o.nombre ?? undefined })
  })
  return out
}

/* ---------- dibujo ---------- */

/**
 * Traza una curva muestreada. Un salto grande entre dos muestras se comprueba
 * con el punto medio: si no cae entre ambas, es una asíntota y se corta el trazo.
 */
function trazo(g: Pintor2D, p: (u: number) => [number, number], a: number, b: number, n: number, color: string, grosor: number, discontinua = false) {
  const { ctx } = g
  const salto = Math.max(g.ancho, g.alto) * 0.25
  const px = (q: [number, number]): [number, number] => [g.X(q[0]), Math.max(-10 * g.alto, Math.min(11 * g.alto, g.Y(q[1])))]
  const entre = (m: number, u: number, v: number) => m >= Math.min(u, v) - 1e-9 && m <= Math.max(u, v) + 1e-9
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = grosor
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  if (discontinua) ctx.setLineDash([5, 5])
  ctx.beginPath()
  let prev: [number, number] | null = null
  let uPrev = a
  for (let i = 0; i <= n; i++) {
    const u = a + ((b - a) * i) / n
    const q = p(u)
    if (!Number.isFinite(q[0]) || !Number.isFinite(q[1])) {
      prev = null
      continue
    }
    const pq = px(q)
    if (prev) {
      const ppx = px(prev)
      let corta = false
      if (Math.abs(pq[1] - ppx[1]) > salto || Math.abs(pq[0] - ppx[0]) > salto) {
        const m = p((u + uPrev) / 2)
        corta = !(entre(m[0], prev[0], q[0]) && entre(m[1], prev[1], q[1]))
      }
      if (corta) ctx.moveTo(pq[0], pq[1])
      else ctx.lineTo(pq[0], pq[1])
    } else ctx.moveTo(pq[0], pq[1])
    prev = q
    uPrev = u
  }
  ctx.stroke()
  ctx.restore()
}

function segmentos(g: Pintor2D, segs: Array<[[number, number], [number, number]]>, color: string, grosor: number, discontinua = false) {
  const { ctx } = g
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = grosor
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  if (discontinua) ctx.setLineDash([5, 4])
  ctx.beginPath()
  for (const linea of encadenar(segs, (g.ventana.x[1] - g.ventana.x[0]) * 1e-9)) {
    ctx.moveTo(g.X(linea[0][0]), g.Y(linea[0][1]))
    for (let k = 1; k < linea.length; k++) ctx.lineTo(g.X(linea[k][0]), g.Y(linea[k][1]))
  }
  ctx.stroke()
  ctx.restore()
}

/**
 * Una recta como y = x pasa justo por vértices de la rejilla, donde el valor es
 * 0 exacto y marching squares no ve cambio de signo: se corta un pelo por encima.
 */
const NIVEL = 1e-11

/** Rellena donde se cumplen todas las condiciones, por celdas de 3 px agrupadas en tiras. */
function region(g: Pintor2D, conds: Condicion[], color: string) {
  const { ctx } = g
  const celda = 3
  const cumple = (x: number, y: number) => conds.every((c) => {
    const v = c.F(x, y)
    return c.estricta ? v > 0 : v >= 0
  })
  ctx.save()
  ctx.fillStyle = color
  ctx.globalAlpha = 0.2
  for (let py = 0; py < g.alto; py += celda) {
    let ini = -1
    for (let px = 0; px <= g.ancho; px += celda) {
      const w = g.aMundo(px + celda / 2, py + celda / 2)
      const dentro = px < g.ancho && cumple(w.x, w.y)
      if (dentro && ini < 0) ini = px
      if (!dentro && ini >= 0) {
        ctx.fillRect(ini, py, px - ini, celda)
        ini = -1
      }
    }
  }
  ctx.restore()
  // borde: cada condición en su curva de nivel cero, solo donde las demás se cumplen
  conds.forEach((c, k) => {
    const segs = contorno(c.F, g.ventana, NIVEL, Math.round(g.ancho / 5), Math.round(g.alto / 5)).filter(([p, q]) => {
      const m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]
      return conds.every((o, j) => j === k || o.F(m[0], m[1]) >= -1e-9)
    })
    segmentos(g, segs, color, 1.6, c.estricta)
  })
}

function sombra(g: Pintor2D, arriba: F1, abajo: F1, a: number, b: number, color: string) {
  const { ctx } = g
  const n = 400
  ctx.save()
  ctx.fillStyle = color
  ctx.globalAlpha = 0.2
  ctx.beginPath()
  for (let i = 0; i <= n; i++) {
    const x = a + ((b - a) * i) / n
    const y = arriba(x)
    ctx[i ? 'lineTo' : 'moveTo'](g.X(x), g.Y(Number.isFinite(y) ? y : 0))
  }
  for (let i = n; i >= 0; i--) {
    const x = a + ((b - a) * i) / n
    const y = abajo(x)
    ctx.lineTo(g.X(x), g.Y(Number.isFinite(y) ? y : 0))
  }
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

function dibujar(g: Pintor2D, s: S) {
  g.ejes({ etiquetaX: 'x', etiquetaY: 'y' })
  ventanaActual = { x: [...g.ventana.x], y: [...g.ventana.y] }
  const an = analisis(s)
  const [xa, xb] = g.ventana.x
  const [ya, yb] = g.ventana.y
  const ver = (i: number) => s.filas[i].visible
  const fa = activa(s, an)

  // regiones debajo de todo
  an.objetos.forEach((o, i) => {
    if (o.k === 'inecuacion' && ver(i)) region(g, o.condiciones, g.color(colorDe(i)))
  })

  if (fa && s.area !== 'no') {
    const a = Math.min(s.a, s.x0)
    const b = Math.max(s.a, s.x0)
    const og = s.area === 'entre' ? otra(s, an, fa.i) : null
    sombra(g, fa.o.f, og ? og.o.f : () => 0, a, b, g.color(colorDe(fa.i)))
  }

  if (fa && s.verAsintotas) {
    const as = asintotas(fa.o.f, xa, xb)
    for (const x of as.verticales) g.curva([[x, ya], [x, yb]], g.color('--ink-soft'), 1.2, true)
    for (const o of as.oblicuas) g.curva([[xa, o.m * xa + o.b], [xb, o.m * xb + o.b]], g.color('--ink-soft'), 1.2, true)
  }

  if (fa && s.verDerivada) trazo(g, (x) => [x, derivada(fa.o.f, x)], xa, xb, 900, g.color('--pos'), 1.4, true)

  an.objetos.forEach((o, i) => {
    if (!ver(i)) return
    const color = g.color(colorDe(i))
    const grosor = fa?.i === i ? 2.6 : 2
    switch (o.k) {
      case 'funcion':
        trazo(g, (x) => [x, o.f(x)], xa, xb, 1400, color, grosor)
        break
      case 'funcionY':
        trazo(g, (y) => [o.f(y), y], ya, yb, 1000, color, grosor)
        break
      case 'parametrica':
        trazo(g, (t) => [o.X(t), o.Y(t)], o.dom[0], o.dom[1], 2000, color, grosor)
        break
      case 'polar':
        trazo(g, (t) => [o.r(t) * Math.cos(t), o.r(t) * Math.sin(t)], o.dom[0], o.dom[1], 2000, color, grosor)
        break
      case 'implicita':
        segmentos(g, contorno(o.F, g.ventana, NIVEL, Math.round(g.ancho / 4), Math.round(g.alto / 4)), color, grosor)
        break
    }
  })

  const fs = funciones(s, an)
  if (s.verCortes) {
    for (let p = 0; p < fs.length; p++)
      for (let q = p + 1; q < fs.length; q++)
        for (const c of cortes(fs[p].o.f, fs[q].o.f, xa, xb)) g.punto(c.x, c.y, g.color('--ink'), 3.5)
  }

  if (fa) {
    const f = fa.o.f
    if (s.verRaices) {
      for (const x of ceros(f, xa, xb)) {
        g.punto(x, 0, g.color('--ink'), 4)
        g.texto(fmt(x, 3), x, 0, g.color('--ink-soft'), { dx: 6, dy: 12 })
      }
      const y0 = f(0)
      if (Number.isFinite(y0)) g.punto(0, y0, g.color('--ink'), 3.5)
    }
    if (s.verExtremos) for (const e of extremos(f, xa, xb)) if (Number.isFinite(e.y)) g.punto(e.x, e.y, g.color('--pos'), 4)
    if (s.verInflexion)
      for (const p of inflexiones(f, xa, xb)) {
        if (!Number.isFinite(p.y)) continue
        g.punto(p.x, p.y, g.color('--panel'), 4)
        g.punto(p.x, p.y, g.color('--pos'), 2.2)
      }

    const v = f(s.x0)
    if (Number.isFinite(v)) {
      g.curva([[s.x0, ya], [s.x0, yb]], g.color('--ink-soft'), 1, true)
      if (s.verTangente) {
        const d = derivada(f, s.x0)
        const L = (xb - xa) * 0.22
        g.curva([[s.x0 - L, v - d * L], [s.x0 + L, v + d * L]], g.color('--ink'), 1.6)
      }
      g.texto(`(${s.x0.toFixed(2)}, ${v.toFixed(3)})`, s.x0, v, g.color('--ink'), { dx: 12, dy: 18 })
    }
  }

  an.objetos.forEach((o, i) => {
    if (o.k !== 'punto' || !ver(i) || !Number.isFinite(o.x) || !Number.isFinite(o.y)) return
    // los libres los pinta el armazón como asas; aquí solo los que dependen de algo
    if (!o.libre) g.punto(o.x, o.y, g.color(colorDe(i)), 4.5)
    if (o.nombre) g.texto(o.nombre, o.x, o.y, g.color(colorDe(i)), { dx: 9, dy: -11 })
  })

  s.marcas.forEach(([x, c], k) => {
    const o = an.objetos[c]
    if (o?.k !== 'funcion' || !ver(c)) return
    const y = o.f(x)
    if (!Number.isFinite(y)) return
    const color = g.color(colorDe(c))
    if (s.verProyecciones) {
      g.curva([[x, 0], [x, y]], g.color('--ink-soft'), 1, true)
      g.curva([[0, y], [x, y]], g.color('--ink-soft'), 1, true)
      g.texto(x.toFixed(2), x, 0, g.color('--ink-soft'), { dx: -12, dy: y > 0 ? 16 : -8 })
      g.texto(y.toFixed(2), 0, y, g.color('--ink-soft'), { dx: x > 0 ? -38 : 6, dy: 4 })
    }
    if (s.verTangente) {
      const d = derivada(o.f, x)
      const L = (xb - xa) * 0.1
      g.curva([[x - L, y - d * L], [x + L, y + d * L]], color, 1.2)
    }
    g.texto(`P${sub(k + 1)}`, x, y, color, { dx: 10, dy: -10 })
  })
}

/* ---------- panel ---------- */

function Deslizadores({ s, set, an }: PropsPanel<S> & { an: Analisis }) {
  const ref = useRef(s)
  ref.current = s
  const animando = an.parametros.some((p) => s.params[p]?.anim)

  useEffect(() => {
    if (!animando) return
    let id = 0
    let prev = performance.now()
    const dir: Record<string, number> = {}
    const paso = (ahora: number) => {
      const dt = Math.min(0.1, (ahora - prev) / 1000)
      prev = ahora
      let st = ref.current
      const a2 = analisis(st)
      let parche: Partial<S> = {}
      for (const p of a2.parametros) {
        const P = param(st, a2, p)
        if (!P.anim) continue
        // de un extremo al otro en 4 s, y vuelta
        let v = P.v + (dir[p] ?? 1) * ((P.max - P.min) * dt) / 4
        if (v >= P.max) {
          v = P.max
          dir[p] = -1
        } else if (v <= P.min) {
          v = P.min
          dir[p] = 1
        }
        parche = { ...parche, ...fijar(st, a2, p, { v }) }
        st = { ...st, ...parche }
      }
      set(parche)
      id = requestAnimationFrame(paso)
    }
    id = requestAnimationFrame(paso)
    return () => cancelAnimationFrame(id)
  }, [animando])

  if (!an.parametros.length) return null
  return (
    <Grupo titulo="Deslizadores">
      {an.parametros.map((p) => {
        const P = param(s, an, p)
        return (
          <div className="deslizador" key={p}>
            <Rango etiqueta={p} valor={P.v} min={P.min} max={P.max} paso={(P.max - P.min) / 400} formato={(v) => fmt(v, 3)} onChange={(v) => set(fijar(s, an, p, { v }))} />
            <button type="button" className="play" aria-pressed={!!P.anim} aria-label={P.anim ? `Parar ${p}` : `Animar ${p}`} onClick={() => set(fijar(s, an, p, { anim: !P.anim }))}>
              {P.anim ? '❚❚' : '▶'}
            </button>
            <div className="limites">
              <input type="number" aria-label={`Mínimo de ${p}`} value={P.min} step="any" onChange={(e) => Number.isFinite(+e.target.value) && e.target.value !== '' && set(fijar(s, an, p, { min: +e.target.value }))} />
              <span>…</span>
              <input type="number" aria-label={`Máximo de ${p}`} value={P.max} step="any" onChange={(e) => Number.isFinite(+e.target.value) && e.target.value !== '' && set(fijar(s, an, p, { max: +e.target.value }))} />
            </div>
          </div>
        )
      })}
    </Grupo>
  )
}

function Tabla({ s, an }: { s: S; an: Analisis }) {
  const fs = funciones(s, an).slice(0, 4)
  if (!fs.length) return null
  const xs = Array.from({ length: 11 }, (_, k) => s.tablaDesde + k * s.tablaPaso)
  return (
    <table className="tabla-valores">
      <thead>
        <tr>
          <th>x</th>
          {fs.map((f) => (
            <th key={f.i} style={{ color: `var(${colorDe(f.i)})` }}>
              {f.o.nombre}(x)
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {xs.map((x) => (
          <tr key={x}>
            <td>{fmt(x, 4)}</td>
            {fs.map((f) => (
              <td key={f.i}>{fmt(f.o.f(x), 5)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Panel({ s, set }: PropsPanel<S>) {
  const an = analisis(s)
  const fs = funciones(s, an)
  const fa = activa(s, an)
  const n = fa?.o.nombre ?? 'f'
  const setFila = (i: number, parche: Partial<Fila>) => set({ filas: s.filas.map((f, k) => (k === i ? { ...f, ...parche } : f)) })

  return (
    <>
      <Grupo titulo="Objetos">
        <div className="objetos">
          {s.filas.map((f, i) => {
            const o = an.objetos[i]
            const anonima = o.k === 'funcion' && !f.src.includes('=')
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
                  etiqueta={anonima ? `${o.nombre}(x) =` : ''}
                  valor={f.src}
                  variables={[]}
                  piezas={PIEZAS}
                  comprobar={() => (o.k === 'error' ? o.error : null)}
                  previa={() => (anonima ? null : o.tex)}
                  onChange={(src) => setFila(i, { src })}
                />
                <button type="button" className="quitar-fila" aria-label="Quitar" onClick={() => set(quitarFila(s, i))}>
                  ×
                </button>
              </div>
            )
          })}
        </div>
        <Boton onClick={() => set({ filas: [...s.filas, { src: '', visible: true }] })}>Añadir objeto</Boton>
        <Atajos opciones={EJEMPLOS.map((e) => ({ t: e.t, onClick: () => set(anadirFila(s, e.e)) }))} />
      </Grupo>

      <Deslizadores s={s} set={set} an={an} />

      {fa && (
        <Grupo titulo="Análisis">
          {fs.length > 1 && <Segmentado valor={fa.i} opciones={fs.map((f) => ({ v: f.i, t: f.o.nombre }))} onChange={(activa) => set({ activa })} />}
          <Rango etiqueta="x₀" valor={s.x0} min={-12} max={12} paso={0.01} formato={(v) => v.toFixed(2)} onChange={(x0) => set({ x0 })} />
          <div className="interruptores">
            <Interruptor activo={s.verTangente} onChange={(verTangente) => set({ verTangente })}>
              Tangente
            </Interruptor>
            <Interruptor activo={s.verDerivada} onChange={(verDerivada) => set({ verDerivada })}>
              {n}′
            </Interruptor>
          </div>
          <Segmentado
            valor={fs.length > 1 || s.area !== 'entre' ? s.area : 'bajo'}
            opciones={[
              { v: 'no', t: 'Sin área' },
              { v: 'bajo', t: `∫ ${n}` },
              ...(fs.length > 1 ? [{ v: 'entre' as const, t: 'Entre dos' }] : []),
            ]}
            onChange={(area) => set({ area })}
          />
          {s.area !== 'no' && <Rango etiqueta="desde a" valor={s.a} min={-12} max={12} paso={0.01} formato={(v) => v.toFixed(2)} onChange={(a) => set({ a })} />}
        </Grupo>
      )}

      {fa && (
        <Grupo titulo="Puntos notables">
          <div className="interruptores">
            <Interruptor activo={s.verRaices} onChange={(verRaices) => set({ verRaices })}>
              Cortes con los ejes
            </Interruptor>
            <Interruptor activo={s.verExtremos} onChange={(verExtremos) => set({ verExtremos })}>
              Extremos
            </Interruptor>
            <Interruptor activo={s.verInflexion} onChange={(verInflexion) => set({ verInflexion })}>
              Inflexión
            </Interruptor>
            <Interruptor activo={s.verAsintotas} onChange={(verAsintotas) => set({ verAsintotas })}>
              Asíntotas
            </Interruptor>
            {fs.length > 1 && (
              <Interruptor activo={s.verCortes} onChange={(verCortes) => set({ verCortes })}>
                Cortes entre curvas
              </Interruptor>
            )}
          </div>
        </Grupo>
      )}

      {fs.length > 0 && (
        <Grupo titulo="Puntos marcados">
          {s.marcas.length > 0 && (
            <div className="lista-marcas">
              {s.marcas.map(([x, c], k) => {
                const o = an.objetos[c]
                return (
                  <div className="fila-quitable" key={k}>
                    <span className="punto" style={{ background: `var(${colorDe(c)})` }} />
                    <span className="marca">
                      P{sub(k + 1)} sobre {o?.k === 'funcion' ? o.nombre : '—'}, x = {x.toFixed(3)}
                    </span>
                    <button type="button" className="quitar-fila" aria-label={`Quitar P${k + 1}`} onClick={() => set({ marcas: s.marcas.filter((_, j) => j !== k) })}>
                      ×
                    </button>
                  </div>
                )
              })}
            </div>
          )}
          <div className="interruptores">
            <Interruptor activo={s.verProyecciones} onChange={(verProyecciones) => set({ verProyecciones })}>
              Proyecciones a los ejes
            </Interruptor>
            {s.marcas.length > 0 && <Boton onClick={() => set({ marcas: [] })}>Quitar todos</Boton>}
          </div>
        </Grupo>
      )}

      {fs.length > 0 && (
        <Grupo titulo="Tabla de valores">
          <div className="interruptores">
            <Interruptor activo={s.verTabla} onChange={(verTabla) => set({ verTabla })}>
              Tabla de valores
            </Interruptor>
          </div>
          {s.verTabla && (
            <>
              <div className="fila-numeros">
                <span>desde</span>
                <input type="number" step="any" value={s.tablaDesde} onChange={(e) => e.target.value !== '' && set({ tablaDesde: +e.target.value })} />
                <span>paso</span>
                <input type="number" step="any" value={s.tablaPaso} onChange={(e) => +e.target.value > 0 && set({ tablaPaso: +e.target.value })} />
              </div>
              <Tabla s={s} an={an} />
            </>
          )}
        </Grupo>
      )}
    </>
  )
}

/* ---------- lecturas ---------- */

function lecturas(s: S): Array<[string, string]> {
  const an = analisis(s)
  const fa = activa(s, an)
  const filas: Array<[string, string]> = []
  if (!fa) {
    const errores = an.objetos.filter((o) => o.k === 'error').length
    return errores ? [['Filas con error', String(errores)]] : []
  }
  const { o, i } = fa
  const f = o.f
  const n = o.nombre
  const v = f(s.x0)
  filas.push(
    ['x₀', s.x0.toFixed(4)],
    [`${n}(x₀)`, Number.isFinite(v) ? v.toFixed(6) : 'no definido'],
    [`${n}′(x₀)`, fmt(derivada(f, s.x0), 6)],
    [`${n}″(x₀)`, fmt(segunda(f, s.x0), 4)],
  )
  if (s.area !== 'no') {
    const og = s.area === 'entre' ? otra(s, an, i) : null
    const val = og ? integral((x) => f(x) - og.o.f(x), s.a, s.x0) : integral(f, s.a, s.x0)
    filas.push([og ? `∫ (${n} − ${og.o.nombre})` : `∫ ${n}`, `${fmt(val, 6)} en [${fmt(s.a, 2)}, ${fmt(s.x0, 2)}]`])
  }
  if (s.verRaices) {
    const r = ceros(f, ...LECTURA)
    filas.push([`Raíces en [−12, 12]`, `${r.length}`])
    r.slice(0, 4).forEach((x, k) => filas.push([`x${sub(k + 1)}`, x.toFixed(6)]))
    const y0 = valorOLimite(f, 0)
    filas.push(['Corte con el eje y', Number.isFinite(f(0)) ? fmt(y0, 6) : Number.isFinite(y0) ? `ninguno (f(0) no existe; el límite es ${fmt(y0, 6)})` : '—'])
  }
  if (s.verExtremos) {
    const e = extremos(f, ...LECTURA)
    filas.push(['Extremos', `${e.length}`])
    e.slice(0, 4).forEach((p, k) => filas.push([`${p.tipo} ${k + 1}`, `(${fmt(p.x, 3)}, ${fmt(p.y, 3)})`]))
  }
  if (s.verInflexion) {
    const p = inflexiones(f, ...LECTURA)
    filas.push(['Inflexiones', `${p.length}`])
    p.slice(0, 4).forEach((q, k) => filas.push([`inflexión ${k + 1}`, `(${fmt(q.x, 3)}, ${fmt(q.y, 3)})`]))
  }
  if (s.verAsintotas) {
    const as = asintotas(f, ...LECTURA)
    as.verticales.slice(0, 4).forEach((x) => filas.push(['Asíntota vertical', `x = ${fmt(x, 4)}`]))
    as.oblicuas.forEach((a) =>
      filas.push([
        `Asíntota en ${a.lado}∞`,
        a.m === 0
          ? `y = ${fmt(a.b, 4)}`
          : `y = ${a.m === 1 ? '' : a.m === -1 ? '−' : fmt(a.m, 4)}x${a.b === 0 ? '' : ` ${a.b < 0 ? '−' : '+'} ${fmt(Math.abs(a.b), 4)}`}`,
      ]),
    )
    if (!as.verticales.length && !as.oblicuas.length) filas.push(['Asíntotas', 'ninguna'])
  }
  if (s.verCortes) {
    for (const g of funciones(s, an)) {
      if (g.i === i) continue
      const c = cortes(f, g.o.f, ...LECTURA)
      filas.push([`Cortes ${n} = ${g.o.nombre}`, `${c.length}`])
      c.slice(0, 3).forEach((p, k) => filas.push([`corte ${k + 1}`, `(${fmt(p.x, 4)}, ${fmt(p.y, 4)})`]))
    }
  }
  s.marcas.forEach(([x, c], k) => {
    const q = an.objetos[c]
    if (q?.k !== 'funcion') return
    filas.push([`P${sub(k + 1)} en ${q.nombre}`, `(${x.toFixed(3)}, ${fmt(q.f(x), 4)}) · pendiente ${fmt(derivada(q.f, x), 3)}`])
  })
  return filas
}

export default definir<S>({
  id: 'grafica',
  area: 'funciones',
  resumen: 'Gráficas: funciones, curvas, regiones y deslizadores',
  corto: 'Gráficas',
  titulo: 'Gráficas y <i>números</i>',
  entradilla: 'Escribe lo que quieras dibujar: funciones, curvas implícitas, regiones, paramétricas, polares o puntos.',
  inicial: {
    filas: [{ src: 'x^3-3x', visible: true }],
    params: {},
    activa: 0,
    x0: 1,
    verTangente: true,
    verDerivada: true,
    area: 'no',
    a: 0,
    verRaices: true,
    verExtremos: true,
    verInflexion: false,
    verAsintotas: true,
    verCortes: true,
    marcas: [],
    verProyecciones: true,
    verTabla: false,
    tablaDesde: -2,
    tablaPaso: 0.5,
  },
  Panel,
  rotulo: (s) => ({ nombre: `x₀ = ${s.x0.toFixed(3)}`, apunte: 'arrastra el punto por la curva' }),
  formula: (s) => {
    const an = analisis(s)
    const fa = activa(s, an)
    if (!fa) return []
    const out: string[] = []
    if (fa.o.tex) out.push(fa.o.tex)
    out.push(String.raw`${fa.o.nombre}'(x_0)=\lim_{h\to0}\frac{${fa.o.nombre}(x_0+h)-${fa.o.nombre}(x_0)}{h}`)
    if (s.area !== 'no') {
      const og = s.area === 'entre' ? otra(s, an, fa.i) : null
      const cuerpo = og ? `\\left(${fa.o.nombre}(x)-${og.o.nombre}(x)\\right)` : `${fa.o.nombre}(x)`
      out.push(String.raw`\int_{a}^{x_0} ${cuerpo}\,dx \quad (\text{Simpson, 2000 tramos})`)
    }
    return out
  },
  lecturas,
  leyenda: (s) => {
    const an = analisis(s)
    return (
      <>
        {an.objetos.map((o, i) => {
          if (!s.filas[i].visible || o.k === 'vacio' || o.k === 'error' || o.k === 'deslizador') return null
          const nombre = o.k === 'funcion' ? o.nombre : o.k === 'punto' ? o.nombre ?? 'punto' : o.k === 'inecuacion' ? 'región' : 'curva'
          return (
            <Muestra key={i} color={`var(${colorDe(i)})`}>
              {nombre}
            </Muestra>
          )
        })}
        {s.verDerivada && activa(s, an) && <Muestra color="var(--pos)">{activa(s, an)!.o.nombre}′</Muestra>}
      </>
    )
  },
  vista: {
    tipo: '2d',
    ventana: { x: [-6, 6], y: [-4, 4] },
    interaccion: {
      asas,
      mover(id, t, s) {
        const x = Math.round(t.p[0] * 1000) / 1000
        if (id === 'x0') return { x0: x }
        if (id.startsWith('L')) {
          const i = +id.slice(1)
          return { filas: s.filas.map((f, k) => (k === i ? { ...f, src: moverPunto(f.src, t.p[0], t.p[1]) } : f)) }
        }
        const k = +id.slice(1)
        return { marcas: s.marcas.map((m, j) => (j === k ? [x, m[1]] : m)) }
      },
      anadir(t, s) {
        // cerca de una función: marca un punto sobre ella (por distancia real, no
        // vertical: en una curva empinada eso lo mandaría fuera de la vista);
        // en un hueco: punto libre nuevo
        const [x, y] = t.p
        const an = analisis(s)
        const w = ventanaActual.x[1] - ventanaActual.x[0]
        const h = ventanaActual.y[1] - ventanaActual.y[0]
        let mejor: number[] | null = null
        let dmin = Infinity
        for (const { i, o } of funciones(s, an)) {
          for (let k = 0; k <= 800; k++) {
            const xi = x - w / 6 + (w / 3) * (k / 800)
            const d = Math.hypot((xi - x) / w, (o.f(xi) - y) / h)
            if (Number.isFinite(d) && d < dmin) {
              dmin = d
              mejor = [Math.round(xi * 1000) / 1000, i]
            }
          }
        }
        if (mejor && dmin < 0.03) return { marcas: [...s.marcas, mejor] }
        return anadirFila(s, `${nombrePunto(s.filas)} = (${fmt(x, 2)}, ${fmt(y, 2)})`)
      },
      quitar(id, s) {
        if (id === 'x0') return
        if (id.startsWith('L')) return quitarFila(s, +id.slice(1))
        return { marcas: s.marcas.filter((_, j) => j !== +id.slice(1)) }
      },
      pista: 'Arrastra x₀, los puntos libres o los marcados · doble clic junto a una curva: marcar · en un hueco: punto nuevo · doble clic o Supr: quitar',
    },
    dibujar,
  },
})
