import type { Nodo } from '../expresion'

/**
 * Expresión simbólica en forma canónica. Todo se construye con `suma`, `prod`,
 * `pot` y `fn`, que ya agrupan términos semejantes, juntan potencias de la
 * misma base, hacen la aritmética exacta con racionales (BigInt) y evalúan los
 * valores notables; así dos expresiones iguales tienen la misma `clave`.
 *
 *   a − b  = a + (−1)·b        a / b = a · b^(−1)
 *   √a     = a^(1/2)           eˣ    = e^x  (símbolo e como base)
 */
export type E =
  | { t: 'q'; n: bigint; d: bigint }
  | { t: 'f'; v: number }
  | { t: 's'; v: string }
  | { t: '+'; a: E[] }
  | { t: '*'; a: E[] }
  | { t: '^'; b: E; e: E }
  | { t: 'fn'; v: string; a: E[] }

export type Num = Extract<E, { t: 'q' }> | Extract<E, { t: 'f' }>

/* ---------- números ---------- */

const absB = (n: bigint) => (n < 0n ? -n : n)
export function mcd(a: bigint, b: bigint): bigint {
  a = absB(a)
  b = absB(b)
  while (b) [a, b] = [b, a % b]
  return a
}

export const INDEF: E = { t: 's', v: 'indefinido' }

export function q(n: bigint | number, d: bigint | number = 1n): E {
  let N = BigInt(n)
  let D = BigInt(d)
  if (D === 0n) return INDEF
  if (D < 0n) {
    N = -N
    D = -D
  }
  const g = mcd(N, D) || 1n
  return { t: 'q', n: N / g, d: D / g }
}

export const CERO = q(0) as Num
export const UNO = q(1) as Num
export const MENOS = q(-1) as Num
export const DOS = q(2) as Num
export const MEDIO = q(1, 2) as Num
export const s = (v: string): E => ({ t: 's', v })
export const PI = s('pi')
export const NEPER = s('e')
export const flo = (v: number): Num => ({ t: 'f', v })

export const esNum = (x: E): x is Num => x.t === 'q' || x.t === 'f'
export const esIndef = (x: E) => x.t === 's' && x.v === 'indefinido'
export const valor = (x: Num) => (x.t === 'q' ? Number(x.n) / Number(x.d) : x.v)
export const esCero = (x: E) => (x.t === 'q' && x.n === 0n) || (x.t === 'f' && x.v === 0)
export const esUno = (x: E) => x.t === 'q' && x.n === 1n && x.d === 1n
export const esEntero = (x: E): x is Extract<E, { t: 'q' }> => x.t === 'q' && x.d === 1n
export const esRacional = (x: E, n: number, d = 1) => x.t === 'q' && x.n === BigInt(n) && x.d === BigInt(d)

export function sumaN(a: Num, b: Num): Num {
  if (a.t === 'q' && b.t === 'q') return q(a.n * b.d + b.n * a.d, a.d * b.d) as Num
  return flo(valor(a) + valor(b))
}

export function prodN(a: Num, b: Num): Num {
  if (a.t === 'q' && b.t === 'q') return q(a.n * b.n, a.d * b.d) as Num
  return flo(valor(a) * valor(b))
}

/** Descomposición en primos por división de prueba; null si es demasiado grande. */
function primos(n: bigint): Map<bigint, number> | null {
  if (n > 10n ** 14n) return null
  const out = new Map<bigint, number>()
  let m = n
  for (let p = 2n; p * p <= m; p += p === 2n ? 1n : 2n) {
    while (m % p === 0n) {
      out.set(p, (out.get(p) ?? 0) + 1)
      m /= p
    }
  }
  if (m > 1n) out.set(m, (out.get(m) ?? 0) + 1)
  return out
}

/**
 * n^(1/r) para n > 0 entero: parte exacta y resto bajo la raíz, agrupando los
 * primos que quedan con el mismo exponente (√6, no √2·√3; ⁴√4 = √2).
 */
function raizEntera(n: bigint, r: number): { fuera: bigint; dentro: Array<[bigint, number, number]> } | null {
  const f = primos(n)
  if (!f) return null
  let fuera = 1n
  const porFraccion = new Map<string, [bigint, number, number]>()
  for (const [p, a] of f) {
    fuera *= p ** BigInt(Math.floor(a / r))
    const resto = a % r
    if (!resto) continue
    const g = gcdN(resto, r)
    const k = `${resto / g}/${r / g}`
    const actual = porFraccion.get(k)
    porFraccion.set(k, actual ? [actual[0] * p, resto / g, r / g] : [p, resto / g, r / g])
  }
  return { fuera, dentro: [...porFraccion.values()] }
}

const gcdN = (a: number, b: number): number => (b ? gcdN(b, a % b) : a)

function potN(b: Num, e: Num): E {
  if (b.t === 'f' || e.t === 'f') {
    const v = Math.pow(valor(b), valor(e))
    return Number.isNaN(v) ? INDEF : flo(v)
  }
  if (e.d === 1n) {
    if (absB(e.n) > 4000n) return flo(Math.pow(valor(b), valor(e)))
    return e.n >= 0n ? q(b.n ** e.n, b.d ** e.n) : q(b.d ** -e.n, b.n ** -e.n)
  }
  // e = k + p/r con 0 < p < r
  const r = Number(e.d)
  let k = e.n / e.d
  if (e.n < 0n && k * e.d !== e.n) k -= 1n
  const p = e.n - k * e.d
  const entera = potN(b, q(k) as Num)
  const negativa = b.n < 0n
  if (negativa && r % 2 === 0) {
    // raíz par de un negativo: no es real, se deja escrita
    const resto: E = { t: '^', b: q(b.n ** p, b.d ** p), e: q(1, r) }
    return esUno(entera) ? resto : { t: '*', a: [entera, resto] }
  }
  // (n/d)^(1/r) = (n·d^(r−1))^(1/r) / d: sin raíces en el denominador
  const N = absB(b.n) ** p * b.d ** (p * BigInt(r - 1))
  const raiz = raizEntera(N, r)
  if (!raiz) return { t: '^', b, e }
  const signo = negativa && p % 2n === 1n ? -1n : 1n
  let coef = q(signo * raiz.fuera, b.d ** p) as Num
  coef = prodN(coef, entera as Num)
  const factores: E[] = raiz.dentro.map(([base, pp, rr]) => ({ t: '^', b: q(base), e: q(pp, rr) }) as E)
  if (!factores.length) return coef
  factores.sort(porClave)
  return esUno(coef) && factores.length === 1 ? factores[0] : { t: '*', a: [...(esUno(coef) ? [] : [coef]), ...factores] }
}

/* ---------- clave y orden ---------- */

const claves = new WeakMap<E, string>()
export function clave(x: E): string {
  const c = claves.get(x)
  if (c) return c
  let k: string
  switch (x.t) {
    case 'q':
      k = x.d === 1n ? `${x.n}` : `${x.n}/${x.d}`
      break
    case 'f':
      k = `~${x.v}`
      break
    case 's':
      k = x.v
      break
    case '+':
    case '*':
      k = `(${x.t} ${x.a.map(clave).join(' ')})`
      break
    case '^':
      k = `(^ ${clave(x.b)} ${clave(x.e)})`
      break
    case 'fn':
      k = `${x.v}(${x.a.map(clave).join(',')})`
  }
  claves.set(x, k)
  return k
}

export const igual = (a: E, b: E) => clave(a) === clave(b)
export const porClave = (a: E, b: E) => (clave(a) < clave(b) ? -1 : clave(a) > clave(b) ? 1 : 0)

/* ---------- constructores canónicos ---------- */

/** Un término como coeficiente numérico × resto. */
export function partirTermino(x: E): [Num, E | null] {
  if (esNum(x)) return [x, null]
  if (x.t === '*' && esNum(x.a[0])) {
    const resto = x.a.slice(1)
    return [x.a[0], resto.length === 1 ? resto[0] : { t: '*', a: resto }]
  }
  return [UNO, x]
}

export function suma(...xs: E[]): E {
  const planos: E[] = []
  for (const x of xs) {
    if (x.t === '+') planos.push(...x.a)
    else planos.push(x)
  }
  if (planos.some(esIndef)) return INDEF
  let c: Num = CERO
  const grupos = new Map<string, { coef: Num; resto: E }>()
  for (const x of planos) {
    const [k, r] = partirTermino(x)
    if (!r) {
      c = sumaN(c, k)
      continue
    }
    const key = clave(r)
    const g = grupos.get(key)
    if (g) g.coef = sumaN(g.coef, k)
    else grupos.set(key, { coef: k, resto: r })
  }
  // a·sin²u + a·cos²u = a
  for (const [key, g] of grupos) {
    const r = g.resto
    if (r.t !== '^' || !esRacional(r.e, 2) || r.b.t !== 'fn' || r.b.v !== 'sin') continue
    const kc = clave({ t: '^', b: { t: 'fn', v: 'cos', a: r.b.a }, e: DOS })
    const h = grupos.get(kc)
    if (h && clave(h.coef) === clave(g.coef)) {
      c = sumaN(c, g.coef)
      grupos.delete(key)
      grupos.delete(kc)
    }
  }
  const terminos: E[] = []
  for (const g of grupos.values()) if (!esCero(g.coef)) terminos.push(prod(g.coef, g.resto))
  if (!esCero(c)) terminos.push(c)
  if (!terminos.length) return c
  if (terminos.length === 1) return terminos[0]
  terminos.sort(porClave)
  return { t: '+', a: terminos }
}

export function prod(...xs: E[]): E {
  const planos: E[] = []
  for (const x of xs) {
    if (x.t === '*') planos.push(...x.a)
    else planos.push(x)
  }
  if (planos.some(esIndef)) return INDEF
  let c: Num = UNO
  const bases = new Map<string, { b: E; e: E[] }>()
  for (const x of planos) {
    if (esNum(x)) {
      c = prodN(c, x)
      continue
    }
    const [b, e] = x.t === '^' ? [x.b, x.e] : [x, UNO]
    const key = clave(b)
    const g = bases.get(key)
    if (g) g.e.push(e)
    else bases.set(key, { b, e: [e] })
  }
  if (esCero(c)) return c
  const factores: E[] = []
  for (const { b, e } of bases.values()) {
    const p = pot(b, e.length === 1 ? e[0] : suma(...e))
    if (esIndef(p)) return INDEF
    if (esNum(p)) c = prodN(c, p)
    else if (p.t === '*') {
      for (const y of p.a) {
        if (esNum(y)) c = prodN(c, y)
        else factores.push(y)
      }
    } else factores.push(p)
  }
  if (esCero(c)) return c
  if (!factores.length) return c
  factores.sort(porClave)
  if (esUno(c) && factores.length === 1) return factores[0]
  return { t: '*', a: esUno(c) ? factores : [c, ...factores] }
}

export function pot(b: E, e: E): E {
  if (esIndef(b) || esIndef(e)) return INDEF
  if (esCero(e)) return UNO
  if (esUno(e)) return b
  if (esNum(b) && esCero(b)) {
    if (esNum(e)) return valor(e) > 0 ? CERO : INDEF
    return { t: '^', b, e }
  }
  if (esUno(b)) return UNO
  if (esNum(b) && esNum(e)) return potN(b, e)
  if (b.t === '^' && esEntero(e)) return pot(b.b, prod(b.e, e))
  if (b.t === '*') {
    if (esEntero(e)) return prod(...b.a.map((y) => pot(y, e)))
    // un coeficiente positivo sale de la raíz: √(4x) = 2√x
    const c = b.a[0]
    if (esNum(c) && valor(c) > 0) return prod(pot(c, e), pot(prod(...b.a.slice(1)), e))
  }
  if (b.t === 's' && b.v === 'e') {
    if (e.t === 'fn' && e.v === 'ln') return e.a[0]
    if (e.t === '*') {
      const ln = e.a.find((y) => y.t === 'fn' && y.v === 'ln') as Extract<E, { t: 'fn' }> | undefined
      if (ln && e.a.length === 2) return pot(ln.a[0], e.a.find((y) => y !== ln)!)
    }
  }
  return { t: '^', b, e }
}

/* ---------- funciones ---------- */

const IMPARES = new Set(['sin', 'tan', 'asin', 'atan', 'sinh', 'tanh', 'asinh', 'atanh', 'erf'])
const PARES = new Set(['cos', 'cosh', 'abs'])

/** ¿Tiene signo menos delante? */
export function negativo(x: E): boolean {
  if (esNum(x)) return valor(x) < 0
  if (x.t === '*') return esNum(x.a[0]) && valor(x.a[0]) < 0
  return false
}

const raiz = (n: number) => pot(q(n), MEDIO)

/** sin(k·π) exacto para k con denominador 1, 2, 3, 4 o 6. */
function senoPi(k: Extract<E, { t: 'q' }>): E | null {
  // se reduce a [0, 2)
  const dos = 2n * k.d
  let n = k.n % dos
  if (n < 0n) n += dos
  const r = q(n, k.d) as Extract<E, { t: 'q' }>
  const signo = valor(r) >= 1 ? -1 : 1
  let t = valor(r) >= 1 ? (q(r.n - r.d, r.d) as Extract<E, { t: 'q' }>) : r
  if (valor(t) > 0.5) t = q(t.d - t.n, t.d) as Extract<E, { t: 'q' }>
  const tabla: Record<string, E> = {
    '0': CERO, '1/6': MEDIO, '1/4': prod(MEDIO, raiz(2)), '1/3': prod(MEDIO, raiz(3)), '1/2': UNO,
  }
  const v = tabla[clave(t)]
  return v ? prod(q(signo), v) : null
}

/** Si x = k·π con k racional, devuelve k. */
function multiploPi(x: E): Extract<E, { t: 'q' }> | null {
  if (esCero(x)) return q(0) as Extract<E, { t: 'q' }>
  if (x.t === 's' && x.v === 'pi') return q(1) as Extract<E, { t: 'q' }>
  if (x.t === '*' && x.a.length === 2 && x.a[0].t === 'q' && x.a[1].t === 's' && x.a[1].v === 'pi') return x.a[0]
  return null
}

type Q = Extract<E, { t: 'q' }>
const coseno = (k: Q) => senoPi(q(k.n * 2n + k.d, 2n * k.d) as Q)

/** asin y atan de los valores notables, sacados de la propia tabla de senos. */
let inversos: { asin: Record<string, E>; atan: Record<string, E> } | null = null
function tablaInversas() {
  if (inversos) return inversos
  const asin: Record<string, E> = {}
  const atan: Record<string, E> = {}
  for (const [n, d] of [[0, 1], [1, 6], [1, 4], [1, 3], [1, 2], [-1, 6], [-1, 4], [-1, 3], [-1, 2]]) {
    const k = q(n, d) as Q
    asin[clave(senoPi(k)!)] = prod(k, PI)
    if (Math.abs(n / d) < 0.5) atan[clave(prod(senoPi(k)!, pot(coseno(k)!, MENOS)))] = prod(k, PI)
  }
  inversos = { asin, atan }
  return inversos
}

const NUMERICAS: Record<string, (x: number) => number> = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan,
  sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh, asinh: Math.asinh, acosh: Math.acosh, atanh: Math.atanh,
  ln: Math.log, abs: Math.abs, sign: Math.sign, floor: Math.floor, ceil: Math.ceil, round: Math.round,
  // escalón de Heaviside con H(0) = ½, como en el evaluador numérico
  heaviside: (x) => (x > 0 ? 1 : x < 0 ? 0 : 0.5),
}

export function fn(v: string, a: E[]): E {
  if (a.some(esIndef)) return INDEF
  const [u] = a
  if (a.length === 1) {
    if (u.t === 'f' && NUMERICAS[v]) return flo(NUMERICAS[v](u.v))
    if (IMPARES.has(v) && negativo(u)) return prod(MENOS, fn(v, [prod(MENOS, u)]))
    if (PARES.has(v) && negativo(u)) return fn(v, [prod(MENOS, u)])
    const k = multiploPi(u)
    if (k) {
      if (v === 'sin') return senoPi(k) ?? { t: 'fn', v, a }
      if (v === 'cos') return coseno(k) ?? { t: 'fn', v, a }
      if (v === 'tan') {
        const sn = senoPi(k)
        const cs = coseno(k)
        if (sn && cs) return esCero(cs) ? INDEF : prod(sn, pot(cs, MENOS))
      }
    }
    if (esCero(u) && ['sinh', 'tanh', 'asinh', 'atanh', 'asin', 'atan', 'erf'].includes(v)) return CERO
    if (esCero(u) && v === 'cosh') return UNO
    if (v === 'asin' || v === 'atan') {
      const r = tablaInversas()[v][clave(u)]
      if (r) return r
    }
    if (v === 'acos') {
      const r = tablaInversas().asin[clave(u)]
      if (r) return suma(prod(MEDIO, PI), prod(MENOS, r))
    }
    if (v === 'ln') {
      if (esUno(u)) return CERO
      if (u.t === 's' && u.v === 'e') return UNO
      if (u.t === '^' && u.b.t === 's' && u.b.v === 'e') return u.e
      if (esCero(u)) return INDEF
      // ln 8 = 3 ln 2: así ln 8 / ln 2 se simplifica solo
      if (u.t === 'q' && u.d === 1n && u.n > 3n && u.n < 1n << 53n) {
        const n = Number(u.n)
        for (let b = 2; b * b <= n; b++) {
          let k = 0
          let m = n
          while (m % b === 0) {
            m /= b
            k++
          }
          if (m === 1 && k > 1) return prod(q(k), fn('ln', [q(b)]))
          if (k) break
        }
      }
    }
    if (v === 'abs' && esNum(u)) return u.t === 'q' ? q(absB(u.n), u.d) : flo(Math.abs(u.v))
    if (v === 'sign' && esNum(u)) return q(Math.sign(valor(u)))
    // |e|, |π|, |e^g|: positivos seguro
    if (v === 'abs' && ((u.t === 's' && (u.v === 'e' || u.v === 'pi')) || (u.t === '^' && u.b.t === 's' && u.b.v === 'e'))) return u
    // n! y Γ(n) exactos con enteros
    if ((v === 'fact' || v === 'gamma') && u.t === 'q' && u.d === 1n) {
      const n = v === 'fact' ? u.n : u.n - 1n
      if (n >= 0n && n <= 300n) {
        let r = 1n
        for (let i = 2n; i <= n; i++) r *= i
        return q(r)
      }
    }
  }
  if (a.length === 2 && (v === 'ncr' || v === 'binomial') && a.every((y) => y.t === 'q' && y.d === 1n)) {
    const [n, k] = a.map((y) => (y as Extract<E, { t: 'q' }>).n)
    if (n >= 0n && k >= 0n && k <= n && n <= 1000n) {
      let r = 1n
      for (let i = 0n; i < k; i++) r = (r * (n - i)) / (i + 1n)
      return q(r)
    }
    if (n >= 0n && (k < 0n || k > n)) return CERO
  }
  return { t: 'fn', v, a }
}

/* ---------- utilidades ---------- */

export function contiene(x: E, v: string): boolean {
  switch (x.t) {
    case 's':
      return x.v === v
    case '+':
    case '*':
    case 'fn':
      return x.a.some((y) => contiene(y, v))
    case '^':
      return contiene(x.b, v) || contiene(x.e, v)
    default:
      return false
  }
}

const CONSTANTES = new Set(['pi', 'e', 'indefinido'])

export function simbolos(x: E, out = new Set<string>()): Set<string> {
  switch (x.t) {
    case 's':
      if (!CONSTANTES.has(x.v)) out.add(x.v)
      break
    case '+':
    case '*':
    case 'fn':
      x.a.forEach((y) => simbolos(y, out))
      break
    case '^':
      simbolos(x.b, out)
      simbolos(x.e, out)
  }
  return out
}

/** Reconstruye la expresión con los constructores: es la simplificación básica. */
export function reconstruir(x: E, cambio: (y: E) => E | null = () => null): E {
  const c = cambio(x)
  if (c) return c
  switch (x.t) {
    case '+':
      return suma(...x.a.map((y) => reconstruir(y, cambio)))
    case '*':
      return prod(...x.a.map((y) => reconstruir(y, cambio)))
    case '^':
      return pot(reconstruir(x.b, cambio), reconstruir(x.e, cambio))
    case 'fn':
      return fn(x.v, x.a.map((y) => reconstruir(y, cambio)))
    default:
      return x
  }
}

/** Sustituye un símbolo (o una subexpresión) por otra expresión. */
export function sustituir(x: E, que: E, por: E): E {
  const k = clave(que)
  return reconstruir(x, (y) => (clave(y) === k ? por : null))
}

export function evaluar(x: E, vars: Record<string, number> = {}): number {
  switch (x.t) {
    case 'q':
    case 'f':
      return valor(x)
    case 's':
      if (x.v === 'pi') return Math.PI
      if (x.v === 'e') return Math.E
      return x.v in vars ? vars[x.v] : NaN
    case '+':
      return x.a.reduce((s, y) => s + evaluar(y, vars), 0)
    case '*':
      return x.a.reduce((s, y) => s * evaluar(y, vars), 1)
    case '^': {
      const b = evaluar(x.b, vars)
      const e = evaluar(x.e, vars)
      // raíz impar de un negativo: real, como en papel
      if (b < 0 && x.e.t === 'q' && x.e.d % 2n === 1n) return (x.e.n % 2n === 0n ? 1 : -1) * Math.pow(-b, e)
      return Math.pow(b, e)
    }
    case 'fn': {
      const a = x.a.map((y) => evaluar(y, vars))
      if (x.v in NUMERICAS) return NUMERICAS[x.v](a[0])
      if (x.v === 'fact') return gammaR(a[0] + 1)
      if (x.v === 'gamma') return gammaR(a[0])
      if (x.v === 'erf') return erfR(a[0])
      // δ es una distribución: vale 0 fuera del origen y no tiene valor en él
      if (x.v === 'delta') return a[0] === 0 ? NaN : 0
      return NaN
    }
  }
}

function gammaR(x: number): number {
  if (x < 0.5) return Math.PI / (Math.sin(Math.PI * x) * gammaR(1 - x))
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ]
  x -= 1
  let a = c[0]
  const t = x + 7.5
  for (let i = 1; i < 9; i++) a += c[i] / (x + i)
  return Math.sqrt(2 * Math.PI) * Math.pow(t, x + 0.5) * Math.exp(-t) * a
}

function erfR(x: number): number {
  let t = x
  let s = x
  for (let n = 1; n < 100; n++) {
    t *= (-x * x) / n
    s += t / (2 * n + 1)
  }
  return (2 / Math.sqrt(Math.PI)) * s
}

/* ---------- desde el árbol del evaluador ---------- */

export interface Definiciones {
  funciones: Record<string, { v: string; cuerpo: E }>
  valores: Record<string, E>
}

const ALIAS: Record<string, string> = {
  sen: 'sin', tg: 'tan', arcsin: 'asin', arcsen: 'asin', arccos: 'acos', arctan: 'atan', arctg: 'atan',
  senh: 'sinh', arcsinh: 'asinh', arccosh: 'acosh', arctanh: 'atanh', sgn: 'sign', raiz: 'sqrt', escalon: 'heaviside', dirac: 'delta',
}

/** Un literal decimal se lee exacto: 0.2 es 1/5. */
function exacto(v: number): E {
  if (Number.isInteger(v)) return q(BigInt(v))
  const t = String(v)
  const m = t.match(/^(-?)(\d+)\.(\d+)$/)
  if (!m) return flo(v)
  return q(BigInt(`${m[1]}${m[2]}${m[3]}`), 10n ** BigInt(m[3].length))
}

export function desdeNodo(n: Nodo, defs: Definiciones, derivar?: (x: E, v: string) => E): E {
  const r = (m: Nodo) => desdeNodo(m, defs, derivar)
  switch (n.t) {
    case 'num':
      return exacto(n.v)
    case 'cte':
      if (n.v === 'pi') return PI
      if (n.v === 'e') return NEPER
      if (n.v === 'tau') return prod(DOS, PI)
      return prod(MEDIO, suma(UNO, raiz(5)))
    case 'var':
      return defs.valores[n.v] ?? s(n.v)
    case 'neg':
      return prod(MENOS, r(n.a))
    case 'post':
      return n.v === '!' ? fn('fact', [r(n.a)]) : prod(r(n.a), PI, q(1, 180))
    case 'op': {
      const a = r(n.a)
      const b = r(n.b)
      if (n.v === '+') return suma(a, b)
      if (n.v === '-') return suma(a, prod(MENOS, b))
      if (n.v === '*') return prod(a, b)
      if (n.v === '/') return prod(a, pot(b, MENOS))
      return pot(a, b)
    }
    case 'usr': {
      const d = defs.funciones[n.v]
      if (!d) throw new Error(`función desconocida: ${n.v}`)
      let cuerpo = d.cuerpo
      for (let k = 0; k < n.d; k++) {
        if (!derivar) throw new Error('aquí no se pueden usar derivadas')
        cuerpo = derivar(cuerpo, d.v)
      }
      return sustituir(cuerpo, s(d.v), r(n.args[0]))
    }
    case 'fn': {
      const v = ALIAS[n.v] ?? n.v
      const a = n.args.map(r)
      switch (v) {
        case 'sqrt':
          return pot(a[0], MEDIO)
        case 'cbrt':
          return pot(a[0], q(1, 3))
        case 'nroot':
          return pot(a[0], pot(a[1], MENOS))
        case 'exp':
          return pot(NEPER, a[0])
        case 'log':
          return a.length === 2 ? prod(fn('ln', [a[1]]), pot(fn('ln', [a[0]]), MENOS)) : prod(fn('ln', [a[0]]), pot(fn('ln', [q(10)]), MENOS))
        case 'lg':
        case 'log10':
          return prod(fn('ln', [a[0]]), pot(fn('ln', [q(10)]), MENOS))
        case 'log2':
        case 'ld':
          return prod(fn('ln', [a[0]]), pot(fn('ln', [DOS]), MENOS))
        case 'sec':
          return pot(fn('cos', a), MENOS)
        case 'csc':
        case 'cosec':
          return pot(fn('sin', a), MENOS)
        case 'cot':
        case 'cotan':
        case 'cotg':
          return prod(fn('cos', a), pot(fn('sin', a), MENOS))
        case 'sech':
          return pot(fn('cosh', a), MENOS)
        case 'csch':
          return pot(fn('sinh', a), MENOS)
        case 'coth':
          return prod(fn('cosh', a), pot(fn('sinh', a), MENOS))
        case 'if':
          throw new Error('las funciones a trozos no entran en el cálculo simbólico')
        default:
          return fn(v, a)
      }
    }
    default:
      throw new Error('una comparación no es una expresión')
  }
}
