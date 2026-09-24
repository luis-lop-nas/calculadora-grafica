import { betaI, erf, erfInv, gammaP, lnGamma } from './especiales'

/** Generador xoshiro128** con semilla: la misma semilla da la misma simulación en la web y en la app. */
export function generador(semilla: number) {
  let a = 0x9e3779b9 ^ semilla
  let b = 0x243f6a88 ^ (semilla * 31)
  let c = 0xb7e15162 ^ (semilla * 131)
  let d = 0x85a308d3 ^ (semilla * 1031)
  const rotl = (x: number, k: number) => (x << k) | (x >>> (32 - k))
  const sig = () => {
    const r = Math.imul(rotl(Math.imul(b, 5), 7), 9)
    const t = b << 9
    c ^= a
    d ^= b
    b ^= c
    a ^= d
    c ^= t
    d = rotl(d, 11)
    return (r >>> 0) / 4294967296
  }
  for (let i = 0; i < 20; i++) sig()
  let guardada: number | null = null
  const uniforme = () => {
    let u = sig()
    while (u === 0) u = sig()
    return u
  }
  const normal = () => {
    if (guardada !== null) {
      const g = guardada
      guardada = null
      return g
    }
    const r = Math.sqrt(-2 * Math.log(uniforme()))
    const th = 2 * Math.PI * sig()
    guardada = r * Math.sin(th)
    return r * Math.cos(th)
  }
  return {
    u: sig,
    uniforme,
    normal,
    exponencial: (l: number) => -Math.log(uniforme()) / l,
    poisson(l: number) {
      // suma de Poisson(λ/m) independientes: exacta y sin subdesbordar e^{−λ}
      if (l > 30) {
        const m = Math.ceil(l / 30)
        let k = 0
        for (let i = 0; i < m; i++) k += this.poisson(l / m)
        return k
      }
      const L = Math.exp(-l)
      let k = 0
      let p = 1
      do {
        k++
        p *= sig()
      } while (p > L)
      return k - 1
    },
    binomial(n: number, p: number) {
      let k = 0
      for (let i = 0; i < n; i++) if (sig() < p) k++
      return k
    },
    entero: (n: number) => Math.floor(sig() * n),
  }
}
export type Generador = ReturnType<typeof generador>

export interface Distribucion {
  id: string
  nombre: string
  discreta: boolean
  params: { nombre: string; valor: number; min: number; max: number; paso: number; entero?: boolean }[]
  /** soporte razonable para dibujar */
  soporte(p: number[]): [number, number]
  pdf(x: number, p: number[]): number
  cdf(x: number, p: number[]): number
  cuantil(q: number, p: number[]): number
  media(p: number[]): number
  varianza(p: number[]): number
  tex: string
  muestra(g: Generador, p: number[]): number
}

const SQ2 = Math.SQRT2

export const phi = (z: number) => 0.5 * (1 + erf(z / SQ2))
export const phiInv = (q: number) => SQ2 * erfInv(2 * q - 1)

/** Cuantil por bisección sobre una cdf continua y monótona. */
function invertir(cdf: (x: number) => number, q: number, a: number, b: number): number {
  while (cdf(a) > q) a = a - Math.max(1, Math.abs(a))
  while (cdf(b) < q) b = b + Math.max(1, Math.abs(b))
  for (let i = 0; i < 200; i++) {
    const m = (a + b) / 2
    if (cdf(m) < q) a = m
    else b = m
    if (b - a < 1e-14 * Math.max(1, Math.abs(m))) break
  }
  return (a + b) / 2
}

/** Cuantil discreto: el menor k con F(k) ≥ q. */
function invertirDiscreta(cdf: (k: number) => number, q: number, max = 1e7): number {
  let k = 0
  while (k < max && cdf(k) < q - 1e-15) k++
  return k
}

const lnComb = (n: number, k: number) => lnGamma(n + 1) - lnGamma(k + 1) - lnGamma(n - k + 1)

export const cdfT = (x: number, n: number) => {
  const ib = betaI(n / 2, 0.5, n / (n + x * x))
  return x >= 0 ? 1 - 0.5 * ib : 0.5 * ib
}
export const cdfChi2 = (x: number, k: number) => gammaP(k / 2, Math.max(0, x) / 2)
export const cdfF = (x: number, a: number, b: number) => (x <= 0 ? 0 : betaI(a / 2, b / 2, (a * x) / (a * x + b)))

export const DISTRIBUCIONES: Distribucion[] = [
  {
    id: 'normal', nombre: 'Normal', discreta: false, tex: String.raw`\mathcal N(\mu,\sigma^2)`,
    params: [{ nombre: 'μ', valor: 0, min: -5, max: 5, paso: 0.1 }, { nombre: 'σ', valor: 1, min: 0.1, max: 5, paso: 0.1 }],
    soporte: ([m, s]) => [m - 4.5 * s, m + 4.5 * s],
    pdf: (x, [m, s]) => Math.exp(-(((x - m) / s) ** 2) / 2) / (s * Math.sqrt(2 * Math.PI)),
    cdf: (x, [m, s]) => phi((x - m) / s),
    cuantil: (q, [m, s]) => m + s * phiInv(q),
    media: ([m]) => m, varianza: ([, s]) => s * s,
    muestra: (g, [m, s]) => m + s * g.normal(),
  },
  {
    id: 't', nombre: 't de Student', discreta: false, tex: String.raw`t_\nu`,
    params: [{ nombre: 'ν', valor: 5, min: 1, max: 60, paso: 1, entero: true }],
    soporte: ([n]) => (n <= 2 ? [-8, 8] : [-5, 5]),
    pdf: (x, [n]) => Math.exp(lnGamma((n + 1) / 2) - lnGamma(n / 2) - 0.5 * Math.log(n * Math.PI) - ((n + 1) / 2) * Math.log(1 + (x * x) / n)),
    cdf: (x, [n]) => cdfT(x, n),
    cuantil: (q, [n]) => invertir((x) => cdfT(x, n), q, -10, 10),
    media: ([n]) => (n > 1 ? 0 : NaN), varianza: ([n]) => (n > 2 ? n / (n - 2) : n > 1 ? Infinity : NaN),
    muestra: (g, [n]) => {
      let c = 0
      for (let i = 0; i < n; i++) c += g.normal() ** 2
      return g.normal() / Math.sqrt(c / n)
    },
  },
  {
    id: 'chi2', nombre: 'χ²', discreta: false, tex: String.raw`\chi^2_k`,
    params: [{ nombre: 'k', valor: 4, min: 1, max: 60, paso: 1, entero: true }],
    soporte: ([k]) => [0, k + 6 * Math.sqrt(2 * k) + 2],
    pdf: (x, [k]) => (x <= 0 ? (k === 2 && x === 0 ? 0.5 : 0) : Math.exp((k / 2 - 1) * Math.log(x) - x / 2 - (k / 2) * Math.LN2 - lnGamma(k / 2))),
    cdf: (x, [k]) => cdfChi2(x, k),
    cuantil: (q, [k]) => invertir((x) => cdfChi2(x, k), q, 0, k + 10),
    media: ([k]) => k, varianza: ([k]) => 2 * k,
    muestra: (g, [k]) => {
      let c = 0
      for (let i = 0; i < k; i++) c += g.normal() ** 2
      return c
    },
  },
  {
    id: 'f', nombre: 'F de Snedecor', discreta: false, tex: String.raw`F_{d_1,d_2}`,
    params: [{ nombre: 'd₁', valor: 5, min: 1, max: 60, paso: 1, entero: true }, { nombre: 'd₂', valor: 10, min: 1, max: 60, paso: 1, entero: true }],
    soporte: () => [0, 5],
    pdf: (x, [a, b]) => (x <= 0 ? 0 : Math.exp(0.5 * (a * Math.log(a * x) + b * Math.log(b) - (a + b) * Math.log(a * x + b)) - Math.log(x) - (lnGamma(a / 2) + lnGamma(b / 2) - lnGamma((a + b) / 2)))),
    cdf: (x, [a, b]) => cdfF(x, a, b),
    cuantil: (q, [a, b]) => invertir((x) => cdfF(x, a, b), q, 0, 10),
    media: ([, b]) => (b > 2 ? b / (b - 2) : NaN),
    varianza: ([a, b]) => (b > 4 ? (2 * b * b * (a + b - 2)) / (a * (b - 2) ** 2 * (b - 4)) : NaN),
    muestra: (g, [a, b]) => {
      let x = 0
      let y = 0
      for (let i = 0; i < a; i++) x += g.normal() ** 2
      for (let i = 0; i < b; i++) y += g.normal() ** 2
      return x / a / (y / b)
    },
  },
  {
    id: 'exponencial', nombre: 'Exponencial', discreta: false, tex: String.raw`\mathrm{Exp}(\lambda)`,
    params: [{ nombre: 'λ', valor: 1, min: 0.1, max: 5, paso: 0.1 }],
    soporte: ([l]) => [0, 7 / l],
    pdf: (x, [l]) => (x < 0 ? 0 : l * Math.exp(-l * x)),
    cdf: (x, [l]) => (x < 0 ? 0 : 1 - Math.exp(-l * x)),
    cuantil: (q, [l]) => -Math.log(1 - q) / l,
    media: ([l]) => 1 / l, varianza: ([l]) => 1 / (l * l),
    muestra: (g, [l]) => g.exponencial(l),
  },
  {
    id: 'gamma', nombre: 'Gamma', discreta: false, tex: String.raw`\Gamma(k,\theta)`,
    params: [{ nombre: 'k', valor: 2, min: 0.5, max: 20, paso: 0.5 }, { nombre: 'θ', valor: 1, min: 0.1, max: 5, paso: 0.1 }],
    soporte: ([k, t]) => [0, (k + 6 * Math.sqrt(k) + 2) * t],
    pdf: (x, [k, t]) => (x <= 0 ? 0 : Math.exp((k - 1) * Math.log(x) - x / t - lnGamma(k) - k * Math.log(t))),
    cdf: (x, [k, t]) => gammaP(k, Math.max(0, x) / t),
    cuantil: (q, [k, t]) => invertir((x) => gammaP(k, Math.max(0, x) / t), q, 0, k * t + 10),
    media: ([k, t]) => k * t, varianza: ([k, t]) => k * t * t,
    muestra: (g, [k, t]) => {
      // Marsaglia–Tsang (k ≥ 1; para k < 1 se usa el truco U^{1/k})
      const kk = k < 1 ? k + 1 : k
      const d = kk - 1 / 3
      const c = 1 / Math.sqrt(9 * d)
      let v = 0
      for (;;) {
        const z = g.normal()
        v = (1 + c * z) ** 3
        if (v > 0 && Math.log(g.uniforme()) < 0.5 * z * z + d - d * v + d * Math.log(v)) break
      }
      const x = d * v * t
      return k < 1 ? x * g.uniforme() ** (1 / k) : x
    },
  },
  {
    id: 'beta', nombre: 'Beta', discreta: false, tex: String.raw`\mathrm{Beta}(\alpha,\beta)`,
    params: [{ nombre: 'α', valor: 2, min: 0.5, max: 20, paso: 0.5 }, { nombre: 'β', valor: 5, min: 0.5, max: 20, paso: 0.5 }],
    soporte: () => [0, 1],
    pdf: (x, [a, b]) => (x <= 0 || x >= 1 ? 0 : Math.exp((a - 1) * Math.log(x) + (b - 1) * Math.log(1 - x) - (lnGamma(a) + lnGamma(b) - lnGamma(a + b)))),
    cdf: (x, [a, b]) => betaI(a, b, x),
    cuantil: (q, [a, b]) => invertir((x) => betaI(a, b, Math.min(1, Math.max(0, x))), q, 0, 1),
    media: ([a, b]) => a / (a + b), varianza: ([a, b]) => (a * b) / ((a + b) ** 2 * (a + b + 1)),
    muestra: (g, [a, b]) => {
      const x = DISTRIBUCIONES[5].muestra(g, [a, 1])
      const y = DISTRIBUCIONES[5].muestra(g, [b, 1])
      return x / (x + y)
    },
  },
  {
    id: 'uniforme', nombre: 'Uniforme', discreta: false, tex: String.raw`\mathcal U(a,b)`,
    params: [{ nombre: 'a', valor: 0, min: -5, max: 5, paso: 0.1 }, { nombre: 'b', valor: 1, min: -5, max: 10, paso: 0.1 }],
    soporte: ([a, b]) => [a - 0.2 * (b - a), b + 0.2 * (b - a)],
    pdf: (x, [a, b]) => (x < a || x > b ? 0 : 1 / (b - a)),
    cdf: (x, [a, b]) => Math.min(1, Math.max(0, (x - a) / (b - a))),
    cuantil: (q, [a, b]) => a + q * (b - a),
    media: ([a, b]) => (a + b) / 2, varianza: ([a, b]) => (b - a) ** 2 / 12,
    muestra: (g, [a, b]) => a + (b - a) * g.u(),
  },
  {
    id: 'binomial', nombre: 'Binomial', discreta: true, tex: String.raw`\mathrm{B}(n,p)`,
    params: [{ nombre: 'n', valor: 20, min: 1, max: 200, paso: 1, entero: true }, { nombre: 'p', valor: 0.3, min: 0.01, max: 0.99, paso: 0.01 }],
    soporte: ([n]) => [0, n],
    pdf: (k, [n, p]) => (k < 0 || k > n || !Number.isInteger(k) ? 0 : Math.exp(lnComb(n, k) + k * Math.log(p) + (n - k) * Math.log1p(-p))),
    cdf: (k, [n, p]) => (k < 0 ? 0 : k >= n ? 1 : 1 - betaI(Math.floor(k) + 1, n - Math.floor(k), p)),
    cuantil: (q, [n, p]) => invertirDiscreta((k) => (k >= n ? 1 : 1 - betaI(k + 1, n - k, p)), q, n),
    media: ([n, p]) => n * p, varianza: ([n, p]) => n * p * (1 - p),
    muestra: (g, [n, p]) => g.binomial(n, p),
  },
  {
    id: 'poisson', nombre: 'Poisson', discreta: true, tex: String.raw`\mathrm{Pois}(\lambda)`,
    params: [{ nombre: 'λ', valor: 4, min: 0.1, max: 50, paso: 0.1 }],
    soporte: ([l]) => [0, Math.ceil(l + 6 * Math.sqrt(l) + 4)],
    pdf: (k, [l]) => (k < 0 || !Number.isInteger(k) ? 0 : Math.exp(k * Math.log(l) - l - lnGamma(k + 1))),
    cdf: (k, [l]) => (k < 0 ? 0 : 1 - gammaP(Math.floor(k) + 1, l)),
    cuantil: (q, [l]) => invertirDiscreta((k) => 1 - gammaP(k + 1, l), q),
    media: ([l]) => l, varianza: ([l]) => l,
    muestra: (g, [l]) => g.poisson(l),
  },
  {
    id: 'geometrica', nombre: 'Geométrica', discreta: true, tex: String.raw`\mathrm{Geo}(p)`,
    params: [{ nombre: 'p', valor: 0.25, min: 0.01, max: 0.99, paso: 0.01 }],
    soporte: ([p]) => [1, Math.ceil(Math.log(0.001) / Math.log(1 - p)) + 1],
    // número de ensayos hasta el primer éxito, k = 1, 2, …
    pdf: (k, [p]) => (k < 1 || !Number.isInteger(k) ? 0 : p * (1 - p) ** (k - 1)),
    cdf: (k, [p]) => (k < 1 ? 0 : 1 - (1 - p) ** Math.floor(k)),
    cuantil: (q, [p]) => Math.max(1, Math.ceil(Math.log(1 - q) / Math.log(1 - p) - 1e-12)),
    media: ([p]) => 1 / p, varianza: ([p]) => (1 - p) / (p * p),
    muestra: (g, [p]) => Math.max(1, Math.ceil(Math.log(g.uniforme()) / Math.log(1 - p))),
  },
]

export const distribucion = (id: string) => DISTRIBUCIONES.find((d) => d.id === id) ?? DISTRIBUCIONES[0]

/* ── Estadística descriptiva ─────────────────────────────── */

export function media(x: ArrayLike<number>) {
  let s = 0
  for (let i = 0; i < x.length; i++) s += x[i]
  return s / x.length
}

/** Cuasivarianza (divisor n − 1), por dos pasadas para no perder cifras. */
export function varianza(x: ArrayLike<number>) {
  const m = media(x)
  let s = 0
  for (let i = 0; i < x.length; i++) s += (x[i] - m) ** 2
  return s / (x.length - 1)
}

/** Cuantil muestral tipo 7 (el de R y de Excel): interpolación lineal. */
export function cuantilMuestral(ordenados: ArrayLike<number>, q: number) {
  const h = (ordenados.length - 1) * q
  const lo = Math.floor(h)
  const hi = Math.min(ordenados.length - 1, lo + 1)
  return ordenados[lo] + (h - lo) * (ordenados[hi] - ordenados[lo])
}

export function correlacion(x: ArrayLike<number>, y: ArrayLike<number>) {
  const mx = media(x)
  const my = media(y)
  let sxy = 0
  let sxx = 0
  let syy = 0
  for (let i = 0; i < x.length; i++) {
    sxy += (x[i] - mx) * (y[i] - my)
    sxx += (x[i] - mx) ** 2
    syy += (y[i] - my) ** 2
  }
  return sxy / Math.sqrt(sxx * syy)
}
