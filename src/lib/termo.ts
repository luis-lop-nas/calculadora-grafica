/**
 * Termodinámica: ciclos de gas ideal (Carnot, Otto, Diesel, Brayton, Stirling) con los cuatro
 * procesos cerrados, y el gas de van der Waals en variables reducidas con la construcción de
 * Maxwell.
 *
 * Unidades de los ciclos: P en kPa, V en L, T en K; así P·V sale en J y nR en J/K.
 */

export const R = 8.314462618

/* ═══════════ gas ideal ═══════════ */

export interface Gas {
  n: number
  gamma: number
}

export const cv = (g: Gas) => R / (g.gamma - 1)
export const cp = (g: Gas) => (g.gamma * R) / (g.gamma - 1)

export interface Estado {
  P: number
  V: number
  T: number
}

export type Proceso = 'isoterma' | 'adiabatica' | 'isobara' | 'isocora'

export interface Tramo {
  de: number
  a: number
  tipo: Proceso
}

export type TipoCiclo = 'carnot' | 'otto' | 'diesel' | 'brayton' | 'stirling'

/**
 * Parámetros comunes: el estado 1 (V₁, P₁) y dos números cuyo sentido depende del ciclo.
 *   carnot   a = V₂/V₁ (expansión isoterma)   b = T_c/T_h
 *   otto     a = r = V₁/V₂                    b = T₃/T₂ (calentamiento isócoro)
 *   diesel   a = r = V₁/V₂                    b = r_c = V₃/V₂ (corte)
 *   brayton  a = r_p = P₂/P₁                  b = T₃/T₂ (calentamiento isóbaro)
 *   stirling a = r = V₁/V₂                    b = T_h/T_c
 */
export interface ParamCiclo {
  tipo: TipoCiclo
  V1: number
  P1: number
  a: number
  b: number
  /** Solo Stirling: el regenerador devuelve el calor de la isócora fría a la caliente. */
  regenerador?: boolean
}

const estado = (g: Gas, V: number, T: number): Estado => ({ V, T, P: (g.n * R * T) / V })

export interface Ciclo {
  estados: Estado[]
  tramos: Tramo[]
}

export function ciclo(g: Gas, p: ParamCiclo): Ciclo {
  const k = g.gamma - 1
  const T1 = (p.P1 * p.V1) / (g.n * R)
  const s1 = estado(g, p.V1, T1)
  const tr = (...tipos: Proceso[]): Tramo[] => tipos.map((tipo, i) => ({ de: i, a: (i + 1) % 4, tipo }))
  switch (p.tipo) {
    case 'carnot': {
      const V2 = p.a * p.V1
      const Tc = p.b * T1
      const f = (T1 / Tc) ** (1 / k)
      return {
        estados: [s1, estado(g, V2, T1), estado(g, V2 * f, Tc), estado(g, p.V1 * f, Tc)],
        tramos: tr('isoterma', 'adiabatica', 'isoterma', 'adiabatica'),
      }
    }
    case 'otto': {
      const V2 = p.V1 / p.a
      const T2 = T1 * p.a ** k
      const T3 = p.b * T2
      return {
        estados: [s1, estado(g, V2, T2), estado(g, V2, T3), estado(g, p.V1, T3 * p.a ** -k)],
        tramos: tr('adiabatica', 'isocora', 'adiabatica', 'isocora'),
      }
    }
    case 'diesel': {
      const V2 = p.V1 / p.a
      const T2 = T1 * p.a ** k
      const V3 = p.b * V2
      const T3 = p.b * T2
      return {
        estados: [s1, estado(g, V2, T2), estado(g, V3, T3), estado(g, p.V1, T3 * (V3 / p.V1) ** k)],
        tramos: tr('adiabatica', 'isobara', 'adiabatica', 'isocora'),
      }
    }
    case 'brayton': {
      const e = k / g.gamma
      const T2 = T1 * p.a ** e
      const P2 = p.a * p.P1
      const T3 = p.b * T2
      const T4 = T3 * p.a ** -e
      const nR = g.n * R
      return {
        estados: [s1, { P: P2, T: T2, V: (nR * T2) / P2 }, { P: P2, T: T3, V: (nR * T3) / P2 }, { P: p.P1, T: T4, V: (nR * T4) / p.P1 }],
        tramos: tr('adiabatica', 'isobara', 'adiabatica', 'isobara'),
      }
    }
    case 'stirling': {
      const V2 = p.V1 / p.a
      const Th = p.b * T1
      return {
        estados: [s1, estado(g, V2, T1), estado(g, V2, Th), estado(g, p.V1, Th)],
        tramos: tr('isoterma', 'isocora', 'isoterma', 'isocora'),
      }
    }
  }
}

export interface Balance {
  Q: number
  W: number
  dU: number
  dS: number
}

/** Primer principio tramo a tramo, con las fórmulas cerradas de cada proceso. */
export function balance(g: Gas, A: Estado, B: Estado, tipo: Proceso): Balance {
  const dU = g.n * cv(g) * (B.T - A.T)
  const dS = g.n * cv(g) * Math.log(B.T / A.T) + g.n * R * Math.log(B.V / A.V)
  let W = 0
  if (tipo === 'isoterma') W = g.n * R * A.T * Math.log(B.V / A.V)
  else if (tipo === 'adiabatica') W = -dU
  else if (tipo === 'isobara') W = A.P * (B.V - A.V)
  return { Q: dU + W, W, dU, dS }
}

/** Entropía respecto del estado de referencia (V₀, T₀). */
export const entropia = (g: Gas, V: number, T: number, V0: number, T0: number) =>
  g.n * cv(g) * Math.log(T / T0) + g.n * R * Math.log(V / V0)

/** Puntos del proceso de A a B (incluidos), recorriendo la ley del proceso. */
export function camino(g: Gas, A: Estado, B: Estado, tipo: Proceso, N = 120): Estado[] {
  const pts: Estado[] = []
  const k = g.gamma - 1
  for (let i = 0; i <= N; i++) {
    const u = i / N
    if (tipo === 'isocora') {
      pts.push(estado(g, A.V, A.T + u * (B.T - A.T)))
    } else if (tipo === 'isobara') {
      const V = A.V + u * (B.V - A.V)
      pts.push({ P: A.P, V, T: (A.P * V) / (g.n * R) })
    } else {
      const V = A.V * (B.V / A.V) ** u
      pts.push(estado(g, V, tipo === 'isoterma' ? A.T : A.T * (A.V / V) ** k))
    }
  }
  return pts
}

export interface Resumen {
  tramos: Array<Balance & Tramo>
  W: number
  Qabs: number
  Qced: number
  eta: number
  Tmax: number
  Tmin: number
}

/**
 * Trabajo neto, calor absorbido y rendimiento. Con regenerador (Stirling) el calor de la isócora
 * de calentamiento lo pone el propio gas al enfriarse en la otra, así que no cuenta como absorbido.
 */
export function resumen(g: Gas, p: ParamCiclo): Resumen {
  const c = ciclo(g, p)
  const tramos = c.tramos.map((t) => ({ ...t, ...balance(g, c.estados[t.de], c.estados[t.a], t.tipo) }))
  const W = tramos.reduce((s, t) => s + t.W, 0)
  const regen = p.tipo === 'stirling' && p.regenerador
  let Qabs = 0
  let Qced = 0
  for (const t of tramos) {
    if (regen && t.tipo === 'isocora') continue
    if (t.Q > 0) Qabs += t.Q
    else Qced -= t.Q
  }
  const Ts = c.estados.map((e) => e.T)
  return { tramos, W, Qabs, Qced, eta: W / Qabs, Tmax: Math.max(...Ts), Tmin: Math.min(...Ts) }
}

/** Rendimiento de libro para cada ciclo (lo que el trazado debe reproducir). */
export function rendimientoTeorico(g: Gas, p: ParamCiclo): number {
  const G = g.gamma
  switch (p.tipo) {
    case 'carnot':
      return 1 - p.b
    case 'otto':
      return 1 - p.a ** (1 - G)
    case 'diesel':
      return 1 - (p.a ** (1 - G) * (p.b ** G - 1)) / (G * (p.b - 1))
    case 'brayton':
      return 1 - p.a ** ((1 - G) / G)
    case 'stirling': {
      if (p.regenerador) return 1 - 1 / p.b
      const lr = Math.log(p.a)
      // por unidad de nT_c: W = R(b − 1) ln r, Q = C_v(b − 1) + R b ln r
      return (R * (p.b - 1) * lr) / (cv(g) * (p.b - 1) + R * p.b * lr)
    }
  }
}

/* ═══════════ van der Waals en variables reducidas ═══════════ */

/** p = 8T/(3v − 1) − 3/v², con p, v, T divididos por sus valores críticos. */
export const pVdW = (v: number, T: number) => (8 * T) / (3 * v - 1) - 3 / (v * v)

/** La temperatura de la isoterma que pasa por (v, p). */
export const TVdW = (v: number, p: number) => ((p + 3 / (v * v)) * (3 * v - 1)) / 8

/** ∫ p dv entre v₁ y v₂ a T fija. */
export const integralVdW = (v1: number, v2: number, T: number) =>
  ((8 * T) / 3) * Math.log((3 * v2 - 1) / (3 * v1 - 1)) + 3 * (1 / v2 - 1 / v1)

/** Energía libre de Gibbs por mol, reducida y salvo una función de T: g = f + pv, f = −(8T/3) ln(3v − 1) − 3/v. */
export const gibbsVdW = (v: number, T: number) => -((8 * T) / 3) * Math.log(3 * v - 1) - 3 / v + pVdW(v, T) * v

/** Raíces reales de a x³ + b x² + c x + d (ordenadas). */
export function cubica(a: number, b: number, c: number, d: number): number[] {
  const B = b / a
  const C = c / a
  const D = d / a
  const q = (3 * C - B * B) / 9
  const r = (9 * B * C - 27 * D - 2 * B * B * B) / 54
  const disc = q * q * q + r * r
  const s = -B / 3
  if (disc > 0) {
    const sq = Math.sqrt(disc)
    return [s + Math.cbrt(r + sq) + Math.cbrt(r - sq)]
  }
  const th = Math.acos(Math.max(-1, Math.min(1, r / Math.sqrt(-q * q * q))))
  const m = 2 * Math.sqrt(-q)
  return [0, 1, 2].map((k) => s + m * Math.cos((th + 2 * Math.PI * k) / 3)).sort((x, y) => x - y)
}

/** Volúmenes donde la isoterma corta la presión p (solo v > 1/3). */
export const volumenesVdW = (p: number, T: number) => cubica(3 * p, -(p + 8 * T), 9, -3).filter((v) => v > 1 / 3)

/** Espinodal: extremos de la isoterma, raíces de 4T v³ − 9v² + 6v − 1 = 0 (dp/dv = 0). */
export function espinodal(T: number): [number, number] | null {
  if (T >= 1) return null
  const r = cubica(4 * T, -9, 6, -1).filter((v) => v > 1 / 3)
  return r.length >= 2 ? [r[0], r[r.length - 1]] : null
}

export interface Coexistencia {
  p: number
  vl: number
  vg: number
}

/** Construcción de Maxwell: la p que iguala las dos áreas entre la recta y la isoterma. */
export function maxwell(T: number): Coexistencia | null {
  const sp = espinodal(T)
  if (!sp) return null
  let lo = Math.max(pVdW(sp[0], T), 1e-12)
  let hi = pVdW(sp[1], T)
  const f = (p: number) => {
    const vs = volumenesVdW(p, T)
    const vl = vs[0]
    const vg = vs[vs.length - 1]
    return { d: integralVdW(vl, vg, T) - p * (vg - vl), vl, vg }
  }
  // d > 0 si la recta está baja; d decrece al subir p
  for (let i = 0; i < 200; i++) {
    const m = (lo + hi) / 2
    if (f(m).d > 0) lo = m
    else hi = m
  }
  const p = (lo + hi) / 2
  const { vl, vg } = f(p)
  return { p, vl, vg }
}

export type Fase = 'punto crítico' | 'líquido' | 'gas' | 'fluido supercrítico' | 'líquido sobrecalentado (metaestable)' | 'vapor subenfriado (metaestable)' | 'inestable (dp/dv > 0)'

export function fase(v: number, T: number): Fase {
  if (Math.abs(T - 1) < 1e-3 && Math.abs(v - 1) < 1e-2) return 'punto crítico'
  if (T >= 1) return pVdW(v, T) >= 1 ? 'fluido supercrítico' : 'gas'
  const c = maxwell(T)!
  const sp = espinodal(T)!
  if (v <= c.vl) return 'líquido'
  if (v >= c.vg) return 'gas'
  if (v > sp[0] && v < sp[1]) return 'inestable (dp/dv > 0)'
  return v <= sp[0] ? 'líquido sobrecalentado (metaestable)' : 'vapor subenfriado (metaestable)'
}

export interface Sustancia {
  nombre: string
  /** a en Pa·m⁶/mol², b en m³/mol. */
  a: number
  b: number
}

export const SUSTANCIAS: Sustancia[] = [
  { nombre: 'CO₂', a: 0.364, b: 4.267e-5 },
  { nombre: 'H₂O', a: 0.5536, b: 3.049e-5 },
  { nombre: 'N₂', a: 0.137, b: 3.87e-5 },
  { nombre: 'Ar', a: 0.1355, b: 3.2e-5 },
  { nombre: 'He', a: 0.00346, b: 2.38e-5 },
]

/** Punto crítico de van der Waals: T_c = 8a/27Rb, p_c = a/27b², v_c = 3b. */
export const critico = (s: Sustancia) => ({ T: (8 * s.a) / (27 * R * s.b), p: s.a / (27 * s.b * s.b), v: 3 * s.b })
