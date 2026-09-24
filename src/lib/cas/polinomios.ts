import { mcd, partirTermino, pot, prod, q, s, suma, type E } from './expr'

/**
 * Polinomios en una variable con coeficientes racionales exactos. Un polinomio
 * es la lista de coeficientes de menor a mayor grado, sin ceros al final.
 */
export interface R {
  n: bigint
  d: bigint
}
export type P = R[]

export function r(n: bigint | number, d: bigint | number = 1n): R {
  let N = BigInt(n)
  let D = BigInt(d)
  if (D < 0n) {
    N = -N
    D = -D
  }
  const g = mcd(N, D) || 1n
  return { n: N / g, d: D / g }
}

export const rSuma = (a: R, b: R) => r(a.n * b.d + b.n * a.d, a.d * b.d)
export const rResta = (a: R, b: R) => r(a.n * b.d - b.n * a.d, a.d * b.d)
export const rProd = (a: R, b: R) => r(a.n * b.n, a.d * b.d)
export const rDiv = (a: R, b: R) => r(a.n * b.d, a.d * b.n)
export const rCero = (a: R) => a.n === 0n
const R0 = r(0)
const R1 = r(1)

export function recortar(p: P): P {
  let k = p.length
  while (k > 0 && rCero(p[k - 1])) k--
  return p.slice(0, k)
}

export const grado = (p: P) => recortar(p).length - 1
export const principalP = (p: P) => p[p.length - 1]

export function sumaP(a: P, b: P): P {
  const out: P = []
  for (let i = 0; i < Math.max(a.length, b.length); i++) out.push(rSuma(a[i] ?? R0, b[i] ?? R0))
  return recortar(out)
}

export const escalar = (p: P, c: R): P => recortar(p.map((x) => rProd(x, c)))
export const restaP = (a: P, b: P) => sumaP(a, escalar(b, r(-1)))

export function prodP(a: P, b: P): P {
  if (!a.length || !b.length) return []
  const out: P = Array.from({ length: a.length + b.length - 1 }, () => R0)
  for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) out[i + j] = rSuma(out[i + j], rProd(a[i], b[j]))
  return recortar(out)
}

export function divP(a: P, b: P): { c: P; r: P } {
  let resto = recortar(a)
  const d = recortar(b)
  if (!d.length) throw new Error('división por el polinomio cero')
  const c: P = Array.from({ length: Math.max(0, resto.length - d.length + 1) }, () => R0)
  while (resto.length >= d.length && resto.length) {
    const k = resto.length - d.length
    const f = rDiv(principalP(resto), principalP(d))
    c[k] = f
    const sustraendo: P = Array.from({ length: k }, () => R0).concat(escalar(d, f))
    resto = restaP(resto, sustraendo)
  }
  return { c: recortar(c), r: resto }
}

export const monico = (p: P): P => (p.length ? escalar(p, rDiv(R1, principalP(p))) : p)

export function mcdP(a: P, b: P): P {
  let x = recortar(a)
  let y = recortar(b)
  while (y.length) [x, y] = [y, divP(x, y).r]
  return monico(x)
}

export const derivP = (p: P): P => recortar(p.slice(1).map((c, i) => rProd(c, r(i + 1))))

export function evalP(p: P, x: R): R {
  let acc = R0
  for (let i = p.length - 1; i >= 0; i--) acc = rSuma(rProd(acc, x), p[i])
  return acc
}

export const evalPn = (p: P, x: number) => p.reduceRight((acc, c) => acc * x + Number(c.n) / Number(c.d), 0)

/* ---------- entre expresiones y polinomios ---------- */

export function aExpr(p: P, x: string): E {
  return suma(...p.map((c, k) => prod(q(c.n, c.d), pot(s(x), q(k)))))
}

/**
 * Coeficientes de una expresión ya desarrollada como polinomio en x; null si
 * algún término no es c·xᵏ con c racional.
 */
export function comoPolinomio(e: E, x: string): P | null {
  const terminos = e.t === '+' ? e.a : [e]
  const out: P = []
  for (const t of terminos) {
    const [c, resto] = partirTermino(t)
    if (c.t !== 'q') return null
    let k = 0
    if (resto) {
      if (resto.t === 's' && resto.v === x) k = 1
      else if (resto.t === '^' && resto.b.t === 's' && resto.b.v === x && resto.e.t === 'q' && resto.e.d === 1n && resto.e.n > 0n && resto.e.n < 500n) k = Number(resto.e.n)
      else return null
    }
    while (out.length <= k) out.push(R0)
    out[k] = rSuma(out[k], r(c.n, c.d))
  }
  return recortar(out)
}

/* ---------- factorización sobre Q ---------- */

/** Descomposición libre de cuadrados de Yun: p = Π gᵢ^i con los gᵢ sin factores repetidos. */
function yun(p: P): Array<{ g: P; m: number }> {
  const a = monico(p)
  const b = derivP(a)
  const c = mcdP(a, b)
  let w = divP(a, c).c
  let y = divP(b, c).c
  let z = restaP(y, derivP(w))
  const out: Array<{ g: P; m: number }> = []
  let i = 1
  while (grado(w) > 0) {
    const g = mcdP(w, z)
    if (grado(g) > 0) out.push({ g, m: i })
    w = divP(w, g).c
    y = divP(z, g).c
    z = restaP(y, derivP(w))
    i++
  }
  return out
}

function divisores(n: bigint): bigint[] {
  n = n < 0n ? -n : n
  if (n === 0n || n > 10n ** 12n) return [1n]
  const out: bigint[] = []
  for (let k = 1n; k * k <= n; k++) {
    if (n % k === 0n) {
      out.push(k)
      if (k * k !== n) out.push(n / k)
    }
  }
  return out
}

/** Coeficientes enteros primitivos, con el principal positivo. */
export function primitivo(p: P): P {
  if (!p.length) return p
  let m = 1n
  for (const c of p) m = (m * c.d) / mcd(m, c.d)
  const enteros = p.map((c) => (c.n * m) / c.d)
  let g = 0n
  for (const c of enteros) g = mcd(g, c)
  const signo = enteros[enteros.length - 1] < 0n ? -1n : 1n
  return enteros.map((c) => r((signo * c) / (g || 1n)))
}

function raicesRacionales(p: P): R[] {
  const z = primitivo(p)
  const a0 = z[0].n
  if (a0 === 0n) return [R0]
  const an = z[z.length - 1].n
  const out: R[] = []
  for (const pp of divisores(a0))
    for (const qq of divisores(an))
      for (const sg of [1n, -1n]) {
        const cand = r(sg * pp, qq)
        if (!out.some((o) => o.n === cand.n && o.d === cand.d) && rCero(evalP(z, cand))) out.push(cand)
      }
  return out
}

export interface Factorizacion {
  c: R
  /** Factores primitivos (coeficientes enteros), cada uno con su multiplicidad. */
  factores: Array<{ p: P; m: number }>
}

export function factorizarP(p: P): Factorizacion {
  const c0 = principalP(p)
  const factores: Array<{ p: P; m: number }> = []
  for (const { g, m } of yun(p)) {
    let resto = g
    for (const raiz of raicesRacionales(g)) {
      factores.push({ p: primitivo([rResta(R0, raiz), R1]), m })
      resto = divP(resto, [rResta(R0, raiz), R1]).c
    }
    if (grado(resto) > 0) factores.push({ p: primitivo(resto), m })
  }
  // la constante que deja el producto de primitivos igual al original
  let lc = R1
  for (const f of factores) for (let k = 0; k < f.m; k++) lc = rProd(lc, principalP(f.p))
  factores.sort((a, b) => grado(a.p) - grado(b.p) || Number(a.p[0].n - b.p[0].n))
  return { c: rDiv(c0, lc), factores }
}

export function factorizacionAExpr(f: Factorizacion, x: string): E {
  return prod(q(f.c.n, f.c.d), ...f.factores.map(({ p, m }) => pot(aExpr(p, x), q(m))))
}

/** Raíces reales aproximadas, por cambio de signo y bisección dentro de la cota de Cauchy. */
export function raicesReales(p: P): number[] {
  const lc = Number(principalP(p).n) / Number(principalP(p).d)
  const cota = 1 + Math.max(...p.slice(0, -1).map((c) => Math.abs(Number(c.n) / Number(c.d) / lc)), 0)
  const f = (x: number) => evalPn(p, x)
  // los extremos de la derivada separan las raíces: entre dos críticos hay a lo sumo una
  const cortes = [-cota, ...(grado(p) > 1 ? raicesReales(derivP(p)) : []), cota].sort((a, b) => a - b)
  const out: number[] = []
  for (let i = 0; i + 1 < cortes.length; i++) {
    let lo = cortes[i]
    let hi = cortes[i + 1]
    const flo = f(lo)
    const fhi = f(hi)
    if (flo === 0) out.push(lo)
    if (flo * fhi > 0) continue
    for (let k = 0; k < 200; k++) {
      const m = (lo + hi) / 2
      if (f(lo) * f(m) <= 0) hi = m
      else lo = m
    }
    out.push((lo + hi) / 2)
  }
  if (f(cortes[cortes.length - 1]) === 0) out.push(cortes[cortes.length - 1])
  return out.filter((x, i) => !out.slice(0, i).some((y) => Math.abs(x - y) < 1e-9))
}
