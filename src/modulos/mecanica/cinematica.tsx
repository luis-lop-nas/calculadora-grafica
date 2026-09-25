import { useEffect, useRef } from 'react'
import { definir, type Asa, type Capa, type EntradaMenu, type PropsPanel } from '../../nucleo/tipos'
import { accion, casilla, radios, submenu } from '../../nucleo/menu'
import { Atajos, Boton, Grupo, Interruptor, Muestra, Rango, Resultado, Segmentado } from '../../nucleo/controles'
import { animacion } from '../../nucleo/vista'
import { BarraEditor, EDITOR_INICIAL, caja, circ, pasoRejilla, type CampoEditor, type Categoria, type EstadoEditor, type Seleccion } from '../../nucleo/editor'
import type { Pintor2D } from '../../render/pintor2d'
import { graficasTiempo, type PanelTiempo } from '../../render/graficas'
import { DIM, ecuacion, mags, type Dimensional } from '../../lib/dimensiones'
import {
  aceleracionMrua,
  apoyarEn,
  energias,
  estadoEnT,
  simular,
  solidoEn,
  tramoInicial,
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
  /** Barra del editor: modo, objeto elegido para colocar y pestaña. */
  ed: EstadoEditor
  /** Sube al poner un ejemplo o vaciar: el lienzo vuelve a encuadrar. */
  marco: number
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
  diana: 'Diana',
  regla: 'Regla',
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
  p.tipo === 'diana' ? '--rosa' : p.tipo === 'regla' ? '--aux' : p.tipo === 'suelo' ? COLOR_MATERIAL[p.material ?? ''] ?? '--ink-soft' : p.tipo === 'arbol' ? '--aux' : p.tipo === 'farola' ? '--ocre' : p.tipo === 'rampa' ? '--ocre' : '--ink-soft'

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
    case 'diana':
      return { ...base, ancho: 1.2, alto: 3 }
    case 'regla':
      return { ...base, ancho: 10, alto: 0.6 }
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
    t: 'Cañón y diana (en la altura máxima)',
    e: {
      ...MUNDO,
      e: 0.3,
      tMax: 4,
      piezas: [
        // vértice de la parábola: x = v₀² sin 2θ / (2g), y = y₀ + v₀² sin²θ / (2g)
        P({ id: 'p1', tipo: 'diana', x: 225 / (2 * 9.8) - 0.6, ancho: 1.2, alto: 0.2 + 225 / (4 * 9.8) }),
        P({ id: 'p2', tipo: 'regla', x: 0, ancho: 225 / 9.8, alto: -0.9 }),
      ],
      moviles: [M({ id: 'm1', tipo: 'pelota', nombre: 'Bala', canon: true, m: 1, r: 0.2, x0: 0, y0: 0.2, v0: 15, ang: 45 })],
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
const ponerEjemplo = (s: S, e: Partial<S>): Partial<S> => ({ ...e, sel: e.moviles?.[0]?.id ?? null, ocultos: [], sig: s.sig + 10, jugando: true, marco: s.marco + 1, ...reiniciar() })
const vaciar = (s: S): Partial<S> => ({ piezas: [], moviles: [], sel: null, ocultos: [], marco: s.marco + 1, ...reiniciar() })

/* ---------------------------------------------------------------- editor (barra al pie del lienzo) */

/** Catálogo de la barra: el id dice qué se crea (`p:tipo[:variante]` pieza, `m:tipo[:movimiento]` móvil). */
export const CATALOGO: Categoria[] = [
  {
    id: 'terreno',
    nombre: 'Terreno',
    objetos: [
      { id: 'p:edificio', nombre: 'Edificio', icono: caja(8, 6, 16, 22) + 'M4 28h24' },
      { id: 'p:muro', nombre: 'Muro', icono: caja(14, 10, 4, 18) + 'M4 28h24' },
      { id: 'p:rampa', nombre: 'Rampa ↗', icono: 'M4 28L28 12V28Z', color: '--ocre' },
      { id: 'p:rampa:i', nombre: 'Rampa ↖', icono: 'M4 12V28H28Z', color: '--ocre' },
      { id: 'p:plataforma', nombre: 'Plataforma', icono: caja(6, 10, 20, 4) + 'M16 14v14M4 28h24' },
    ],
  },
  {
    id: 'suelos',
    nombre: 'Suelos',
    objetos: MATERIALES.map((m) => ({ id: `p:suelo:${m.t}`, nombre: `${m.t[0].toUpperCase()}${m.t.slice(1)} μ ${m.muD}`, icono: 'M4 20h24M4 24h24', color: COLOR_MATERIAL[m.t] })),
  },
  {
    id: 'decorado',
    nombre: 'Decorado',
    objetos: [
      { id: 'p:arbol', nombre: 'Árbol', icono: 'M16 28V18' + circ(16, 12, 7), color: '--aux' },
      { id: 'p:farola', nombre: 'Farola', icono: 'M12 28V6h8' + circ(20, 9, 2), color: '--ocre' },
    ],
  },
  {
    id: 'medir',
    nombre: 'Medir',
    objetos: [
      { id: 'p:diana', nombre: 'Diana', icono: circ(16, 16, 10) + circ(16, 16, 5) + circ(16, 16, 1), color: '--rosa' },
      { id: 'p:regla', nombre: 'Regla', icono: 'M4 16h24M4 12v8M28 12v8M10 16v-3M16 16v-4M22 16v-3', color: '--aux' },
    ],
  },
  {
    id: 'moviles',
    nombre: 'Móviles',
    objetos: [
      { id: 'm:pelota', nombre: 'Pelota', icono: circ(16, 18, 7) + 'M4 28h24', color: '--accent' },
      { id: 'm:piedra', nombre: 'Piedra', icono: circ(16, 20, 5) + 'M4 28h24', color: '--ink-soft' },
      { id: 'm:bloque', nombre: 'Bloque', icono: caja(9, 14, 14, 14) + 'M4 28h24', color: '--morado' },
      { id: 'm:coche', nombre: 'Coche MRUA', icono: caja(4, 13, 24, 9) + circ(10, 24, 3) + circ(22, 24, 3), color: '--pos' },
      { id: 'm:coche:mru', nombre: 'Coche MRU', icono: caja(4, 13, 24, 9) + circ(10, 24, 3) + circ(22, 24, 3) + 'M8 8h16', color: '--pos' },
      { id: 'm:canon', nombre: 'Cañón', icono: 'M6 26l6-6' + circ(9, 23, 3) + 'M12 20l10-10' + circ(24, 8, 2.5), color: '--accent' },
      { id: 'm:disco', nombre: 'Giro MCU', icono: circ(16, 16, 10) + 'M16 16L26 16' + circ(26, 16, 2), color: '--rosa' },
    ],
  },
]

const redondea = (v: number, k = 0.1) => Math.round(v / k) * k

/** Coloca el objeto del pincel donde se ha hecho clic (x, y del mundo). */
export function colocar(s: S, pincel: string, x: number, y: number): Partial<S> {
  const o = objetoNuevo(s, pincel, x, y)
  return 'ancho' in o ? { piezas: [...s.piezas, o], sig: s.sig + 1, sel: o.id, ...reiniciar() } : { moviles: [...s.moviles, o], sig: s.sig + 1, sel: o.id, ...reiniciar() }
}

/** El objeto que crearía un clic en (x, y), sin tocar el estado ni el reloj. */
export function objetoNuevo(s: S, pincel: string, x: number, y: number): Pieza | Movil {
  const [clase, tipo, variante] = pincel.split(':')
  const k = pasoRejilla(s.ed)
  if (clase === 'p') {
    const p = piezaNueva(tipo as TipoPieza, s, tipo === 'suelo' ? variante : undefined)
    p.x = +redondea(x - p.ancho / 2, k).toFixed(2)
    if (tipo === 'rampa' && variante === 'i') p.derecha = false
    // la plataforma, a la altura del clic
    if (tipo === 'plataforma') p.alto = Math.max(1, +redondea(y, k).toFixed(2))
    // la diana y la regla, a la altura del clic
    if (tipo === 'diana' || tipo === 'regla') p.alto = Math.max(0, +redondea(y, k).toFixed(2))
    return p
  }
  const canon = tipo === 'canon'
  const m = movilNuevo(canon ? 'pelota' : (tipo as TipoMovil), s, variante as Movimiento | undefined)
  if (canon) Object.assign(m, { nombre: `Bala${s.moviles.some((q) => q.canon) ? ' ' + (s.moviles.filter((q) => q.canon).length + 1) : ''}`, canon: true, r: 0.2, m: 1 })
  if (m.movimiento === 'mcu') {
    m.x0 = +redondea(x, k).toFixed(2)
    m.y0 = +Math.max(m.R, redondea(y, k)).toFixed(2)
  } else {
    const xx = redondea(x, k)
    const apoyo = apoyarEn(activa(s), xx, y, m.r)
    m.x0 = +xx.toFixed(2)
    // cerca de una superficie (o dentro de algo sólido), apoyado en ella; si no, donde se ha hecho clic
    m.y0 = +(y - apoyo < 0.8 ? apoyo : redondea(y, k)).toFixed(2)
    if (m.tipo !== 'coche') m.v0 = 0
    if (canon) Object.assign(m, { v0: 15, ang: 45 })
  }
  return m
}

function duplicar(s: S, id: string): Partial<S> {
  const p = s.piezas.find((q) => q.id === id)
  if (p) {
    const q = { ...p, id: `p${s.sig}`, x: p.x + p.ancho + 1 }
    return { piezas: [...s.piezas, q], sig: s.sig + 1, sel: q.id, ...reiniciar() }
  }
  const m = s.moviles.find((q) => q.id === id)
  if (!m) return {}
  const n = s.moviles.filter((q) => q.tipo === m.tipo).length + 1
  const q = { ...m, id: `m${s.sig}`, nombre: `${NOMBRE_MOVIL[m.tipo]} ${n}`, x0: m.x0 + Math.max(1, 3 * m.r) }
  return { moviles: [...s.moviles, q], sig: s.sig + 1, sel: q.id, ...reiniciar() }
}

/** Los valores del seleccionado como campos de la barra. */
export function camposDe(s: S, set: (p: Partial<S>) => void): Seleccion | null {
  const p = s.piezas.find((q) => q.id === s.sel)
  const soltar = () => set({ sel: null })
  const quitar = () => s.sel && set(quitarObjeto(s, s.sel))
  const dup = () => s.sel && set(duplicar(s, s.sel))
  if (p) {
    const cambia = (parche: Partial<Pieza>) => set({ ...moverPieza(s, p.id, parche), ...reiniciar() })
    if (p.tipo === 'diana' || p.tipo === 'regla') {
      const diana = p.tipo === 'diana'
      return {
        nombre: NOMBRE_PIEZA[p.tipo],
        color: colorPieza(p),
        campos: diana
          ? [
              { etiqueta: 'Centro x', valor: p.x + p.ancho / 2, paso: 0.5, unidad: 'm', onChange: (cx) => cambia({ x: +(cx - p.ancho / 2).toFixed(3) }) },
              { etiqueta: 'Centro y', valor: p.alto, paso: 0.5, min: 0, unidad: 'm', onChange: (alto) => cambia({ alto }) },
              { etiqueta: 'Diámetro', valor: p.ancho, paso: 0.1, min: 0.1, unidad: 'm', onChange: (ancho) => cambia({ ancho, x: +(p.x + p.ancho / 2 - ancho / 2).toFixed(3) }) },
            ]
          : [
              { etiqueta: 'Desde x', valor: p.x, paso: 0.5, unidad: 'm', onChange: (x) => cambia({ x }) },
              { etiqueta: 'Hasta x', valor: p.x + p.ancho, paso: 0.5, unidad: 'm', onChange: (x1) => cambia({ ancho: Math.max(0.1, +(x1 - p.x).toFixed(3)) }) },
              { etiqueta: 'Altura', valor: p.alto, paso: 0.5, min: 0, unidad: 'm', onChange: (alto) => cambia({ alto }) },
            ],
        paso: pasoRejilla(s.ed),
        mover: (dx, dy) => cambia({ x: +(p.x + dx).toFixed(2), alto: Math.max(0, +(p.alto + dy).toFixed(2)) }),
        duplicar: dup,
        quitar,
        soltar,
      }
    }
    const campos: CampoEditor[] = [{ etiqueta: 'x (borde izq.)', valor: p.x, paso: 0.5, unidad: 'm', onChange: (x) => cambia({ x }) }]
    if (p.tipo !== 'suelo') campos.push({ etiqueta: p.tipo === 'plataforma' ? 'Altura de la losa' : 'Altura', valor: p.alto, paso: 0.5, min: 0.2, unidad: 'm', onChange: (alto) => cambia({ alto }) })
    campos.push({ etiqueta: p.tipo === 'arbol' ? 'Copa' : 'Ancho', valor: p.ancho, paso: p.tipo === 'muro' ? 0.1 : 0.5, min: p.tipo === 'muro' ? 0.1 : 0.5, unidad: 'm', onChange: (ancho) => cambia({ ancho }) })
    if (p.tipo === 'rampa')
      campos.push({
        etiqueta: 'Inclinación θ',
        valor: (Math.atan2(p.alto, p.ancho) * 180) / Math.PI,
        paso: 1,
        min: 1,
        max: 80,
        unidad: '°',
        decimales: 1,
        onChange: (a) => cambia({ alto: +(p.ancho * Math.tan((a * Math.PI) / 180)).toFixed(3) }),
      })
    if (p.tipo === 'suelo')
      campos.push({
        tipo: 'opciones',
        etiqueta: 'Material',
        valor: p.material ?? '',
        opciones: MATERIALES.map((m) => ({ v: m.t, t: m.t })),
        onChange: (t) => {
          const m = MATERIALES.find((q) => q.t === t)!
          cambia({ material: m.t, muE: m.muE, muD: m.muD })
        },
      })
    if (p.tipo === 'arbol' || p.tipo === 'farola') campos.push({ tipo: 'si-no', etiqueta: 'Se choca con él', valor: !!p.solido, onChange: (solido) => cambia({ solido }) })
    else {
      campos.push({ etiqueta: 'μ estático', valor: p.muE, paso: 0.05, min: 0, max: 2, onChange: (muE) => cambia({ muE: Math.max(muE, p.muD) }) })
      campos.push({ etiqueta: 'μ dinámico', valor: p.muD, paso: 0.05, min: 0, max: 2, onChange: (muD) => cambia({ muD, muE: Math.max(p.muE, muD) }) })
    }
    return {
      nombre: `${NOMBRE_PIEZA[p.tipo]}${p.material ? ' de ' + p.material : ''}`,
      color: colorPieza(p),
      campos,
      paso: pasoRejilla(s.ed),
      mover: (dx, dy) => cambia(p.tipo === 'plataforma' ? { x: +(p.x + dx).toFixed(2), alto: Math.max(0.5, +(p.alto + dy).toFixed(2)) } : { x: +(p.x + dx).toFixed(2) }),
      voltear: p.tipo === 'rampa' ? () => cambia({ derecha: p.derecha === false }) : undefined,
      duplicar: dup,
      quitar,
      soltar,
    }
  }
  const m = s.moviles.find((q) => q.id === s.sel)
  if (!m) return null
  const cambia = (parche: Partial<Movil>) => set({ ...moverMovil(s, m.id, parche), ...reiniciar() })
  const campos: CampoEditor[] = [
    { tipo: 'opciones', etiqueta: 'Movimiento', valor: m.movimiento, opciones: (Object.keys(NOMBRE_MOV) as Movimiento[]).map((v) => ({ v, t: NOMBRE_MOV[v] })), onChange: (v) => cambia({ movimiento: v as Movimiento }) },
    { etiqueta: 'Masa m', valor: m.m, paso: m.tipo === 'coche' ? 50 : 0.1, min: 0.01, unidad: 'kg', onChange: (v) => cambia({ m: v }) },
    { etiqueta: 'Radio', valor: m.r, paso: 0.05, min: 0.05, max: 5, unidad: 'm', onChange: (r) => cambia({ r }) },
  ]
  if (m.movimiento === 'libre')
    campos.push({ etiqueta: m.e === undefined ? 'Rebote e (el del mundo)' : 'Rebote e (propio)', valor: m.e ?? s.e, paso: 0.05, min: 0, max: 1, onChange: (e) => cambia({ e }) })
  if (m.movimiento === 'mcu')
    campos.push(
      { etiqueta: 'Centro x', valor: m.x0, paso: 0.5, unidad: 'm', onChange: (x0) => cambia({ x0 }) },
      { etiqueta: 'Centro y', valor: m.y0, paso: 0.5, unidad: 'm', onChange: (y0) => cambia({ y0 }) },
      { etiqueta: 'Radio R', valor: m.R, paso: 0.1, min: 0.1, unidad: 'm', onChange: (R) => cambia({ R }) },
      { etiqueta: 'ω₀', valor: m.w0, paso: 0.1, unidad: 'rad/s', onChange: (w0) => cambia({ w0 }) },
      { etiqueta: 'α', valor: m.alfa, paso: 0.05, unidad: 'rad/s²', onChange: (alfa) => cambia({ alfa }) },
      { etiqueta: 'Ángulo inicial', valor: m.fase, paso: 5, unidad: '°', onChange: (fase) => cambia({ fase }) },
    )
  else {
    campos.push(
      { etiqueta: 'x₀', valor: m.x0, paso: 0.1, unidad: 'm', onChange: (x0) => cambia({ x0 }) },
      { etiqueta: 'y₀', valor: m.y0, paso: 0.1, min: 0, unidad: 'm', onChange: (y0) => cambia({ y0 }) },
      { etiqueta: 'v₀', valor: m.v0, paso: 0.5, min: m.movimiento === 'libre' ? 0 : undefined, unidad: 'm/s', onChange: (v0) => cambia({ v0 }) },
      { etiqueta: 'Dirección', valor: m.ang, paso: 5, min: -180, max: 180, unidad: '°', onChange: (ang) => cambia({ ang }) },
    )
    if (m.movimiento === 'mrua')
      campos.push(
        { etiqueta: 'Aceleración a', valor: m.a, paso: 0.1, unidad: 'm/s²', onChange: (a) => cambia({ a }) },
        { tipo: 'si-no', etiqueta: 'Se para al frenar', valor: m.parar, onChange: (parar) => cambia({ parar }) },
        { tipo: 'si-no', etiqueta: 'Rozamiento del suelo', valor: m.rozar, onChange: (rozar) => cambia({ rozar }) },
      )
  }
  return {
    nombre: m.nombre,
    color: COLOR_MOVIL[m.tipo],
    campos,
    paso: pasoRejilla(s.ed),
    mover: (dx, dy) => cambia({ x0: +(m.x0 + dx).toFixed(2), y0: +Math.max(m.movimiento === 'mcu' ? 0 : m.r, m.y0 + dy).toFixed(2) }),
    voltear: m.movimiento === 'mcu' ? () => cambia({ w0: -m.w0, alfa: -m.alfa }) : () => cambia({ ang: m.ang >= 0 ? 180 - m.ang : -180 - m.ang }),
    duplicar: dup,
    quitar,
    soltar,
  }
}

function Barra({ s, set }: { s: S; set: (p: Partial<S>) => void }) {
  return (
    <BarraEditor
      ed={s.ed}
      set={(p) => set({ ed: { ...s.ed, ...p } })}
      categorias={CATALOGO}
      seleccion={s.ed.modo === 'editar' ? camposDe(s, set) : null}
      extra={
        <>
          <button type="button" className="ed-boton" aria-pressed={s.jugando} onClick={() => set(s.jugando ? pausar(s) : reproducir(s))} title="Reproducir o pausar">
            {s.jugando ? '❚❚' : '▶'}
          </button>
          <button type="button" className="ed-boton" onClick={() => set(reiniciar())} title="Volver a t = 0">
            ⟲
          </button>
        </>
      }
    />
  )
}

/** Dónde está el ratón (para la vista previa del objeto que se va a colocar). */
let fantasma: { x: number; y: number } | null = null

function cursor(p: { x: number; y: number } | null, s: S): boolean {
  const antes = fantasma
  fantasma = p
  // vista previa del pincel o lectura de la trayectoria: las dos se repintan al mover el ratón
  return (!!antes || !!p) && (s.moviles.length > 0 || (s.ed.modo === 'construir' && !!s.ed.pincel))
}

/** El objeto del pincel, translúcido, donde caería con un clic. */
function dibujarFantasma(g: Pintor2D, s: S) {
  if (!fantasma || s.ed.modo !== 'construir' || !s.ed.pincel) return
  const o = objetoNuevo(s, s.ed.pincel, fantasma.x, fantasma.y)
  g.ctx.save()
  g.ctx.globalAlpha = 0.45
  const p = 'ancho' in o ? o : null
  const m = 'ancho' in o ? null : o
  if (p) dibujarPieza(g, p, { ...s, verCotas: false }, false)
  if (m) {
    if (m.movimiento === 'mcu') g.curva(circulo(m.x0, m.y0, m.R, 72), g.color('--ink-soft'), 1, true)
    const [x, y] = m.movimiento === 'mcu' ? [m.x0 + m.R * Math.cos((m.fase * Math.PI) / 180), m.y0 + m.R * Math.sin((m.fase * Math.PI) / 180)] : [m.x0, m.y0]
    dibujarMovil(g, m, x, y, 1, 0, false)
  }
  g.ctx.restore()
}

/** Al pasar el ratón cerca de una trayectoria: t, x, y y |v| del punto más cercano (como el «rastro» de PhET). */
function dibujarLectura(g: Pintor2D, s: S) {
  if (!fantasma || (s.ed.modo === 'construir' && s.ed.pincel)) return
  const sim = calcular(s)
  let mejor: { d: number; q: (typeof sim.recorridos)[number]['muestras'][number]; c: string } | null = null
  const visibles = s.moviles.filter((m) => !s.ocultos.includes(m.id))
  visibles.forEach((m, i) => {
    for (const q of sim.recorridos[i]?.muestras ?? []) {
      const d = Math.hypot(g.X(q.x) - g.X(fantasma!.x), g.Y(q.y) - g.Y(fantasma!.y))
      if (d < 10 && (!mejor || d < mejor.d)) mejor = { d, q, c: COLOR_MOVIL[m.tipo] }
    }
  })
  if (!mejor) return
  const { q, c } = mejor as { q: (typeof sim.recorridos)[number]['muestras'][number]; c: string }
  g.punto(q.x, q.y, g.color(c), 5)
  g.texto(`t = ${num(q.t)} s · (${num(q.x)}; ${num(q.y)}) m · |v| = ${num(Math.hypot(q.vx, q.vy))} m/s`, q.x, q.y, g.color('--ink'), { dx: 10, dy: -12 })
}

/** Clic en el lienzo según el modo del editor. */
function pulsar(p: { x: number; y: number }, s: S): Partial<S> | void {
  const bajo = objetoEn(s, p.x, p.y)
  if (s.ed.modo === 'borrar') return bajo ? quitarObjeto(s, bajo) : undefined
  if (s.ed.modo === 'construir' && s.ed.pincel) return colocar(s, s.ed.pincel, p.x, p.y)
  // en Construir sin pincel, un clic sobre algo lo abre para editar
  if (s.ed.modo === 'construir') return bajo ? { sel: bajo, ed: { ...s.ed, modo: 'editar' } } : undefined
  return { sel: bajo }
}

/** Escala de las flechas: metros de flecha por m/s (velocidad) y por m/s² (aceleración). */
const K_V = 0.25
const K_A = 0.25

const movilSel = (s: S) => s.moviles.find((m) => m.id === s.sel) ?? s.moviles.find((m) => !s.ocultos.includes(m.id)) ?? null

/* ---------------------------------------------------------------- panel */

function Campo({ etiqueta, valor, min, max, paso, unidad, onChange }: { etiqueta: string; valor: number; min: number; max: number; paso: number; unidad: string; onChange: (v: number) => void }) {
  const dec = paso >= 1 ? 0 : paso >= 0.1 ? 1 : 2
  return <Rango etiqueta={etiqueta} valor={valor} min={min} max={max} paso={paso} formato={(v) => `${v.toFixed(dec)} ${unidad}`} onChange={onChange} />
}

function Panel({ s, set }: PropsPanel<S>) {
  const sim = calcular(s)
  return (
    <>
      <Grupo titulo="Construir">
        <Atajos marcador="Ejemplos…" opciones={EJEMPLOS.map((e) => ({ t: e.t, onClick: () => set(ponerEjemplo(s, e.e)) }))} />
        <p className="nota-editor">
          Monta el escenario con la barra de abajo: <b>Construir</b> (elige un objeto y haz clic en el lienzo), <b>Editar</b> (clic en un objeto para
          darle valores; flechas para moverlo) y <b>Borrar</b>.
        </p>
        {(s.piezas.length > 0 || s.moviles.length > 0) && (
          <Boton onClick={() => set(vaciar(s))}>Vaciar el escenario</Boton>
        )}
      </Grupo>
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

/**
 * Dibujo de trazo simple: cada pieza es un contorno con un relleno muy suave, sin
 * texturas ni ventanas; lo que importa (alturas, ángulos, μ) va rotulado.
 */
function dibujarPieza(g: Pintor2D, p: Pieza, s: S, sel: boolean) {
  const c = g.color(colorPieza(p))
  const tinta = g.color('--ink-soft')
  const x0 = p.x
  const x1 = p.x + p.ancho
  const h = p.alto
  const grosor = sel ? 2.6 : 1.5
  switch (p.tipo) {
    case 'edificio':
    case 'muro':
      g.rellenar(rect(x0, 0, x1, h), c, p.tipo === 'muro' ? 0.3 : 0.1)
      g.curva(rect(x0, 0, x1, h), tinta, grosor)
      if (s.verCotas) cota(g, x1 + (p.tipo === 'muro' ? 0.5 : 0.8), 0, h, p.tipo === 'muro' ? `${num(h, 1)} m` : `h = ${num(h, 1)} m`)
      break
    case 'plataforma':
      g.rellenar(rect(x0, h - 0.4, x1, h), c, 0.3)
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
      g.rellenar(pts, c, 0.12)
      g.curva([...pts, pts[0]], tinta, grosor)
      const ang = (Math.atan2(h, p.ancho) * 180) / Math.PI
      const pie = der ? x0 : x1
      const r = Math.min(2.5, p.ancho / 3)
      const arco: Array<[number, number]> = Array.from({ length: 16 }, (_, k) => {
        const a = ((ang * Math.PI) / 180) * (k / 15)
        return der ? [pie + r * Math.cos(a), r * Math.sin(a)] : [pie - r * Math.cos(a), r * Math.sin(a)]
      })
      g.curva(arco, tinta, 1)
      g.texto(`θ = ${num(ang, 1)}°`, pie + (der ? r + 0.3 : -r - 0.3), 0.5, tinta, { alinea: der ? 'left' : 'right' })
      g.texto(`μ = ${num(p.muD)}`, (x0 + x1) / 2, h / 2, tinta, { dx: der ? -30 : 10, dy: -14 })
      if (s.verCotas) cota(g, der ? x1 + 0.6 : x0 - 0.6, 0, h, `${num(h, 2)} m`)
      break
    }
    case 'arbol': {
      const cx = (x0 + x1) / 2
      const rc = Math.max(p.ancho / 2, 0.5)
      g.curva(
        [
          [cx, 0],
          [cx, h - 2 * rc],
        ],
        tinta,
        sel ? 3 : 2,
      )
      g.curva(circulo(cx, h - rc, rc), c, grosor, !p.solido)
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
      g.curva(circulo(cx + 0.8, h - 0.25, 0.25, 14), c, 1.5)
      break
    }
    case 'diana': {
      const cx = (x0 + x1) / 2
      const R = p.ancho / 2
      for (const k of [1, 0.6, 0.2]) g.curva(circulo(cx, h, R * k, 32), c, k === 1 ? grosor : 1.2)
      g.curva(
        [
          [cx, 0],
          [cx, h - R],
        ],
        tinta,
        1,
        true,
      )
      if (s.verCotas) g.texto(`(${num(cx, 1)}; ${num(h, 1)}) m`, cx + R, h, tinta, { dx: 6 })
      if (sel) g.curva(rect(cx - R - 0.3, h - R - 0.3, cx + R + 0.3, h + R + 0.3), g.color('--accent'), 1, true)
      return
    }
    case 'regla': {
      // cota horizontal con su longitud: Δx de x a x + ancho
      const d = 6 / g.escalaY
      g.curva(
        [
          [x0, h],
          [x1, h],
        ],
        c,
        grosor,
      )
      for (const xx of [x0, x1])
        g.curva(
          [
            [xx, h - 2 * d],
            [xx, h + 2 * d],
          ],
          c,
          grosor,
        )
      const paso = p.ancho > 40 ? 10 : p.ancho > 8 ? 1 : 0.5
      for (let xx = x0 + paso; xx < x1 - 1e-9; xx += paso)
        g.curva(
          [
            [xx, h],
            [xx, h + d],
          ],
          c,
          1,
        )
      g.texto(`Δx = ${num(p.ancho, 2)} m`, (x0 + x1) / 2, h, c, { dy: -12, alinea: 'center' })
      if (sel) g.curva(rect(x0 - 0.3, h - 0.5, x1 + 0.3, h + 0.5), g.color('--accent'), 1, true)
      return
    }
    case 'suelo':
      g.curva(
        [
          [x0, -0.05],
          [x1, -0.05],
        ],
        c,
        5,
      )
      g.texto(`${p.material ?? 'suelo'} · μ = ${num(p.muD)}`, (x0 + x1) / 2, -0.35, tinta, { dy: 10, alinea: 'center' })
      break
  }
  if (sel) g.curva(rect(x0 - 0.3, -0.3, x1 + 0.3, Math.max(h, 0.3) + 0.3), g.color('--accent'), 1, true)
}

function dibujarMovil(g: Pintor2D, m: Movil, x: number, y: number, vx: number, vy: number, sel: boolean) {
  const c = g.color(COLOR_MOVIL[m.tipo])
  // nunca más pequeño que unos píxeles: un coche en una calle de 100 m sigue viéndose
  const r = Math.max(m.r, 6 / g.escalaX)
  const grosor = sel ? 2.8 : 1.8
  switch (m.tipo) {
    case 'pelota':
    case 'disco':
    case 'piedra':
      g.rellenar(circulo(x, y, r), c, m.tipo === 'piedra' ? 0.6 : 0.25)
      g.curva(circulo(x, y, r), c, grosor)
      break
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
      g.rellenar(pts, c, 0.25)
      g.curva(pts, c, grosor)
      break
    }
    case 'coche': {
      // una caja y dos ruedas; la cabina, hacia donde va
      const sgn = vx < -1e-6 ? -1 : 1
      const L = 2.2 * r
      const cuerpo = rect(x - L, y - 0.4 * r, x + L, y + 0.3 * r)
      const cabina: Array<[number, number]> = [
        [x - sgn * 0.7 * L, y + 0.3 * r],
        [x - sgn * 0.5 * L, y + 0.85 * r],
        [x + sgn * 0.3 * L, y + 0.85 * r],
        [x + sgn * 0.5 * L, y + 0.3 * r],
      ]
      g.rellenar(cuerpo, c, 0.25)
      g.curva(cuerpo, c, grosor)
      g.curva(cabina, c, grosor)
      for (const k of [-0.6, 0.6]) g.curva(circulo(x + k * L, y - 0.55 * r, 0.42 * r, 14), c, grosor)
      break
    }
  }
  if (g.mostrarNombres) g.texto(m.nombre, x, y + r, g.color('--ink-soft'), { dy: -10, alinea: 'center' })
}

/** Cañón de trazo simple en la posición de salida: una rueda y el tubo en la dirección de v₀. */
function dibujarCanon(g: Pintor2D, m: Movil) {
  const tinta = g.color('--ink-soft')
  const a = (m.ang * Math.PI) / 180
  const L = Math.max(1.2, 6 * m.r)
  const [ux, uy] = [Math.cos(a), Math.sin(a)]
  const [nx, ny] = [-uy, ux]
  const w = Math.max(m.r * 1.3, 0.25)
  // el eje (la rueda) en el punto de salida y el tubo hacia delante: nunca se mete bajo el suelo
  const boca: [number, number] = [m.x0 + 0.75 * L * ux, m.y0 + 0.75 * L * uy]
  const culata: [number, number] = [m.x0 - 0.25 * L * ux, m.y0 - 0.25 * L * uy]
  g.curva(
    [
      [culata[0] + w * nx, culata[1] + w * ny],
      [boca[0] + w * nx, boca[1] + w * ny],
      [boca[0] - w * nx, boca[1] - w * ny],
      [culata[0] - w * nx, culata[1] - w * ny],
      [culata[0] + w * nx, culata[1] + w * ny],
    ],
    tinta,
    1.8,
  )
  g.curva(circulo(m.x0, m.y0, Math.max(0.1, Math.min(w * 1.4, m.y0)), 20), tinta, 1.8)
  g.texto(`θ = ${num(m.ang, 0)}°`, culata[0], culata[1], tinta, { dx: -8, dy: 14, alinea: 'right' })
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
  // con la barra del editor abierta, el suelo sube por encima de ella (≈ 30 % del alto)
  const yaBarra = s.ed.barra ? Math.min(ya, -0.45 * yb) : ya
  return { x: [x0 - px, x1 + px], y: [yaBarra, yb] }
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
  const detras = (p: Pieza) => p.tipo === 'arbol' || p.tipo === 'farola' || p.tipo === 'suelo' || p.tipo === 'diana'
  for (const p of visibles.filter(detras)) dibujarPieza(g, p, s, p.id === s.sel)
  for (const p of visibles.filter((p) => !detras(p))) dibujarPieza(g, p, s, p.id === s.sel)

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
    if (m.canon && m.movimiento !== 'mcu') dibujarCanon(g, m)
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
  if (s.verSucesos)
    for (const e of sim.aciertos) {
      g.punto(e.x, e.y, g.color('--rosa'), 5)
      if (e.t <= t) g.texto(`${e.texto} · t = ${num(e.t)} s`, e.x, e.y, g.color('--rosa'), { dy: -24, alinea: 'center' })
    }
  dibujarFantasma(g, s)
  dibujarLectura(g, s)
  // rótulo del tiempo, fijo arriba a la izquierda
  const tx = x[0] + 0.02 * (x[1] - x[0])
  const ty = y[1] - 0.04 * (y[1] - y[0])
  g.texto(`t = ${num(t)} s${s.jugando ? '' : '  (pausa)'}`, tx, ty, g.color('--ink'), { fuente: `600 14px ${g.color('--mono') || 'monospace'}` })
  if (!s.piezas.length && !s.moviles.length)
    g.texto('Escenario vacío: en la barra de abajo, Construir → elige un objeto y haz clic aquí. Doble clic: una pelota.', tx, ty - 0.06 * (y[1] - y[0]), tinta)
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
  // libre: ¿empieza apoyado sobre algo (desliza) o en el aire (tiro)?
  const sim = calcular(s)
  const visibles = s.moviles.filter((q) => !s.ocultos.includes(q.id))
  const rec = sim.recorridos[visibles.indexOf(m)]
  const i0 = tramoInicial(sim.tramos, m)
  const primerChoque = rec?.sucesos.find((e) => e.tipo === 'impacto')
  if (i0 >= 0) {
    const tr = sim.tramos[i0]
    const th = Math.atan(Math.abs(tr.t[1] / tr.t[0]))
    const g = s.g
    if (th < 1e-6) {
      out.push(String.raw`a=-\mu_d\,g=-${texN(tr.muD)}\cdot ${texN(g)}=${texN(-tr.muD * g, 3)}\ \mathrm{m/s^2}`)
      if (m.v0 > 0 && tr.muD > 0 && s.aire === 'no')
        out.push(String.raw`d=\frac{v_0^2}{2\mu_d g}=${texN((m.v0 * m.v0) / (2 * tr.muD * g), 3)}\ \mathrm{m},\qquad t=\frac{v_0}{\mu_d g}=${texN(m.v0 / (tr.muD * g), 3)}\ \mathrm{s}\ \text{(si no cambia de suelo)}`)
    } else {
      const baja = g * (Math.sin(th) - tr.muD * Math.cos(th))
      const sube = -g * (Math.sin(th) + tr.muD * Math.cos(th))
      out.push(String.raw`\text{sobre la rampa de } ${texN((th * 180) / Math.PI, 1)}^\circ:\ a_{\downarrow}=g(\sin\theta-\mu_d\cos\theta)=${texN(baja, 3)}\ \mathrm{m/s^2}`)
      if (m.v0 !== 0) out.push(String.raw`a_{\uparrow}=-g(\sin\theta+\mu_d\cos\theta)=${texN(sube, 3)}\ \mathrm{m/s^2}`)
      else if (Math.tan(th) <= tr.muE) out.push(String.raw`\tan\theta=${texN(Math.tan(th), 3)}\le\mu_e=${texN(tr.muE)}:\ \text{no arranca}`)
      else if (s.aire === 'no') {
        // desde el reposo hasta el pie del tramo: L = ½ a t²
        const baj = tr.t[1] < 0 ? tr.b : tr.a
        const L = Math.hypot(baj[0] + m.r * tr.n[0] - m.x0, baj[1] + m.r * tr.n[1] - m.y0)
        const t = Math.sqrt((2 * L) / baja)
        out.push(String.raw`\text{hasta el pie } (L=${texN(L, 2)}\ \mathrm{m}):\ t=\sqrt{2L/a}=${texN(t, 3)}\ \mathrm{s},\quad v=a\,t=${texN(baja * t, 3)}\ \mathrm{m/s}`)
      }
    }
  } else if (s.aire === 'no') {
    out.push(String.raw`x(t)=x_0+v_{0x}t = ${texN(m.x0)} ${signo(vx)}\,t`)
    out.push(String.raw`y(t)=y_0+v_{0y}t-\tfrac12 g t^2 = ${texN(m.y0)} ${signo(vy)}\,t - ${texN(s.g / 2, 3)}\,t^2`)
    if (s.g > 0) {
      const tSub = vy > 0 ? vy / s.g : 0
      if (vy > 0 && !(primerChoque && primerChoque.t < tSub))
        out.push(String.raw`t_{\text{subida}}=\frac{v_{0y}}{g}=${texN(tSub, 3)}\ \mathrm{s},\quad h_{\max}=y_0+\frac{v_{0y}^2}{2g}=${texN(m.y0 + (vy * vy) / (2 * s.g), 3)}\ \mathrm{m}`)
      // el primer choque sale de la simulación; si es con el suelo, se contrasta con la fórmula
      const D = vy * vy + 2 * s.g * (m.y0 - m.r)
      const tSuelo = D >= 0 ? (vy + Math.sqrt(D)) / s.g : NaN
      if (primerChoque && Math.abs(primerChoque.y - m.r) < 1e-3 && Math.abs(primerChoque.t - tSuelo) < 1e-3)
        out.push(
          String.raw`\text{al suelo: } t=\frac{v_{0y}+\sqrt{v_{0y}^2+2g(y_0-r)}}{g}=${texN(tSuelo, 3)}\ \mathrm{s}`,
          String.raw`\Delta x=v_{0x}\,t=${texN(vx * tSuelo, 3)}\ \mathrm{m},\quad |v|=${texN(Math.hypot(vx, vy - s.g * tSuelo), 3)}\ \mathrm{m/s}`,
        )
      else if (primerChoque)
        out.push(
          String.raw`\text{primer choque (con un obstáculo): } t=${texN(primerChoque.t, 3)}\ \mathrm{s}`,
          String.raw`(x,\ y)=(${texN(primerChoque.x)},\ ${texN(primerChoque.y)})\ \mathrm{m},\quad |v|=${texN(primerChoque.v ?? 0, 3)}\ \mathrm{m/s}`,
        )
    }
  }
  if (s.aire === 'lineal') {
    out.push(String.raw`m\,\dot{\vec v}=m\vec g-b\,\vec v,\qquad v_{\text{lím}}=\frac{mg}{b}=${texN((m.m * s.g) / Math.max(1e-9, s.kAire), 3)}\ \mathrm{m/s}`)
  } else if (s.aire === 'cuadratico') {
    out.push(String.raw`m\,\dot{\vec v}=m\vec g-c\,|\vec v|\,\vec v,\qquad v_{\text{lím}}=\sqrt{\frac{mg}{c}}=${texN(Math.sqrt((m.m * s.g) / Math.max(1e-9, s.kAire)), 3)}\ \mathrm{m/s}`)
  }
  if (i0 >= 0) return out
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
  for (const q of sim.aciertos) filas.push(['Diana', `${q.texto}: t = ${num(q.t)} s a ${num(q.v ?? 0)} m/s`])
  const dianas = s.piezas.filter((p) => p.tipo === 'diana' && !s.ocultos.includes(p.id))
  if (dianas.length && !sim.aciertos.some((a) => a.movil === m.id)) filas.push(['Diana', `${m.nombre} no da en ninguna`])
  return filas
}

/* ---------------------------------------------------------------- análisis dimensional */

const DIMS = {
  x: DIM.longitud, y: DIM.longitud, x0: DIM.longitud, y0: DIM.longitud, h: DIM.longitud, s: DIM.longitud, R: DIM.longitud,
  t: DIM.tiempo, v: DIM.velocidad, v0: DIM.velocidad, v0x: DIM.velocidad, v0y: DIM.velocidad, a: DIM.aceleracion, g: DIM.aceleracion,
  m: DIM.masa, mu: DIM.adim, theta: DIM.adim, omega: DIM.frecuencia, alpha: DIM.frecuencia.map((x) => 2 * x) as typeof DIM.frecuencia,
  b: DIM.amortiguamiento, c: DIM.masa.map((x, i) => x - (i === 0 ? 1 : 0)) as typeof DIM.masa, Ec: DIM.energia, Ep: DIM.energia, E: DIM.energia, F: DIM.fuerza,
}

export function dimensionesDe(s: S): Dimensional {
  const m = movilSel(s)
  const n2 = (v: number, u: string, d = 2) => `${num(v, d)} ${u}`
  const val = <T,>(f: (mv: Movil) => T) => (m ? f(m) : undefined)
  const ecs = [
    ecuacion('Posición en el MRUA', 'x = x0 + v0*t + 1/2*a*t^2', DIMS),
    ecuacion('Velocidad y desplazamiento', 'v^2 = v0^2 + 2*a*s', DIMS),
    ecuacion('Tiro: altura', 'y = y0 + v0y*t - 1/2*g*t^2', DIMS),
    ecuacion('Energía cinética y potencial', 'E = 1/2*m*v^2 + m*g*h', DIMS),
    ecuacion('Rozamiento dinámico', 'F = mu*m*g', DIMS),
    ecuacion('Plano inclinado', 'a = g*(sin(theta) - mu*cos(theta))', DIMS),
    ecuacion('MCU: aceleración normal', 'a = omega^2*R', DIMS),
    ecuacion('MCU: velocidad', 'v = omega*R', DIMS),
  ]
  if (s.aire === 'lineal') ecs.push(ecuacion('Velocidad límite (aire lineal)', 'v = m*g/b', DIMS))
  if (s.aire === 'cuadratico') ecs.push(ecuacion('Velocidad límite (aire cuadrático)', 'v = sqrt(m*g/c)', DIMS))
  return {
    magnitudes: mags(
      ['x,\\ y', 'posición', DIM.longitud],
      ['t', 'tiempo', DIM.tiempo],
      ['v_0', 'rapidez inicial', DIM.velocidad, val((q) => n2(Math.abs(q.v0), 'm/s'))],
      ['a', 'aceleración (MRUA)', DIM.aceleracion, val((q) => (q.movimiento === 'mrua' ? n2(aceleracionMrua(s, q), 'm/s²') : undefined))],
      ['g', 'gravedad', DIM.aceleracion, n2(s.g, 'm/s²')],
      ['m', 'masa', DIM.masa, val((q) => n2(q.m, 'kg'))],
      ['\\mu', 'coeficiente de rozamiento', DIM.adim, num(s.muD)],
      ['\\omega', 'velocidad angular', DIM.frecuencia, val((q) => (q.movimiento === 'mcu' ? n2(q.w0, 'rad/s') : undefined))],
      ['\\alpha', 'aceleración angular', DIMS.alpha, val((q) => (q.movimiento === 'mcu' ? n2(q.alfa, 'rad/s²') : undefined))],
      ['e', 'coeficiente de restitución', DIM.adim, num(s.e)],
      ...(s.aire === 'lineal' ? [['b', 'rozamiento del aire (lineal)', DIM.amortiguamiento, n2(s.kAire, 'kg/s', 3)] as [string, string, typeof DIM.masa, string]] : []),
      ...(s.aire === 'cuadratico' ? [['c', 'rozamiento del aire (cuadrático)', DIMS.c, n2(s.kAire, 'kg/m', 3)] as [string, string, typeof DIM.masa, string]] : []),
      ['E', 'energía', DIM.energia],
      ['F', 'fuerza', DIM.fuerza],
    ),
    ecuaciones: ecs,
    nota: 'Los ángulos (θ, ωt) son adimensionales: por eso pueden ir dentro de sin y cos.',
  }
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
  ed: { ...EDITOR_INICIAL, modo: 'construir', categoria: 'terreno' },
  marco: 0,
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
    // se pega a la superficie de debajo si pasa cerca (Mayús: sin imán); nunca se queda dentro de algo sólido
    const apoyo = apoyarEn(activa(s), px, py, m.r)
    if (solidoEn(activa(s), px, py) || (!t.mayus && Math.abs(y - apoyo) < 0.6)) y = apoyo
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
    const y0 = p.tipo === 'suelo' ? -0.4 : p.tipo === 'plataforma' ? p.alto - 0.5 : p.tipo === 'diana' ? p.alto - p.ancho / 2 : p.tipo === 'regla' ? p.alto - 0.4 : 0
    const y1 = p.tipo === 'suelo' ? 0.1 : p.tipo === 'diana' ? p.alto + p.ancho / 2 : p.tipo === 'regla' ? p.alto + 0.2 : p.alto
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
      accion<S>('Vaciar el escenario', (x) => vaciar(x), !s.piezas.length && !s.moviles.length),
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
  dimensiones: dimensionesDe,
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
            clave: `escena:${s.marco}:${s.ed.barra}`,
            ventana: encuadre(s),
            animada: (st) => st.jugando,
            dibujar: (g, st) => vistaEscena(g, st),
            alPulsar: pulsar,
            barrer: (st) => st.ed.modo === 'borrar',
            cursor,
            barra: Barra,
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
