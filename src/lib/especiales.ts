/** Polinomio de Laguerre generalizado L_n^a(x), por recurrencia. */
export function laguerre(n: number, a: number, x: number): number {
  if (n <= 0) return 1
  let l0 = 1
  let l1 = 1 + a - x
  for (let k = 1; k < n; k++) {
    const l2 = ((2 * k + 1 + a - x) * l1 - (k + a) * l0) / (k + 1)
    l0 = l1
    l1 = l2
  }
  return l1
}

/** Función asociada de Legendre P_l^m(x), m ≥ 0. */
export function legendre(l: number, m: number, x: number): number {
  let pmm = 1
  const s = Math.sqrt(Math.max(0, 1 - x * x))
  for (let i = 1; i <= m; i++) pmm *= -(2 * i - 1) * s
  if (l === m) return pmm
  let p1 = x * (2 * m + 1) * pmm
  if (l === m + 1) return p1
  let pl = 0
  for (let ll = m + 2; ll <= l; ll++) {
    pl = ((2 * ll - 1) * x * p1 - (ll + m - 1) * pmm) / (ll - m)
    pmm = p1
    p1 = pl
  }
  return pl
}

/** Polinomio de Hermite «físico» H_n(x). */
export function hermite(n: number, x: number): number {
  if (n <= 0) return 1
  let h0 = 1
  let h1 = 2 * x
  for (let k = 1; k < n; k++) {
    const h2 = 2 * x * h1 - 2 * k * h0
    h0 = h1
    h1 = h2
  }
  return h1
}

/** Polinomio de Legendre P_n(x) en [−1, 1]. */
export function legendreP(n: number, x: number): number {
  if (n === 0) return 1
  let p0 = 1
  let p1 = x
  for (let k = 1; k < n; k++) {
    const p2 = ((2 * k + 1) * x * p1 - k * p0) / (k + 1)
    p0 = p1
    p1 = p2
  }
  return p1
}

const FACT: number[] = [1]
export function factorial(n: number): number {
  for (let i = FACT.length; i <= n; i++) FACT[i] = FACT[i - 1] * i
  return FACT[n]
}

/** Bessel de primera especie J_n(x) por la serie de potencias. */
export function besselJ(n: number, x: number): number {
  if (x < 0) return (n % 2 === 0 ? 1 : -1) * besselJ(n, -x)
  const h = x / 2
  let suma = 0
  for (let k = 0; k < 60; k++) {
    const t = ((k % 2 === 0 ? 1 : -1) * Math.pow(h, 2 * k + n)) / (factorial(k) * factorial(k + n))
    suma += t
    if (Math.abs(t) < 1e-18 && k > n) break
  }
  return suma
}

const CEROS = new Map<string, number[]>()
/** Los primeros `cuantos` ceros positivos de J_n, por barrido y bisección. */
export function cerosBessel(n: number, cuantos: number): number[] {
  const clave = `${n}:${cuantos}`
  const guardado = CEROS.get(clave)
  if (guardado) return guardado
  const out: number[] = []
  const paso = 0.05
  let x = Math.max(0.1, n * 0.9)
  let prev = besselJ(n, x)
  while (out.length < cuantos && x < 400) {
    const sig = x + paso
    const v = besselJ(n, sig)
    if (prev === 0 || prev * v < 0) {
      let a = x
      let b = sig
      for (let i = 0; i < 80; i++) {
        const m = (a + b) / 2
        if (besselJ(n, a) * besselJ(n, m) <= 0) b = m
        else a = m
      }
      out.push((a + b) / 2)
    }
    x = sig
    prev = v
  }
  CEROS.set(clave, out)
  return out
}
