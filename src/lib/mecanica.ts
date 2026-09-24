/**
 * Mecánica analítica: de un lagrangiano escrito a mano a sus ecuaciones de Euler–Lagrange
 * (simbólicas, con el CAS), su hamiltoniano y su integración numérica.
 */
import { CERO, MENOS, contiene, desdeNodo, prod, s as sim, simbolos, suma, sustituir, type E } from './cas/expr'
import { derivar } from './cas/derivar'
import { simplificar } from './cas/algebra'
import { resolverSistema } from './cas/resolver'
import { compilarE } from './cas/compilar'
import { analizar } from './expresion'
import { resolverLineal } from './matrices'
import { dormandPrince, interpolarHermite } from './numerico'

export const vel = (q: string) => q + "'"
export const acc = (q: string) => q + "''"
export const mom = (q: string) => 'p_' + q

export interface Sistema {
  coords: string[]
  L: E
  /** d/dt ∂L/∂q̇ᵢ − ∂L/∂qᵢ, simplificada */
  EL: E[]
  /** EL = M·q̈ − f */
  M: E[][]
  f: E[]
  /** pᵢ = ∂L/∂q̇ᵢ */
  p: E[]
  /** H = Σ q̇ᵢ pᵢ − L (en q, q̇) */
  H: E
  /** H(q, p) y las ecuaciones de Hamilton, si se pudieron despejar las velocidades */
  hamilton: { H: E; qd: E[]; pd: E[] } | null
  dependeDeT: boolean
  libres: string[]
}

export function leerLista(src: string): string[] {
  return src.split(/[,;\s]+/).map((x) => x.trim().toLowerCase()).filter(Boolean)
}

/** «m = 1, g = 9.8» → { m: 1, g: 9.8 } (valores numéricos o expresiones con pi). */
export function leerValores(src: string): Record<string, number> {
  const out: Record<string, number> = {}
  for (const trozo of src.split(/[,;]/)) {
    const t = trozo.trim()
    if (!t) continue
    const m = t.match(/^([A-Za-zα-ωΑ-Ω_][\w']*)\s*=\s*(.+)$/)
    if (!m) throw new Error(`«${t}»: se escribe nombre = valor`)
    const e = simplificar(desdeNodo(analizar(m[2], { variables: [] }), { funciones: {}, valores: {} }))
    const v = compilarE(e, [])(new Float64Array(0))
    if (!Number.isFinite(v)) throw new Error(`«${t}»: no es un número`)
    out[m[1].toLowerCase().replace(/[α-ω]/g, (c) => ({ θ: 'theta', φ: 'phi', α: 'alpha', β: 'beta', ω: 'omega' } as Record<string, string>)[c] ?? c)] = v
  }
  return out
}

function leerE(src: string, variables: string[]): E {
  return desdeNodo(analizar(src, { variables }), { funciones: {}, valores: {} })
}

/** `parametros`: nombres que hay que leer enteros (sin ellos, «mc» se partiría en m·c). */
export function analizarLagrangiano(coordsSrc: string, Lsrc: string, parametros: string[] = []): Sistema {
  const coords = leerLista(coordsSrc)
  if (!coords.length) throw new Error('faltan las coordenadas')
  if (coords.length > 4) throw new Error('como mucho cuatro coordenadas')
  const variables = [...coords, ...coords.map(vel), ...coords.map(acc), 't']
  const L = simplificar(leerE(Lsrc, [...variables, ...parametros]))
  const libres = [...simbolos(L)].filter((v) => !variables.includes(v) && v !== 'pi' && v !== 'e')
  // d/dt F(q, q̇, t) = Σ ∂F/∂qⱼ q̇ⱼ + Σ ∂F/∂q̇ⱼ q̈ⱼ + ∂F/∂t
  const ddt = (F: E) =>
    suma(
      ...coords.map((q) => prod(derivar(F, q), sim(vel(q)))),
      ...coords.map((q) => prod(derivar(F, vel(q)), sim(acc(q)))),
      derivar(F, 't'),
    )
  const p = coords.map((q) => simplificar(derivar(L, vel(q))))
  const EL = coords.map((q, i) => simplificar(suma(ddt(p[i]), prod(MENOS, derivar(L, q)))))
  const M = EL.map((ei) => coords.map((q) => simplificar(derivar(ei, acc(q)))))
  if (M.flat().some((m) => coords.some((q) => contiene(m, acc(q)))))
    throw new Error('las ecuaciones no son lineales en las aceleraciones (¿L no es cuadrático en las velocidades?)')
  const f = EL.map((ei) => {
    let x = ei
    for (const q of coords) x = sustituir(x, sim(acc(q)), CERO)
    return simplificar(prod(MENOS, x))
  })
  const H = simplificar(suma(...coords.map((q, i) => prod(sim(vel(q)), p[i])), prod(MENOS, L)))
  let hamilton: Sistema['hamilton'] = null
  try {
    // pᵢ − ∂L/∂q̇ᵢ = 0 es lineal en las velocidades cuando L es cuadrático en ellas
    const ecs = coords.map((q, i) => suma(sim(mom(q)), prod(MENOS, p[i])))
    const sol = resolverSistema(ecs, coords.map(vel))
    if (sol.tipo === 'unica') {
      let Hq = H
      coords.forEach((q, i) => (Hq = sustituir(Hq, sim(vel(q)), sol.valores[i])))
      Hq = simplificar(Hq)
      hamilton = {
        H: Hq,
        qd: coords.map((q) => simplificar(derivar(Hq, mom(q)))),
        pd: coords.map((q) => simplificar(prod(MENOS, derivar(Hq, q)))),
      }
    }
  } catch {
    hamilton = null
  }
  return { coords, L, EL, M, f, p, H, hamilton, dependeDeT: contiene(L, 't'), libres }
}

export interface Numerico {
  n: number
  /** y = (q, q̇) ↦ y′ = (q̇, q̈) */
  campo: (t: number, y: number[]) => number[]
  energia: (y: number[], t?: number) => number
  aceleraciones: (y: number[], t?: number) => number[]
}

export function numerico(sis: Sistema, params: Record<string, number>): Numerico {
  const faltan = sis.libres.filter((v) => !(v in params))
  if (faltan.length) throw new Error(`falta el valor de: ${faltan.join(', ')}`)
  const n = sis.coords.length
  const vars = [...sis.coords, ...sis.coords.map(vel), 't']
  const Mc = sis.M.map((fila) => fila.map((m) => compilarE(m, vars, params)))
  const fc = sis.f.map((x) => compilarE(x, vars, params))
  const Hc = compilarE(sis.H, vars, params)
  const buf = new Float64Array(2 * n + 1)
  const cargar = (y: number[], t: number) => {
    for (let i = 0; i < 2 * n; i++) buf[i] = y[i]
    buf[2 * n] = t
  }
  const aceleraciones = (y: number[], t = 0) => {
    cargar(y, t)
    const M = Mc.map((fila) => fila.map((m) => m(buf)))
    const b = fc.map((x) => x(buf))
    const qdd = resolverLineal(M, b)
    if (!qdd) throw new Error('la matriz de masas es singular en este estado')
    return qdd
  }
  return {
    n,
    aceleraciones,
    campo: (t, y) => [...y.slice(n), ...aceleraciones(y, t)],
    energia: (y, t = 0) => {
      cargar(y, t)
      return Hc(buf)
    },
  }
}

export interface Trayectoria {
  t: number[]
  y: number[][]
  dy: number[][]
  parada?: string
}

export function integrar(num: Numerico, y0: number[], tMax: number, tol = 1e-11): Trayectoria {
  return dormandPrince(num.campo, 0, y0, tMax, tol, 400000)
}

export const estadoEn = (tr: Trayectoria, t: number) => interpolarHermite(tr, t)

/** Instantes en que g(y) cruza 0 subiendo, refinados por bisección sobre la interpolación. */
export function cruces(tr: Trayectoria, g: (y: number[]) => number): number[] {
  const out: number[] = []
  for (let k = 1; k < tr.t.length; k++) {
    const a = g(tr.y[k - 1])
    const b = g(tr.y[k])
    if (a < 0 && b >= 0) {
      let lo = tr.t[k - 1]
      let hi = tr.t[k]
      for (let i = 0; i < 80; i++) {
        const m = (lo + hi) / 2
        if (g(estadoEn(tr, m)) < 0) lo = m
        else hi = m
      }
      out.push((lo + hi) / 2)
    }
  }
  return out
}

/** Periodo medido para un grado de libertad: tiempo entre pasos sucesivos de q̇ por 0 hacia arriba. */
export function periodo(tr: Trayectoria, n: number): number | null {
  const c = cruces(tr, (y) => y[n])
  if (c.length < 2) return null
  return (c[c.length - 1] - c[0]) / (c.length - 1)
}

/** Sección de Poincaré: (q₁, q̇₁) cada vez que q₂ pasa por 0 (módulo 2π si es un ángulo) con q̇₂ > 0. */
export function poincare(tr: Trayectoria, n: number, angulo: boolean): Array<[number, number]> {
  const red = (x: number) => (angulo ? x - 2 * Math.PI * Math.round(x / (2 * Math.PI)) : x)
  const out: Array<[number, number]> = []
  for (let k = 1; k < tr.t.length; k++) {
    const a = red(tr.y[k - 1][1])
    const b = red(tr.y[k][1])
    if (a < 0 && b >= 0 && b - a < Math.PI && tr.y[k][n + 1] > 0) {
      let lo = tr.t[k - 1]
      let hi = tr.t[k]
      for (let i = 0; i < 60; i++) {
        const m = (lo + hi) / 2
        if (red(estadoEn(tr, m)[1]) < 0) lo = m
        else hi = m
      }
      const y = estadoEn(tr, (lo + hi) / 2)
      out.push([red(y[0]), y[n]])
    }
  }
  return out
}

/** «(x₁, y₁); (x₂, y₂)» → funciones de posición de cada cuerpo. */
export function leerPuntos(src: string, coords: string[], params: Record<string, number>): Array<(y: number[]) => [number, number]> {
  const vars = coords
  const conocidas = [...coords, ...Object.keys(params)]
  const out: Array<(y: number[]) => [number, number]> = []
  for (const trozo of src.split(';')) {
    const t = trozo.trim()
    if (!t) continue
    const dentro = t.replace(/^\(/, '').replace(/\)$/, '')
    // coma de primer nivel
    let prof = 0
    let corte = -1
    for (let i = 0; i < dentro.length; i++) {
      if (dentro[i] === '(') prof++
      else if (dentro[i] === ')') prof--
      else if (dentro[i] === ',' && prof === 0) {
        corte = i
        break
      }
    }
    if (corte < 0) throw new Error(`«${t}»: un punto se escribe (x, y)`)
    const fx = compilarE(simplificar(leerE(dentro.slice(0, corte), conocidas)), vars, params)
    const fy = compilarE(simplificar(leerE(dentro.slice(corte + 1), conocidas)), vars, params)
    const buf = new Float64Array(vars.length)
    out.push((y) => {
      for (let i = 0; i < vars.length; i++) buf[i] = y[i]
      return [fx(buf), fy(buf)]
    })
  }
  return out
}
