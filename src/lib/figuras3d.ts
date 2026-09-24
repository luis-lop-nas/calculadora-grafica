/**
 * Figuras en alambre para deformar con una aplicación lineal: cada una es una
 * lista de polilíneas (meridianos, paralelos, aristas) que caben en [−1, 1]³,
 * para que se vean todas igual que el cubo.
 */

export type P3 = [number, number, number]
export type Polilinea = P3[]

const TAU = 2 * Math.PI

/** Curvas u = cte y v = cte de una superficie paramétrica r(u, v). */
function malla(r: (u: number, v: number) => P3, [u0, u1]: [number, number], [v0, v1]: [number, number], nu: number, nv: number, pasos = 72): Polilinea[] {
  const out: Polilinea[] = []
  for (let i = 0; i <= nu; i++) {
    const u = u0 + ((u1 - u0) * i) / nu
    out.push(Array.from({ length: pasos + 1 }, (_, k) => r(u, v0 + ((v1 - v0) * k) / pasos)))
  }
  for (let j = 0; j <= nv; j++) {
    const v = v0 + ((v1 - v0) * j) / nv
    out.push(Array.from({ length: pasos + 1 }, (_, k) => r(u0 + ((u1 - u0) * k) / pasos, v)))
  }
  return out
}

/** Aristas de un poliedro: los pares de vértices a la distancia mínima, escalado para que quepa en la esfera unidad. */
function poliedro(V: P3[]): Polilinea[] {
  const d = (a: P3, b: P3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
  const R = Math.max(...V.map((v) => Math.hypot(...v)))
  const W = V.map((v) => v.map((c) => c / R) as P3)
  let min = Infinity
  for (let i = 0; i < W.length; i++) for (let j = i + 1; j < W.length; j++) min = Math.min(min, d(W[i], W[j]))
  const out: Polilinea[] = []
  for (let i = 0; i < W.length; i++) for (let j = i + 1; j < W.length; j++) if (Math.abs(d(W[i], W[j]) - min) < 1e-6) out.push([W[i], W[j]])
  return out
}

const signos = (vs: number[][]): P3[] => {
  const out: P3[] = []
  for (const v of vs)
    for (const sx of v[0] ? [1, -1] : [1])
      for (const sy of v[1] ? [1, -1] : [1])
        for (const sz of v[2] ? [1, -1] : [1]) out.push([sx * v[0], sy * v[1], sz * v[2]])
  return out
}
/** Permutaciones cíclicas de (a, b, c). */
const ciclicas = (a: number, b: number, c: number) => [[a, b, c], [b, c, a], [c, a, b]]
const phi = (1 + Math.sqrt(5)) / 2

function curva(r: (t: number) => P3, t0: number, t1: number, pasos = 600): Polilinea[] {
  return [Array.from({ length: pasos + 1 }, (_, k) => r(t0 + ((t1 - t0) * k) / pasos))]
}

export const FIGURAS = {
  cubo: { t: 'Cubo', lineas: () => poliedro(signos([[1, 1, 1]])) },
  esfera: {
    t: 'Esfera',
    lineas: () => malla((u, v) => [Math.sin(u) * Math.cos(v), Math.sin(u) * Math.sin(v), Math.cos(u)], [0, Math.PI], [0, TAU], 12, 16),
  },
  rejilla: {
    t: 'Rejilla (plano z = 0)',
    lineas: () => malla((u, v) => [u, v, 0], [-1, 1], [-1, 1], 8, 8, 2),
  },
  toro: {
    t: 'Toro',
    lineas: () => {
      const [R, r] = [0.68, 0.3]
      return malla((u, v) => [(R + r * Math.cos(v)) * Math.cos(u), (R + r * Math.cos(v)) * Math.sin(u), r * Math.sin(v)], [0, TAU], [0, TAU], 24, 10)
    },
  },
  helice: {
    t: 'Hélice (espira)',
    lineas: () => curva((t) => [0.8 * Math.cos(t), 0.8 * Math.sin(t), t / (4 * Math.PI) - 1], 0, 8 * Math.PI, 900),
  },
  espiral: {
    t: 'Espiral cónica',
    lineas: () => curva((t) => [(1 - t / (10 * Math.PI)) * Math.cos(t), (1 - t / (10 * Math.PI)) * Math.sin(t), t / (5 * Math.PI) - 1], 0, 10 * Math.PI, 1000),
  },
  nudo: {
    t: 'Nudo de trébol',
    lineas: () => curva((t) => [(Math.sin(t) + 2 * Math.sin(2 * t)) / 3, (Math.cos(t) - 2 * Math.cos(2 * t)) / 3, -Math.sin(3 * t) / 3], 0, TAU, 700),
  },
  mobius: {
    t: 'Banda de Möbius',
    lineas: () => malla((u, v) => [(0.7 + v * Math.cos(u / 2)) * Math.cos(u), (0.7 + v * Math.cos(u / 2)) * Math.sin(u), v * Math.sin(u / 2)], [0, TAU], [-0.3, 0.3], 30, 4, 96),
  },
  cilindro: {
    t: 'Cilindro',
    lineas: () => malla((u, v) => [0.8 * Math.cos(u), 0.8 * Math.sin(u), v], [0, TAU], [-1, 1], 16, 6, 72),
  },
  cono: {
    t: 'Cono',
    lineas: () => malla((u, v) => [((1 - v) / 2) * 0.9 * Math.cos(u), ((1 - v) / 2) * 0.9 * Math.sin(u), v], [0, TAU], [-1, 1], 16, 6, 72),
  },
  hiperboloide: {
    t: 'Hiperboloide de una hoja (reglado)',
    lineas: () => {
      // sus dos familias de rectas: cada punto de la circunferencia de abajo va al de arriba girado ±α
      const [a, alfa] = [0.85, (2 * Math.PI) / 3]
      const out: Polilinea[] = []
      for (let k = 0; k < 20; k++) {
        const th = (TAU * k) / 20
        for (const s of [1, -1]) out.push([[a * Math.cos(th), a * Math.sin(th), -1], [a * Math.cos(th + s * alfa), a * Math.sin(th + s * alfa), 1]])
      }
      // las dos circunferencias de los bordes
      for (const z of [-1, 1]) out.push(Array.from({ length: 97 }, (_, k): P3 => [a * Math.cos((TAU * k) / 96), a * Math.sin((TAU * k) / 96), z]))
      return out
    },
  },
  silla: {
    t: 'Silla (paraboloide hiperbólico)',
    lineas: () => malla((u, v) => [u, v, u * u - v * v], [-1, 1], [-1, 1], 10, 10, 40),
  },
  tetraedro: { t: 'Tetraedro', lineas: () => poliedro([[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]]) },
  octaedro: { t: 'Octaedro', lineas: () => poliedro(signos([[1, 0, 0], [0, 1, 0], [0, 0, 1]])) },
  icosaedro: { t: 'Icosaedro', lineas: () => poliedro(signos(ciclicas(0, 1, phi))) },
  dodecaedro: { t: 'Dodecaedro', lineas: () => poliedro([...signos([[1, 1, 1]]), ...signos(ciclicas(0, 1 / phi, phi))]) },
} satisfies Record<string, { t: string; lineas: () => Polilinea[] }>

export type Figura = keyof typeof FIGURAS

const guardadas = new Map<Figura, Polilinea[]>()
export function lineasDe(f: Figura): Polilinea[] {
  let l = guardadas.get(f)
  if (!l) {
    l = (FIGURAS[f] ?? FIGURAS.cubo).lineas()
    guardadas.set(f, l)
  }
  return l
}
