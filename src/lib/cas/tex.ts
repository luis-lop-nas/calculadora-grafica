import { esNum, MENOS, negativo, pot, prod, simbolos, valor, type E, type Num } from './expr'

/**
 * LaTeX de una expresión canónica, escrita como en papel: términos de mayor a
 * menor grado, restas en vez de «+ (−1)·», fracciones con numerador y
 * denominador, raíces con √ y sin²x en vez de (sin x)².
 */

const GRIEGAS = new Set(['alpha', 'beta', 'delta', 'epsilon', 'eta', 'theta', 'kappa', 'lambda', 'mu', 'nu', 'xi', 'rho', 'sigma', 'omega', 'psi', 'chi', 'tau'])

const FUNCIONES: Record<string, string> = {
  sin: '\\sin', cos: '\\cos', tan: '\\tan', asin: '\\arcsin', acos: '\\arccos', atan: '\\arctan',
  sinh: '\\sinh', cosh: '\\cosh', tanh: '\\tanh', asinh: '\\operatorname{arsinh}', acosh: '\\operatorname{arcosh}',
  atanh: '\\operatorname{artanh}', ln: '\\ln', sign: '\\operatorname{sgn}', gamma: '\\Gamma', erf: '\\operatorname{erf}',
  round: '\\operatorname{round}', trunc: '\\operatorname{trunc}',
}
/** Las que admiten el exponente pegado al nombre: sin²x. */
const CON_POTENCIA = new Set(['sin', 'cos', 'tan', 'sinh', 'cosh', 'tanh', 'ln'])

function texSimbolo(v: string) {
  if (v === 'pi') return '\\pi'
  if (v === 'indefinido') return '\\text{indefinido}'
  if (GRIEGAS.has(v)) return `\\${v}`
  const m = v.match(/^([a-zA-Z])(\d+)$/)
  if (m) return `${m[1]}_{${m[2]}}`
  if (/^[a-zA-Z]'*$/.test(v)) return v
  return `\\mathrm{${v}}`
}

export function texNumero(x: Num): string {
  if (x.t === 'q') return x.d === 1n ? `${x.n}` : `\\frac{${x.n}}{${x.d}}`
  const v = x.v
  if (!Number.isFinite(v)) return Number.isNaN(v) ? '\\text{indefinido}' : v > 0 ? '\\infty' : '-\\infty'
  if (v !== 0 && (Math.abs(v) >= 1e10 || Math.abs(v) < 1e-6)) {
    const [m, e] = v.toExponential(8).split('e')
    return `${String(+m).replace('.', '{,}')} \\cdot 10^{${+e}}`
  }
  return String(+v.toPrecision(10)).replace('.', '{,}')
}

/** Variable principal para ordenar: x si aparece, si no la primera en orden alfabético. */
function principal(x: E): string | null {
  const vs = [...simbolos(x)]
  if (vs.includes('x')) return 'x'
  return vs.sort()[0] ?? null
}

function grado(x: E, v: string | null): [number, number] {
  // [grado en la principal, grado total]
  switch (x.t) {
    case 's':
      return x.v === v ? [1, 1] : x.v === 'pi' || x.v === 'e' ? [0, 0] : [0, 1]
    case '^': {
      const [a, b] = grado(x.b, v)
      const e = esNum(x.e) ? valor(x.e) : 1
      return [a * e, b * e]
    }
    case '*':
      return x.a.reduce<[number, number]>((acc, y) => {
        const [a, b] = grado(y, v)
        return [acc[0] + a, acc[1] + b]
      }, [0, 0])
    case 'fn':
      return [0, 0.5]
    case '+':
      return x.a.reduce<[number, number]>((acc, y) => {
        const [a, b] = grado(y, v)
        return [Math.max(acc[0], a), Math.max(acc[1], b)]
      }, [0, 0])
    default:
      return [0, 0]
  }
}

const envuelve = (t: string) => `\\left(${t}\\right)`

function texFactor(x: E): string {
  if (x.t === '+') return envuelve(tex(x))
  return tex(x)
}

function texBase(x: E): string {
  if (x.t === 'q' && (x.d !== 1n || x.n < 0n)) return envuelve(tex(x))
  if (x.t === 'f' && x.v < 0) return envuelve(tex(x))
  if (x.t === '+' || x.t === '*' || x.t === '^') return envuelve(tex(x))
  return tex(x)
}

function texPotencia(b: E, e: E): string {
  if (e.t === 'q' && e.n === 1n && e.d > 1n) return e.d === 2n ? `\\sqrt{${tex(b)}}` : `\\sqrt[${e.d}]{${tex(b)}}`
  if (b.t === 'fn' && CON_POTENCIA.has(b.v) && e.t === 'q' && e.d === 1n && e.n > 0n)
    return `${FUNCIONES[b.v]}^{${e.n}}\\!\\left(${tex(b.a[0])}\\right)`
  const exp = e.t === 'q' && e.d !== 1n ? `${e.n}/${e.d}` : tex(e)
  return `${texBase(b)}^{${exp}}`
}

function texProducto(x: E): string {
  const factores = x.t === '*' ? x.a : [x]
  let coef: Num | null = null
  const arriba: E[] = []
  const abajo: E[] = []
  for (const f of factores) {
    if (esNum(f)) coef = f
    else if (f.t === '^' && negativo(f.e) && !exponencialNegativa(f)) abajo.push(pot(f.b, prod(MENOS, f.e)))
    else arriba.push(f)
  }
  let signo = ''
  let numC = ''
  let denC = ''
  if (coef) {
    if (coef.t === 'q') {
      if (coef.n < 0n) signo = '-'
      const n = coef.n < 0n ? -coef.n : coef.n
      if (n !== 1n || !arriba.length) numC = `${n}`
      if (coef.d !== 1n) denC = `${coef.d}`
    } else {
      if (coef.v < 0) signo = '-'
      numC = texNumero({ t: 'f', v: Math.abs(coef.v) })
    }
  }
  // en papel va primero lo polinómico (2x·e^{x²}), luego funciones y potencias raras, y al final las sumas
  const rango = (f: E) => (f.t === 's' || (f.t === '^' && f.b.t === 's' && esNum(f.e) && f.b.v !== 'e') ? 0 : f.t === '+' ? 2 : 1)
  const nombre = (f: E) => (f.t === 's' ? f.v : f.t === '^' && f.b.t === 's' ? f.b.v : '')
  const orden = (a: E, b: E) => rango(a) - rango(b) || (nombre(a) < nombre(b) ? -1 : nombre(a) > nombre(b) ? 1 : 0)
  arriba.sort(orden)
  abajo.sort(orden)
  const junta = (partes: string[]) =>
    partes.reduce((acc, p) => (acc && /^[0-9]/.test(p) ? `${acc} \\cdot ${p}` : acc ? `${acc} ${p}` : p), '')
  const num = junta([numC, ...arriba.map(texFactor)].filter(Boolean)) || '1'
  if (!abajo.length && !denC) return signo + num
  // un solo factor de suma arriba, sin nada más, no necesita paréntesis dentro de la fracción
  const numF = !numC && arriba.length === 1 && arriba[0].t === '+' ? tex(arriba[0]) : num
  const den = abajo.length === 1 && !denC ? tex(abajo[0]) : junta([denC, ...abajo.map(texFactor)].filter(Boolean))
  return `${signo}\\frac{${numF}}{${den}}`
}

/** Con esto activo, e^(−x) se escribe así y no como 1/eˣ: es como salen las EDOs en los libros. */
let exponencialArriba = false

const exponencialNegativa = (f: E) => exponencialArriba && f.t === '^' && f.b.t === 's' && f.b.v === 'e'

export function texConExponenciales(x: E): string {
  exponencialArriba = true
  try {
    return tex(x)
  } finally {
    exponencialArriba = false
  }
}

export function tex(x: E): string {
  switch (x.t) {
    case 'q':
    case 'f':
      return texNumero(x)
    case 's':
      return texSimbolo(x.v)
    case '^':
      if (negativo(x.e) && !exponencialNegativa(x)) return texProducto(x)
      return texPotencia(x.b, x.e)
    case '*':
      return texProducto(x)
    case 'fn': {
      const a = x.a.map((y) => tex(y))
      if (x.v === 'abs') return `\\left|${a[0]}\\right|`
      if (x.v === 'floor') return `\\left\\lfloor ${a[0]}\\right\\rfloor`
      if (x.v === 'ceil') return `\\left\\lceil ${a[0]}\\right\\rceil`
      if (x.v === 'fact') return `${texBase(x.a[0])}!`
      return `${FUNCIONES[x.v] ?? `\\operatorname{${x.v}}`}\\!\\left(${a.join(',\\,')}\\right)`
    }
    case '+': {
      const v = principal(x)
      const terminos = [...x.a].sort((a, b) => {
        const [a1, a2] = grado(a, v)
        const [b1, b2] = grado(b, v)
        return b1 - a1 || b2 - a2
      })
      return terminos
        .map((t, i) => {
          if (negativo(t)) return `${i ? ' - ' : '-'}${tex(prod(MENOS, t))}`
          return `${i ? ' + ' : ''}${tex(t)}`
        })
        .join('')
    }
  }
}

