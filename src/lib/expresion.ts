import * as K from './complejo'

/**
 * Evaluador de expresiones sin `eval`: descenso recursivo a un árbol y
 * compilación del árbol a cierres. Solo entiende lo que hay en FUNCIONES,
 * CONSTANTES y las funciones que le pase quien compila, así que una cadena rara
 * no puede ejecutar nada. El árbol es público porque el CAS trabaja sobre él.
 */

export type Nodo =
  | { t: 'num'; v: number }
  | { t: 'cte'; v: string }
  | { t: 'var'; v: string }
  | { t: 'neg'; a: Nodo }
  /** `imp`: multiplicación implícita (2x), que se compone sin punto. */
  | { t: 'op'; v: '+' | '-' | '*' | '/' | '^'; a: Nodo; b: Nodo; imp?: boolean }
  | { t: 'fn'; v: string; args: Nodo[] }
  /** Llamada a una función del usuario; `d` es el número de primas. */
  | { t: 'usr'; v: string; d: number; args: Nodo[] }
  | { t: 'cmp'; v: '<' | '>' | '<=' | '>=' | '==' | '!='; a: Nodo; b: Nodo }
  | { t: 'y'; a: Nodo; b: Nodo }
  | { t: 'post'; v: '!' | '°'; a: Nodo }

/* ---------- funciones reales ---------- */

function gamma(x: number): number {
  if (x < 0.5) return Math.PI / (Math.sin(Math.PI * x) * gamma(1 - x))
  const g = 7
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ]
  x -= 1
  let a = c[0]
  const t = x + g + 0.5
  for (let i = 1; i < 9; i++) a += c[i] / (x + i)
  return Math.sqrt(2 * Math.PI) * Math.pow(t, x + 0.5) * Math.exp(-t) * a
}

function erf(x: number): number {
  if (!Number.isFinite(x)) return Number.isNaN(x) ? NaN : Math.sign(x)
  const ax = Math.abs(x)
  if (ax < 2.5) {
    // serie de Taylor: a esta distancia la cancelación cuesta menos de 4 cifras
    let termino = x
    let suma = x
    for (let n = 1; n < 80; n++) {
      termino *= (-x * x) / n
      const d = termino / (2 * n + 1)
      suma += d
      if (Math.abs(d) < 1e-17 * Math.abs(suma)) break
    }
    return (2 / Math.sqrt(Math.PI)) * suma
  }
  // fracción continua de erfc, evaluada de atrás hacia delante
  let t = ax
  for (let k = 80; k >= 1; k--) t = ax + k / 2 / t
  const erfc = Math.exp(-ax * ax) / (Math.sqrt(Math.PI) * t)
  return Math.sign(x) * (1 - erfc)
}

const factorial = (x: number) => (Number.isInteger(x) && x >= 0 && x < 171 ? Array.from({ length: x }, (_, i) => i + 1).reduce((a, b) => a * b, 1) : gamma(x + 1))

const binomial = (n: number, k: number) => {
  if (Number.isInteger(n) && Number.isInteger(k)) {
    if (k < 0 || k > n) return 0
    let r = 1
    for (let i = 1; i <= Math.min(k, n - k); i++) r = (r * (n - i + 1)) / i
    return Math.round(r)
  }
  return gamma(n + 1) / (gamma(k + 1) * gamma(n - k + 1))
}

const UNARIAS: Record<string, (x: number) => number> = {
  sin: Math.sin, sen: Math.sin, cos: Math.cos, tan: Math.tan, tg: Math.tan,
  sec: (x) => 1 / Math.cos(x), csc: (x) => 1 / Math.sin(x), cosec: (x) => 1 / Math.sin(x),
  cot: (x) => 1 / Math.tan(x), cotan: (x) => 1 / Math.tan(x), cotg: (x) => 1 / Math.tan(x),
  asin: Math.asin, arcsin: Math.asin, arcsen: Math.asin, acos: Math.acos, arccos: Math.acos,
  atan: Math.atan, arctan: Math.atan, arctg: Math.atan,
  sinh: Math.sinh, senh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
  sech: (x) => 1 / Math.cosh(x), csch: (x) => 1 / Math.sinh(x), coth: (x) => 1 / Math.tanh(x),
  asinh: Math.asinh, arcsinh: Math.asinh, acosh: Math.acosh, arccosh: Math.acosh, atanh: Math.atanh, arctanh: Math.atanh,
  exp: Math.exp, ln: Math.log, lg: Math.log10, log10: Math.log10, log2: Math.log2, ld: Math.log2,
  sqrt: Math.sqrt, raiz: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs,
  sign: Math.sign, sgn: Math.sign, floor: Math.floor, ceil: Math.ceil, round: Math.round, trunc: Math.trunc,
  gamma, erf, fact: factorial,
  // de variable compleja; con números reales se quedan en lo que valen ahí
  conj: (x) => x, re: (x) => x, im: () => 0, arg: (x) => (x < 0 ? Math.PI : 0),
  // Señales. En los saltos valen la media de los dos lados (H(0) = ½), que es a donde converge Fourier.
  heaviside: (x) => (x > 0 ? 1 : x < 0 ? 0 : 0.5),
  escalon: (x) => (x > 0 ? 1 : x < 0 ? 0 : 0.5),
  // δ de Dirac: para dibujar vale 0 fuera del origen; en él no tiene valor (la lee el CAS, no la gráfica).
  // No se llama «delta» porque esa palabra ya es la letra griega δ.
  dirac: (x) => (x === 0 ? NaN : 0),
  rect: (x) => (Math.abs(x) < 0.5 ? 1 : Math.abs(x) === 0.5 ? 0.5 : 0),
  tri: (x) => Math.max(0, 1 - Math.abs(x)),
  // sinc normalizada, la de señales: sin(πx)/(πx)
  sinc: (x) => (x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x)),
  // periódicas de periodo 2π, como sin: cuadrada = sgn(sin x), sierra = x/π en (−π, π), triangular = 1 − 2|x|/π en [−π, π]
  cuadrada: (x) => Math.sign(Math.sin(x)),
  sierra: (x) => {
    const r = x / (2 * Math.PI) + 0.5
    const f = r - Math.floor(r)
    return f === 0 ? 0 : 2 * f - 1
  },
  triangular: (x) => {
    const r = x / (2 * Math.PI) + 0.5
    return 1 - 2 * Math.abs(2 * (r - Math.floor(r)) - 1)
  },
}

/** Funciones de más de un argumento: [mínimo, máximo] de argumentos y cómo se evalúan. */
const MULTIPLES: Record<string, [number, number, (a: number[]) => number]> = {
  log: [1, 2, (a) => (a.length === 1 ? Math.log10(a[0]) : Math.log(a[1]) / Math.log(a[0]))],
  atan2: [2, 2, (a) => Math.atan2(a[0], a[1])],
  nroot: [2, 2, (a) => (a[0] < 0 && a[1] % 2 === 1 ? -Math.pow(-a[0], 1 / a[1]) : Math.pow(a[0], 1 / a[1]))],
  mod: [2, 2, (a) => a[0] - a[1] * Math.floor(a[0] / a[1])],
  min: [1, Infinity, (a) => Math.min(...a)],
  max: [1, Infinity, (a) => Math.max(...a)],
  ncr: [2, 2, (a) => binomial(a[0], a[1])],
  binomial: [2, 2, (a) => binomial(a[0], a[1])],
}

/** `if(c, a)`, `if(c, a, b)`, `if(c1, a1, c2, a2, …, [resto])`: perezosa, por eso va aparte. */
const CONDICIONALES = new Set(['if', 'si'])

const esFuncion = (n: string) => n in UNARIAS || n in MULTIPLES || CONDICIONALES.has(n)

const CONSTANTES: Record<string, number> = { pi: Math.PI, e: Math.E, tau: 2 * Math.PI, phi: (1 + Math.sqrt(5)) / 2 }

/** Nombres que se leen enteros aunque tengan varias letras. */
const GRIEGAS = ['alpha', 'beta', 'delta', 'epsilon', 'eta', 'theta', 'kappa', 'lambda', 'mu', 'nu', 'xi', 'rho', 'sigma', 'omega', 'psi', 'chi']

const UNICODE: Record<string, string> = {
  π: 'pi', ℯ: 'e', τ: 'tau', φ: 'phi', α: 'alpha', β: 'beta', δ: 'delta', ε: 'epsilon', η: 'eta', θ: 'theta',
  κ: 'kappa', λ: 'lambda', μ: 'mu', ν: 'nu', ξ: 'xi', ρ: 'rho', σ: 'sigma', ω: 'omega', ψ: 'psi', χ: 'chi',
  '·': '*', '×': '*', '÷': '/', '−': '-', '²': '^2', '³': '^3', '≤': '<=', '≥': '>=', '≠': '!=', '∧': '&', '√': 'sqrt ',
}

/* ---------- análisis léxico ---------- */

type Ficha = { t: 'num'; v: number } | { t: 'nom'; v: string; hueco: boolean } | { t: 'sim'; v: string }

const SIMBOLOS = ['<=', '>=', '==', '!=', '&&', '**', '+', '-', '*', '/', '^', '(', ')', ',', '|', '!', '°', '<', '>', '&']

function fichas(src: string): Ficha[] {
  let s = src.toLowerCase()
  for (const [u, a] of Object.entries(UNICODE)) s = s.split(u).join(a)
  const out: Ficha[] = []
  let i = 0
  let hueco = false
  while (i < s.length) {
    const ch = s[i]
    if (/\s/.test(ch)) {
      hueco = true
      i++
      continue
    }
    if (/[0-9.]/.test(ch)) {
      let j = i
      while (j < s.length && /[0-9.]/.test(s[j])) j++
      // sin notación científica: 2e-1 es 2·e − 1, como siempre se ha leído aquí
      const literal = s.slice(i, j)
      if (!/^(\d+(\.\d*)?|\.\d+)$/.test(literal)) throw new Error(`número no válido: ${literal}`)
      out.push({ t: 'num', v: Number(literal) })
      i = j
    } else if (/[a-z_]/.test(ch)) {
      let j = i
      // la prima forma parte del nombre: así y, y' e y'' son tres variables
      while (j < s.length && /[a-z0-9_']/.test(s[j])) j++
      out.push({ t: 'nom', v: s.slice(i, j), hueco })
      i = j
    } else {
      const sim = SIMBOLOS.find((x) => s.startsWith(x, i))
      if (!sim) throw new Error(ch === '=' ? 'sobra un signo =' : `carácter no admitido: ${ch}`)
      out.push({ t: 'sim', v: sim === '**' ? '^' : sim === '&&' ? '&' : sim })
      i += sim.length
    }
    hueco = false
  }
  return out
}

/* ---------- nombres pegados ---------- */

/**
 * Parte un nombre que no es una variable conocida en trozos que sí lo son:
 * con x e y conocidas, `xy` es x·y; con nada conocido, `ab` es a·b. Un trozo
 * suelto es una letra con sus cifras y primas detrás (a1, y''). Gana la partición
 * con menos trozos, y un trozo conocido pesa menos que uno suelto.
 */
function partir(nombre: string, conocidas: Set<string>): string[] {
  if (conocidas.has(nombre) || nombre in CONSTANTES || GRIEGAS.includes(nombre)) return [nombre]
  const n = nombre.length
  const coste = new Array<number>(n + 1).fill(Infinity)
  const desde = new Array<[number, string]>(n + 1)
  coste[0] = 0
  for (let i = 0; i < n; i++) {
    if (coste[i] === Infinity) continue
    const prueba = (trozo: string, c: number) => {
      const j = i + trozo.length
      if (coste[i] + c < coste[j]) {
        coste[j] = coste[i] + c
        desde[j] = [i, trozo]
      }
    }
    for (const k of [...conocidas, ...Object.keys(CONSTANTES), ...GRIEGAS]) if (nombre.startsWith(k, i)) prueba(k, 1)
    const suelto = nombre.slice(i).match(/^[a-z_][0-9_']*/)
    if (suelto) prueba(suelto[0], 1.5)
  }
  if (coste[n] === Infinity) return [nombre]
  const trozos: string[] = []
  for (let j = n; j > 0; j = desde[j][0]) trozos.unshift(desde[j][1])
  return trozos
}

// una variable declarada gana a la constante del mismo nombre: con φ como coordenada,
// cos(θ − φ) no puede leerse como cos(θ − 1,618…)
const hoja = (v: string, conocidas: Set<string>): Nodo => (v in CONSTANTES && !conocidas.has(v) ? { t: 'cte', v } : { t: 'var', v })

const producto = (trozos: string[], conocidas: Set<string>): Nodo =>
  trozos.map((t) => hoja(t, conocidas)).reduce((a, b) => ({ t: 'op', v: '*', a, b, imp: true }))

/* ---------- análisis sintáctico ---------- */

export interface Contexto {
  /** Variables y parámetros que se pueden nombrar. */
  variables?: string[]
  /** Nombres de funciones del usuario: f(x), g(x)… y sus derivadas f'(x). */
  funciones?: string[]
}

/**
 * Gramática, de menos a más prioridad:
 *   y      := cmp ('&' cmp)*
 *   cmp    := suma (('<'|'>'|'<='|'>='|'=='|'!=') suma)*   (0 < x < 2 se encadena)
 *   suma   := term (('+'|'-') term)*
 *   term   := unario (('*'|'/') unario | unario implícito)*
 *   unario := ('-'|'+') unario | pot
 *   pot    := post ('^' unario)?
 *   post   := prim ('!'|'°')*
 */
export function analizar(src: string, ctx: Contexto = {}): Nodo {
  const fs = fichas(src)
  const conocidas = new Set(ctx.variables ?? [])
  const usuario = new Set(ctx.funciones ?? [])
  let i = 0
  let barras = 0

  const mira = (k = 0) => fs[i + k]
  const es = (v: string, k = 0) => {
    const f = fs[i + k]
    return f !== undefined && f.t === 'sim' && f.v === v
  }
  const fin = () => i >= fs.length
  const espera = (v: string, error: string) => {
    if (!es(v)) throw new Error(error)
    i++
  }

  function y(): Nodo {
    let a = cmp()
    while (es('&')) {
      i++
      a = { t: 'y', a, b: cmp() }
    }
    return a
  }

  function cmp(): Nodo {
    const primero = suma()
    const ops = ['<=', '>=', '==', '!=', '<', '>'] as const
    let izq = primero
    let res: Nodo | null = null
    for (;;) {
      const f = mira()
      const op = f?.t === 'sim' ? ops.find((x) => x === f.v) : undefined
      if (!op) break
      i++
      const der = suma()
      const c: Nodo = { t: 'cmp', v: op, a: izq, b: der }
      res = res ? { t: 'y', a: res, b: c } : c
      izq = der
    }
    return res ?? primero
  }

  function suma(): Nodo {
    let a = term()
    while (es('+') || es('-')) {
      const v = (fs[i++] as { v: '+' | '-' }).v
      a = { t: 'op', v, a, b: term() }
    }
    return a
  }

  const empiezaPrimario = () => {
    const f = mira()
    if (!f) return false
    if (f.t !== 'sim') return true
    return f.v === '(' || (f.v === '|' && barras === 0)
  }

  function term(): Nodo {
    let a = unario()
    for (;;) {
      if (es('*') || es('/')) {
        const v = (fs[i++] as { v: '*' | '/' }).v
        a = { t: 'op', v, a, b: unario() }
      } else if (empiezaPrimario()) {
        a = { t: 'op', v: '*', a, b: pot(), imp: true }
      } else break
    }
    return a
  }

  function unario(): Nodo {
    if (es('-')) {
      i++
      return { t: 'neg', a: unario() }
    }
    if (es('+')) {
      i++
      return unario()
    }
    return pot()
  }

  function pot(): Nodo {
    const base = post()
    if (es('^')) {
      i++
      return { t: 'op', v: '^', a: base, b: unario() }
    }
    return base
  }

  function post(): Nodo {
    let a = prim()
    while (es('!') || es('°')) a = { t: 'post', v: (fs[i++] as { v: '!' | '°' }).v, a }
    return a
  }

  function argumentos(): Nodo[] {
    espera('(', 'falta el paréntesis')
    const guardadas = barras
    barras = 0
    const args: Nodo[] = []
    if (!es(')')) {
      args.push(y())
      while (es(',')) {
        i++
        args.push(y())
      }
    }
    espera(')', 'paréntesis sin cerrar')
    barras = guardadas
    return args
  }

  function llamada(nombre: string): Nodo {
    const args = argumentos()
    if (CONDICIONALES.has(nombre)) {
      if (args.length < 2) throw new Error(`${nombre} necesita una condición y un valor`)
      return { t: 'fn', v: 'if', args }
    }
    if (nombre in UNARIAS) {
      if (args.length !== 1) throw new Error(`${nombre} lleva un solo argumento`)
      return { t: 'fn', v: nombre, args }
    }
    const [mn, mx] = MULTIPLES[nombre]
    if (args.length < mn || args.length > mx) throw new Error(`${nombre}: número de argumentos incorrecto`)
    return { t: 'fn', v: nombre, args }
  }

  function funcionUsuario(nombre: string): Nodo | null {
    const m = nombre.match(/^(.*?)('*)$/)!
    if (!usuario.has(m[1])) return null
    const args = argumentos()
    if (args.length !== 1) throw new Error(`${m[1]} lleva un solo argumento`)
    return { t: 'usr', v: m[1], d: m[2].length, args }
  }

  function prim(): Nodo {
    const f = mira()
    if (!f) throw new Error('expresión incompleta')
    if (f.t === 'num') {
      i++
      return { t: 'num', v: f.v }
    }
    if (f.t === 'sim') {
      if (f.v === '(') {
        i++
        const guardadas = barras
        barras = 0
        const a = y()
        if (es(',')) throw new Error('una coma fuera de una función')
        espera(')', 'paréntesis sin cerrar')
        barras = guardadas
        return a
      }
      if (f.v === '|') {
        i++
        barras++
        const a = y()
        espera('|', 'falta cerrar |')
        barras--
        return { t: 'fn', v: 'abs', args: [a] }
      }
      if (f.v === ')') throw new Error('paréntesis sin abrir')
      throw new Error('falta un operando')
    }
    i++
    const nombre = f.v
    const abre = es('(')

    if (abre) {
      const u = funcionUsuario(nombre)
      if (u) return u
      if (esFuncion(nombre)) return llamada(nombre)
      // 2xsin(x): la función va al final de un nombre pegado
      for (let k = 1; k < nombre.length; k++) {
        const cola = nombre.slice(k)
        if (esFuncion(cola) || usuario.has(cola)) {
          const cabeza = producto(partir(nombre.slice(0, k), conocidas), conocidas)
          const cuerpo = usuario.has(cola) ? funcionUsuario(cola)! : llamada(cola)
          return { t: 'op', v: '*', a: cabeza, b: cuerpo, imp: true }
        }
      }
      const trozos = partir(nombre, conocidas)
      const algunoConocido = trozos.some((t) => conocidas.has(t) || t in CONSTANTES || GRIEGAS.includes(t))
      if (nombre.length > 1 && !algunoConocido) throw new Error(`función desconocida: ${nombre}`)
      // x(x+1): no es una llamada, es un producto; lo resuelve el bucle de term
      return producto(trozos, conocidas)
    }

    // sin x, sinx: función sin paréntesis, aplicada a lo que sigue
    if (esFuncion(nombre) && !CONDICIONALES.has(nombre) && nombre in UNARIAS) {
      if (fin() || (mira()!.t === 'sim' && !['(', '|'].includes((mira() as { v: string }).v))) throw new Error(`${nombre} necesita un argumento`)
      return { t: 'fn', v: nombre, args: [pot()] }
    }
    for (const fn of Object.keys(UNARIAS).sort((a, b) => b.length - a.length)) {
      if (nombre.length > fn.length && nombre.startsWith(fn) && !conocidas.has(nombre)) {
        const resto = partir(nombre.slice(fn.length), conocidas)
        if (resto.every((r) => conocidas.has(r) || r in CONSTANTES)) return { t: 'fn', v: fn, args: [producto(resto, conocidas)] }
      }
    }
    if (esFuncion(nombre)) throw new Error(`${nombre} necesita paréntesis`)
    return producto(partir(nombre, conocidas), conocidas)
  }

  if (!fs.length) throw new Error('expresión vacía')
  const raiz = y()
  if (!fin()) {
    const f = mira()!
    if (f.t === 'sim' && f.v === ')') throw new Error('paréntesis sin abrir')
    if (f.t === 'sim' && f.v === ',') throw new Error('una coma fuera de una función')
    throw new Error('expresión incompleta')
  }
  return raiz
}

/** Variables que usa la expresión, en orden de aparición. */
export function variablesDe(n: Nodo, out: string[] = []): string[] {
  switch (n.t) {
    case 'var':
      if (!out.includes(n.v)) out.push(n.v)
      break
    case 'neg':
    case 'post':
      variablesDe(n.a, out)
      break
    case 'op':
    case 'cmp':
    case 'y':
      variablesDe(n.a, out)
      variablesDe(n.b, out)
      break
    case 'fn':
    case 'usr':
      n.args.forEach((a) => variablesDe(a, out))
  }
  return out
}

/** Nombres libres de `src`: los que no están entre las variables del contexto. */
export function libres(src: string, ctx: Contexto = {}): string[] {
  const conocidas = new Set(ctx.variables ?? [])
  return variablesDe(analizar(src, ctx)).filter((v) => !conocidas.has(v))
}

/* ---------- compilación a cierres ---------- */

type Real = (v: Float64Array | number[]) => number
export type FuncionUsuario = (x: number) => number

/** Derivada numérica de orden d por diferencias centradas. */
function derivar(f: FuncionUsuario, d: number, x: number): number {
  if (d === 0) return f(x)
  const h = Math.cbrt(Number.EPSILON) * Math.max(1, Math.abs(x)) * (d > 1 ? 30 : 1)
  return (derivar(f, d - 1, x + h) - derivar(f, d - 1, x - h)) / (2 * h)
}

function aCierre(n: Nodo, idx: Map<string, number>, usuario: Record<string, FuncionUsuario>): Real {
  switch (n.t) {
    case 'num': {
      const v = n.v
      return () => v
    }
    case 'cte': {
      const v = CONSTANTES[n.v]
      return () => v
    }
    case 'var': {
      const k = idx.get(n.v)
      if (k === undefined) throw new Error(`variable desconocida: ${n.v}`)
      return (v) => v[k]
    }
    case 'neg': {
      const a = aCierre(n.a, idx, usuario)
      return (v) => -a(v)
    }
    case 'post': {
      const a = aCierre(n.a, idx, usuario)
      return n.v === '!' ? (v) => factorial(a(v)) : (v) => (a(v) * Math.PI) / 180
    }
    case 'op': {
      const a = aCierre(n.a, idx, usuario)
      const b = aCierre(n.b, idx, usuario)
      switch (n.v) {
        case '+': return (v) => a(v) + b(v)
        case '-': return (v) => a(v) - b(v)
        case '*': return (v) => a(v) * b(v)
        case '/': return (v) => a(v) / b(v)
        default:
          // (-8)^(1/3) = -2, como en papel, si el exponente es 1/impar
          return (v) => {
            const x = a(v)
            const p = b(v)
            if (x < 0 && !Number.isInteger(p)) {
              const q = 1 / p
              if (Number.isInteger(Math.round(q)) && Math.abs(q - Math.round(q)) < 1e-9 && Math.round(q) % 2 !== 0) return -Math.pow(-x, p)
            }
            return Math.pow(x, p)
          }
      }
    }
    case 'cmp': {
      const a = aCierre(n.a, idx, usuario)
      const b = aCierre(n.b, idx, usuario)
      switch (n.v) {
        case '<': return (v) => +(a(v) < b(v))
        case '>': return (v) => +(a(v) > b(v))
        case '<=': return (v) => +(a(v) <= b(v))
        case '>=': return (v) => +(a(v) >= b(v))
        case '==': return (v) => +(Math.abs(a(v) - b(v)) < 1e-12)
        default: return (v) => +(Math.abs(a(v) - b(v)) >= 1e-12)
      }
    }
    case 'y': {
      const a = aCierre(n.a, idx, usuario)
      const b = aCierre(n.b, idx, usuario)
      return (v) => +(a(v) !== 0 && b(v) !== 0)
    }
    case 'usr': {
      const f = usuario[n.v]
      if (!f) throw new Error(`función desconocida: ${n.v}`)
      const a = aCierre(n.args[0], idx, usuario)
      const d = n.d
      return d === 0 ? (v) => f(a(v)) : (v) => derivar(f, d, a(v))
    }
    case 'fn': {
      const args = n.args.map((x) => aCierre(x, idx, usuario))
      if (n.v === 'if') {
        return (v) => {
          let k = 0
          for (; k + 1 < args.length; k += 2) if (args[k](v) !== 0) return args[k + 1](v)
          return k < args.length ? args[k](v) : NaN
        }
      }
      if (n.v in UNARIAS) {
        const f = UNARIAS[n.v]
        const a = args[0]
        return (v) => f(a(v))
      }
      const f = MULTIPLES[n.v][2]
      return (v) => f(args.map((a) => a(v)))
    }
  }
}

/** Compila un árbol ya analizado; mismas reglas que `compilar`. */
export function compilarNodo(n: Nodo, variables: string[], usuario: Record<string, FuncionUsuario> = {}): (...vals: number[]) => number {
  const idx = new Map(variables.map((v, k) => [v, k]))
  const f = aCierre(n, idx, usuario)
  return (...vals: number[]) => f(vals)
}

/** Compila `src` a una función de las variables indicadas. Lanza si no es válida. */
export function compilar(src: string, variables: string[], usuario: Record<string, FuncionUsuario> = {}): (...vals: number[]) => number {
  const n = analizar(src, { variables, funciones: Object.keys(usuario) })
  return compilarNodo(n, variables, usuario)
}

/** Como `compilar`, pero la función recibe el vector de valores: sin empaquetar argumentos en cada llamada (bucles calientes). */
export function compilarVector(src: string, variables: string[]): (v: number[]) => number {
  const n = analizar(src, { variables })
  return aCierre(n, new Map(variables.map((v, k) => [v, k])), {})
}

/** Compila y, si falla, devuelve `null` en vez de lanzar. */
export function compilarSuave(src: string, variables: string[], usuario: Record<string, FuncionUsuario> = {}) {
  try {
    const f = compilar(src, variables, usuario)
    f(...variables.map(() => 1))
    return { f, error: null as string | null }
  } catch (e) {
    return { f: null, error: (e as Error).message }
  }
}

/* ---------- LaTeX ---------- */

const NOMBRES: Record<string, string> = {
  sin: '\\sin', sen: '\\sin', cos: '\\cos', tan: '\\tan', tg: '\\tan', sec: '\\sec', csc: '\\csc', cosec: '\\csc',
  cot: '\\cot', cotan: '\\cot', cotg: '\\cot', asin: '\\arcsin', arcsin: '\\arcsin', arcsen: '\\arcsin',
  acos: '\\arccos', arccos: '\\arccos', atan: '\\arctan', arctan: '\\arctan', arctg: '\\arctan',
  sinh: '\\sinh', senh: '\\sinh', cosh: '\\cosh', tanh: '\\tanh', coth: '\\coth', exp: '\\exp', ln: '\\ln',
  lg: '\\log_{10}', log10: '\\log_{10}', log2: '\\log_{2}', ld: '\\log_{2}',
  sign: '\\operatorname{sgn}', sgn: '\\operatorname{sgn}', round: '\\operatorname{round}', gamma: '\\Gamma',
  erf: '\\operatorname{erf}', min: '\\min', max: '\\max', mod: '\\operatorname{mod}',
}
const NIVEL: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2, '^': 4 }
const CMP_TEX: Record<string, string> = { '<': '<', '>': '>', '<=': '\\le', '>=': '\\ge', '==': '=', '!=': '\\ne' }
const CTE_TEX: Record<string, string> = { pi: '\\pi', e: 'e', tau: '\\tau', phi: '\\varphi' }

function texVar(v: string): string {
  if (GRIEGAS.includes(v)) return `\\${v}`
  const m = v.match(/^([a-z])(\d+)$/)
  if (m) return `${m[1]}_{${m[2]}}`
  if (/^[a-z]'*$/.test(v)) return v
  const sub = v.match(/^([a-z])_([a-z0-9]+)$/)
  if (sub) return `${sub[1]}_{${sub[2]}}`
  return `\\mathrm{${v}}`
}

const empiezaConNumero = (n: Nodo): boolean =>
  n.t === 'num' || ((n.t === 'op' && n.v !== '/') || n.t === 'post' ? empiezaConNumero(n.a) : false)

export function tex(n: Nodo, padre = 0): string {
  switch (n.t) {
    case 'num':
      return String(n.v).replace('.', '{,}')
    case 'cte':
      return CTE_TEX[n.v] ?? n.v
    case 'var':
      return texVar(n.v)
    case 'neg': {
      const s = `-${tex(n.a, 3)}`
      return padre >= 2 ? `\\left(${s}\\right)` : s
    }
    case 'post':
      return n.v === '!' ? `${tex(n.a, 5)}!` : `${tex(n.a, 5)}^{\\circ}`
    case 'usr':
      return `${n.v}${"'".repeat(n.d)}\\!\\left(${tex(n.args[0])}\\right)`
    case 'cmp': {
      const s = `${tex(n.a, 1)} ${CMP_TEX[n.v]} ${tex(n.b, 1)}`
      return padre > 0 ? `\\left(${s}\\right)` : s
    }
    case 'y': {
      // 0 < x < 2 llega como (0 < x) ∧ (x < 2): se recompone encadenada
      if (n.t === 'y' && n.a.t === 'cmp' && n.b.t === 'cmp' && JSON.stringify(n.a.b) === JSON.stringify(n.b.a))
        return `${tex(n.a.a, 1)} ${CMP_TEX[n.a.v]} ${tex(n.a.b, 1)} ${CMP_TEX[n.b.v]} ${tex(n.b.b, 1)}`
      return `${tex(n.a, 0)} \\wedge ${tex(n.b, 0)}`
    }
    case 'fn': {
      const a = n.args
      if (n.v === 'sqrt' || n.v === 'raiz') return `\\sqrt{${tex(a[0])}}`
      if (n.v === 'cbrt') return `\\sqrt[3]{${tex(a[0])}}`
      if (n.v === 'nroot') return `\\sqrt[${tex(a[1])}]{${tex(a[0])}}`
      if (n.v === 'abs') return `\\left|${tex(a[0])}\\right|`
      if (n.v === 'floor') return `\\left\\lfloor ${tex(a[0])}\\right\\rfloor`
      if (n.v === 'ceil') return `\\left\\lceil ${tex(a[0])}\\right\\rceil`
      if (n.v === 'fact') return `${tex(a[0], 5)}!`
      if (n.v === 'log' && a.length === 2) return `\\log_{${tex(a[0])}}\\!\\left(${tex(a[1])}\\right)`
      if (n.v === 'log') return `\\log_{10}\\!\\left(${tex(a[0])}\\right)`
      if (n.v === 'ncr' || n.v === 'binomial') return `\\binom{${tex(a[0])}}{${tex(a[1])}}`
      if (n.v === 'if') {
        const filas: string[] = []
        let k = 0
        for (; k + 1 < a.length; k += 2) filas.push(`${tex(a[k + 1])} & \\text{si } ${tex(a[k])}`)
        if (k < a.length) filas.push(`${tex(a[k])} & \\text{si no}`)
        return `\\begin{cases} ${filas.join(' \\\\ ')} \\end{cases}`
      }
      return `${NOMBRES[n.v] ?? `\\operatorname{${n.v}}`}\\!\\left(${a.map((x) => tex(x)).join(',\\,')}\\right)`
    }
    case 'op': {
      if (n.v === '/') return `\\frac{${tex(n.a)}}{${tex(n.b)}}`
      if (n.v === '^') {
        const s = `${tex(n.a, 5)}^{${tex(n.b)}}`
        return padre >= 5 ? `\\left(${s}\\right)` : s
      }
      // 2x se compone pegado; x·2 o 2·3 necesitan el punto para leerse
      const pegado = n.imp && !empiezaConNumero(n.b)
      const op = n.v === '*' ? (pegado ? '' : '\\cdot') : n.v
      const s = pegado ? `${tex(n.a, NIVEL[n.v])} ${tex(n.b, NIVEL[n.v] + 1)}` : `${tex(n.a, NIVEL[n.v])} ${op} ${tex(n.b, NIVEL[n.v] + 1)}`
      return NIVEL[n.v] < padre ? `\\left(${s}\\right)` : s
    }
  }
}

/** Convierte la expresión escrita a LaTeX. Devuelve null si no es válida. */
export function aLatex(src: string, ctx: Contexto = {}): string | null {
  try {
    return tex(analizar(src, ctx))
  } catch {
    return null
  }
}

/* ---------- evaluación sobre los complejos ---------- */

const FUNCIONES_C: Record<string, (z: K.C) => K.C> = {
  exp: K.exp,
  ln: (z) => [Math.log(K.abs(z)), K.arg(z)],
  sqrt: K.sqrt,
  sin: K.sin,
  sen: K.sin,
  cos: K.cos,
  tan: (z) => K.div(K.sin(z), K.cos(z)),
  tg: (z) => K.div(K.sin(z), K.cos(z)),
  sinh: (z) => K.div(K.resta(K.exp(z), K.exp([-z[0], -z[1]])), [2, 0]),
  cosh: (z) => K.div(K.suma(K.exp(z), K.exp([-z[0], -z[1]])), [2, 0]),
  tanh: (z) => K.div(FUNCIONES_C.sinh(z), FUNCIONES_C.cosh(z)),
  abs: (z) => [K.abs(z), 0],
  conj: (z) => [z[0], -z[1]],
  re: (z) => [z[0], 0],
  im: (z) => [z[1], 0],
  arg: (z) => [K.arg(z), 0],
}

const potencia = (a: K.C, b: K.C): K.C => {
  if (a[0] === 0 && a[1] === 0) return b[0] === 0 && b[1] === 0 ? [1, 0] : [0, 0]
  return K.exp(K.mul(b, [Math.log(K.abs(a)), K.arg(a)]))
}

type Compleja = (v: K.C[]) => K.C

function aCierreC(n: Nodo, idx: Map<string, number>): Compleja {
  switch (n.t) {
    case 'num': {
      const z: K.C = [n.v, 0]
      return () => z
    }
    case 'cte': {
      const z: K.C = [CONSTANTES[n.v], 0]
      return () => z
    }
    case 'var': {
      const k = idx.get(n.v)
      if (k === undefined) {
        if (n.v === 'i') return () => [0, 1]
        throw new Error(`variable desconocida: ${n.v}`)
      }
      return (v) => v[k]
    }
    case 'neg': {
      const a = aCierreC(n.a, idx)
      return (v) => {
        const z = a(v)
        return [-z[0], -z[1]]
      }
    }
    case 'op': {
      const a = aCierreC(n.a, idx)
      const b = aCierreC(n.b, idx)
      const op = n.v === '+' ? K.suma : n.v === '-' ? K.resta : n.v === '*' ? K.mul : n.v === '/' ? K.div : potencia
      return (v) => op(a(v), b(v))
    }
    case 'fn': {
      const f = FUNCIONES_C[n.v]
      if (!f || n.args.length !== 1) throw new Error(`${n.v} no está definida para complejos`)
      const a = aCierreC(n.args[0], idx)
      return (v) => f(a(v))
    }
    default:
      throw new Error('eso no tiene sentido con complejos')
  }
}

/**
 * Compila la expresión para evaluarla sobre los complejos. Mismo análisis que
 * `compilar`; `i` es la unidad imaginaria si no es una de las variables.
 */
export function compilarC(src: string, variables: string[]): (...vals: K.C[]) => K.C {
  const n = analizar(src, { variables: [...variables, 'i'] })
  const f = aCierreC(n, new Map(variables.map((v, k) => [v, k])))
  return (...vals: K.C[]) => f(vals)
}

export function compilarCSuave(src: string, variables: string[]) {
  try {
    const f = compilarC(src, variables)
    f(...variables.map(() => [0.7, 0.3] as K.C))
    return { f, error: null as string | null }
  } catch (e) {
    return { f: null, error: (e as Error).message }
  }
}
