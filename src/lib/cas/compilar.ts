/**
 * Compila una expresión del CAS a un cierre numérico rápido: para integrar ecuaciones que salieron
 * del cálculo simbólico (Euler–Lagrange, geodésicas) sin recorrer el árbol en cada paso.
 */
import type { E } from './expr'

type F = (v: Float64Array) => number

const UNARIAS: Record<string, (x: number) => number> = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan,
  sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh, asinh: Math.asinh, acosh: Math.acosh, atanh: Math.atanh,
  ln: Math.log, abs: Math.abs, sign: Math.sign, floor: Math.floor, ceil: Math.ceil, round: Math.round,
  heaviside: (x) => (x > 0 ? 1 : x < 0 ? 0 : 0.5),
}

/**
 * `variables` da la posición de cada símbolo en el vector de entrada; `valores` fija el resto
 * (parámetros). Un símbolo que no esté en ninguno de los dos es un error.
 */
export function compilarE(e: E, variables: string[], valores: Record<string, number> = {}): F {
  const indice = new Map(variables.map((v, i) => [v, i]))
  const c = (x: E): F => {
    switch (x.t) {
      case 'q': {
        const v = Number(x.n) / Number(x.d)
        return () => v
      }
      case 'f': {
        const v = x.v
        return () => v
      }
      case 's': {
        const i = indice.get(x.v)
        if (i !== undefined) return (a) => a[i]
        if (x.v === 'pi') return () => Math.PI
        if (x.v === 'e') return () => Math.E
        if (x.v in valores) {
          const v = valores[x.v]
          return () => v
        }
        throw new Error(`falta el valor de «${x.v}»`)
      }
      case '+': {
        const fs = x.a.map(c)
        return (a) => {
          let s = 0
          for (const f of fs) s += f(a)
          return s
        }
      }
      case '*': {
        const fs = x.a.map(c)
        return (a) => {
          let s = 1
          for (const f of fs) s *= f(a)
          return s
        }
      }
      case '^': {
        const b = c(x.b)
        if (x.e.t === 'q' && x.e.d === 1n) {
          const n = Number(x.e.n)
          if (n === 2) return (a) => {
            const v = b(a)
            return v * v
          }
          if (n === -1) return (a) => 1 / b(a)
          return (a) => b(a) ** n
        }
        if (x.e.t === 'q' && x.e.n === 1n && x.e.d === 2n) return (a) => Math.sqrt(b(a))
        if (x.b.t === 's' && x.b.v === 'e') {
          const k = c(x.e)
          return (a) => Math.exp(k(a))
        }
        const k = c(x.e)
        return (a) => b(a) ** k(a)
      }
      case 'fn': {
        const g = UNARIAS[x.v]
        if (!g || x.a.length !== 1) throw new Error(`no sé evaluar ${x.v}`)
        const u = c(x.a[0])
        return (a) => g(u(a))
      }
    }
  }
  return c(e)
}
