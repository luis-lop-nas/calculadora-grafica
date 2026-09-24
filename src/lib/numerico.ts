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
