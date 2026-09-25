/**
 * Operadores diferenciales de campos en ℝ³: gradiente, divergencia, rotacional, laplaciano y
 * derivada direccional. Numéricos por diferencias centrales (para campos que solo se pueden
 * evaluar) y simbólicos con el CAS (para los que se escriben).
 */
import { desdeNodo, suma, type E } from './cas/expr'
import { derivar } from './cas/derivar'
import { simplificar } from './cas/algebra'
import { compilarE } from './cas/compilar'
import { analizar } from './expresion'

export type V3 = [number, number, number]
export type Escalar = (x: number, y: number, z: number) => number
export type Vectorial = (x: number, y: number, z: number) => number[]

const H = 1e-4

/** ∂f/∂xᵢ en p por diferencias centrales. */
function parcial(f: Escalar, p: number[], i: number, h = H): number {
  const a = p.slice()
  const b = p.slice()
  a[i] += h
  b[i] -= h
  return (f(a[0], a[1], a[2]) - f(b[0], b[1], b[2])) / (2 * h)
}

export function gradiente(f: Escalar, p: number[], h = H): V3 {
  return [parcial(f, p, 0, h), parcial(f, p, 1, h), parcial(f, p, 2, h)]
}

/** Jacobiana J[k][i] = ∂Fₖ/∂xᵢ. */
export function jacobiana(F: Vectorial, p: number[], h = H): number[][] {
  return [0, 1, 2].map((k) => [0, 1, 2].map((i) => parcial((x, y, z) => F(x, y, z)[k], p, i, h)))
}

export function divergencia(F: Vectorial, p: number[], h = H): number {
  const J = jacobiana(F, p, h)
  return J[0][0] + J[1][1] + J[2][2]
}

export function rotacional(F: Vectorial, p: number[], h = H): V3 {
  const J = jacobiana(F, p, h)
  return [J[2][1] - J[1][2], J[0][2] - J[2][0], J[1][0] - J[0][1]]
}

/** ∇²f = Σ ∂²f/∂xᵢ², con la diferencia centrada de segundo orden. */
export function laplaciano(f: Escalar, p: number[], h = 1e-3): number {
  const c = f(p[0], p[1], p[2])
  let s = 0
  for (let i = 0; i < 3; i++) {
    const a = p.slice()
    const b = p.slice()
    a[i] += h
    b[i] -= h
    s += (f(a[0], a[1], a[2]) - 2 * c + f(b[0], b[1], b[2])) / (h * h)
  }
  return s
}

export const norma = (v: ArrayLike<number>) => Math.hypot(...Array.from(v))

/** Derivada de f en p en la dirección de u (se normaliza): ∇f · û. */
export function derivadaDireccional(f: Escalar, p: number[], u: number[]): number {
  const n = norma(u)
  if (n < 1e-12) return NaN
  const g = gradiente(f, p)
  return (g[0] * u[0] + g[1] * u[1] + g[2] * u[2]) / n
}

/* ---------------------------------------------------------------- simbólico */

export interface EscalarSimbolico {
  phi: E
  grad: [E, E, E]
  lap: E
  /** Evaluadores compilados. */
  f: Escalar
  F: (x: number, y: number, z: number) => V3
  L: Escalar
}

/** φ escrita → φ, ∇φ y ∇²φ simbólicos (con el CAS) y compilados. */
export function escalarSimbolico(src: string): EscalarSimbolico {
  const phi = simplificar(desdeNodo(analizar(src, { variables: ['x', 'y', 'z'] }), { funciones: {}, valores: {} }))
  const grad = (['x', 'y', 'z'] as const).map((v) => simplificar(derivar(phi, v))) as [E, E, E]
  const lap = simplificar(suma(...(['x', 'y', 'z'] as const).map((v, i) => derivar(grad[i], v))))
  const vars = ['x', 'y', 'z']
  const c = (e: E) => {
    const g = compilarE(e, vars)
    const buf = new Float64Array(3)
    return (x: number, y: number, z: number) => {
      buf[0] = x
      buf[1] = y
      buf[2] = z
      return g(buf)
    }
  }
  const f = c(phi)
  const gs = grad.map(c)
  const L = c(lap)
  return { phi, grad, lap, f, F: (x, y, z) => [gs[0](x, y, z), gs[1](x, y, z), gs[2](x, y, z)], L }
}
