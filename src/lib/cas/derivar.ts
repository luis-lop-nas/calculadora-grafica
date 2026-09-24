import { CERO, contiene, DOS, fn, MEDIO, MENOS, NEPER, PI, pot, prod, q, suma, UNO, type E } from './expr'

/** Derivada de la función de una variable `u` respecto de su argumento. */
function exterior(v: string, u: E): E {
  const uu = pot(u, DOS)
  switch (v) {
    case 'sin':
      return fn('cos', [u])
    case 'cos':
      return prod(MENOS, fn('sin', [u]))
    case 'tan':
      return pot(fn('cos', [u]), q(-2))
    case 'asin':
      return pot(suma(UNO, prod(MENOS, uu)), q(-1, 2))
    case 'acos':
      return prod(MENOS, pot(suma(UNO, prod(MENOS, uu)), q(-1, 2)))
    case 'atan':
      return pot(suma(UNO, uu), MENOS)
    case 'sinh':
      return fn('cosh', [u])
    case 'cosh':
      return fn('sinh', [u])
    case 'tanh':
      return pot(fn('cosh', [u]), q(-2))
    case 'asinh':
      return pot(suma(uu, UNO), q(-1, 2))
    case 'acosh':
      return pot(suma(uu, MENOS), q(-1, 2))
    case 'atanh':
      return pot(suma(UNO, prod(MENOS, uu)), MENOS)
    case 'ln':
      return pot(u, MENOS)
    case 'abs':
      return prod(u, pot(fn('abs', [u]), MENOS))
    case 'sign':
      return CERO
    // en el sentido de las distribuciones: H′ = δ
    case 'heaviside':
      return fn('delta', [u])
    case 'erf':
      return prod(DOS, pot(PI, prod(MENOS, MEDIO)), pot(NEPER, prod(MENOS, uu)))
    default:
      throw new Error(`no sé derivar ${v}`)
  }
}

export function derivar(e: E, x: string): E {
  if (!contiene(e, x)) return CERO
  switch (e.t) {
    case 's':
      return UNO
    case '+':
      return suma(...e.a.map((t) => derivar(t, x)))
    case '*':
      // Leibniz para n factores
      return suma(...e.a.map((f, i) => prod(derivar(f, x), ...e.a.filter((_, j) => j !== i))))
    case '^': {
      const enBase = contiene(e.b, x)
      const enExp = contiene(e.e, x)
      if (!enExp) return prod(e.e, pot(e.b, suma(e.e, MENOS)), derivar(e.b, x))
      if (!enBase) return prod(e, fn('ln', [e.b]), derivar(e.e, x))
      // f^g = e^(g·ln f)
      return prod(e, suma(prod(derivar(e.e, x), fn('ln', [e.b])), prod(e.e, derivar(e.b, x), pot(e.b, MENOS))))
    }
    case 'fn': {
      if (e.a.length !== 1) throw new Error(`no sé derivar ${e.v}`)
      return prod(exterior(e.v, e.a[0]), derivar(e.a[0], x))
    }
    default:
      return CERO
  }
}

export function derivarN(e: E, x: string, n: number): E {
  let d = e
  for (let k = 0; k < n; k++) d = derivar(d, x)
  return d
}
