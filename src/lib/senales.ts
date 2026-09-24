/**
 * Utilidades numéricas de señales: localizar saltos, integrar a trozos, coeficientes de Fourier,
 * transformada continua por cuadratura.
 */

const GL_X = [0.0765265211334973, 0.2277858511416451, 0.3737060887154195, 0.5108670019508271, 0.636053680726515, 0.7463319064601508, 0.8391169718222188, 0.912234428251326, 0.9639719272779138, 0.9931285991850949]
const GL_W = [0.1527533871307258, 0.1491729864726037, 0.142096109318382, 0.1316886384491766, 0.1181945319615184, 0.1019301198172404, 0.0832767415767048, 0.0626720483341091, 0.0406014298003869, 0.0176140071391521]

/**
 * Saltos de f en (a, b): se muestrea fino y, donde una diferencia destaca frente a sus vecinas,
 * se acota el salto por bisección hasta la precisión de máquina. Sirve para partir las integrales
 * justo en las discontinuidades (una cuadratura que cruza un salto pierde el orden).
 */
export function rupturas(f: (t: number) => number, a: number, b: number, M = 4096): number[] {
  const h = (b - a) / M
  // rejilla desplazada una fracción irracional del paso: un salto no cae nunca sobre un nodo
  // (si cayera, sgn(0) = 0 partiría el salto en dos diferencias iguales y no destacaría)
  const desp = 0.3819660112501051
  const v = new Float64Array(M + 1)
  const tk = (i: number) => a + (i + desp) * h
  for (let i = 0; i <= M; i++) v[i] = f(Math.min(b, tk(i)))
  const d = new Float64Array(M)
  for (let i = 0; i < M; i++) d[i] = Number.isFinite(v[i]) && Number.isFinite(v[i + 1]) ? Math.abs(v[i + 1] - v[i]) : 0
  let escala = 0
  for (let i = 0; i <= M; i++) if (Number.isFinite(v[i])) escala = Math.max(escala, Math.abs(v[i]))
  const out: number[] = []
  for (let i = 0; i < M; i++) {
    const vecinas = Math.max(i > 0 ? d[i - 1] : 0, i < M - 1 ? d[i + 1] : 0)
    if (d[i] > 1e-9 * Math.max(1, escala) && d[i] > 6 * vecinas) {
      let lo = tk(i)
      let hi = Math.min(b, tk(i + 1))
      let flo = f(lo)
      for (let k = 0; k < 60 && hi - lo > 1e-15 * Math.max(1, Math.abs(lo)); k++) {
        const m = (lo + hi) / 2
        const fm = f(m)
        // se queda con la mitad donde la variación es mayor
        if (Math.abs(fm - flo) >= Math.abs(f(hi) - fm)) hi = m
        else {
          lo = m
          flo = fm
        }
      }
      out.push((lo + hi) / 2)
    }
  }
  return out
}

/** Nodos y pesos de Gauss–Legendre compuesto en [a, b] partido por `cortes` y con `porUnidad` tramos por unidad de longitud. */
export function nodos(a: number, b: number, cortes: number[], tramosTotales: number): { t: Float64Array; w: Float64Array } {
  const puntos = [a, ...cortes.filter((c) => c > a && c < b).sort((x, y) => x - y), b]
  const ts: number[] = []
  const ws: number[] = []
  for (let k = 0; k < puntos.length - 1; k++) {
    const p = puntos[k]
    const q = puntos[k + 1]
    const n = Math.max(1, Math.ceil((tramosTotales * (q - p)) / (b - a)))
    const h = (q - p) / n
    for (let j = 0; j < n; j++) {
      const c = p + (j + 0.5) * h
      const r = h / 2
      for (let i = 0; i < 10; i++) {
        ts.push(c - r * GL_X[i], c + r * GL_X[i])
        ws.push(GL_W[i] * r, GL_W[i] * r)
      }
    }
  }
  return { t: Float64Array.from(ts), w: Float64Array.from(ws) }
}

export interface Coeficientes {
  T: number
  a: Float64Array
  b: Float64Array
  /** (1/T)∫ f² en un periodo: la energía media que reparte Parseval */
  potencia: number
  saltos: number[]
}

/**
 * Coeficientes reales de Fourier de f en [−T/2, T/2]:
 *   f ~ a₀/2 + Σ aₙ cos(nω t) + bₙ sin(nω t),  ω = 2π/T.
 */
export function coeficientesFourier(f: (t: number) => number, T: number, N: number): Coeficientes {
  const a0 = -T / 2
  const b0 = T / 2
  const saltos = rupturas(f, a0, b0)
  const { t, w } = nodos(a0, b0, saltos, Math.max(128, 4 * N))
  const fv = new Float64Array(t.length)
  let potencia = 0
  for (let i = 0; i < t.length; i++) {
    const v = f(t[i])
    fv[i] = Number.isFinite(v) ? v : 0
    potencia += w[i] * fv[i] * fv[i]
  }
  const a = new Float64Array(N + 1)
  const b = new Float64Array(N + 1)
  const om = (2 * Math.PI) / T
  for (let i = 0; i < t.length; i++) {
    // cos(nθ), sin(nθ) por la recurrencia de Chebyshev evaluada en doble precisión
    const th = om * t[i]
    const c1 = Math.cos(th)
    const s1 = Math.sin(th)
    let c = 1
    let s = 0
    const peso = w[i] * fv[i]
    for (let n = 0; n <= N; n++) {
      a[n] += peso * c
      b[n] += peso * s
      const cn = c * c1 - s * s1
      s = s * c1 + c * s1
      c = cn
    }
  }
  for (let n = 0; n <= N; n++) {
    a[n] *= 2 / T
    b[n] *= 2 / T
  }
  b[0] = 0
  return { T, a, b, potencia: potencia / T, saltos }
}

/** Suma parcial S_N (o media de Fejér σ_N si `fejer`) en t. */
export function sumaParcial(c: Coeficientes, N: number, t: number, fejer = false): number {
  const om = (2 * Math.PI) / c.T
  let s = c.a[0] / 2
  for (let n = 1; n <= N; n++) {
    const peso = fejer ? 1 - n / (N + 1) : 1
    s += peso * (c.a[n] * Math.cos(n * om * t) + c.b[n] * Math.sin(n * om * t))
  }
  return s
}

/** Transformada continua X(ν) = ∫ x(t) e^{−2πiνt} dt en [−L, L] (x se supone nula fuera), por cuadratura partida en los saltos. */
export function transformada(x: (t: number) => number, L: number, frecuencias: ArrayLike<number>, tramos = 1600) {
  const saltos = rupturas(x, -L, L)
  const { t, w } = nodos(-L, L, saltos, tramos)
  const xv = new Float64Array(t.length)
  for (let i = 0; i < t.length; i++) {
    const v = x(t[i])
    xv[i] = Number.isFinite(v) ? v * w[i] : 0
  }
  const re = new Float64Array(frecuencias.length)
  const im = new Float64Array(frecuencias.length)
  for (let k = 0; k < frecuencias.length; k++) {
    const om = -2 * Math.PI * frecuencias[k]
    let sr = 0
    let si = 0
    for (let i = 0; i < t.length; i++) {
      sr += xv[i] * Math.cos(om * t[i])
      si += xv[i] * Math.sin(om * t[i])
    }
    re[k] = sr
    im[k] = si
  }
  return { re, im }
}

/** Integral de f en [a, b] partida en sus saltos. */
export function integrarTrozos(f: (t: number) => number, a: number, b: number, tramos = 400): number {
  const { t, w } = nodos(a, b, rupturas(f, a, b), tramos)
  let s = 0
  for (let i = 0; i < t.length; i++) {
    const v = f(t[i])
    if (Number.isFinite(v)) s += w[i] * v
  }
  return s
}

/** Ventanas para la DFT. */
export const VENTANAS: Record<string, (n: number, N: number) => number> = {
  rectangular: () => 1,
  hann: (n, N) => 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / (N - 1)),
  hamming: (n, N) => 0.54 - 0.46 * Math.cos((2 * Math.PI * n) / (N - 1)),
  blackman: (n, N) => 0.42 - 0.5 * Math.cos((2 * Math.PI * n) / (N - 1)) + 0.08 * Math.cos((4 * Math.PI * n) / (N - 1)),
}
