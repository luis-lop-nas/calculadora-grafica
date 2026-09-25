import { useEffect, useRef } from 'react'
import { definir, type Asa, type Capa, type EntradaMenu, type PropsPanel } from '../../nucleo/tipos'
import { accion, casilla, radios, submenu } from '../../nucleo/menu'
import { Atajos, Boton, Eleccion, Grupo, Interruptor, Muestra, Rango, Resultado, Segmentado } from '../../nucleo/controles'
import { animacion } from '../../nucleo/vista'
import type { Pintor2D } from '../../render/pintor2d'
import { graficasTiempo, type PanelTiempo } from '../../render/graficas'
import {
  aceleracionMrua,
  energias,
  estadoEnT,
  simular,
  superficieBajo,
  tramosDe,
  type Aire,
  type Escena,
  type Movil,
  type Movimiento,
  type Pieza,
  type Simulacion,
  type TipoMovil,
  type TipoPieza,
} from '../../lib/escenario'

type Vista = 'escena' | 'graficas' | 'tabla'

export interface EstadoCinematica extends Escena {
  sel: string | null
  vista: Vista
  jugando: boolean
  /** Instante mostrado cuando está en pausa. */
  tPausa: number
  velocidad: number
  verV: boolean
  verA: boolean
  verTrayectoria: boolean
  verSucesos: boolean
  verCotas: boolean
  dtTabla: number
  /** Contador para los ids nuevos. */
  sig: number
  /** Objetos apagados: ni se dibujan ni cuentan en la simulación. */
  ocultos: string[]
}

type S = EstadoCinematica

/* ---------------------------------------------------------------- catálogo */

const NOMBRE_PIEZA: Record<TipoPieza, string> = {
  edificio: 'Edificio',
  muro: 'Muro',
  rampa: 'Rampa',
  plataforma: 'Plataforma',
  arbol: 'Árbol',
  farola: 'Farola',
  suelo: 'Suelo',
}

const NOMBRE_MOVIL: Record<TipoMovil, string> = {
  pelota: 'Pelota',
  piedra: 'Piedra',
  coche: 'Coche',
  bloque: 'Bloque',
  disco: 'Disco',
}

const NOMBRE_MOV: Record<Movimiento, string> = {
  libre: 'Libre (gravedad, choques)',
  mru: 'MRU',
  mrua: 'MRUA',
  mcu: 'MCU / MCUA',
}

export const MATERIALES: Array<{ t: string; muE: number; muD: number }> = [
  { t: 'asfalto', muE: 0.8, muD: 0.7 },
  { t: 'hierba', muE: 0.5, muD: 0.35 },
  { t: 'arena', muE: 0.7, muD: 0.6 },
  { t: 'madera', muE: 0.4, muD: 0.3 },
  { t: 'hielo', muE: 0.05, muD: 0.03 },
]

const COLOR_MOVIL: Record<TipoMovil, string> = {
  pelota: '--accent',
  piedra: '--ink-soft',
  coche: '--pos',
  bloque: '--morado',
  disco: '--rosa',
}

const COLOR_MATERIAL: Record<string, string> = {
  asfalto: '--ink-soft',
  hierba: '--aux',
  arena: '--ocre',
  madera: '--ocre',
  hielo: '--neg',
}

const colorPieza = (p: Pieza) =>
  p.tipo === 'suelo' ? COLOR_MATERIAL[p.material ?? ''] ?? '--ink-soft' : p.tipo === 'arbol' ? '--aux' : p.tipo === 'farola' ? '--ocre' : p.tipo === 'rampa' ? '--ocre' : '--ink-soft'

/** Una pieza nueva con valores típicos, colocada a la derecha de lo que ya hay. */
export function piezaNueva(tipo: TipoPieza, s: S, material?: string): Pieza {
  const id = `p${s.sig}`
  const derecha = s.piezas.reduce((m, p) => Math.max(m, p.x + p.ancho), -2)
  const x = s.piezas.length ? derecha + 3 : 0
  const base = { id, tipo, x, muE: 0.5, muD: 0.4 }
  switch (tipo) {
    case 'edificio':
      return { ...base, ancho: 8, alto: 20 }
    case 'muro':
      return { ...base, ancho: 0.4, alto: 3 }
    case 'rampa':
      return { ...base, ancho: 8, alto: +(8 * Math.tan(Math.PI / 6)).toFixed(2), muE: 0.3, muD: 0.2, derecha: true }
    case 'plataforma':
      return { ...base, ancho: 5, alto: 6 }
    case 'arbol':
      return { ...base, ancho: 3, alto: 6, solido: false }
    case 'farola':
      return { ...base, ancho: 1, alto: 5, solido: false }
    case 'suelo': {
      const m = MATERIALES.find((q) => q.t === material) ?? MATERIALES[4]
      return { ...base, ancho: 10, alto: 0, muE: m.muE, muD: m.muD, material: m.t }
    }
  }
}

/** Un móvil nuevo con un problema típico para su tipo. */
export function movilNuevo(tipo: TipoMovil, s: S, mov?: Movimiento): Movil {
  const id = `m${s.sig}`
  const n = s.moviles.filter((m) => m.tipo === tipo).length + 1
  const nombre = `${NOMBRE_MOVIL[tipo]}${n > 1 ? ' ' + n : ''}`
  const base: Movil = { id, tipo, nombre, m: 1, r: 0.3, movimiento: 'libre', x0: 0, y0: 0.3, v0: 0, ang: 0, a: 0, parar: true, rozar: false, R: 3, w0: 1, alfa: 0, fase: 0 }
  const tramos = tramosDe(s)
  const alto = [...s.piezas].filter((p) => p.tipo === 'edificio').sort((a, b) => b.alto - a.alto)[0]
  const rampa = s.piezas.find((p) => p.tipo === 'rampa')
  let m: Movil
  switch (tipo) {
    case 'pelota':
      // desde la azotea más alta, en el borde: lista para un tiro horizontal
      m = alto
        ? { ...base, r: 0.25, m: 0.45, x0: alto.x + alto.ancho + 0.3, y0: alto.alto + 0.25, v0: 8, ang: 0 }
        : { ...base, r: 0.25, m: 0.45, x0: 0, y0: 10, v0: 0 }
      break
    case 'piedra':
      m = alto ? { ...base, r: 0.2, m: 0.5, x0: alto.x + alto.ancho + 0.25, y0: alto.alto + 0.2 } : { ...base, r: 0.2, m: 0.5, x0: 2, y0: 15 }
      break
    case 'coche':
      m = { ...base, r: 0.8, m: 1200, movimiento: 'mrua', x0: -10, y0: 0.8, v0: 20, a: -4 }
      break
    case 'bloque':
      if (rampa) {
        const alta = rampa.derecha !== false ? rampa.x + rampa.ancho - 0.6 : rampa.x + 0.6
        m = { ...base, r: 0.3, m: 2, x0: alta, y0: superficieBajo(tramos, alta) + 0.3 }
      } else m = { ...base, r: 0.3, m: 2, x0: 0, y0: 0.3, v0: 6 }
      break
    case 'disco':
      m = { ...base, r: 0.25, movimiento: 'mcu', x0: 0, y0: 6, R: 3, w0: 1.5 }
      break
  }
  if (mov && mov !== m.movimiento) {
    m.movimiento = mov
    if (mov === 'mcu') Object.assign(m, { y0: Math.max(m.y0, 5), R: 3, w0: 1.5 })
    if (mov === 'mru' || mov === 'mrua') Object.assign(m, { v0: m.v0 || 5, a: mov === 'mrua' ? m.a || 1 : 0 })
  }
  return m
}

/* ---------------------------------------------------------------- ejemplos */

const P = (p: Partial<Pieza> & { id: string; tipo: TipoPieza }): Pieza => ({ x: 0, ancho: 8, alto: 20, muE: 0.5, muD: 0.4, ...p })
const M = (m: Partial<Movil> & { id: string; tipo: TipoMovil; nombre: string }): Movil => ({
  m: 1,
  r: 0.25,
  movimiento: 'libre',
  x0: 0,
  y0: 0.25,
  v0: 0,
  ang: 0,
  a: 0,
  parar: true,
  rozar: false,
  R: 3,
  w0: 1,
  alfa: 0,
  fase: 0,
  ...m,
})

const MUNDO: Omit<Escena, 'piezas' | 'moviles'> = { g: 9.8, aire: 'no', kAire: 0.02, e: 0.6, muE: 0.5, muD: 0.4, tMax: 8 }

export const EJEMPLOS: Array<{ t: string; e: Partial<S> }> = [
  {
    t: 'Caída libre desde un edificio',
    e: { ...MUNDO, e: 0, tMax: 4, piezas: [P({ id: 'p1', tipo: 'edificio', x: -8, alto: 45 })], moviles: [M({ id: 'm1', tipo: 'piedra', nombre: 'Piedra', r: 0.2, x0: 0.2, y0: 45.2 })] },
  },
  {
    t: 'Tiro horizontal desde una azotea',
    e: {
      ...MUNDO,
      e: 0.3,
      tMax: 5,
      piezas: [P({ id: 'p1', tipo: 'edificio', x: -8, alto: 30 }), P({ id: 'p2', tipo: 'arbol', x: 18, ancho: 3, alto: 6, solido: false })],
      moviles: [M({ id: 'm1', tipo: 'pelota', nombre: 'Pelota', m: 0.45, x0: 0.25, y0: 30.25, v0: 12 })],
    },
  },
  {
    t: 'Tiro parabólico entre dos edificios',
    e: {
      ...MUNDO,
      e: 0.2,
      tMax: 5,
      piezas: [P({ id: 'p1', tipo: 'edificio', x: -8, alto: 18 }), P({ id: 'p2', tipo: 'edificio', x: 22, ancho: 10, alto: 12 }), P({ id: 'p3', tipo: 'farola', x: 10, ancho: 1, alto: 5, solido: false })],
      moviles: [M({ id: 'm1', tipo: 'pelota', nombre: 'Pelota', m: 0.45, x0: -1, y0: 18.25, v0: 15, ang: 35 })],
    },
  },
  {
    t: 'Coche que frena (MRUA)',
    e: {
      ...MUNDO,
      tMax: 7,
      piezas: [P({ id: 'p1', tipo: 'farola', x: 20, ancho: 1, alto: 5, solido: false }), P({ id: 'p2', tipo: 'arbol', x: 45, ancho: 3, alto: 6, solido: false })],
      moviles: [M({ id: 'm1', tipo: 'coche', nombre: 'Coche', m: 1200, r: 0.8, movimiento: 'mrua', x0: 0, y0: 0.8, v0: 25, a: -5 })],
    },
  },
  {
    t: 'Encuentro de dos coches (MRU)',
    e: {
      ...MUNDO,
      tMax: 8,
      piezas: [P({ id: 'p1', tipo: 'edificio', x: -12, ancho: 8, alto: 10 }), P({ id: 'p2', tipo: 'edificio', x: 104, ancho: 8, alto: 14 })],
      moviles: [
        M({ id: 'm1', tipo: 'coche', nombre: 'Coche A', m: 1000, r: 0.8, movimiento: 'mru', x0: 0, y0: 0.8, v0: 15 }),
        M({ id: 'm2', tipo: 'coche', nombre: 'Coche B', m: 1300, r: 0.8, movimiento: 'mru', x0: 100, y0: 0.8, v0: 10, ang: 180 }),
      ],
    },
  },
  {
    t: 'Persecución: MRU contra MRUA',
    e: {
      ...MUNDO,
      tMax: 10,
      piezas: [],
      moviles: [
        M({ id: 'm1', tipo: 'coche', nombre: 'Moto', m: 200, r: 0.6, movimiento: 'mru', x0: 0, y0: 0.6, v0: 20 }),
        M({ id: 'm2', tipo: 'coche', nombre: 'Policía', m: 1400, r: 0.8, movimiento: 'mrua', x0: -30, y0: 0.8, v0: 0, a: 3, parar: false }),
      ],
    },
  },
  {
    t: 'Noria (MCU)',
    e: {
      ...MUNDO,
      tMax: 12,
      piezas: [P({ id: 'p1', tipo: 'farola', x: -0.5, ancho: 1, alto: 8, solido: false })],
      moviles: [M({ id: 'm1', tipo: 'disco', nombre: 'Cabina', movimiento: 'mcu', x0: 0, y0: 8, R: 6, w0: 0.5, r: 0.4 })],
    },
  },
  {
    t: 'Rueda que acelera (MCUA)',
    e: {
      ...MUNDO,
      tMax: 8,
      piezas: [],
      moviles: [M({ id: 'm1', tipo: 'disco', nombre: 'Punto', movimiento: 'mcu', x0: 0, y0: 4, R: 3, w0: 0, alfa: 0.5 })],
    },
  },
  {
    t: 'Bloque en una rampa con rozamiento',
    e: {
      ...MUNDO,
      e: 0,
      tMax: 6,
      piezas: [P({ id: 'p1', tipo: 'rampa', x: 0, ancho: 12, alto: 6.93, muE: 0.3, muD: 0.2, derecha: false }), P({ id: 'p2', tipo: 'suelo', x: 12, ancho: 30, alto: 0, muE: 0.7, muD: 0.6, material: 'arena' })],
      moviles: [M({ id: 'm1', tipo: 'bloque', nombre: 'Bloque', m: 2, r: 0.3, x0: 0.5, y0: 7.0 })],
    },
  },
  {
    t: 'Pelota que rebota',
    e: { ...MUNDO, e: 0.8, tMax: 8, piezas: [P({ id: 'p1', tipo: 'muro', x: 14, ancho: 0.4, alto: 4 })], moviles: [M({ id: 'm1', tipo: 'pelota', nombre: 'Pelota', m: 0.45, x0: 0, y0: 8, v0: 3, ang: 0 })] },
  },
  {
    t: 'Paracaidista (rozamiento del aire)',
    e: {
      ...MUNDO,
      aire: 'cuadratico',
      kAire: 0.25,
      e: 0,
      tMax: 20,
      piezas: [P({ id: 'p1', tipo: 'edificio', x: -10, ancho: 8, alto: 60 })],
      moviles: [
        M({ id: 'm1', tipo: 'piedra', nombre: 'Con aire', m: 80, r: 0.4, x0: 3, y0: 250 }),
        M({ id: 'm2', tipo: 'pelota', nombre: 'Referencia', m: 80, r: 0.4, x0: 8, y0: 250 }),
      ],
    },
  },
  {
    t: 'Hielo y asfalto: frenada de un bloque',
    e: {
      ...MUNDO,
      tMax: 8,
      piezas: [P({ id: 'p1', tipo: 'suelo', x: 5, ancho: 15, alto: 0, muE: 0.05, muD: 0.03, material: 'hielo' }), P({ id: 'p2', tipo: 'suelo', x: 20, ancho: 30, alto: 0, muE: 0.8, muD: 0.7, material: 'asfalto' })],
      moviles: [M({ id: 'm1', tipo: 'bloque', nombre: 'Bloque', m: 5, r: 0.3, x0: 0, y0: 0.3, v0: 10 })],
    },
  },
]

/* ---------------------------------------------------------------- simulación y reloj */

const activa = (s: S): Escena => ({
  ...s,
  piezas: s.piezas.filter((p) => !s.ocultos.includes(p.id)),
  moviles: s.moviles.filter((m) => !s.ocultos.includes(m.id)),
})

let cache: { clave: string; v: Simulacion } | null = null

export function calcular(s: S): Simulacion {
  const e = activa(s)
  const clave = JSON.stringify([e.g, e.aire, e.kAire, e.e, e.muE, e.muD, e.tMax, e.piezas, e.moviles])
  if (cache?.clave === clave) return cache.v
  const v = simular(e)
  cache = { clave, v }
  return v
}

/** Reloj propio: avanza con el tiempo real (y el menú Animación) y se detiene en `tPausa`. */
const reloj = { t: 0, previo: 0, reinicios: animacion.reinicios }

export function tAhora(s: S): number {
  const sim = calcular(s)
  const ahora = typeof performance !== 'undefined' ? performance.now() : 0
  const dt = reloj.previo ? Math.min(0.1, (ahora - reloj.previo) / 1000) : 0
  reloj.previo = ahora
  if (animacion.reinicios !== reloj.reinicios) {
    reloj.reinicios = animacion.reinicios
    reloj.t = 0
  }
  if (!s.jugando) {
    reloj.t = Math.min(s.tPausa, sim.tFin)
    return reloj.t
  }
  if (!animacion.pausado) reloj.t += dt * animacion.velocidad * s.velocidad
  // al acabar, un segundo quieto y vuelta a empezar
  if (reloj.t > sim.tFin + 1) reloj.t = 0
  return Math.min(reloj.t, sim.tFin)
}

const pausar = (s: S): Partial<S> => ({ jugando: false, tPausa: Math.min(reloj.t, calcular(s).tFin) })
const reproducir = (s: S): Partial<S> => {
  reloj.t = s.tPausa >= calcular(s).tFin ? 0 : s.tPausa
  return { jugando: true }
}
const reiniciar = (): Partial<S> => {
  reloj.t = 0
  return { tPausa: 0 }
}

/* ---------------------------------------------------------------- edición */

const moverPieza = (s: S, id: string, parche: Partial<Pieza>): Partial<S> => ({ piezas: s.piezas.map((p) => (p.id === id ? { ...p, ...parche } : p)), sel: id })
const moverMovil = (s: S, id: string, parche: Partial<Movil>): Partial<S> => ({ moviles: s.moviles.map((m) => (m.id === id ? { ...m, ...parche } : m)), sel: id })
const quitarObjeto = (s: S, id: string): Partial<S> => ({
  piezas: s.piezas.filter((p) => p.id !== id),
  moviles: s.moviles.filter((m) => m.id !== id),
  ocultos: s.ocultos.filter((o) => o !== id),
  sel: s.sel === id ? null : s.sel,
})
const anadirPieza = (s: S, tipo: TipoPieza, material?: string): Partial<S> => {
  const p = piezaNueva(tipo, s, material)
  return { piezas: [...s.piezas, p], sig: s.sig + 1, sel: p.id, ...reiniciar() }
}
const anadirMovil = (s: S, tipo: TipoMovil, mov?: Movimiento): Partial<S> => {
  const m = movilNuevo(tipo, s, mov)
  return { moviles: [...s.moviles, m], sig: s.sig + 1, sel: m.id, ...reiniciar() }
}
const ponerEjemplo = (s: S, e: Partial<S>): Partial<S> => ({ ...e, sel: e.moviles?.[0]?.id ?? null, ocultos: [], sig: s.sig + 10, jugando: true, ...reiniciar() })

/** Escala de las flechas: metros de flecha por m/s (velocidad) y por m/s² (aceleración). */
const K_V = 0.25
const K_A = 0.25

const movilSel = (s: S) => s.moviles.find((m) => m.id === s.sel) ?? s.moviles.find((m) => !s.ocultos.includes(m.id)) ?? null

/* ---------------------------------------------------------------- panel */

function Campo({ etiqueta, valor, min, max, paso, unidad, onChange }: { etiqueta: string; valor: number; min: number; max: number; paso: number; unidad: string; onChange: (v: number) => void }) {
  const dec = paso >= 1 ? 0 : paso >= 0.1 ? 1 : 2
  return <Rango etiqueta={etiqueta} valor={valor} min={min} max={max} paso={paso} formato={(v) => `${v.toFixed(dec)} ${unidad}`} onChange={onChange} />
}

function InspectorPieza({ p, s, set }: { p: Pieza; s: S; set: (x: Partial<S>) => void }) {
  const cambia = (parche: Partial<Pieza>) => set(moverPieza(s, p.id, parche))
  const ang = p.tipo === 'rampa' ? (Math.atan2(p.alto, p.ancho) * 180) / Math.PI : 0
  return (
    <>
      <Campo etiqueta="Posición x" valor={p.x} min={-100} max={300} paso={0.5} unidad="m" onChange={(x) => cambia({ x })} />
      {p.tipo !== 'suelo' && <Campo etiqueta={p.tipo === 'plataforma' ? 'Altura de la losa' : 'Altura'} valor={p.alto} min={0.2} max={p.tipo === 'edificio' ? 300 : 60} paso={0.5} unidad="m" onChange={(alto) => cambia({ alto })} />}
      <Campo etiqueta={p.tipo === 'arbol' ? 'Copa' : 'Ancho'} valor={p.ancho} min={p.tipo === 'muro' ? 0.1 : 0.5} max={200} paso={p.tipo === 'muro' ? 0.1 : 0.5} unidad="m" onChange={(ancho) => cambia({ ancho })} />
      {p.tipo === 'rampa' && (
        <>
          <Campo etiqueta="Inclinación θ" valor={ang} min={2} max={70} paso={1} unidad="°" onChange={(a) => cambia({ alto: +(p.ancho * Math.tan((a * Math.PI) / 180)).toFixed(3) })} />
          <Segmentado valor={p.derecha !== false ? 'd' : 'i'} opciones={[{ v: 'i', t: 'Alta a la izquierda' }, { v: 'd', t: 'Alta a la derecha' }]} onChange={(v) => cambia({ derecha: v === 'd' })} />
        </>
      )}
      {p.tipo === 'suelo' && (
        <Atajos
          opciones={MATERIALES.map((m) => ({ t: m.t, activo: p.material === m.t, onClick: () => cambia({ material: m.t, muE: m.muE, muD: m.muD }) }))}
        />
      )}
      {(p.tipo === 'arbol' || p.tipo === 'farola') && (
        <Interruptor activo={!!p.solido} onChange={(solido) => cambia({ solido })}>
          Se choca con él
        </Interruptor>
      )}
      {(p.tipo === 'edificio' || p.tipo === 'rampa' || p.tipo === 'plataforma' || p.tipo === 'suelo' || p.tipo === 'muro') && (
        <>
          <Campo etiqueta="μ estático" valor={p.muE} min={0} max={1.5} paso={0.01} unidad="" onChange={(muE) => cambia({ muE: Math.max(muE, p.muD) })} />
          <Campo etiqueta="μ dinámico" valor={p.muD} min={0} max={1.5} paso={0.01} unidad="" onChange={(muD) => cambia({ muD, muE: Math.max(p.muE, muD) })} />
        </>
      )}
    </>
  )
}

function InspectorMovil({ m, s, set }: { m: Movil; s: S; set: (x: Partial<S>) => void }) {
  const cambia = (parche: Partial<Movil>) => set({ ...moverMovil(s, m.id, parche), ...reiniciar() })
  return (
    <>
      <Eleccion etiqueta="Movimiento" valor={m.movimiento} opciones={(Object.keys(NOMBRE_MOV) as Movimiento[]).map((v) => ({ v, t: NOMBRE_MOV[v] }))} onChange={(movimiento) => cambia({ movimiento })} />
      <Campo etiqueta="Masa" valor={m.m} min={0.05} max={m.tipo === 'coche' ? 3000 : 100} paso={m.tipo === 'coche' ? 10 : 0.05} unidad="kg" onChange={(v) => cambia({ m: v })} />
      <Campo etiqueta="Tamaño (radio)" valor={m.r} min={0.05} max={3} paso={0.05} unidad="m" onChange={(r) => cambia({ r })} />
      {m.movimiento === 'mcu' ? (
        <>
          <Campo etiqueta="Centro x" valor={m.x0} min={-100} max={300} paso={0.5} unidad="m" onChange={(x0) => cambia({ x0 })} />
          <Campo etiqueta="Centro y" valor={m.y0} min={0} max={100} paso={0.5} unidad="m" onChange={(y0) => cambia({ y0 })} />
          <Campo etiqueta="Radio R" valor={m.R} min={0.2} max={50} paso={0.1} unidad="m" onChange={(R) => cambia({ R })} />
          <Campo etiqueta="ω₀" valor={m.w0} min={-6} max={6} paso={0.05} unidad="rad/s" onChange={(w0) => cambia({ w0 })} />
          <Campo etiqueta="α (0 = MCU)" valor={m.alfa} min={-3} max={3} paso={0.05} unidad="rad/s²" onChange={(alfa) => cambia({ alfa })} />
          <Campo etiqueta="Ángulo inicial" valor={m.fase} min={-180} max={180} paso={1} unidad="°" onChange={(fase) => cambia({ fase })} />
        </>
      ) : (
        <>
          <Campo etiqueta="x₀" valor={m.x0} min={-100} max={300} paso={0.1} unidad="m" onChange={(x0) => cambia({ x0 })} />
          <Campo etiqueta="y₀" valor={m.y0} min={0} max={400} paso={0.1} unidad="m" onChange={(y0) => cambia({ y0 })} />
          <Campo etiqueta="v₀" valor={m.v0} min={m.movimiento === 'libre' ? 0 : -60} max={80} paso={0.1} unidad="m/s" onChange={(v0) => cambia({ v0 })} />
          <Campo etiqueta="Dirección" valor={m.ang} min={-180} max={180} paso={1} unidad="°" onChange={(ang) => cambia({ ang })} />
          {m.movimiento === 'mrua' && (
            <>
              <Campo etiqueta="Aceleración a" valor={m.a} min={-15} max={15} paso={0.1} unidad="m/s²" onChange={(a) => cambia({ a })} />
              <div className="interruptores">
                <Interruptor activo={m.parar} onChange={(parar) => cambia({ parar })}>
                  Se para al frenar
                </Interruptor>
                <Interruptor activo={m.rozar} onChange={(rozar) => cambia({ rozar })}>
                  Rozamiento del suelo
                </Interruptor>
              </div>
            </>
          )}
        </>
      )}
    </>
  )
}

function Panel({ s, set }: PropsPanel<S>) {
  const sim = calcular(s)
  const objetos = [...s.piezas.map((p) => ({ v: p.id, t: `${NOMBRE_PIEZA[p.tipo]}${p.material ? ' (' + p.material + ')' : ''} · ${p.id}` })), ...s.moviles.map((m) => ({ v: m.id, t: m.nombre }))]
  const pieza = s.piezas.find((p) => p.id === s.sel)
  const movil = s.moviles.find((m) => m.id === s.sel)
  return (
    <>
      <Grupo titulo="Construir">
        <Atajos marcador="Ejemplos…" opciones={EJEMPLOS.map((e) => ({ t: e.t, onClick: () => set(ponerEjemplo(s, e.e)) }))} />
        <Atajos
          marcador="Añadir al escenario…"
          opciones={[
            ...(['edificio', 'muro', 'rampa', 'plataforma', 'arbol', 'farola'] as TipoPieza[]).map((t) => ({ t: NOMBRE_PIEZA[t], onClick: () => set(anadirPieza(s, t)) })),
            ...MATERIALES.map((m) => ({ t: `Suelo de ${m.t}`, onClick: () => set(anadirPieza(s, 'suelo', m.t)) })),
          ]}
        />
        <Atajos marcador="Añadir un móvil…" opciones={(Object.keys(NOMBRE_MOVIL) as TipoMovil[]).map((t) => ({ t: NOMBRE_MOVIL[t], onClick: () => set(anadirMovil(s, t)) }))} />
        {(s.piezas.length > 0 || s.moviles.length > 0) && (
          <Boton onClick={() => set({ piezas: [], moviles: [], sel: null, ocultos: [], ...reiniciar() })}>Vaciar el escenario</Boton>
        )}
      </Grupo>
      {objetos.length > 0 && (
        <Grupo titulo="Objeto">
          <Eleccion etiqueta="Seleccionado" valor={s.sel ?? ''} opciones={[{ v: '', t: '—' }, ...objetos]} onChange={(sel) => set({ sel: sel || null })} />
          {pieza && <InspectorPieza p={pieza} s={s} set={set} />}
          {movil && <InspectorMovil m={movil} s={s} set={set} />}
          {(pieza || movil) && <Boton onClick={() => set(quitarObjeto(s, s.sel!))}>Quitar</Boton>}
        </Grupo>
      )}
      <Resultado />
      <Grupo titulo="Tiempo">
        <div className="interruptores">
          <Interruptor activo={s.jugando} onChange={(v) => set(v ? reproducir(s) : pausar(s))}>
            Reproducir
          </Interruptor>
          <Boton onClick={() => set(reiniciar())}>Volver a t = 0</Boton>
        </div>
        <Rango etiqueta="Instante t" valor={s.jugando ? Math.min(reloj.t, sim.tFin) : Math.min(s.tPausa, sim.tFin)} min={0} max={Math.max(0.01, sim.tFin)} paso={0.01} formato={(v) => `${v.toFixed(2)} s`} onChange={(tPausa) => set({ tPausa, jugando: false })} />
        <Rango etiqueta="Velocidad de reproducción" valor={s.velocidad} min={0.1} max={3} paso={0.1} formato={(v) => `${v.toFixed(1)}×`} onChange={(velocidad) => set({ velocidad })} />
        <Rango etiqueta="Simular hasta" valor={s.tMax} min={1} max={60} paso={0.5} formato={(v) => `${v.toFixed(1)} s`} onChange={(tMax) => set({ tMax })} />
      </Grupo>
      <Grupo titulo="Mundo">
        <Atajos
          opciones={[
            { t: 'Tierra (g = 9,8)', activo: s.g === 9.8, onClick: () => set({ g: 9.8 }) },
            { t: 'Luna (g = 1,62)', activo: s.g === 1.62, onClick: () => set({ g: 1.62 }) },
            { t: 'Marte (g = 3,71)', activo: s.g === 3.71, onClick: () => set({ g: 3.71 }) },
            { t: 'Júpiter (g = 24,8)', activo: s.g === 24.8, onClick: () => set({ g: 24.8 }) },
          ]}
        />
        <Campo etiqueta="Gravedad g" valor={s.g} min={0} max={30} paso={0.01} unidad="m/s²" onChange={(g) => set({ g })} />
        <Segmentado valor={s.aire} opciones={[{ v: 'no', t: 'Sin aire' }, { v: 'lineal', t: 'F = −b·v' }, { v: 'cuadratico', t: 'F = −c·v²' }]} onChange={(aire: Aire) => set({ aire })} />
        {s.aire !== 'no' && <Campo etiqueta={s.aire === 'lineal' ? 'b' : 'c'} valor={s.kAire} min={0} max={s.aire === 'lineal' ? 20 : 2} paso={0.005} unidad={s.aire === 'lineal' ? 'kg/s' : 'kg/m'} onChange={(kAire) => set({ kAire })} />}
        <Campo etiqueta="Restitución e (rebote)" valor={s.e} min={0} max={1} paso={0.01} unidad="" onChange={(e) => set({ e })} />
        <Campo etiqueta="μ estático del suelo" valor={s.muE} min={0} max={1.5} paso={0.01} unidad="" onChange={(muE) => set({ muE: Math.max(muE, s.muD) })} />
        <Campo etiqueta="μ dinámico del suelo" valor={s.muD} min={0} max={1.5} paso={0.01} unidad="" onChange={(muD) => set({ muD, muE: Math.max(s.muE, muD) })} />
      </Grupo>
      <Grupo titulo="Ver">
        <Segmentado
          columnas={3}
          valor={s.vista}
          opciones={[
            { v: 'escena', t: 'Escena' },
            { v: 'graficas', t: 'Gráficas' },
            { v: 'tabla', t: 'Tabla' },
          ]}
          onChange={(vista) => set({ vista })}
        />
        {s.vista === 'escena' && (
          <div className="interruptores">
            <Interruptor activo={s.verV} onChange={(verV) => set({ verV })}>
              Vector velocidad
            </Interruptor>
            <Interruptor activo={s.verA} onChange={(verA) => set({ verA })}>
              Vector aceleración
            </Interruptor>
            <Interruptor activo={s.verTrayectoria} onChange={(verTrayectoria) => set({ verTrayectoria })}>
              Trayectoria completa
            </Interruptor>
            <Interruptor activo={s.verSucesos} onChange={(verSucesos) => set({ verSucesos })}>
              Sucesos (choques, h máx…)
            </Interruptor>
            <Interruptor activo={s.verCotas} onChange={(verCotas) => set({ verCotas })}>
              Cotas
            </Interruptor>
          </div>
        )}
        {s.vista === 'tabla' && <Campo etiqueta="Cada" valor={s.dtTabla} min={0.01} max={2} paso={0.01} unidad="s" onChange={(dtTabla) => set({ dtTabla })} />}
      </Grupo>
    </>
  )
}

/* ---------------------------------------------------------------- dibujo de la escena */

function circulo(cx: number, cy: number, r: number, n = 28): Array<[number, number]> {
  return Array.from({ length: n + 1 }, (_, k) => [cx + r * Math.cos((2 * Math.PI * k) / n), cy + r * Math.sin((2 * Math.PI * k) / n)] as [number, number])
}

function rect(x0: number, y0: number, x1: number, y1: number): Array<[number, number]> {
  return [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
    [x0, y0],
  ]
}

const num = (v: number, d = 2) => v.toFixed(d).replace('.', ',')

function cota(g: Pintor2D, x: number, y0: number, y1: number, texto: string) {
  const c = g.color('--ink-soft')
  g.curva(
    [
      [x, y0],
      [x, y1],
    ],
    c,
    1,
  )
  const d = 6 / g.escalaX
  g.curva(
    [
      [x - d, y0],
      [x + d, y0],
    ],
    c,
    1,
  )
  g.curva(
    [
      [x - d, y1],
      [x + d, y1],
    ],
    c,
    1,
  )
  g.texto(texto, x, (y0 + y1) / 2, c, { dx: 6 })
}

function dibujarPieza(g: Pintor2D, p: Pieza, s: S, sel: boolean) {
  const c = g.color(colorPieza(p))
  const tinta = g.color('--ink-soft')
  const x0 = p.x
  const x1 = p.x + p.ancho
  const h = p.alto
  const grosor = sel ? 2.4 : 1.2
  switch (p.tipo) {
    case 'edificio': {
      g.rellenar(rect(x0, 0, x1, h), c, 0.16)
      g.curva(rect(x0, 0, x1, h), tinta, grosor)
      // ventanas: una planta cada 3 m y una ventana cada 2 m
      const plantas = Math.floor(h / 3)
      const cols = Math.max(1, Math.floor((p.ancho - 0.6) / 2))
      const paso = (p.ancho - 0.6) / cols
      if (g.escalaX * 0.8 > 3)
        for (let i = 0; i < plantas; i++)
          for (let j = 0; j < cols; j++) {
            const wx = x0 + 0.3 + j * paso + paso * 0.25
            const wy = i * 3 + 1
            if (wy + 1.2 > h - 0.3) continue
            g.rellenar(rect(wx, wy, wx + paso * 0.5, wy + 1.2).slice(0, 4), g.color('--accent'), 0.22)
          }
      if (s.verCotas) cota(g, x1 + 0.8, 0, h, `h = ${num(h, 1)} m`)
      break
    }
    case 'muro':
      g.rellenar(rect(x0, 0, x1, h), c, 0.45)
      g.curva(rect(x0, 0, x1, h), tinta, grosor)
      if (s.verCotas) cota(g, x1 + 0.5, 0, h, `${num(h, 1)} m`)
      break
    case 'plataforma':
      g.rellenar(rect(x0, h - 0.4, x1, h), c, 0.4)
      g.curva(rect(x0, h - 0.4, x1, h), tinta, grosor)
      g.curva(
        [
          [(x0 + x1) / 2, 0],
          [(x0 + x1) / 2, h - 0.4],
        ],
        tinta,
        1,
        true,
      )
      if (s.verCotas) cota(g, x1 + 0.6, 0, h, `${num(h, 1)} m`)
      break
    case 'rampa': {
      const der = p.derecha !== false
      const pts: Array<[number, number]> = der
        ? [
            [x0, 0],
            [x1, h],
            [x1, 0],
          ]
        : [
            [x0, 0],
            [x0, h],
            [x1, 0],
          ]
      g.rellenar(pts, c, 0.25)
      g.curva([...pts, pts[0]], tinta, grosor)
      const ang = (Math.atan2(h, p.ancho) * 180) / Math.PI
      const pie = der ? x0 : x1
      const r = Math.min(2.5, p.ancho / 3)
      const arco: Array<[number, number]> = Array.from({ length: 16 }, (_, k) => {
        const a = ((ang * Math.PI) / 180) * (k / 15)
        return der ? [pie + r * Math.cos(a), r * Math.sin(a)] : [pie - r * Math.cos(a), r * Math.sin(a)]
      })
      g.curva(arco, tinta, 1)
      g.texto(`${num(ang, 0)}°`, pie + (der ? r + 0.3 : -r - 0.3), 0.5, tinta, { alinea: der ? 'left' : 'right' })
      g.texto(`μ = ${num(p.muD)}`, (x0 + x1) / 2, h / 2, tinta, { dx: der ? -30 : 10, dy: -14 })
      if (s.verCotas) cota(g, der ? x1 + 0.6 : x0 - 0.6, 0, h, `${num(h, 2)} m`)
      break
    }
    case 'arbol': {
      const cx = (x0 + x1) / 2
      g.rellenar(rect(cx - 0.2, 0, cx + 0.2, h * 0.55).slice(0, 4), g.color('--ocre'), 0.7)
      const rc = Math.max(p.ancho / 2, 0.5)
      g.rellenar(circulo(cx, h - rc, rc), c, 0.45)
      g.curva(circulo(cx, h - rc, rc), c, grosor)
      break
    }
    case 'farola': {
      const cx = (x0 + x1) / 2
      g.curva(
        [
          [cx, 0],
          [cx, h],
          [cx + 0.8, h],
        ],
        tinta,
        sel ? 3 : 2,
      )
      g.rellenar(circulo(cx + 0.8, h - 0.25, 0.25), c, 0.9)
      g.rellenar(circulo(cx + 0.8, h - 0.25, 0.8), c, 0.12)
      break
    }
    case 'suelo':
      g.rellenar(rect(x0, -0.35, x1, 0).slice(0, 4), c, 0.55)
      g.texto(`${p.material ?? 'suelo'} · μ = ${num(p.muD)}`, (x0 + x1) / 2, -0.35, tinta, { dy: 10, alinea: 'center' })
      break
  }
  if (sel) g.curva(rect(x0 - 0.3, -0.3, x1 + 0.3, Math.max(h, 0.3) + 0.3), g.color('--accent'), 1, true)
}

function dibujarMovil(g: Pintor2D, m: Movil, x: number, y: number, vx: number, vy: number, sel: boolean) {
  const c = g.color(COLOR_MOVIL[m.tipo])
  // nunca más pequeño que unos píxeles: un coche en una calle de 100 m sigue viéndose
  const r = Math.max(m.r, 6 / g.escalaX)
  switch (m.tipo) {
    case 'pelota':
    case 'disco':
      g.rellenar(circulo(x, y, r), c, 0.85)
      g.curva(circulo(x, y, r), c, sel ? 2.5 : 1.4)
      break
    case 'piedra': {
      const pts: Array<[number, number]> = Array.from({ length: 9 }, (_, k) => {
        const a = (2 * Math.PI * k) / 8
        const rr = r * (0.8 + 0.25 * Math.sin(3 * a + 1))
        return [x + rr * Math.cos(a), y + rr * Math.sin(a)]
      })
      g.rellenar(pts, c, 0.8)
      g.curva(pts, g.color('--ink'), sel ? 2.2 : 1)
      break
    }
    case 'bloque': {
      // inclinado según la velocidad cuando se mueve por una rampa
      const ang = Math.hypot(vx, vy) > 0.05 && Math.abs(vy) < Math.abs(vx) * 3 ? Math.atan2(vy, vx) : 0
      const a = Math.abs(ang) > Math.PI / 2 ? ang - Math.sign(ang) * Math.PI : ang
      const cs = Math.cos(a)
      const sn = Math.sin(a)
      const pts: Array<[number, number]> = [
        [-r, -r],
        [r, -r],
        [r, r],
        [-r, r],
        [-r, -r],
      ].map(([u, v]) => [x + u * cs - v * sn, y + u * sn + v * cs])
      g.rellenar(pts, c, 0.75)
      g.curva(pts, c, sel ? 2.5 : 1.4)
      break
    }
    case 'coche': {
      // mirando hacia donde va
      const sgn = vx < -1e-6 ? -1 : 1
      const L = 2.2 * r
      const cuerpo: Array<[number, number]> = [
        [x - L, y - 0.45 * r],
        [x + L, y - 0.45 * r],
        [x + L, y + 0.15 * r],
        [x + sgn * 0.5 * L, y + 0.2 * r],
        [x + sgn * 0.2 * L, y + 0.8 * r],
        [x - sgn * 0.6 * L, y + 0.8 * r],
        [x - sgn * 0.9 * L, y + 0.2 * r],
        [x - L, y + 0.15 * r],
      ]
      g.rellenar(cuerpo, c, 0.85)
      g.curva([...cuerpo, cuerpo[0]], c, sel ? 2.5 : 1.2)
      for (const k of [-0.6, 0.6]) g.rellenar(circulo(x + k * L, y - 0.5 * r, 0.42 * r, 14), g.color('--ink'), 0.9)
      break
    }
  }
  if (g.mostrarNombres) g.texto(m.nombre, x, y + r, g.color('--ink-soft'), { dy: -10, alinea: 'center' })
}

/** Ventana que abarca el escenario y las trayectorias, con margen. */
function encuadre(s: S): { x: [number, number]; y: [number, number] } {
  const sim = calcular(s)
  const xs: number[] = [-2, 12]
  const ys: number[] = [-1, 8]
  for (const p of s.piezas) {
    xs.push(p.x, p.x + p.ancho)
    ys.push(p.alto)
  }
  for (const r of sim.recorridos)
    for (let k = 0; k < r.muestras.length; k += 10) {
      xs.push(r.muestras[k].x)
      ys.push(r.muestras[k].y)
    }
  for (const m of s.moviles)
    if (m.movimiento === 'mcu') {
      xs.push(m.x0 - m.R, m.x0 + m.R)
      ys.push(m.y0 + m.R)
    }
  const x0 = Math.min(...xs)
  const x1 = Math.max(...xs)
  const px = 0.08 * (x1 - x0)
  const ya = -0.08 * Math.max(...ys) - 1
  // proporción parecida a la del lienzo, estirando hacia arriba: el suelo queda abajo
  const yb = Math.max(Math.max(...ys) * 1.12 + 1, ya + (x1 - x0 + 2 * px) / 1.35)
  return { x: [x0 - px, x1 + px], y: [ya, yb] }
}

function vistaEscena(g: Pintor2D, s: S) {
  const sim = calcular(s)
  const t = tAhora(s)
  const { x, y } = g.ventana
  const tinta = g.color('--ink-soft')
  // cielo y suelo
  g.ejes({ rejilla: true })
  g.rellenar(
    [
      [x[0], 0],
      [x[1], 0],
      [x[1], Math.min(0, y[0])],
      [x[0], Math.min(0, y[0])],
    ],
    tinta,
    0.12,
  )
  g.curva(
    [
      [x[0], 0],
      [x[1], 0],
    ],
    tinta,
    1.6,
  )
  const visibles = s.piezas.filter((p) => !s.ocultos.includes(p.id))
  // primero el decorado (detrás), luego lo sólido
  for (const p of visibles.filter((p) => p.tipo === 'arbol' || p.tipo === 'farola' || p.tipo === 'suelo')) dibujarPieza(g, p, s, p.id === s.sel)
  for (const p of visibles.filter((p) => !(p.tipo === 'arbol' || p.tipo === 'farola' || p.tipo === 'suelo'))) dibujarPieza(g, p, s, p.id === s.sel)

  const moviles = s.moviles.filter((m) => !s.ocultos.includes(m.id))
  moviles.forEach((m, i) => {
    const rec = sim.recorridos[i]
    if (!rec) return
    const c = g.color(COLOR_MOVIL[m.tipo])
    if (m.movimiento === 'mcu') {
      g.curva(circulo(m.x0, m.y0, m.R, 72), tinta, 1, true)
      g.punto(m.x0, m.y0, tinta, 3)
    }
    if (s.verTrayectoria)
      g.curva(
        rec.muestras.map((q) => [q.x, q.y] as [number, number]),
        c,
        1,
        true,
      )
    // estela: lo ya recorrido
    const pasado = rec.muestras.filter((q) => q.t <= t).map((q) => [q.x, q.y] as [number, number])
    g.curva(pasado, c, 2)
    // v₀ del seleccionado
    if (m.id === s.sel && m.movimiento !== 'mcu' && m.v0 !== 0) {
      const a = (m.ang * Math.PI) / 180
      g.flecha(m.x0, m.y0, m.v0 * K_V * Math.cos(a), m.v0 * K_V * Math.sin(a), g.color('--pos'), 1.2, 7)
      g.texto(`v₀ = ${num(Math.abs(m.v0), 1)} m/s`, m.x0 + m.v0 * K_V * Math.cos(a), m.y0 + m.v0 * K_V * Math.sin(a), g.color('--pos'), { dx: 6, dy: -10 })
    }
    if (s.verSucesos) {
      // con rótulo solo los que se leen bien: los primeros choques y alturas máximas, sin amontonarse
      const rotulados: Array<[number, number]> = []
      let impactos = 0
      for (const e of rec.sucesos) {
        if (e.tipo === 'apoyo') continue
        const hecho = e.t <= t
        g.punto(e.x, e.y, hecho ? g.color('--ink') : tinta, 3)
        if (e.tipo === 'impacto' && ++impactos > 3) continue
        if (!(hecho || s.verTrayectoria)) continue
        const px = g.X(e.x)
        const py = g.Y(e.y)
        if (rotulados.some(([a, b]) => Math.abs(a - px) < 170 && Math.abs(b - py) < 16)) continue
        rotulados.push([px, py])
        g.texto(`${e.texto} · t = ${num(e.t)} s`, e.x, e.y, tinta, { dx: 6, dy: 12 })
      }
    }
    const e = estadoEnT(rec, t)
    if (m.movimiento === 'mcu')
      g.curva(
        [
          [m.x0, m.y0],
          [e.x, e.y],
        ],
        tinta,
        1,
      )
    dibujarMovil(g, m, e.x, e.y, e.vx, e.vy, m.id === s.sel)
    if (s.verV && Math.hypot(e.vx, e.vy) > 1e-3) {
      g.flecha(e.x, e.y, e.vx * K_V, e.vy * K_V, g.color('--pos'), 2, 8)
      g.texto('v', e.x + e.vx * K_V, e.y + e.vy * K_V, g.color('--pos'), { dx: 5, dy: -6, fuente: `italic 16px ${g.color('--serif') || 'serif'}` })
    }
    if (s.verA && Math.hypot(e.ax, e.ay) > 1e-3) {
      g.flecha(e.x, e.y, e.ax * K_A, e.ay * K_A, g.color('--neg'), 2, 8)
      g.texto('a', e.x + e.ax * K_A, e.y + e.ay * K_A, g.color('--neg'), { dx: 5, dy: 6, fuente: `italic 16px ${g.color('--serif') || 'serif'}` })
    }
  })
  if (s.verSucesos)
    for (const e of sim.encuentros) {
      g.punto(e.x, e.y, g.color('--rosa'), 5)
      if (e.t <= t) g.texto(`${e.texto} · t = ${num(e.t)} s`, e.x, e.y, g.color('--rosa'), { dy: -24, alinea: 'center' })
    }
  // rótulo del tiempo, fijo arriba a la izquierda
  const tx = x[0] + 0.02 * (x[1] - x[0])
  const ty = y[1] - 0.04 * (y[1] - y[0])
  g.texto(`t = ${num(t)} s${s.jugando ? '' : '  (pausa)'}`, tx, ty, g.color('--ink'), { fuente: `600 14px ${g.color('--mono') || 'monospace'}` })
  if (!s.piezas.length && !s.moviles.length)
    g.texto('Escenario vacío: añade edificios, rampas, árboles, pelotas… desde el panel u Objeto ▸ Añadir. Doble clic: una pelota.', tx, ty - 0.06 * (y[1] - y[0]), tinta)
}

/* ---------------------------------------------------------------- gráficas y tabla */

function vistaGraficas(g: Pintor2D, s: S) {
  const sim = calcular(s)
  const t = tAhora(s)
  const moviles = s.moviles.filter((m) => !s.ocultos.includes(m.id))
  if (!moviles.length) {
    g.ventana = { x: [-1, 1], y: [-1, 1] }
    g.texto('Añade algún móvil para ver sus gráficas', -0.9, 0.8, g.color('--ink-soft'))
    return
  }
  const sel = movilSel(s)
  const serie = (f: (q: (typeof sim.recorridos)[number]['muestras'][number], m: Movil) => number) =>
    moviles.map((m, i) => ({ pts: sim.recorridos[i].muestras.map((q) => [q.t, f(q, m)] as [number, number]), color: g.color(COLOR_MOVIL[m.tipo]), nombre: moviles.length > 1 ? m.nombre : undefined }))
  const paneles: PanelTiempo[] = [
    { titulo: 'x (m)', series: serie((q) => q.x) },
    { titulo: 'y (m)', series: serie((q) => q.y) },
    { titulo: '|v| (m/s)', series: serie((q) => Math.hypot(q.vx, q.vy)) },
    { titulo: '|a| (m/s²)', series: serie((q) => Math.hypot(q.ax, q.ay)) },
    { titulo: 'distancia recorrida s (m)', series: serie((q) => q.s) },
  ]
  if (sel) {
    const i = moviles.indexOf(sel)
    const ms = sim.recorridos[i]?.muestras ?? []
    const en = ms.map((q) => ({ t: q.t, ...energias(sel.m, s.g, q) }))
    paneles.push({
      titulo: `energía de ${sel.nombre} (J)`,
      series: [
        { pts: en.map((q) => [q.t, q.Ec] as [number, number]), color: g.color('--pos'), nombre: 'Ec' },
        { pts: en.map((q) => [q.t, q.Ep] as [number, number]), color: g.color('--neg'), nombre: 'Ep' },
        { pts: en.map((q) => [q.t, q.E] as [number, number]), color: g.color('--ink'), nombre: 'E' },
      ],
    })
  }
  graficasTiempo(g, paneles, { t, tMax: sim.tFin, columnas: 2 })
}

function Tabla({ s }: { s: S }) {
  const sim = calcular(s)
  const t = tAhora(s)
  const paso = Math.max(0.01, s.dtTabla)
  const actual = Math.round(t / paso)
  const fila = useRef<HTMLTableRowElement>(null)
  useEffect(() => {
    // mientras corre el tiempo, la fila actual se mantiene a la vista
    if (s.jugando) fila.current?.scrollIntoView({ block: 'nearest' })
  }, [actual, s.jugando])
  const moviles = s.moviles.filter((m) => !s.ocultos.includes(m.id))
  const m = movilSel(s)
  if (!m) return <p>Añade algún móvil para ver su tabla de valores.</p>
  const rec = sim.recorridos[moviles.indexOf(m)]
  if (!rec) return null
  const n = Math.min(2000, Math.floor(sim.tFin / paso + 1e-9))
  const filas = Array.from({ length: n + 1 }, (_, k) => estadoEnT(rec, k * paso))
  const f = (v: number) => (Math.abs(v) < 5e-4 ? '0' : v.toFixed(3))
  return (
    <>
      <h2>{m.nombre}</h2>
      <p>
        {NOMBRE_MOV[m.movimiento]} · m = {num(m.m)} kg · una fila cada {num(paso)} s · la fila marcada es el instante actual (t = {num(t)} s).
      </p>
      {rec.sucesos.filter((e) => e.tipo !== 'apoyo').length > 0 && (
        <>
          <h3>Sucesos</h3>
          <table className="tabla-valores" style={{ width: 'auto' }}>
            <thead>
              <tr>
                <th>t (s)</th>
                <th>x (m)</th>
                <th>y (m)</th>
                <th style={{ textAlign: 'left' }}>qué pasa</th>
              </tr>
            </thead>
            <tbody>
              {rec.sucesos
                .filter((e) => e.tipo !== 'apoyo')
                .slice(0, 30)
                .map((e, k) => (
                  <tr key={k} className={e.t <= t ? undefined : 'futuro'}>
                    <td>{e.t.toFixed(3)}</td>
                    <td>{e.x.toFixed(3)}</td>
                    <td>{e.y.toFixed(3)}</td>
                    <td style={{ textAlign: 'left' }}>{e.texto}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </>
      )}
      <h3>Valores en el tiempo</h3>
      <table className="tabla-valores">
        <thead>
          <tr>
            <th>t (s)</th>
            <th>x (m)</th>
            <th>y (m)</th>
            <th>vₓ (m/s)</th>
            <th>v_y (m/s)</th>
            <th>|v| (m/s)</th>
            <th>|a| (m/s²)</th>
            <th>s (m)</th>
            <th>Ec (J)</th>
            <th>Ep (J)</th>
            <th>E (J)</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((q, k) => {
            const en = energias(m.m, s.g, q)
            return (
              <tr key={k} ref={k === actual ? fila : undefined} className={k === actual ? 'actual' : undefined}>
                <td>{q.t.toFixed(2)}</td>
                <td>{f(q.x)}</td>
                <td>{f(q.y)}</td>
                <td>{f(q.vx)}</td>
                <td>{f(q.vy)}</td>
                <td>{f(Math.hypot(q.vx, q.vy))}</td>
                <td>{f(Math.hypot(q.ax, q.ay))}</td>
                <td>{f(q.s)}</td>
                <td>{f(en.Ec)}</td>
                <td>{f(en.Ep)}</td>
                <td>{f(en.E)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </>
  )
}

/* ---------------------------------------------------------------- fórmulas y lecturas */

const texN = (v: number, d = 2) => {
  const r = Number(v.toFixed(d))
  return String(r).replace('.', '{,}')
}
const signo = (v: number, d = 2) => (v < 0 ? `- ${texN(-v, d)}` : `+ ${texN(v, d)}`)

export function formulasDe(s: S): string[] {
  const m = movilSel(s)
  if (!m) return [String.raw`\vec r(t)=\vec r_0+\vec v_0\,t+\tfrac12\,\vec a\,t^2`]
  const rad = (m.ang * Math.PI) / 180
  const vx = m.v0 * Math.cos(rad)
  const vy = m.v0 * Math.sin(rad)
  const out: string[] = []
  if (m.movimiento === 'mcu') {
    out.push(String.raw`\theta(t)=\theta_0+\omega_0 t+\tfrac12\alpha t^2 = ${texN((m.fase * Math.PI) / 180)} ${signo(m.w0)}\,t ${signo(m.alfa / 2, 3)}\,t^2`)
    out.push(String.raw`v=\omega R,\qquad a_n=\omega^2 R,\qquad a_t=\alpha R = ${texN(m.alfa * m.R)}\ \mathrm{m/s^2}`)
    if (m.alfa === 0 && m.w0 !== 0) out.push(String.raw`T=\frac{2\pi}{|\omega|}=${texN((2 * Math.PI) / Math.abs(m.w0), 3)}\ \mathrm{s},\qquad f=${texN(Math.abs(m.w0) / (2 * Math.PI), 3)}\ \mathrm{Hz}`)
    return out
  }
  if (m.movimiento === 'mru') {
    out.push(String.raw`x(t)=x_0+v_x t = ${texN(m.x0)} ${signo(vx)}\,t`)
    if (Math.abs(vy) > 1e-9) out.push(String.raw`y(t)=y_0+v_y t = ${texN(m.y0)} ${signo(vy)}\,t`)
    return out
  }
  if (m.movimiento === 'mrua') {
    const a = aceleracionMrua(s, m)
    out.push(String.raw`s(t)=v_0 t+\tfrac12 a t^2 = ${texN(m.v0)}\,t ${signo(a / 2, 3)}\,t^2`)
    out.push(String.raw`v(t)=v_0+a t = ${texN(m.v0)} ${signo(a)}\,t,\qquad v^2=v_0^2+2a\,\Delta s`)
    if (m.rozar) out.push(String.raw`a = a_{\text{motor}}-\mu g = ${texN(m.a)} - ${texN(s.muD)}\cdot ${texN(s.g)} = ${texN(a)}\ \mathrm{m/s^2}`)
    if (a * m.v0 < 0) out.push(String.raw`t_{\text{parada}}=-\frac{v_0}{a}=${texN(-m.v0 / a, 3)}\ \mathrm{s},\qquad d=\frac{v_0^2}{2|a|}=${texN((m.v0 * m.v0) / (2 * Math.abs(a)), 3)}\ \mathrm{m}`)
    return out
  }
  // libre
  if (s.aire === 'no') {
    out.push(String.raw`x(t)=x_0+v_{0x}t = ${texN(m.x0)} ${signo(vx)}\,t`)
    out.push(String.raw`y(t)=y_0+v_{0y}t-\tfrac12 g t^2 = ${texN(m.y0)} ${signo(vy)}\,t - ${texN(s.g / 2, 3)}\,t^2`)
    if (s.g > 0) {
      const tSub = vy > 0 ? vy / s.g : 0
      const hMax = m.y0 + (vy > 0 ? (vy * vy) / (2 * s.g) : 0)
      // hasta el suelo (y = r), sin contar lo que haya en medio
      const yS = m.r
      const D = vy * vy + 2 * s.g * (m.y0 - yS)
      if (D >= 0) {
        const tv = (vy + Math.sqrt(D)) / s.g
        out.push(String.raw`t_{\text{subida}}=\frac{v_{0y}}{g}=${texN(tSub, 3)}\ \mathrm{s},\quad h_{\max}=y_0+\frac{v_{0y}^2}{2g}=${texN(hMax, 3)}\ \mathrm{m}`)
        out.push(String.raw`\text{hasta el suelo: } t=${texN(tv, 3)}\ \mathrm{s},\quad \Delta x=${texN(vx * tv, 3)}\ \mathrm{m},\quad |v|=${texN(Math.hypot(vx, vy - s.g * tv), 3)}\ \mathrm{m/s}`)
      }
    }
  } else if (s.aire === 'lineal') {
    out.push(String.raw`m\,\dot{\vec v}=m\vec g-b\,\vec v,\qquad v_{\text{lím}}=\frac{mg}{b}=${texN((m.m * s.g) / Math.max(1e-9, s.kAire), 3)}\ \mathrm{m/s}`)
  } else {
    out.push(String.raw`m\,\dot{\vec v}=m\vec g-c\,|\vec v|\,\vec v,\qquad v_{\text{lím}}=\sqrt{\frac{mg}{c}}=${texN(Math.sqrt((m.m * s.g) / Math.max(1e-9, s.kAire)), 3)}\ \mathrm{m/s}`)
  }
  for (const p of s.piezas.filter((q) => q.tipo === 'rampa' && !s.ocultos.includes(q.id))) {
    const th = Math.atan2(p.alto, p.ancho)
    const baja = s.g * (Math.sin(th) - p.muD * Math.cos(th))
    out.push(String.raw`\text{rampa } ${texN((th * 180) / Math.PI, 1)}^\circ:\ a=g(\sin\theta-\mu\cos\theta)=${texN(baja, 3)}\ \mathrm{m/s^2}${Math.tan(th) <= p.muE ? String.raw`\ (\tan\theta\le\mu_e:\ \text{no arranca solo})` : ''}`)
  }
  return out
}

export function lecturasDe(s: S): Array<[string, string]> {
  const sim = calcular(s)
  const m = movilSel(s)
  if (!m) return [['Piezas', String(s.piezas.length)]]
  const moviles = s.moviles.filter((q) => !s.ocultos.includes(q.id))
  const rec = sim.recorridos[moviles.indexOf(m)]
  if (!rec) return []
  const t = tAhora(s)
  const e = estadoEnT(rec, t)
  const v = Math.hypot(e.vx, e.vy)
  const en = energias(m.m, s.g, e)
  const filas: Array<[string, string]> = [
    ['Móvil', m.nombre],
    ['t', `${num(t, 2)} s`],
    ['Posición (x, y)', `(${num(e.x)}; ${num(e.y)}) m`],
    ['Velocidad (vₓ, v_y)', `(${num(e.vx)}; ${num(e.vy)}) m/s`],
    ['|v|', `${num(v)} m/s  (${num(v * 3.6, 1)} km/h)`],
    ['|a|', `${num(Math.hypot(e.ax, e.ay))} m/s²`],
  ]
  if (m.movimiento === 'mcu') {
    const w = m.w0 + m.alfa * t
    filas.push(['ω', `${num(w, 3)} rad/s`], ['aₙ = ω²R', `${num(w * w * m.R)} m/s²`], ['aₜ = αR', `${num(m.alfa * m.R)} m/s²`])
  }
  filas.push(['Distancia recorrida', `${num(e.s)} m`], ['Desplazamiento', `${num(Math.hypot(e.x - rec.muestras[0].x, e.y - rec.muestras[0].y))} m`])
  filas.push(['Ec · Ep · E', `${num(en.Ec, 1)} · ${num(en.Ep, 1)} · ${num(en.E, 1)} J`])
  const sucesos = rec.sucesos.filter((q) => q.tipo !== 'apoyo')
  if (sucesos.length) {
    const alt = sucesos.find((q) => q.tipo === 'altura-max')
    const imp = sucesos.find((q) => q.tipo === 'impacto')
    const par = sucesos.find((q) => q.tipo === 'parada')
    if (alt) filas.push(['Altura máxima', `${num(alt.y)} m en t = ${num(alt.t)} s`])
    if (imp) filas.push(['Primer choque', `t = ${num(imp.t)} s en x = ${num(imp.x)} m a ${num(imp.v ?? 0)} m/s`])
    if (par) filas.push(['Se para', `t = ${num(par.t)} s en x = ${num(par.x)} m`])
  }
  for (const q of sim.encuentros) filas.push(['Encuentro', `${q.texto}: t = ${num(q.t)} s, x = ${num(q.x)} m`])
  return filas
}

/* ---------------------------------------------------------------- módulo */

const INICIAL: S = {
  ...MUNDO,
  piezas: [],
  moviles: [],
  sel: null,
  vista: 'escena',
  jugando: true,
  tPausa: 0,
  velocidad: 1,
  verV: true,
  verA: true,
  verTrayectoria: true,
  verSucesos: true,
  verCotas: true,
  dtTabla: 0.1,
  sig: 1,
  ocultos: [],
}

function asas(s: S): Asa[] {
  const out: Asa[] = []
  for (const p of s.piezas) {
    if (s.ocultos.includes(p.id)) continue
    const cx = p.x + p.ancho / 2
    out.push({ id: `${p.id}:x`, p: [cx, p.tipo === 'suelo' ? -0.2 : 0], eje: 'x', color: '--ink-soft' })
    if (p.tipo !== 'suelo') {
      const xa = p.tipo === 'rampa' ? (p.derecha !== false ? p.x + p.ancho : p.x) : p.tipo === 'farola' ? cx : cx
      out.push({ id: `${p.id}:h`, p: [xa, p.alto], eje: 'y', color: '--accent', nombre: p.id === s.sel ? `${num(p.alto, 1)} m` : undefined })
    }
    if (p.id === s.sel) out.push({ id: `${p.id}:w`, p: [p.x + p.ancho, p.tipo === 'suelo' ? -0.2 : Math.max(0.3, p.alto / 2)], eje: 'x', color: '--aux' })
  }
  for (const m of s.moviles) {
    if (s.ocultos.includes(m.id)) continue
    if (m.movimiento === 'mcu') {
      const f = (m.fase * Math.PI) / 180
      out.push({ id: `${m.id}:c`, p: [m.x0, m.y0], color: '--ink-soft' })
      out.push({ id: `${m.id}:R`, p: [m.x0 + m.R * Math.cos(f), m.y0 + m.R * Math.sin(f)], color: COLOR_MOVIL[m.tipo] })
    } else {
      out.push({ id: `${m.id}:p`, p: [m.x0, m.y0], color: COLOR_MOVIL[m.tipo] })
      if (m.id === s.sel) {
        const a = (m.ang * Math.PI) / 180
        out.push({ id: `${m.id}:v`, p: [m.x0 + m.v0 * K_V * Math.cos(a), m.y0 + m.v0 * K_V * Math.sin(a)], color: '--pos' })
      }
    }
  }
  return out
}

function mover(id: string, t: { p: number[]; mayus: boolean }, s: S): Partial<S> | void {
  const [oid, que] = id.split(':')
  const [px, py] = t.p
  const p = s.piezas.find((q) => q.id === oid)
  if (p) {
    const r = (v: number) => Math.round(v * 10) / 10
    if (que === 'x') return { ...moverPieza(s, oid, { x: r(px - p.ancho / 2) }), ...reiniciar() }
    if (que === 'h') return { ...moverPieza(s, oid, { alto: Math.max(0.2, r(py)) }), ...reiniciar() }
    if (que === 'w') return { ...moverPieza(s, oid, { ancho: Math.max(p.tipo === 'muro' ? 0.1 : 0.5, r(px - p.x)) }), ...reiniciar() }
    return
  }
  const m = s.moviles.find((q) => q.id === oid)
  if (!m) return
  if (que === 'p') {
    let y = Math.max(m.r, py)
    // se pega a la superficie de debajo si pasa cerca (Mayús: sin imán)
    if (!t.mayus) {
      const h = superficieBajo(tramosDe(activa(s)), px, py)
      if (Math.abs(y - (h + m.r)) < 0.6) y = h + m.r
    }
    return { ...moverMovil(s, oid, { x0: Math.round(px * 100) / 100, y0: Math.round(y * 100) / 100 }), ...reiniciar() }
  }
  if (que === 'v') {
    const dx = (px - m.x0) / K_V
    const dy = (py - m.y0) / K_V
    let ang = (Math.atan2(dy, dx) * 180) / Math.PI
    if (t.mayus) ang = Math.round(ang / 15) * 15
    const v0 = Math.round(Math.hypot(dx, dy) * 10) / 10
    // en MRU/MRUA se conserva el signo de v₀ si iba hacia atrás
    return { ...moverMovil(s, oid, { v0, ang: Math.round(ang) }), ...reiniciar() }
  }
  if (que === 'c') return { ...moverMovil(s, oid, { x0: Math.round(px * 10) / 10, y0: Math.round(Math.max(0, py) * 10) / 10 }), ...reiniciar() }
  if (que === 'R') {
    const R = Math.max(0.2, Math.round(Math.hypot(px - m.x0, py - m.y0) * 10) / 10)
    return { ...moverMovil(s, oid, { R, fase: Math.round((Math.atan2(py - m.y0, px - m.x0) * 180) / Math.PI) }), ...reiniciar() }
  }
}

/** Qué objeto hay bajo un clic: primero los móviles, luego las piezas. */
function objetoEn(s: S, x: number, y: number): string | null {
  const sim = calcular(s)
  const t = tAhora(s)
  const moviles = s.moviles.filter((m) => !s.ocultos.includes(m.id))
  for (let i = moviles.length - 1; i >= 0; i--) {
    const e = estadoEnT(sim.recorridos[i], t)
    const m = moviles[i]
    if (Math.hypot(x - e.x, y - e.y) < m.r * (m.tipo === 'coche' ? 2.4 : 1.4) + 0.3) return m.id
    if (Math.hypot(x - m.x0, y - m.y0) < m.r + 0.3) return m.id
  }
  for (const p of [...s.piezas].reverse()) {
    if (s.ocultos.includes(p.id)) continue
    const y0 = p.tipo === 'suelo' ? -0.4 : p.tipo === 'plataforma' ? p.alto - 0.5 : 0
    const y1 = p.tipo === 'suelo' ? 0.1 : p.alto
    if (x >= p.x - 0.2 && x <= p.x + p.ancho + 0.2 && y >= y0 && y <= y1 + 0.2) return p.id
  }
  return null
}

function capas(s: S): Capa<S>[] {
  const alternar = (id: string) => (x: S): Partial<S> => ({ ocultos: x.ocultos.includes(id) ? x.ocultos.filter((o) => o !== id) : [...x.ocultos, id] })
  return [
    ...s.piezas.map((p) => ({
      id: p.id,
      nombre: `${NOMBRE_PIEZA[p.tipo]}${p.material ? ' de ' + p.material : ''}`,
      color: colorPieza(p),
      visible: !s.ocultos.includes(p.id),
      alternar: alternar(p.id),
      quitar: (x: S) => quitarObjeto(x, p.id),
      detalle: p.tipo === 'suelo' ? `μ = ${num(p.muD)}` : `x = ${num(p.x, 1)} m, h = ${num(p.alto, 1)} m`,
    })),
    ...s.moviles.map((m) => ({
      id: m.id,
      nombre: m.nombre,
      color: COLOR_MOVIL[m.tipo],
      visible: !s.ocultos.includes(m.id),
      alternar: alternar(m.id),
      quitar: (x: S) => quitarObjeto(x, m.id),
      detalle: NOMBRE_MOV[m.movimiento],
    })),
  ]
}

function menu(s: S) {
  const escenario: EntradaMenu<S>[] = [
    ...(['edificio', 'muro', 'rampa', 'plataforma', 'arbol', 'farola'] as TipoPieza[]).map((t) => accion<S>(NOMBRE_PIEZA[t], (x) => anadirPieza(x, t))),
    submenu<S>(
      'Suelo',
      MATERIALES.map((m) => accion<S>(`${m.t[0].toUpperCase()}${m.t.slice(1)} (μ = ${num(m.muD)})`, (x) => anadirPieza(x, 'suelo', m.t))),
    ),
  ]
  const moviles: EntradaMenu<S>[] = (Object.keys(NOMBRE_MOVIL) as TipoMovil[]).map((t) =>
    submenu<S>(
      NOMBRE_MOVIL[t],
      (Object.keys(NOMBRE_MOV) as Movimiento[]).map((mv) => accion<S>(NOMBRE_MOV[mv], (x) => anadirMovil(x, t, mv))),
    ),
  )
  return {
    anadir: [submenu<S>('Escenario', escenario), submenu<S>('Móviles', moviles)],
    ejemplos: EJEMPLOS.map((e) => accion<S>(e.t, (x) => ponerEjemplo(x, e.e))),
    acciones: [
      casilla<S>('Reproducir', s.jugando, (v) => (v ? reproducir(s) : pausar(s))),
      accion<S>('Volver a t = 0', () => reiniciar()),
      radios<S, Vista>('Qué mirar', [{ v: 'escena', t: 'Escena' }, { v: 'graficas', t: 'Gráficas x(t), v(t), a(t)…' }, { v: 'tabla', t: 'Tabla de valores' }], s.vista, (vista) => ({ vista })),
      casilla<S>('Vector velocidad', s.verV, (verV) => ({ verV })),
      casilla<S>('Vector aceleración', s.verA, (verA) => ({ verA })),
      casilla<S>('Trayectoria completa', s.verTrayectoria, (verTrayectoria) => ({ verTrayectoria })),
      casilla<S>('Sucesos', s.verSucesos, (verSucesos) => ({ verSucesos })),
      casilla<S>('Cotas', s.verCotas, (verCotas) => ({ verCotas })),
      accion<S>('Quitar el seleccionado', (x) => (x.sel ? quitarObjeto(x, x.sel) : undefined), !s.sel),
      accion<S>('Vaciar el escenario', () => ({ piezas: [], moviles: [], sel: null, ocultos: [], ...reiniciar() }), !s.piezas.length && !s.moviles.length),
    ],
  }
}

export default definir<S>({
  id: 'cinematica',
  area: 'mecanica',
  resumen: 'Escenarios de cinemática: edificios, rampas y móviles con MRU, MRUA, MCU, tiros, caídas, rozamiento y rebotes',
  corto: 'Escenarios de cinemática',
  titulo: 'Escenarios de <i>cinemática</i>',
  entradilla: 'Monta el problema pieza a pieza: edificios, rampas, suelos y móviles. Arrastra alturas, posiciones y la flecha de v₀.',
  inicial: INICIAL,
  Panel,
  resultadoEnPanel: true,
  lecturasVivas: true,
  rotulo: (s) => {
    const m = movilSel(s)
    return { nombre: m ? `${m.nombre} · ${NOMBRE_MOV[m.movimiento]}` : 'Escenario vacío' }
  },
  formula: formulasDe,
  lecturas: lecturasDe,
  capas,
  menu,
  leyenda: (s) =>
    s.vista === 'escena' ? (
      <>
        <Muestra color="var(--pos)">velocidad</Muestra>
        <Muestra color="var(--neg)">aceleración</Muestra>
        <span>discontinua = trayectoria completa</span>
      </>
    ) : s.vista === 'graficas' ? (
      <span>línea vertical = instante actual</span>
    ) : null,
  vista: (s) =>
    s.vista === 'tabla'
      ? { tipo: 'html', clave: 'tabla', Componente: Tabla }
      : s.vista === 'graficas'
        ? {
            tipo: '2d',
            clave: 'graficas',
            navegable: false,
            animada: (st) => st.jugando,
            dibujar: (g, st) => vistaGraficas(g, st),
          }
        : {
            tipo: '2d',
            clave: 'escena',
            ventana: encuadre(s),
            animada: (st) => st.jugando,
            dibujar: (g, st) => vistaEscena(g, st),
            alPulsar: (p, st) => ({ sel: objetoEn(st, p.x, p.y) }),
            interaccion: {
              asas,
              mover,
              anadir: (t, st) => {
                const m = { ...movilNuevo('pelota', st), x0: Math.round(t.p[0] * 10) / 10, y0: Math.round(Math.max(0.25, t.p[1]) * 10) / 10, v0: 0 }
                return { moviles: [...st.moviles, m], sig: st.sig + 1, sel: m.id, ...reiniciar() }
              },
              quitar: (id, st) => quitarObjeto(st, id.split(':')[0]),
              pista: 'Arrastra las asas: base (mover), azotea (altura), flecha v₀. Clic para seleccionar, doble clic para añadir una pelota.',
            },
          },
})
