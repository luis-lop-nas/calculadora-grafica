export type Campo = (t: number, y: number[]) => number[]

/** Un paso de Runge-Kutta de orden 4. */
export function rk4(f: Campo, t: number, y: number[], h: number): number[] {
  const k1 = f(t, y)
  const y2 = y.map((v, i) => v + (h / 2) * k1[i])
  const k2 = f(t + h / 2, y2)
  const y3 = y.map((v, i) => v + (h / 2) * k2[i])
  const k3 = f(t + h / 2, y3)
  const y4 = y.map((v, i) => v + h * k3[i])
  const k4 = f(t + h, y4)
  return y.map((v, i) => v + (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]))
}

/** Integra hacia delante (y hacia atrás si `h` es negativo) guardando la traza. */
export function trayectoria(
  f: Campo,
  y0: number[],
  h: number,
  pasos: number,
  limite?: (y: number[]) => boolean,
): number[][] {
  const out: number[][] = [y0.slice()]
  let y = y0.slice()
  let t = 0
  for (let i = 0; i < pasos; i++) {
    y = rk4(f, t, y, h)
    t += h
    if (!y.every(Number.isFinite)) break
    if (limite && !limite(y)) break
    out.push(y.slice())
  }
  return out
}

/** Método de Euler explícito, para enseñar el error frente a RK4. */
export function euler(f: Campo, t: number, y: number[], h: number): number[] {
  const k = f(t, y)
  return y.map((v, i) => v + h * k[i])
}

/** Punto medio (RK2). */
export function rk2(f: Campo, t: number, y: number[], h: number): number[] {
  const k1 = f(t, y)
  const ym = y.map((v, i) => v + (h / 2) * k1[i])
  const k2 = f(t + h / 2, ym)
  return y.map((v, i) => v + h * k2[i])
}

/** Coeficiente de Fourier b_k de f en [0, L] con la base sin(kπx/L). */
export function coefSeno(f: (x: number) => number, k: number, L: number, n = 600): number {
  let s = 0
  for (let i = 0; i <= n; i++) {
    const x = (L * i) / n
    const w = i === 0 || i === n ? 0.5 : 1
    s += w * f(x) * Math.sin((k * Math.PI * x) / L)
  }
  return ((2 / L) * s * L) / n
}

/**
 * Dormand–Prince 5(4) adaptativo para sistemas y′ = f(t, y), con control de error mixto
 * (tol·(1 + |y|)). Devuelve los pasos aceptados (t, y, y′), que bastan para interpolar con
 * Hermite cúbico entre ellos.
 */
export function dormandPrince(
  f: Campo,
  t0: number,
  y0: number[],
  t1: number,
  tol = 1e-10,
  maxPasos = 200000,
): { t: number[]; y: number[][]; dy: number[][]; parada?: string } {
  const c = [0, 1 / 5, 3 / 10, 4 / 5, 8 / 9, 1, 1]
  const A = [
    [],
    [1 / 5],
    [3 / 40, 9 / 40],
    [44 / 45, -56 / 15, 32 / 9],
    [19372 / 6561, -25360 / 2187, 64448 / 6561, -212 / 729],
    [9017 / 3168, -355 / 33, 46732 / 5247, 49 / 176, -5103 / 18656],
    [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84],
  ]
  const b5 = [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84, 0]
  const b4 = [5179 / 57600, 0, 7571 / 16695, 393 / 640, -92097 / 339200, 187 / 2100, 1 / 40]
  const n = y0.length
  const dir = Math.sign(t1 - t0) || 1
  let t = t0
  let y = y0.slice()
  let k1 = f(t, y)
  let h = dir * Math.min(Math.abs(t1 - t0), 1e-3 * Math.max(1, Math.abs(t1 - t0)))
  const out = { t: [t], y: [y.slice()], dy: [k1.slice()] } as { t: number[]; y: number[][]; dy: number[][]; parada?: string }
  for (let paso = 0; paso < maxPasos && dir * (t1 - t) > 1e-14 * Math.max(1, Math.abs(t1)); paso++) {
    if (dir * (t + h - t1) > 0) h = t1 - t
    const k: number[][] = [k1]
    for (let s = 1; s < 7; s++) {
      const ys = y.map((v, i) => v + h * A[s].reduce((acc, a, j) => acc + a * k[j][i], 0))
      k.push(f(t + c[s] * h, ys))
    }
    const y5 = y.map((v, i) => v + h * b5.reduce((acc, b, j) => acc + b * k[j][i], 0))
    let err = 0
    for (let i = 0; i < n; i++) {
      const e4 = h * b4.reduce((acc, b, j) => acc + (b5[j] - b) * k[j][i], 0)
      err = Math.max(err, Math.abs(e4) / (tol * (1 + Math.max(Math.abs(y[i]), Math.abs(y5[i])))))
    }
    if (!Number.isFinite(err)) {
      out.parada = 'la solución explota'
      break
    }
    if (err <= 1) {
      t += h
      y = y5
      k1 = k[6]
      out.t.push(t)
      out.y.push(y.slice())
      out.dy.push(k1.slice())
    }
    h *= Math.min(5, Math.max(0.2, 0.9 * err ** -0.2))
    if (Math.abs(h) < 1e-14 * Math.max(1, Math.abs(t))) {
      out.parada = 'paso demasiado pequeño (singularidad o rigidez)'
      break
    }
  }
  return out
}

/** Hermite cúbico entre los pasos aceptados de `dormandPrince`: y(t) para cualquier t del tramo. */
export function interpolarHermite(sol: { t: number[]; y: number[][]; dy: number[][] }, t: number): number[] {
  const ts = sol.t
  let lo = 0
  let hi = ts.length - 1
  if (t <= ts[0]) return sol.y[0].slice()
  if (t >= ts[hi]) return sol.y[hi].slice()
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1
    if (ts[m] <= t) lo = m
    else hi = m
  }
  const h = ts[hi] - ts[lo]
  const s = (t - ts[lo]) / h
  const h00 = 2 * s ** 3 - 3 * s * s + 1
  const h10 = s ** 3 - 2 * s * s + s
  const h01 = -2 * s ** 3 + 3 * s * s
  const h11 = s ** 3 - s * s
  return sol.y[lo].map((y0, i) => h00 * y0 + h10 * h * sol.dy[lo][i] + h01 * sol.y[hi][i] + h11 * h * sol.dy[hi][i])
}
