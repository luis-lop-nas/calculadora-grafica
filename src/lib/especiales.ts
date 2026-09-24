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

/* ── Añadidas para el temario de grado ─────────────────────────────── */

/** Integral elíptica completa de primera especie K(k), con módulo k (no parámetro m = k²), por la media aritmético-geométrica. */
export function elipticaK(k: number): number {
  if (Math.abs(k) >= 1) return Infinity
  let a = 1
  let b = Math.sqrt(1 - k * k)
  for (let i = 0; i < 40 && Math.abs(a - b) > 1e-16 * a; i++) [a, b] = [(a + b) / 2, Math.sqrt(a * b)]
  return Math.PI / (2 * a)
}

const GL_X = [0.0765265211334973, 0.2277858511416451, 0.3737060887154195, 0.5108670019508271, 0.636053680726515, 0.7463319064601508, 0.8391169718222188, 0.912234428251326, 0.9639719272779138, 0.9931285991850949]
const GL_W = [0.1527533871307258, 0.1491729864726037, 0.142096109318382, 0.1316886384491766, 0.1181945319615184, 0.1019301198172404, 0.0832767415767048, 0.0626720483341091, 0.0406014298003869, 0.0176140071391521]

/** ∫ₐᵇ f por Gauss–Legendre de 20 puntos compuesto en `tramos` trozos. */
export function gauss20(f: (x: number) => number, a: number, b: number, tramos = 1): number {
  const h = (b - a) / tramos
  let s = 0
  for (let j = 0; j < tramos; j++) {
    const c = a + (j + 0.5) * h
    const r = h / 2
    for (let i = 0; i < 10; i++) s += GL_W[i] * r * (f(c - r * GL_X[i]) + f(c + r * GL_X[i]))
  }
  return s
}

/** Seno integral Si(x) = ∫₀ˣ sin t / t dt. */
export function senoIntegral(x: number): number {
  if (x === 0) return 0
  const f = (t: number) => (t === 0 ? 1 : Math.sin(t) / t)
  return gauss20(f, 0, x, Math.max(1, Math.ceil(Math.abs(x) / 2)))
}

const LANCZOS = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7]
/** ln Γ(x) para x > 0 (Lanczos, g = 7). */
export function lnGamma(x: number): number {
  if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lnGamma(1 - x)
  x -= 1
  let a = LANCZOS[0]
  const t = x + 7.5
  for (let i = 1; i < 9; i++) a += LANCZOS[i] / (x + i)
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a)
}

/** Gamma incompleta regularizada inferior P(a, x). */
export function gammaP(a: number, x: number): number {
  if (x <= 0) return 0
  if (x < a + 1) {
    let suma = 1 / a
    let t = suma
    for (let n = 1; n < 500; n++) {
      t *= x / (a + n)
      suma += t
      if (Math.abs(t) < Math.abs(suma) * 1e-16) break
    }
    return suma * Math.exp(-x + a * Math.log(x) - lnGamma(a))
  }
  return 1 - gammaQcf(a, x)
}

function gammaQcf(a: number, x: number): number {
  const TINY = 1e-300
  let b = x + 1 - a
  let c = 1 / TINY
  let d = 1 / b
  let h = d
  for (let i = 1; i < 500; i++) {
    const an = -i * (i - a)
    b += 2
    d = an * d + b
    if (Math.abs(d) < TINY) d = TINY
    c = b + an / c
    if (Math.abs(c) < TINY) c = TINY
    d = 1 / d
    const del = d * c
    h *= del
    if (Math.abs(del - 1) < 1e-16) break
  }
  return Math.exp(-x + a * Math.log(x) - lnGamma(a)) * h
}

/** Gamma incompleta regularizada superior Q(a, x) = 1 − P(a, x). */
export function gammaQ(a: number, x: number): number {
  if (x <= 0) return 1
  return x < a + 1 ? 1 - gammaP(a, x) : gammaQcf(a, x)
}

function betaCf(a: number, b: number, x: number): number {
  const TINY = 1e-300
  const qab = a + b
  const qap = a + 1
  const qam = a - 1
  let c = 1
  let d = 1 - (qab * x) / qap
  if (Math.abs(d) < TINY) d = TINY
  d = 1 / d
  let h = d
  for (let m = 1; m < 500; m++) {
    const m2 = 2 * m
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2))
    d = 1 + aa * d
    if (Math.abs(d) < TINY) d = TINY
    c = 1 + aa / c
    if (Math.abs(c) < TINY) c = TINY
    d = 1 / d
    h *= d * c
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2))
    d = 1 + aa * d
    if (Math.abs(d) < TINY) d = TINY
    c = 1 + aa / c
    if (Math.abs(c) < TINY) c = TINY
    d = 1 / d
    const del = d * c
    h *= del
    if (Math.abs(del - 1) < 1e-16) break
  }
  return h
}

/** Beta incompleta regularizada I_x(a, b). */
export function betaI(a: number, b: number, x: number): number {
  if (x <= 0) return 0
  if (x >= 1) return 1
  const bt = Math.exp(lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x))
  return x < (a + 1) / (a + b + 2) ? (bt * betaCf(a, b, x)) / a : 1 - (bt * betaCf(b, a, 1 - x)) / b
}

/** Función error con precisión de máquina, vía P(½, x²). */
export function erf(x: number): number {
  const v = gammaP(0.5, x * x)
  return x < 0 ? -v : v
}

/** erfc sin cancelación para x grande. */
export function erfc(x: number): number {
  return x < 0 ? 1 + gammaP(0.5, x * x) : gammaQ(0.5, x * x)
}

/** Inversa de erf en (−1, 1): semilla de Giles y dos pasos de Newton. */
export function erfInv(y: number): number {
  if (y <= -1) return -Infinity
  if (y >= 1) return Infinity
  let w = -Math.log((1 - y) * (1 + y))
  let x: number
  if (w < 5) {
    w -= 2.5
    let p = 2.81022636e-8
    for (const c of [3.43273939e-7, -3.5233877e-6, -4.39150654e-6, 0.00021858087, -0.00125372503, -0.00417768164, 0.246640727, 1.50140941]) p = c + p * w
    x = p * y
  } else {
    w = Math.sqrt(w) - 3
    let p = -0.000200214257
    for (const c of [0.000100950558, 0.00134934322, -0.00367342844, 0.00573950773, -0.0076224613, 0.00943887047, 1.00167406, 2.83297682]) p = c + p * w
    x = p * y
  }
  for (let i = 0; i < 2; i++) x -= (erf(x) - y) / ((2 / Math.sqrt(Math.PI)) * Math.exp(-x * x))
  return x
}

/** J_n(x) utilizable para x grande: serie hasta 20 y, más allá, recurrencia de Miller hacia atrás normalizada. */
export function besselJx(n: number, x: number): number {
  if (x < 0) return (n % 2 === 0 ? 1 : -1) * besselJx(n, -x)
  if (x < 20) return besselJ(n, x)
  const M = 2 * Math.floor((Math.max(n, x) + 40 + Math.sqrt(40 * Math.max(n, x))) / 2)
  let jp1 = 0
  let j = 1e-300
  let suma = 0
  let res = 0
  for (let k = M; k > 0; k--) {
    const jm1 = ((2 * k) / x) * j - jp1
    jp1 = j
    j = jm1
    if (Math.abs(j) > 1e250) {
      j *= 1e-250
      jp1 *= 1e-250
      res *= 1e-250
      suma *= 1e-250
    }
    if (k - 1 === n) res = j
    if ((k - 1) % 2 === 0 && k - 1 > 0) suma += 2 * j
  }
  suma += j
  return res / suma
}
