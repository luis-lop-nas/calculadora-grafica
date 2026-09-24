/**
 * Transformada discreta de Fourier rápida sobre partes real e imaginaria separadas.
 * Convenio: X_k = Σ x_n e^{−2πi kn/N}; la inversa lleva el 1/N.
 * N potencia de 2 → radix-2 iterativo; cualquier otro N → Bluestein (chirp-z) sobre radix-2.
 */

function esPotencia2(n: number) {
  return n > 0 && (n & (n - 1)) === 0
}

function radix2(re: Float64Array, im: Float64Array, inversa: boolean) {
  const n = re.length
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      ;[re[i], re[j]] = [re[j], re[i]]
      ;[im[i], im[j]] = [im[j], im[i]]
    }
  }
  const signo = inversa ? 1 : -1
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (signo * 2 * Math.PI) / len
    const mitad = len >> 1
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < mitad; k++) {
        // twiddle calculado directamente (no por recurrencia) para no acumular error
        const wr = Math.cos(ang * k)
        const wi = Math.sin(ang * k)
        const a = i + k
        const b = a + mitad
        const tr = re[b] * wr - im[b] * wi
        const ti = re[b] * wi + im[b] * wr
        re[b] = re[a] - tr
        im[b] = im[a] - ti
        re[a] += tr
        im[a] += ti
      }
    }
  }
}

function bluestein(re: Float64Array, im: Float64Array, inversa: boolean) {
  const n = re.length
  let m = 1
  while (m < 2 * n - 1) m <<= 1
  const signo = inversa ? 1 : -1
  // chirp w_k = e^{signo·iπk²/N}; k² mod 2N evita perder precisión con k grande
  const cr = new Float64Array(n)
  const ci = new Float64Array(n)
  for (let k = 0; k < n; k++) {
    const a = (Math.PI * ((k * k) % (2 * n))) / n
    cr[k] = Math.cos(a)
    ci[k] = signo * Math.sin(a)
  }
  const ar = new Float64Array(m)
  const ai = new Float64Array(m)
  for (let k = 0; k < n; k++) {
    ar[k] = re[k] * cr[k] - im[k] * ci[k]
    ai[k] = re[k] * ci[k] + im[k] * cr[k]
  }
  const br = new Float64Array(m)
  const bi = new Float64Array(m)
  br[0] = cr[0]
  bi[0] = -ci[0]
  for (let k = 1; k < n; k++) {
    br[k] = br[m - k] = cr[k]
    bi[k] = bi[m - k] = -ci[k]
  }
  radix2(ar, ai, false)
  radix2(br, bi, false)
  for (let k = 0; k < m; k++) {
    const r = ar[k] * br[k] - ai[k] * bi[k]
    const i = ar[k] * bi[k] + ai[k] * br[k]
    ar[k] = r
    ai[k] = i
  }
  radix2(ar, ai, true)
  for (let k = 0; k < n; k++) {
    const r = ar[k] / m
    const i = ai[k] / m
    re[k] = r * cr[k] - i * ci[k]
    im[k] = r * ci[k] + i * cr[k]
  }
}

/** FFT en el sitio. `inversa` aplica e^{+2πi…} y divide entre N. */
export function fftEnSitio(re: Float64Array, im: Float64Array, inversa = false) {
  const n = re.length
  if (n <= 1) return
  if (esPotencia2(n)) radix2(re, im, inversa)
  else bluestein(re, im, inversa)
  if (inversa) for (let k = 0; k < n; k++) {
    re[k] /= n
    im[k] /= n
  }
}

export interface Espectro {
  re: Float64Array
  im: Float64Array
}

export function fft(re: ArrayLike<number>, im?: ArrayLike<number>): Espectro {
  const r = Float64Array.from(re)
  const i = im ? Float64Array.from(im) : new Float64Array(r.length)
  fftEnSitio(r, i)
  return { re: r, im: i }
}

export function ifft(re: ArrayLike<number>, im: ArrayLike<number>): Espectro {
  const r = Float64Array.from(re)
  const i = Float64Array.from(im)
  fftEnSitio(r, i, true)
  return { re: r, im: i }
}

/** DFT directa O(N²): solo para contrastar la FFT. */
export function dft(re: ArrayLike<number>, im: ArrayLike<number>): Espectro {
  const n = re.length
  const R = new Float64Array(n)
  const I = new Float64Array(n)
  for (let k = 0; k < n; k++) {
    let sr = 0
    let si = 0
    for (let j = 0; j < n; j++) {
      const a = (-2 * Math.PI * ((k * j) % n)) / n
      sr += re[j] * Math.cos(a) - im[j] * Math.sin(a)
      si += re[j] * Math.sin(a) + im[j] * Math.cos(a)
    }
    R[k] = sr
    I[k] = si
  }
  return { re: R, im: I }
}

/** FFT 2D sobre una rejilla fila a fila (ny filas de nx), en el sitio. */
export function fft2(re: Float64Array, im: Float64Array, nx: number, ny: number, inversa = false) {
  const fr = new Float64Array(nx)
  const fi = new Float64Array(nx)
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      fr[i] = re[j * nx + i]
      fi[i] = im[j * nx + i]
    }
    fftEnSitio(fr, fi, inversa)
    for (let i = 0; i < nx; i++) {
      re[j * nx + i] = fr[i]
      im[j * nx + i] = fi[i]
    }
  }
  const cr = new Float64Array(ny)
  const ci = new Float64Array(ny)
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      cr[j] = re[j * nx + i]
      ci[j] = im[j * nx + i]
    }
    fftEnSitio(cr, ci, inversa)
    for (let j = 0; j < ny; j++) {
      re[j * nx + i] = cr[j]
      im[j * nx + i] = ci[j]
    }
  }
}

/** Reordena para poner la frecuencia cero en el centro (índice ⌊N/2⌋). */
export function centrar<T extends { length: number; [i: number]: number }>(a: T, crear: (n: number) => T): T {
  const n = a.length
  const out = crear(n)
  const h = Math.floor(n / 2)
  for (let k = 0; k < n; k++) out[(k + h) % n] = a[k]
  return out
}

/** Convolución lineal de dos secuencias reales vía FFT (longitud a+b−1). */
export function convolucion(a: ArrayLike<number>, b: ArrayLike<number>): Float64Array {
  const n = a.length + b.length - 1
  let m = 1
  while (m < n) m <<= 1
  const ar = new Float64Array(m)
  const ai = new Float64Array(m)
  const br = new Float64Array(m)
  const bi = new Float64Array(m)
  for (let i = 0; i < a.length; i++) ar[i] = a[i]
  for (let i = 0; i < b.length; i++) br[i] = b[i]
  fftEnSitio(ar, ai)
  fftEnSitio(br, bi)
  for (let k = 0; k < m; k++) {
    const r = ar[k] * br[k] - ai[k] * bi[k]
    ai[k] = ar[k] * bi[k] + ai[k] * br[k]
    ar[k] = r
  }
  fftEnSitio(ar, ai, true)
  return ar.slice(0, n)
}

/** Convolución lineal directa O(N·M): para contrastar. */
export function convolucionDirecta(a: ArrayLike<number>, b: ArrayLike<number>): Float64Array {
  const out = new Float64Array(a.length + b.length - 1)
  for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) out[i + j] += a[i] * b[j]
  return out
}
