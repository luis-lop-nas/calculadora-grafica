/**
 * Constructor del lagrangiano por piezas: el catálogo, los ejemplos, el panel de edición,
 * el dibujo del montaje y sus asas. El módulo `lagrangiano` lo usa en su modo «Construir».
 */
import { Atajos, Boton, Grupo, Rango } from '../../nucleo/controles'
import type { Asa, EntradaMenu } from '../../nucleo/tipos'
import { accion, submenu } from '../../nucleo/menu'
import type { Pintor2D } from '../../render/pintor2d'
import { aTexto, energiasNumericas, generar, listaValores, posicionesNumericas, type Cuerpo, type Forma, type Generado, type Ligadura, type Montaje, type Polea, type Resorte, type Soporte } from '../../lib/montaje'
import { vel } from '../../lib/mecanica'
import type { ReactNode } from 'react'
import { BarraEditor, EDITOR_INICIAL, caja, circ as circIcono, pasoRejilla, type CampoEditor, type Categoria, type EstadoEditor, type Seleccion } from '../../nucleo/editor'

/** Lo que el módulo guarda del modo Construir. */
export interface EstadoMontaje {
  montaje: Montaje
  /** Hasta dónde se integra: los ejemplos traen el suyo. */
  tMax: number
  selPieza: string | null
  sigPieza: number
  /** Barra del editor (modo, pincel, pestaña). */
  ed?: EstadoEditor
}

/* ---------------------------------------------------------------- generación con caché */

let cache: { clave: string; v: Generado | { error: string } } | null = null

export function generado(mt: Montaje): Generado | { error: string } {
  const clave = JSON.stringify(mt)
  if (cache?.clave === clave) return cache.v
  let v: Generado | { error: string }
  try {
    v = generar(mt)
  } catch (e) {
    v = { error: (e as Error).message }
  }
  cache = { clave, v }
  return v
}

/** Los cinco campos de texto del módulo a partir del montaje. */
export function textoDe(mt: Montaje): { coords: string; L: string; params: string; ci: string; puntos: string } | { error: string } {
  const g = generado(mt)
  if ('error' in g) return g
  return {
    coords: g.coords.join(', '),
    L: g.L,
    params: listaValores(g.params),
    ci: listaValores(g.ci),
    puntos: g.pos.map((p) => `(${aTexto(p.x)}, ${aTexto(p.y)})`).join('; '),
  }
}


/** Estado inicial (q, q̇) del montaje, en el orden de las coordenadas. */
export function y0De(g: Generado): number[] {
  return [...g.coords.map((q) => g.ci[q] ?? 0), ...g.coords.map((q) => g.ci[vel(q)] ?? 0)]
}

/* ---------------------------------------------------------------- piezas nuevas */

const NOMBRES_FORMA: Record<Forma, string> = { caja: 'Caja', bola: 'Bola', disco: 'Disco (rueda)', aro: 'Aro' }

const COLORES = ['--accent', '--pos', '--morado', '--aux', '--rosa', '--ocre']
export const colorCuerpo = (mt: Montaje, id: string) => COLORES[Math.max(0, mt.cuerpos.findIndex((c) => c.id === id)) % COLORES.length]

type Tipo = 'pendulo' | 'carro' | 'plano' | 'muelleV' | 'muelleH' | 'elastico' | 'rueda' | 'atwood' | 'mesa' | 'libre' | 'soporte' | 'resorte'

export const CATALOGO: Array<{ tipo: Tipo; t: string }> = [
  { tipo: 'soporte', t: 'Soporte (punto fijo)' },
  { tipo: 'pendulo', t: 'Péndulo (varilla)' },
  { tipo: 'carro', t: 'Carro en un raíl' },
  { tipo: 'plano', t: 'Caja en un plano inclinado' },
  { tipo: 'rueda', t: 'Rueda que rueda por una rampa' },
  { tipo: 'muelleV', t: 'Masa colgada de un muelle' },
  { tipo: 'muelleH', t: 'Masa y muelle horizontal' },
  { tipo: 'elastico', t: 'Péndulo elástico (muelle que oscila)' },
  { tipo: 'atwood', t: 'Polea con dos masas (Atwood)' },
  { tipo: 'mesa', t: 'Polea con una masa en la mesa' },
  { tipo: 'libre', t: 'Masa libre en el plano' },
  { tipo: 'resorte', t: 'Muelle entre dos cuerpos' },
]

/** Pieza del catálogo añadida al montaje; se cuelga de lo seleccionado si se puede. */
export function anadir(st: EstadoMontaje, tipo: Tipo): Partial<EstadoMontaje> {
  const mt = st.montaje
  let n = st.sigPieza
  const id = (p: string) => `${p}${n++}`
  const soportes = [...mt.soportes]
  const cuerpos = [...mt.cuerpos]
  const poleas = [...mt.poleas]
  const resortes = [...mt.resortes]
  const sel = st.selPieza && (mt.soportes.some((s) => s.id === st.selPieza) || mt.cuerpos.some((c) => c.id === st.selPieza)) ? st.selPieza : null
  // x libre a la derecha de lo que hay
  const derecha = Math.max(-1.5, ...mt.soportes.map((s) => s.x), ...mt.poleas.map((p) => p.x + 1)) + 2
  const soporteNuevo = (x: number, y: number) => {
    const s: Soporte = { id: id('S'), x, y }
    soportes.push(s)
    return s.id
  }
  const padre = () => sel ?? soportes[0]?.id ?? soporteNuevo(0, 0)
  const cuerpo = (c: Omit<Cuerpo, 'id' | 'nombre'> & { nombre?: string }) => {
    const nuevo: Cuerpo = { id: id('C'), nombre: c.nombre ?? `m${cuerpos.length + 1}`, ...c }
    cuerpos.push(nuevo)
    return nuevo.id
  }
  let elegido: string | null = null
  switch (tipo) {
    case 'soporte':
      elegido = soporteNuevo(derecha, 0)
      break
    case 'pendulo':
      elegido = cuerpo({ forma: 'bola', m: 1, R: 0.12, padre: padre(), lig: { tipo: 'varilla', l: 1, q0: 40, v0: 0 } })
      break
    case 'carro':
      elegido = cuerpo({ forma: 'caja', m: 2, R: 0.2, padre: sel ?? soporteNuevo(derecha, 0), lig: { tipo: 'rail', ang: 0, q0: 0, v0: 1, rueda: false } })
      break
    case 'plano':
      elegido = cuerpo({ forma: 'caja', m: 1, R: 0.15, padre: sel ?? soporteNuevo(derecha, 0), lig: { tipo: 'rail', ang: -30, q0: 0.3, v0: 0, rueda: false } })
      break
    case 'rueda':
      elegido = cuerpo({ forma: 'disco', m: 1, R: 0.25, padre: sel ?? soporteNuevo(derecha, 0), lig: { tipo: 'rail', ang: -20, q0: 0.3, v0: 0, rueda: true } })
      break
    case 'muelleV':
      elegido = cuerpo({ forma: 'caja', m: 1, R: 0.12, padre: padre(), lig: { tipo: 'muelle', k: 20, l0: 1, eje: true, ang: -90, r0: 1.3, th0: 0, vr0: 0, vth0: 0 } })
      break
    case 'muelleH':
      elegido = cuerpo({ forma: 'caja', m: 1, R: 0.15, padre: sel ?? soporteNuevo(derecha, 0), lig: { tipo: 'muelle', k: 10, l0: 1, eje: true, ang: 0, r0: 1.4, th0: 0, vr0: 0, vth0: 0 } })
      break
    case 'elastico':
      elegido = cuerpo({ forma: 'bola', m: 1, R: 0.12, padre: padre(), lig: { tipo: 'muelle', k: 40, l0: 1, eje: false, ang: 0, r0: 1.3, th0: 45, vr0: 0, vth0: 0 } })
      break
    case 'libre':
      elegido = cuerpo({ forma: 'bola', m: 1, R: 0.12, padre: null, lig: { tipo: 'libre', x0: derecha, y0: 1, vx0: 1, vy0: 2 } })
      break
    case 'atwood':
    case 'mesa': {
      const p: Polea = {
        id: id('P'),
        x: derecha,
        y: 0,
        R: 0.2,
        M: 0,
        izq: tipo === 'mesa' ? { ang: 180, d0: 1.2 } : { ang: -90, d0: 1 },
        der: { ang: -90, d0: 1 },
        s0: 0,
        v0: 0,
      }
      poleas.push(p)
      cuerpo({ forma: 'caja', m: tipo === 'mesa' ? 2 : 1.2, R: 0.15, padre: null, lig: { tipo: 'polea', polea: p.id, lado: 'izq' } })
      cuerpo({ forma: 'caja', m: 1, R: 0.15, padre: null, lig: { tipo: 'polea', polea: p.id, lado: 'der' } })
      elegido = p.id
      break
    }
    case 'resorte': {
      // entre lo seleccionado y el cuerpo anterior (o un soporte)
      const a = sel ?? cuerpos[cuerpos.length - 1]?.id
      const otros = [...cuerpos.map((c) => c.id), ...soportes.map((s) => s.id)].filter((x) => x !== a)
      const b = otros[otros.length - 1]
      if (!a || !b) return {}
      const r: Resorte = { id: id('K'), a, b, k: 10, l0: 1 }
      resortes.push(r)
      elegido = r.id
      break
    }
  }
  return { montaje: { ...mt, soportes, cuerpos, poleas, resortes }, sigPieza: n, selPieza: elegido }
}

/** Quita una pieza y todo lo que depende de ella. */
export function quitarPieza(st: EstadoMontaje, id: string): Partial<EstadoMontaje> {
  const mt = st.montaje
  const fuera = new Set([id])
  for (const c of mt.cuerpos) if (c.lig.tipo === 'polea' && c.lig.polea === id) fuera.add(c.id)
  let crece = true
  while (crece) {
    crece = false
    for (const c of mt.cuerpos)
      if (!fuera.has(c.id) && c.padre && fuera.has(c.padre)) {
        fuera.add(c.id)
        crece = true
      }
  }
  return {
    montaje: {
      ...mt,
      soportes: mt.soportes.filter((s) => !fuera.has(s.id)),
      cuerpos: mt.cuerpos.filter((c) => !fuera.has(c.id)),
      poleas: mt.poleas.filter((p) => !fuera.has(p.id)),
      resortes: mt.resortes.filter((r) => !fuera.has(r.id) && !fuera.has(r.a) && !fuera.has(r.b)),
    },
    selPieza: st.selPieza && fuera.has(st.selPieza) ? null : st.selPieza,
  }
}

const cambiarCuerpo = (mt: Montaje, id: string, f: (c: Cuerpo) => Cuerpo): Montaje => ({ ...mt, cuerpos: mt.cuerpos.map((c) => (c.id === id ? f(c) : c)) })
const cambiarLig = (mt: Montaje, id: string, parche: Partial<Ligadura>): Montaje => cambiarCuerpo(mt, id, (c) => ({ ...c, lig: { ...c.lig, ...parche } as Ligadura }))

/* ---------------------------------------------------------------- ejemplos */

const S0: Soporte = { id: 'S0', x: 0, y: 0 }
const bola = (id: string, nombre: string, padre: string | null, lig: Ligadura, m = 1, forma: Forma = 'bola', R = 0.12): Cuerpo => ({ id, nombre, forma, m, R, padre, lig })

export const EJEMPLOS_MONTAJE: Array<{ t: string; mt: Montaje; tMax: number }> = [
  { t: 'Péndulo simple', tMax: 10, mt: { g: 9.8, soportes: [S0], poleas: [], resortes: [], cuerpos: [bola('C1', 'm1', 'S0', { tipo: 'varilla', l: 1, q0: 60, v0: 0 })] } },
  {
    t: 'Doble péndulo',
    tMax: 30,
    mt: { g: 9.8, soportes: [S0], poleas: [], resortes: [], cuerpos: [bola('C1', 'm1', 'S0', { tipo: 'varilla', l: 1, q0: 115, v0: 0 }), bola('C2', 'm2', 'C1', { tipo: 'varilla', l: 1, q0: 143, v0: 0 })] },
  },
  {
    t: 'Triple péndulo',
    tMax: 30,
    mt: {
      g: 9.8,
      soportes: [S0],
      poleas: [],
      resortes: [],
      cuerpos: [bola('C1', 'm1', 'S0', { tipo: 'varilla', l: 1, q0: 100, v0: 0 }), bola('C2', 'm2', 'C1', { tipo: 'varilla', l: 0.8, q0: 120, v0: 0 }), bola('C3', 'm3', 'C2', { tipo: 'varilla', l: 0.6, q0: 150, v0: 0 })],
    },
  },
  { t: 'Péndulo elástico', tMax: 20, mt: { g: 9.8, soportes: [S0], poleas: [], resortes: [], cuerpos: [bola('C1', 'm1', 'S0', { tipo: 'muelle', k: 40, l0: 1, eje: false, ang: 0, r0: 1.3, th0: 45, vr0: 0, vth0: 0 })] } },
  {
    t: 'Carro con péndulo',
    tMax: 15,
    mt: { g: 9.8, soportes: [S0], poleas: [], resortes: [], cuerpos: [bola('C1', 'carro', 'S0', { tipo: 'rail', ang: 0, q0: 0, v0: 0, rueda: false }, 2, 'caja', 0.2), bola('C2', 'm2', 'C1', { tipo: 'varilla', l: 1, q0: 70, v0: 0 })] },
  },
  {
    t: 'Máquina de Atwood',
    tMax: 3,
    mt: {
      g: 9.8,
      soportes: [],
      resortes: [],
      poleas: [{ id: 'P1', x: 0, y: 0, R: 0.2, M: 0.4, izq: { ang: -90, d0: 1 }, der: { ang: -90, d0: 1 }, s0: 0, v0: 0 }],
      cuerpos: [bola('C1', 'm1', null, { tipo: 'polea', polea: 'P1', lado: 'izq' }, 1.3, 'caja', 0.15), bola('C2', 'm2', null, { tipo: 'polea', polea: 'P1', lado: 'der' }, 1, 'caja', 0.15)],
    },
  },
  {
    t: 'Polea con masa en la mesa',
    tMax: 3,
    mt: {
      g: 9.8,
      soportes: [],
      resortes: [],
      poleas: [{ id: 'P1', x: 0, y: 0, R: 0.15, M: 0, izq: { ang: 180, d0: 1.5 }, der: { ang: -90, d0: 0.6 }, s0: 0, v0: 0 }],
      cuerpos: [bola('C1', 'mesa', null, { tipo: 'polea', polea: 'P1', lado: 'izq' }, 2, 'caja', 0.15), bola('C2', 'colgante', null, { tipo: 'polea', polea: 'P1', lado: 'der' }, 1, 'caja', 0.15)],
    },
  },
  {
    t: 'Polea con plano inclinado',
    tMax: 3,
    mt: {
      g: 9.8,
      soportes: [],
      resortes: [],
      poleas: [{ id: 'P1', x: 0, y: 0, R: 0.15, M: 0, izq: { ang: 210, d0: 1.5 }, der: { ang: -90, d0: 0.8 }, s0: 0, v0: 0 }],
      cuerpos: [bola('C1', 'plano', null, { tipo: 'polea', polea: 'P1', lado: 'izq' }, 3, 'caja', 0.15), bola('C2', 'colgante', null, { tipo: 'polea', polea: 'P1', lado: 'der' }, 1, 'caja', 0.15)],
    },
  },
  {
    t: 'Rueda que baja por una rampa',
    tMax: 2,
    mt: {
      g: 9.8,
      soportes: [S0, { id: 'S1', x: 0, y: 1.2 }],
      poleas: [],
      resortes: [],
      cuerpos: [bola('C1', 'disco', 'S0', { tipo: 'rail', ang: -25, q0: 0, v0: 0, rueda: true }, 1, 'disco', 0.3), bola('C2', 'caja', 'S1', { tipo: 'rail', ang: -25, q0: 0, v0: 0, rueda: false }, 1, 'caja', 0.15)],
    },
  },
  {
    t: 'Osciladores acoplados',
    tMax: 30,
    mt: {
      g: 9.8,
      soportes: [S0, { id: 'S1', x: 4.5, y: 0 }],
      poleas: [],
      resortes: [{ id: 'K1', a: 'C2', b: 'S1', k: 10, l0: 1.5 }],
      cuerpos: [bola('C1', 'm1', 'S0', { tipo: 'muelle', k: 10, l0: 1.5, eje: true, ang: 0, r0: 1.9, th0: 0, vr0: 0, vth0: 0 }, 1, 'caja', 0.2), bola('C2', 'm2', 'C1', { tipo: 'muelle', k: 10, l0: 1.5, eje: true, ang: 0, r0: 1.5, th0: 0, vr0: 0, vth0: 0 }, 1, 'caja', 0.2)],
    },
  },
  {
    t: 'Masa y muelle en un plano inclinado',
    tMax: 10,
    mt: { g: 9.8, soportes: [S0], poleas: [], resortes: [], cuerpos: [bola('C1', 'm1', 'S0', { tipo: 'muelle', k: 25, l0: 1.2, eje: true, ang: -30, r0: 1.8, th0: 0, vr0: 0, vth0: 0 }, 1, 'caja', 0.15)] } },
  {
    t: 'Péndulo colgado de un muelle',
    tMax: 20,
    mt: {
      g: 9.8,
      soportes: [S0],
      poleas: [],
      resortes: [],
      cuerpos: [bola('C1', 'm1', 'S0', { tipo: 'muelle', k: 30, l0: 1, eje: true, ang: -90, r0: 1.2, th0: 0, vr0: 0, vth0: 0 }, 1, 'caja', 0.15), bola('C2', 'm2', 'C1', { tipo: 'varilla', l: 0.8, q0: 50, v0: 0 })],
    },
  },
]

/* ---------------------------------------------------------------- panel */

const num = (v: number, d = 2) => v.toFixed(d).replace('.', ',')

function Campo({ etiqueta, valor, min, max, paso, unidad, onChange }: { etiqueta: string; valor: number; min: number; max: number; paso: number; unidad: string; onChange: (v: number) => void }) {
  const dec = paso >= 1 ? 0 : paso >= 0.1 ? 1 : 2
  return <Rango etiqueta={etiqueta} valor={valor} min={min} max={max} paso={paso} formato={(v) => `${v.toFixed(dec)} ${unidad}`.trim()} onChange={onChange} />
}

/** ¿`a` cuelga (directa o indirectamente) de `b`? */
function desciende(mt: Montaje, a: string, b: string): boolean {
  let c = mt.cuerpos.find((x) => x.id === a)
  for (let i = 0; c && i < 50; i++) {
    if (c.padre === b) return true
    c = mt.cuerpos.find((x) => x.id === c!.padre)
  }
  return false
}

/** Energía inicial y un deslizador que reescala todas las velocidades iniciales para fijarla. */
/**
 * V con su cero en y = 0, sumado a mano: Σ m g yᵢ más ½ k (d − l₀)² de cada muelle. Difiere del
 * V del lagrangiano solo en una constante (lo comprueba npm run mate).
 */
export function potencialReal(mt: Montaje, gen: Generado, y: number[]): number {
  const d = dibujoDe(gen)
  const pos = new Map<string, [number, number]>(mt.soportes.map((q) => [q.id, [q.x, q.y]]))
  mt.cuerpos.forEach((c, i) => pos.set(c.id, d.pos[i](y)))
  const donde = (id: string | null): [number, number] => (id === null ? [0, 0] : (pos.get(id) ?? [0, 0]))
  const muelle = (k: number, l0: number, a: [number, number], b: [number, number]) => 0.5 * k * (Math.hypot(a[0] - b[0], a[1] - b[1]) - l0) ** 2
  let V = 0
  for (const c of mt.cuerpos) {
    V += c.m * mt.g * donde(c.id)[1]
    if (c.lig.tipo === 'muelle') V += muelle(c.lig.k, c.lig.l0, donde(c.id), donde(c.padre))
  }
  for (const r of mt.resortes) V += muelle(r.k, r.l0, donde(r.a), donde(r.b))
  return V
}

function Energia({ st, set }: { st: EstadoMontaje; set: (x: Partial<EstadoMontaje>) => void }) {
  const g = generado(st.montaje)
  if ('error' in g) return null
  const en = energiasNumericas(g, g.params)
  const y0 = y0De(g)
  const T0 = en.T(y0)
  // el V del lagrangiano no lleva las constantes; el que se enseña, sí: cero de la gravitatoria en y = 0
  const V0 = potencialReal(st.montaje, g, y0)
  const escalar = (E: number) => {
    const n = g.coords.length
    let y = y0
    let T = T0
    if (T < 1e-12) {
      // en reposo: se arranca moviendo la primera coordenada
      y = [...y0]
      y[n] = 1
      T = en.T(y)
    }
    const k = Math.sqrt(Math.max(0, E - V0) / T)
    const qd = y.slice(n).map((v) => v * k)
    const ci: Record<string, number> = {}
    g.coords.forEach((q, i) => (ci[vel(q)] = qd[i]))
    set({ montaje: conVelocidades(st.montaje, g, ci) })
  }
  return (
    <>
      <Rango etiqueta="Energía total E₀ = T₀ + V₀" valor={T0 + V0} min={V0} max={V0 + Math.max(20, 4 * T0)} paso={0.01} formato={(v) => `${v.toFixed(2)} J`} onChange={escalar} />
      <p className="nota-montaje">
        T₀ = {num(T0)} J · V₀ = {num(V0)} J (el cero de V, en y = 0)
      </p>
    </>
  )
}

/** Devuelve el montaje con las velocidades iniciales dadas por coordenada. */
function conVelocidades(mt: Montaje, g: Generado, ci: Record<string, number>): Montaje {
  const v = (id: string, i = 0) => ci[vel(g.coordDe[id]?.[i] ?? '')] ?? 0
  return {
    ...mt,
    poleas: mt.poleas.map((p) => (g.coordDe[p.id] ? { ...p, v0: v(p.id) } : p)),
    cuerpos: mt.cuerpos.map((c) => {
      const l = c.lig
      if (!g.coordDe[c.id]) return c
      switch (l.tipo) {
        case 'varilla':
        case 'rail':
          return { ...c, lig: { ...l, v0: v(c.id) } }
        case 'muelle':
          return { ...c, lig: { ...l, vr0: v(c.id, 0), vth0: l.eje ? l.vth0 : v(c.id, 1) } }
        case 'libre':
          return { ...c, lig: { ...l, vx0: v(c.id, 0), vy0: v(c.id, 1) } }
        default:
          return c
      }
    }),
  }
}

export function PanelMontaje({ st, set }: { st: EstadoMontaje; set: (x: Partial<EstadoMontaje>) => void }) {
  const mt = st.montaje
  const vacio = !mt.soportes.length && !mt.cuerpos.length && !mt.poleas.length && !mt.resortes.length
  return (
    <Grupo titulo="Montaje">
      <Atajos marcador="Ejemplos de montaje…" opciones={EJEMPLOS_MONTAJE.map((e) => ({ t: e.t, onClick: () => set({ montaje: e.mt, selPieza: null, sigPieza: 100, tMax: e.tMax }) }))} />
      <p className="nota-editor">
        En la vista <b>Montaje</b>, la barra de abajo: <b>Construir</b> (elige una pieza y haz clic; péndulos y muelles cuelgan de lo más cercano), <b>Editar</b> (clic en una pieza para darle valores) y <b>Borrar</b>.
      </p>
      {!vacio && <Boton onClick={() => set({ montaje: { ...mt, soportes: [], cuerpos: [], poleas: [], resortes: [] }, selPieza: null })}>Vaciar el montaje</Boton>}
      <Campo etiqueta="Gravedad g" valor={mt.g} min={0} max={25} paso={0.01} unidad="m/s²" onChange={(g) => set({ montaje: { ...mt, g } })} />
      <Energia st={st} set={set} />
    </Grupo>
  )
}

/** Entradas de Objeto ▸ Añadir y de ejemplos para el menú de la app. */
export function menuMontaje<S extends EstadoMontaje>(): { anadir: EntradaMenu<S>[]; ejemplos: EntradaMenu<S>[] } {
  return {
    anadir: [submenu<S>('Pieza del montaje', CATALOGO.map((o) => accion<S>(o.t, (x) => ({ modo: 'construir', ...anadir(x, o.tipo) }) as unknown as Partial<S>)))],
    ejemplos: EJEMPLOS_MONTAJE.map((e) => accion<S>(`Montaje: ${e.t}`, () => ({ modo: 'construir', montaje: e.mt, selPieza: null, sigPieza: 100, tMax: e.tMax }) as unknown as Partial<S>)),
  }
}

/* ---------------------------------------------------------------- dibujo */

export interface Dibujo {
  gen: Generado
  pos: Array<(y: number[]) => [number, number]>
}

let cacheDibujo: { gen: Generado; d: Dibujo } | null = null
export function dibujoDe(gen: Generado): Dibujo {
  if (cacheDibujo?.gen === gen) return cacheDibujo.d
  const d = { gen, pos: posicionesNumericas(gen, gen.params) }
  cacheDibujo = { gen, d }
  return d
}

function zigzag(g: Pintor2D, a: [number, number], b: [number, number], color: string, vueltas = 9) {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const L = Math.hypot(dx, dy)
  if (L < 1e-9) return
  const ux = dx / L
  const uy = dy / L
  const w = Math.min(0.08, 0.12 * L + 0.02)
  const pts: Array<[number, number]> = [a]
  const n = vueltas * 2
  for (let k = 1; k < n; k++) {
    const f = 0.1 + (0.8 * k) / n
    const s = k % 2 ? w : -w
    pts.push([a[0] + f * dx - s * uy, a[1] + f * dy + s * ux])
  }
  pts.push(b)
  g.curva(pts, color, 1.5)
}

function circ(cx: number, cy: number, r: number, n = 30): Array<[number, number]> {
  return Array.from({ length: n + 1 }, (_, k) => [cx + r * Math.cos((2 * Math.PI * k) / n), cy + r * Math.sin((2 * Math.PI * k) / n)] as [number, number])
}

/** Todos los puntos que deben caber en el encuadre (a lo largo de la trayectoria dada). */
export function puntosMontaje(mt: Montaje, d: Dibujo, ys: number[][]): Array<[number, number]> {
  const out: Array<[number, number]> = [...mt.soportes.map((s) => [s.x, s.y] as [number, number]), ...mt.poleas.flatMap((p) => [[p.x - p.R, p.y + p.R] as [number, number], [p.x + p.R, p.y - p.R] as [number, number]])]
  for (const y of ys) for (const f of d.pos) out.push(f(y))
  return out
}

/** El montaje en el estado y = (q, q̇): soportes, raíles, varillas, muelles, poleas y cuerpos. */
export function dibujarMontaje(g: Pintor2D, mt: Montaje, d: Dibujo, y: number[], opts: { sel?: string | null; velocidades?: boolean; rotulos?: boolean } = {}) {
  const tinta = g.color('--ink-soft')
  const idx = new Map(mt.cuerpos.map((c, i) => [c.id, i]))
  const posDe = (id: string | null): [number, number] => {
    if (id === null) return [0, 0]
    const s = mt.soportes.find((x) => x.id === id)
    if (s) return [s.x, s.y]
    const i = idx.get(id)
    return i === undefined ? [0, 0] : d.pos[i](y)
  }
  const extension = Math.max(3, 0.6 * (g.ventana.x[1] - g.ventana.x[0]))
  // raíles y rampas (detrás)
  for (const c of mt.cuerpos) {
    if (c.lig.tipo !== 'rail' && !(c.lig.tipo === 'muelle' && c.lig.eje)) continue
    const [px, py] = posDe(c.padre)
    const a = ((c.lig.ang ?? 0) * Math.PI) / 180
    const u = [Math.cos(a), Math.sin(a)]
    const L0 = c.lig.tipo === 'rail' ? -extension : -0.2
    const pts: Array<[number, number]> = [
      [px + L0 * u[0], py + L0 * u[1]],
      [px + extension * u[0], py + extension * u[1]],
    ]
    if (c.lig.tipo === 'rail' || c.lig.tipo === 'muelle') {
      // superficie por debajo del cuerpo
      const n = [-u[1], u[0]]
      const off = c.lig.tipo === 'muelle' ? -c.R : 0
      const sup: Array<[number, number]> = pts.map(([x, yy]) => [x + off * n[0], yy + off * n[1]])
      g.curva(sup, tinta, 1.4)
      if (Math.abs(u[1]) > 0.02 || c.lig.tipo === 'rail') {
        const relleno: Array<[number, number]> = [sup[0], sup[1], [sup[1][0], Math.min(sup[0][1], sup[1][1]) - 0.05], [sup[0][0], Math.min(sup[0][1], sup[1][1]) - 0.05]]
        if (Math.abs(u[1]) > 0.02) g.rellenar(relleno, tinta, 0.1)
      }
    }
  }
  // soportes
  for (const s of mt.soportes) {
    const w = 0.18
    g.curva(
      [
        [s.x - w, s.y],
        [s.x + w, s.y],
      ],
      tinta,
      2.5,
    )
    for (let k = 0; k < 5; k++) {
      const x = s.x - w + (2 * w * k) / 4
      g.curva(
        [
          [x, s.y],
          [x + 0.07, s.y + 0.07],
        ],
        tinta,
        1,
      )
    }
    if (opts.sel === s.id) g.curva(circ(s.x, s.y, 0.12), g.color('--accent'), 1.5, true)
  }
  // poleas y cuerdas
  for (const p of mt.poleas) {
    g.rellenar(circ(p.x, p.y, p.R), tinta, 0.25)
    g.curva(circ(p.x, p.y, p.R), tinta, opts.sel === p.id ? 2.5 : 1.4)
    g.punto(p.x, p.y, tinta, 2.5)
    for (const c of mt.cuerpos) {
      if (c.lig.tipo !== 'polea' || c.lig.polea !== p.id) continue
      const lado = c.lig.lado === 'izq' ? p.izq : p.der
      const a = (lado.ang * Math.PI) / 180
      const dd = [Math.cos(a), Math.sin(a)]
      const n = c.lig.lado === 'izq' ? [dd[1], -dd[0]] : [-dd[1], dd[0]]
      const t: [number, number] = [p.x + p.R * n[0], p.y + p.R * n[1]]
      g.curva([t, posDe(c.id)], g.color('--ink'), 1.2)
      // superficie de apoyo (mesa o plano inclinado) si la cuerda no cuelga en vertical
      if (Math.abs(dd[0]) > 0.05) {
        const cp = posDe(c.id)
        // normal hacia arriba de la superficie
        let nu = [-dd[1], dd[0]]
        if (nu[1] < 0) nu = [dd[1], -dd[0]]
        const ini: [number, number] = [t[0] - c.R * nu[0], t[1] - c.R * nu[1]]
        const fin: [number, number] = [cp[0] + 1.5 * dd[0] - c.R * nu[0], cp[1] + 1.5 * dd[1] - c.R * nu[1]]
        g.curva([ini, fin], tinta, 1.4)
        const bajo = Math.min(ini[1], fin[1]) - 0.08
        g.rellenar([ini, fin, [fin[0], bajo], [ini[0], bajo]], tinta, 0.1)
      }
    }
    // arco de la cuerda por encima de la polea
    g.curva(
      Array.from({ length: 13 }, (_, k) => {
        const f = Math.PI * (k / 12)
        return [p.x + p.R * Math.cos(f), p.y + p.R * Math.sin(f)] as [number, number]
      }),
      g.color('--ink'),
      1.2,
    )
  }
  // varillas y muelles
  for (const c of mt.cuerpos) {
    const b = posDe(c.id)
    if (c.lig.tipo === 'varilla') g.curva([posDe(c.padre), b], g.color('--ink'), 2)
    if (c.lig.tipo === 'muelle') zigzag(g, posDe(c.padre), b, g.color('--ink'))
  }
  for (const r of mt.resortes) zigzag(g, posDe(r.a), posDe(r.b), g.color(opts.sel === r.id ? '--accent' : '--ink'))
  // cuerpos
  const n = d.gen.coords.length
  for (const c of mt.cuerpos) {
    const i = idx.get(c.id)!
    const [x, yy] = d.pos[i](y)
    const col = g.color(colorCuerpo(mt, c.id))
    const R = Math.max(c.R, 5 / g.escalaX)
    const grosor = opts.sel === c.id ? 3 : 1.4
    if (c.forma === 'caja') {
      // alineada con su raíl o con la cuerda
      const lp = c.lig.tipo === 'polea' ? c.lig : null
      const poleaC = lp ? mt.poleas.find((q) => q.id === lp.polea) : undefined
      const ang =
        c.lig.tipo === 'rail' || (c.lig.tipo === 'muelle' && c.lig.eje)
          ? ((c.lig.ang ?? 0) * Math.PI) / 180
          : poleaC && lp
            ? ((lp.lado === 'izq' ? poleaC.izq.ang : poleaC.der.ang) * Math.PI) / 180
            : 0
      const cs = Math.cos(ang)
      const sn = Math.sin(ang)
      const base = c.lig.tipo === 'rail' ? R : 0
      const pts = (
        [
          [-R, -R],
          [R, -R],
          [R, R],
          [-R, R],
          [-R, -R],
        ] as Array<[number, number]>
      ).map(([u, v]) => [x + u * cs - (v + base) * sn, yy + u * sn + (v + base) * cs] as [number, number])
      g.rellenar(pts, col, 0.8)
      g.curva(pts, col, grosor)
    } else {
      g.rellenar(circ(x, yy, R), col, c.forma === 'aro' ? 0.15 : 0.8)
      g.curva(circ(x, yy, R), col, c.forma === 'aro' ? 3 : grosor)
      if (c.lig.tipo === 'rail' && c.lig.rueda) {
        // radio pintado para ver que gira: φ = −s/R
        const s = y[d.gen.coords.indexOf(d.gen.coordDe[c.id][0])]
        const a0 = ((c.lig.ang * Math.PI) / 180) + Math.PI / 2 - s / c.R
        g.curva(
          [
            [x - R * Math.cos(a0), yy - R * Math.sin(a0)],
            [x + R * Math.cos(a0), yy + R * Math.sin(a0)],
          ],
          g.color('--ink'),
          1.5,
        )
      }
    }
    if (opts.rotulos && g.mostrarNombres) g.texto(c.nombre, x, yy, tinta, { dx: R * g.escalaX + 5, dy: -R * g.escalaX - 4 })
    if (opts.velocidades) {
      // ṙ = J q̇ por diferencias centrales
      const h = 1e-5
      const ya = [...y]
      const yb = [...y]
      for (let k = 0; k < n; k++) {
        ya[k] = y[k] + h * y[n + k]
        yb[k] = y[k] - h * y[n + k]
      }
      const pa = d.pos[i](ya)
      const pb = d.pos[i](yb)
      const vx = (pa[0] - pb[0]) / (2 * h)
      const vy = (pa[1] - pb[1]) / (2 * h)
      if (Math.hypot(vx, vy) > 1e-3) g.flecha(x, yy, vx * K_V, vy * K_V, g.color('--pos'), 1.8, 7)
    }
  }
}

/** Metros de flecha por m/s. */
export const K_V = 0.15

/* ---------------------------------------------------------------- asas (montaje en t = 0) */

export function asasMontaje(st: EstadoMontaje): Asa[] {
  const mt = st.montaje
  const g = generado(mt)
  const out: Asa[] = mt.soportes.map((s) => ({ id: `S:${s.id}`, p: [s.x, s.y], color: '--ink-soft' }))
  for (const p of mt.poleas) out.push({ id: `P:${p.id}`, p: [p.x, p.y], color: '--ink-soft' })
  if ('error' in g) return out
  const d = dibujoDe(g)
  const y0 = y0De(g)
  const n = g.coords.length
  mt.cuerpos.forEach((c, i) => {
    const p = d.pos[i](y0)
    out.push({ id: `C:${c.id}`, p, color: colorCuerpo(mt, c.id) })
    // punta de la flecha de la velocidad inicial (una coordenada)
    const qs = g.coordDe[c.id] ?? []
    if (qs.length === 1 || c.lig.tipo === 'libre') {
      const h = 1e-5
      const ya = [...y0]
      const yb = [...y0]
      for (let k = 0; k < n; k++) {
        ya[k] = y0[k] + h * y0[n + k]
        yb[k] = y0[k] - h * y0[n + k]
      }
      const pa = d.pos[i](ya)
      const pb = d.pos[i](yb)
      const v = [(pa[0] - pb[0]) / (2 * h), (pa[1] - pb[1]) / (2 * h)]
      out.push({ id: `V:${c.id}`, p: [p[0] + K_V * v[0], p[1] + K_V * v[1]], color: '--pos' })
    }
  })
  return out
}

/** Dirección en la que se mueve el cuerpo i al aumentar la coordenada q (∂r/∂q). */
function jacobiana(d: Dibujo, i: number, y: number[], k: number): [number, number] {
  const h = 1e-6
  const ya = [...y]
  const yb = [...y]
  ya[k] += h
  yb[k] -= h
  const a = d.pos[i](ya)
  const b = d.pos[i](yb)
  return [(a[0] - b[0]) / (2 * h), (a[1] - b[1]) / (2 * h)]
}

export function moverMontaje(id: string, t: { p: number[]; mayus: boolean }, st: EstadoMontaje): Partial<EstadoMontaje> | void {
  const [que, pid] = id.split(':')
  const mt = st.montaje
  const [px, py] = t.p
  const r2 = (v: number) => Math.round(v * 100) / 100
  if (que === 'S') return { montaje: { ...mt, soportes: mt.soportes.map((s) => (s.id === pid ? { ...s, x: r2(px), y: r2(py) } : s)) }, selPieza: pid }
  if (que === 'P') return { montaje: { ...mt, poleas: mt.poleas.map((p) => (p.id === pid ? { ...p, x: r2(px), y: r2(py) } : p)) }, selPieza: pid }
  const g = generado(mt)
  if ('error' in g) return
  const d = dibujoDe(g)
  const i = mt.cuerpos.findIndex((c) => c.id === pid)
  const c = mt.cuerpos[i]
  if (!c) return
  const y0 = y0De(g)
  const n = g.coords.length
  const padre = (() => {
    if (c.padre === null) return [0, 0]
    const s = mt.soportes.find((x) => x.id === c.padre)
    if (s) return [s.x, s.y]
    const j = mt.cuerpos.findIndex((x) => x.id === c.padre)
    return j >= 0 ? d.pos[j](y0) : [0, 0]
  })()
  const lig = c.lig
  if (que === 'C') {
    const dx = px - padre[0]
    const dy = py - padre[1]
    let nueva: Ligadura = lig
    switch (lig.tipo) {
      case 'varilla': {
        const q0 = Math.round((Math.atan2(dx, -dy) * 180) / Math.PI)
        nueva = t.mayus ? { ...lig, q0, l: r2(Math.max(0.1, Math.hypot(dx, dy))) } : { ...lig, q0 }
        break
      }
      case 'rail': {
        const a = (lig.ang * Math.PI) / 180
        nueva = { ...lig, q0: r2(dx * Math.cos(a) + dy * Math.sin(a)) }
        break
      }
      case 'muelle':
        if (lig.eje) {
          const a = (lig.ang * Math.PI) / 180
          nueva = { ...lig, r0: r2(Math.max(0.05, dx * Math.cos(a) + dy * Math.sin(a))) }
        } else nueva = { ...lig, r0: r2(Math.max(0.05, Math.hypot(dx, dy))), th0: Math.round((Math.atan2(dx, -dy) * 180) / Math.PI) }
        break
      case 'libre':
        nueva = { ...lig, x0: r2(px), y0: r2(py) }
        break
      case 'polea': {
        // se mueve la cuerda: la proyección sobre la dirección de su lado
        const p = mt.poleas.find((x) => x.id === lig.polea)
        if (!p) return
        const k = g.coords.indexOf(g.coordDe[p.id][0])
        const J = jacobiana(d, i, y0, k)
        const actual = d.pos[i](y0)
        const ds = ((px - actual[0]) * J[0] + (py - actual[1]) * J[1]) / (J[0] ** 2 + J[1] ** 2 || 1)
        return { montaje: { ...mt, poleas: mt.poleas.map((x) => (x.id === p.id ? { ...x, s0: r2(x.s0 + ds) } : x)) }, selPieza: pid }
      }
    }
    return { montaje: { ...mt, cuerpos: mt.cuerpos.map((x) => (x.id === pid ? { ...x, lig: nueva } : x)) }, selPieza: pid }
  }
  if (que === 'V') {
    const p = d.pos[i](y0)
    const w = [(px - p[0]) / K_V, (py - p[1]) / K_V]
    if (lig.tipo === 'libre') return { montaje: cambiarLig(mt, pid, { vx0: r2(w[0]), vy0: r2(w[1]) }), selPieza: pid }
    const q = g.coordDe[c.id]?.[0]
    if (!q) return
    const k = g.coords.indexOf(q)
    const J = jacobiana(d, i, y0, k)
    const qd = r2((w[0] * J[0] + w[1] * J[1]) / (J[0] ** 2 + J[1] ** 2 || 1))
    if (lig.tipo === 'varilla' || lig.tipo === 'rail') return { montaje: cambiarLig(mt, pid, { v0: qd }), selPieza: pid }
    if (lig.tipo === 'muelle') return { montaje: cambiarLig(mt, pid, { vr0: qd }), selPieza: pid }
    if (lig.tipo === 'polea') return { montaje: { ...mt, poleas: mt.poleas.map((x) => (x.id === lig.polea ? { ...x, v0: qd } : x)) }, selPieza: pid }
  }
  void n
}

/* ---------------------------------------------------------------- editor (barra al pie del lienzo) */

export const ED_MONTAJE: EstadoEditor = { ...EDITOR_INICIAL, modo: 'construir', categoria: 'cuerpos', paso: 0.1 }
export const edDe = (st: EstadoMontaje): EstadoEditor => st.ed ?? ED_MONTAJE

const PATAS = 'M6 8h20M9 8l-3-4M14 8l-3-4M19 8l-3-4M24 8l-3-4'

export const CATALOGO_BARRA: Categoria[] = [
  {
    id: 'cuerpos',
    nombre: 'Cuerpos',
    objetos: [
      { id: 'pendulo', nombre: 'Péndulo', icono: PATAS + 'M16 8l6 14' + circIcono(22, 24, 3), color: '--accent' },
      { id: 'carro', nombre: 'Carro', icono: 'M3 24h26' + caja(10, 15, 12, 7), color: '--pos' },
      { id: 'plano', nombre: 'Plano incl.', icono: 'M4 26L28 12' + 'M12 16l4 7 6-3.5-4-7z', color: '--morado' },
      { id: 'rueda', nombre: 'Rueda', icono: 'M4 26L28 14' + circIcono(14, 16, 5), color: '--aux' },
      { id: 'libre', nombre: 'Masa libre', icono: circIcono(16, 16, 5) + 'M20 12l5-5', color: '--rosa' },
    ],
  },
  {
    id: 'muelles',
    nombre: 'Muelles',
    objetos: [
      { id: 'muelleV', nombre: 'Colgado', icono: PATAS + 'M16 8l-3 2 6 2-6 2 6 2-6 2 3 2' + caja(12, 20, 8, 7), color: '--accent' },
      { id: 'muelleH', nombre: 'Horizontal', icono: 'M4 8v18M4 17l3-3 3 6 3-6 3 6 3-3' + caja(19, 13, 8, 8), color: '--pos' },
      { id: 'elastico', nombre: 'Péndulo elástico', icono: PATAS + 'M16 8l1 3 3-1 0 3 3-1 0 3 3-1' + circIcono(24, 20, 3), color: '--morado' },
      { id: 'resorte', nombre: 'Entre dos', icono: circIcono(6, 16, 3) + 'M9 16l2-3 3 6 3-6 3 6 3-6 2 3' + circIcono(26, 16, 3), color: '--ink' },
    ],
  },
  {
    id: 'apoyos',
    nombre: 'Apoyos y poleas',
    objetos: [
      { id: 'soporte', nombre: 'Soporte', icono: PATAS + circIcono(16, 8, 1.5) },
      { id: 'atwood', nombre: 'Atwood', icono: circIcono(16, 8, 4) + 'M12 8v12M20 8v8' + caja(9, 20, 6, 6) + caja(17, 16, 6, 6) },
      { id: 'mesa', nombre: 'Polea y mesa', icono: 'M2 14h20' + circIcono(24, 12, 3) + caja(8, 8, 7, 6) + 'M15 11h9M27 12v10' + caja(24, 22, 6, 5) },
    ],
  },
]

/** Posiciones en t = 0 de soportes y cuerpos (para colgar lo nuevo de lo más cercano). */
function anclas(mt: Montaje): Array<{ id: string; p: [number, number]; cuerpo: boolean }> {
  const out = mt.soportes.map((s) => ({ id: s.id, p: [s.x, s.y] as [number, number], cuerpo: false }))
  const g = generado(mt)
  if (!('error' in g)) {
    const d = dibujoDe(g)
    const y0 = y0De(g)
    mt.cuerpos.forEach((c, i) => out.push({ id: c.id, p: d.pos[i](y0), cuerpo: true }))
  }
  return out
}

const r2 = (v: number) => Math.round(v * 100) / 100

/** Añade la pieza del pincel donde se hace clic: lo que cuelga, del soporte o cuerpo más cercano. */
export function colocarMontaje(st: EstadoMontaje, tipo: string, x: number, y: number): Partial<EstadoMontaje> {
  const k = pasoRejilla(edDe(st))
  x = Math.round(x / k) * k
  y = Math.round(y / k) * k
  const mt0 = st.montaje
  const cerca = anclas(mt0)
    .map((a) => ({ ...a, d: Math.hypot(a.p[0] - x, a.p[1] - y) }))
    .sort((a, b) => a.d - b.d)
  // de qué cuelga: lo más cercano (péndulos y muelles); los raíles, solo si se hace clic encima
  const cuelga = ['pendulo', 'muelleV', 'elastico'].includes(tipo)
  const encima = cerca.find((a) => a.d < 0.3)
  const sel = tipo === 'resorte' ? (cerca.find((a) => a.cuerpo)?.id ?? null) : cuelga ? (cerca[0]?.id ?? null) : (encima?.id ?? null)
  const antes = new Set([...mt0.soportes, ...mt0.cuerpos, ...mt0.poleas, ...mt0.resortes].map((o) => o.id))
  const parche = anadir({ ...st, selPieza: sel }, tipo as Parameters<typeof anadir>[1])
  if (!parche.montaje) return {}
  let mt = parche.montaje
  const nuevo = <T extends { id: string }>(xs: T[]) => xs.find((o) => !antes.has(o.id))
  const sop = nuevo(mt.soportes)
  const pol = nuevo(mt.poleas)
  const cue = nuevo(mt.cuerpos)
  // un soporte nuevo (el del raíl o el suelto) va donde se ha hecho clic
  if (sop) mt = { ...mt, soportes: mt.soportes.map((s) => (s.id === sop.id ? { ...s, x: r2(x), y: r2(y) } : s)) }
  if (pol) mt = { ...mt, poleas: mt.poleas.map((p) => (p.id === pol.id ? { ...p, x: r2(x), y: r2(y) } : p)) }
  if (cue && cuelga) {
    const padre = cerca.find((a) => a.id === cue.padre)
    const [px, py] = padre?.p ?? [0, 0]
    const dx = x - px
    const dy = y - py
    const L = Math.max(0.2, r2(Math.hypot(dx, dy)))
    const th = Math.round((Math.atan2(dx, -dy) * 180) / Math.PI)
    const lig = cue.lig
    const nueva: Ligadura =
      lig.tipo === 'varilla' ? { ...lig, l: L, q0: th } : lig.tipo === 'muelle' && lig.eje ? { ...lig, r0: L, l0: r2(L * 0.8) } : lig.tipo === 'muelle' ? { ...lig, r0: L, l0: r2(L * 0.8), th0: th } : lig
    mt = cambiarLig(mt, cue.id, nueva)
  }
  if (cue && cue.lig.tipo === 'libre') mt = cambiarLig(mt, cue.id, { x0: r2(x), y0: r2(y) })
  return { ...parche, montaje: mt }
}

/** Los valores de la pieza seleccionada como campos de la barra. */
export function camposMontaje(st: EstadoMontaje, set: (p: Partial<EstadoMontaje>) => void): Seleccion | null {
  const mt = st.montaje
  const id = st.selPieza
  if (!id) return null
  const pon = (m: Montaje) => set({ montaje: m })
  const comun = { quitar: () => set(quitarPieza(st, id)), soltar: () => set({ selPieza: null }), paso: pasoRejilla(edDe(st)) }
  const s = mt.soportes.find((q) => q.id === id)
  if (s) {
    const cambia = (p: Partial<Soporte>) => pon({ ...mt, soportes: mt.soportes.map((q) => (q.id === s.id ? { ...q, ...p } : q)) })
    return {
      nombre: `Soporte ${s.id}`,
      color: '--ink-soft',
      campos: [
        { etiqueta: 'x', valor: s.x, paso: 0.05, unidad: 'm', onChange: (x) => cambia({ x }) },
        { etiqueta: 'y', valor: s.y, paso: 0.05, unidad: 'm', onChange: (y) => cambia({ y }) },
      ],
      mover: (dx, dy) => cambia({ x: r2(s.x + dx), y: r2(s.y + dy) }),
      ...comun,
    }
  }
  const p = mt.poleas.find((q) => q.id === id)
  if (p) {
    const cambia = (x: Partial<Polea>) => pon({ ...mt, poleas: mt.poleas.map((q) => (q.id === p.id ? { ...q, ...x } : q)) })
    return {
      nombre: `Polea ${p.id}`,
      color: '--ink-soft',
      campos: [
        { etiqueta: 'Masa de la polea M', valor: p.M, paso: 0.1, min: 0, unidad: 'kg', onChange: (M) => cambia({ M }) },
        { etiqueta: 'Radio', valor: p.R, paso: 0.01, min: 0.05, unidad: 'm', onChange: (R) => cambia({ R }) },
        { etiqueta: 'Cuerda izq.: dirección', valor: p.izq.ang, paso: 5, min: 90, max: 270, unidad: '°', onChange: (ang) => cambia({ izq: { ...p.izq, ang } }) },
        { etiqueta: 'Cuerda izq.: largo', valor: p.izq.d0, paso: 0.05, min: 0.1, unidad: 'm', onChange: (d0) => cambia({ izq: { ...p.izq, d0 } }) },
        { etiqueta: 'Cuerda der.: dirección', valor: p.der.ang, paso: 5, min: -90, max: 90, unidad: '°', onChange: (ang) => cambia({ der: { ...p.der, ang } }) },
        { etiqueta: 'Cuerda der.: largo', valor: p.der.d0, paso: 0.05, min: 0.1, unidad: 'm', onChange: (d0) => cambia({ der: { ...p.der, d0 } }) },
        { etiqueta: 'Velocidad inicial', valor: p.v0, paso: 0.1, unidad: 'm/s', onChange: (v0) => cambia({ v0 }) },
      ],
      mover: (dx, dy) => cambia({ x: r2(p.x + dx), y: r2(p.y + dy) }),
      ...comun,
    }
  }
  const r = mt.resortes.find((q) => q.id === id)
  if (r) {
    const cambia = (x: Partial<Resorte>) => pon({ ...mt, resortes: mt.resortes.map((q) => (q.id === r.id ? { ...q, ...x } : q)) })
    const extremos = [...mt.soportes.map((q) => ({ v: q.id, t: `soporte ${q.id}` })), ...mt.cuerpos.map((c) => ({ v: c.id, t: c.nombre }))]
    return {
      nombre: `Muelle ${r.id}`,
      color: '--ink',
      campos: [
        { tipo: 'opciones', etiqueta: 'De', valor: r.a, opciones: extremos, onChange: (a) => cambia({ a }) },
        { tipo: 'opciones', etiqueta: 'A', valor: r.b, opciones: extremos, onChange: (b) => cambia({ b }) },
        { etiqueta: 'Constante k', valor: r.k, paso: 1, min: 0.1, unidad: 'N/m', onChange: (k) => cambia({ k }) },
        { etiqueta: 'Longitud natural l₀', valor: r.l0, paso: 0.05, min: 0.05, unidad: 'm', onChange: (l0) => cambia({ l0 }) },
      ],
      ...comun,
    }
  }
  const c = mt.cuerpos.find((q) => q.id === id)
  if (!c) return null
  const lig = c.lig
  const cuerpo = (f: (x: Cuerpo) => Cuerpo) => pon(cambiarCuerpo(mt, c.id, f))
  const ligar = (x: Partial<Ligadura>) => pon(cambiarLig(mt, c.id, x))
  const padres = [
    { v: '', t: 'el origen' },
    ...mt.soportes.map((q) => ({ v: q.id, t: `soporte ${q.id}` })),
    ...mt.cuerpos.filter((x) => x.id !== c.id && !desciende(mt, x.id, c.id)).map((x) => ({ v: x.id, t: x.nombre })),
  ]
  const nuevas: Record<string, Ligadura> = {
    varilla: { tipo: 'varilla', l: 1, q0: 30, v0: 0 },
    rail: { tipo: 'rail', ang: 0, q0: 0, v0: 0, rueda: c.forma !== 'caja' },
    muelle: { tipo: 'muelle', k: 20, l0: 1, eje: true, ang: -90, r0: 1.2, th0: 0, vr0: 0, vth0: 0 },
    libre: { tipo: 'libre', x0: 0, y0: 1, vx0: 1, vy0: 0 },
  }
  const campos: CampoEditor[] = [
    { tipo: 'opciones', etiqueta: 'Forma', valor: c.forma, opciones: (Object.keys(NOMBRES_FORMA) as Forma[]).map((f) => ({ v: f, t: NOMBRES_FORMA[f] })), onChange: (forma) => cuerpo((x) => ({ ...x, forma: forma as Forma })) },
    { etiqueta: 'Masa m', valor: c.m, paso: 0.1, min: 0.01, unidad: 'kg', onChange: (m) => cuerpo((x) => ({ ...x, m })) },
    { etiqueta: lig.tipo === 'rail' && lig.rueda ? 'Radio R' : 'Tamaño', valor: c.R, paso: 0.01, min: 0.03, unidad: 'm', onChange: (R) => cuerpo((x) => ({ ...x, R })) },
  ]
  if (lig.tipo !== 'polea') {
    campos.push({ tipo: 'opciones', etiqueta: 'Cómo se mueve', valor: lig.tipo, opciones: [{ v: 'varilla', t: 'varilla (θ)' }, { v: 'rail', t: 'raíl (s)' }, { v: 'muelle', t: 'muelle' }, { v: 'libre', t: 'libre (x, y)' }], onChange: (t) => cuerpo((x) => ({ ...x, lig: nuevas[t] })) })
    if (lig.tipo !== 'libre') campos.push({ tipo: 'opciones', etiqueta: 'Cuelga de', valor: c.padre ?? '', opciones: padres, onChange: (v) => cuerpo((x) => ({ ...x, padre: v || null })) })
  }
  if (lig.tipo === 'varilla')
    campos.push(
      { etiqueta: 'Longitud l', valor: lig.l, paso: 0.05, min: 0.05, unidad: 'm', onChange: (l) => ligar({ l }) },
      { etiqueta: 'θ₀ (desde abajo)', valor: lig.q0, paso: 5, min: -180, max: 180, unidad: '°', onChange: (q0) => ligar({ q0 }) },
      { etiqueta: 'θ̇₀', valor: lig.v0, paso: 0.1, unidad: 'rad/s', onChange: (v0) => ligar({ v0 }) },
    )
  if (lig.tipo === 'rail')
    campos.push(
      { etiqueta: 'Inclinación', valor: lig.ang, paso: 5, min: -89, max: 89, unidad: '°', onChange: (ang) => ligar({ ang }) },
      { etiqueta: 's₀', valor: lig.q0, paso: 0.05, unidad: 'm', onChange: (q0) => ligar({ q0 }) },
      { etiqueta: 'ṡ₀', valor: lig.v0, paso: 0.1, unidad: 'm/s', onChange: (v0) => ligar({ v0 }) },
      { tipo: 'si-no', etiqueta: 'Rueda sin deslizar', valor: lig.rueda, onChange: (rueda) => cuerpo((x) => ({ ...x, forma: rueda && x.forma === 'caja' ? 'disco' : x.forma, lig: { ...lig, rueda } })) },
    )
  if (lig.tipo === 'muelle') {
    campos.push(
      { etiqueta: 'Constante k', valor: lig.k, paso: 1, min: 0.1, unidad: 'N/m', onChange: (k) => ligar({ k }) },
      { etiqueta: 'Longitud natural l₀', valor: lig.l0, paso: 0.05, min: 0.05, unidad: 'm', onChange: (l0) => ligar({ l0 }) },
      { etiqueta: 'r₀ (largo inicial)', valor: lig.r0, paso: 0.05, min: 0.05, unidad: 'm', onChange: (r0) => ligar({ r0 }) },
      { etiqueta: 'ṙ₀', valor: lig.vr0, paso: 0.1, unidad: 'm/s', onChange: (vr0) => ligar({ vr0 }) },
      { tipo: 'si-no', etiqueta: 'También oscila de lado', valor: !lig.eje, onChange: (v) => ligar({ eje: !v }) },
    )
    if (lig.eje) campos.push({ etiqueta: 'Dirección', valor: lig.ang, paso: 5, min: -180, max: 180, unidad: '°', onChange: (ang) => ligar({ ang }) })
    else
      campos.push(
        { etiqueta: 'θ₀', valor: lig.th0, paso: 5, min: -180, max: 180, unidad: '°', onChange: (th0) => ligar({ th0 }) },
        { etiqueta: 'θ̇₀', valor: lig.vth0, paso: 0.1, unidad: 'rad/s', onChange: (vth0) => ligar({ vth0 }) },
      )
  }
  if (lig.tipo === 'libre')
    campos.push(
      { etiqueta: 'x₀', valor: lig.x0, paso: 0.05, unidad: 'm', onChange: (x0) => ligar({ x0 }) },
      { etiqueta: 'y₀', valor: lig.y0, paso: 0.05, unidad: 'm', onChange: (y0) => ligar({ y0 }) },
      { etiqueta: 'ẋ₀', valor: lig.vx0, paso: 0.1, unidad: 'm/s', onChange: (vx0) => ligar({ vx0 }) },
      { etiqueta: 'ẏ₀', valor: lig.vy0, paso: 0.1, unidad: 'm/s', onChange: (vy0) => ligar({ vy0 }) },
    )
  // voltear: la imagen especular respecto a la vertical que pasa por el padre
  const voltear =
    lig.tipo === 'varilla'
      ? () => ligar({ q0: -lig.q0, v0: -lig.v0 })
      : lig.tipo === 'rail'
        ? () => ligar({ ang: -lig.ang, q0: -lig.q0, v0: -lig.v0 })
        : lig.tipo === 'muelle'
          ? () => ligar(lig.eje ? { ang: lig.ang >= 0 ? 180 - lig.ang : -180 - lig.ang } : { th0: -lig.th0, vth0: -lig.vth0 })
          : lig.tipo === 'libre'
            ? () => ligar({ x0: -lig.x0, vx0: -lig.vx0 })
            : undefined
  return {
    nombre: `${NOMBRES_FORMA[c.forma]} ${c.nombre}`,
    color: colorCuerpo(mt, c.id),
    campos,
    mover: lig.tipo === 'libre' ? (dx, dy) => ligar({ x0: r2(lig.x0 + dx), y0: r2(lig.y0 + dy) }) : undefined,
    voltear,
    ...comun,
  }
}

/** La barra del editor para el modo Construir. */
export function BarraMontaje({ st, set, extra }: { st: EstadoMontaje; set: (p: Partial<EstadoMontaje>) => void; extra?: ReactNode }) {
  const ed = edDe(st)
  return <BarraEditor ed={ed} set={(p) => set({ ed: { ...ed, ...p } })} categorias={CATALOGO_BARRA} seleccion={ed.modo === 'editar' ? camposMontaje(st, set) : null} extra={extra} />
}
