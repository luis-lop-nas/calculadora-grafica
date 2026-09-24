/** Bloque 0: librerías comunes (funciones especiales nuevas, FFT, azar, álgebra lineal numérica). */
import { besselJ, besselJx, betaI, elipticaK, erf, erfc, erfInv, gauss20, gammaP, gammaQ, lnGamma, senoIntegral } from '../../lib/especiales'
import { convolucion, convolucionDirecta, dft, fft, fft2, ifft } from '../../lib/fft'
import { DISTRIBUCIONES, cdfChi2, cdfF, cdfT, correlacion, cuantilMuestral, generador, media, varianza } from '../../lib/azar'
import {
  autoGeneralizado, autovaloresTridiagonal, autovectorTridiagonal, cholesky, jacobiSimetrica, minimosCuadrados,
  mul, raicesPolinomio, resolverLineal, transpuesta,
} from '../../lib/matrices'
import { cerca, cierto, parecido, seccion } from './comun'

export function pruebasBase() {
  seccion('Bloque 0 · funciones especiales nuevas')
  {
    // K(k): valores de Abramowitz–Stegun (tabla 17.1, con módulo k = sin α)
    cerca('K(0) = π/2', elipticaK(0), Math.PI / 2, 1e-15)
    cerca('K(sin 15°)', elipticaK(Math.sin(Math.PI / 12)), 1.5981420021, 1e-10)
    cerca('K(sin 45°)', elipticaK(Math.SQRT1_2), 1.8540746773013719, 1e-13)
    cerca('K(sin 80°)', elipticaK(Math.sin((80 * Math.PI) / 180)), 3.1533852519, 1e-9)
    cerca('Si(π) (constante de Gibbs·π/2)', senoIntegral(Math.PI), 1.851937051982466, 1e-13)
    cerca('Si(1)', senoIntegral(1), 0.946083070367183, 1e-13)
    cerca('Si(−2) impar', senoIntegral(-2), -1.605412976802695, 1e-13)
    cerca('Si(50)', senoIntegral(50), 1.551617072485936, 1e-12)
    cerca('Γ(10) = 9!', Math.exp(lnGamma(10)), 362880, 1e-6)
    cerca('Γ(½) = √π', Math.exp(lnGamma(0.5)), Math.sqrt(Math.PI), 1e-13)
    cerca('P(3, 2) = 1 − 5e⁻²', gammaP(3, 2), 1 - 5 * Math.exp(-2), 1e-14)
    cerca('P(1, x) = 1 − e⁻ˣ en x = 7', gammaP(1, 7), 1 - Math.exp(-7), 1e-14)
    cerca('P + Q = 1', gammaP(4.5, 3.2) + gammaQ(4.5, 3.2), 1, 1e-14)
    cerca('I₀.₄(2, 3) = 0,5248 (polinomio exacto)', betaI(2, 3, 0.4), 0.5248, 1e-14)
    cerca('I_x(a, b) = 1 − I_{1−x}(b, a)', betaI(2.5, 4.2, 0.3), 1 - betaI(4.2, 2.5, 0.7), 1e-14)
    cerca('erf(1)', erf(1), 0.8427007929497149, 1e-15)
    cerca('erf(−0,5)', erf(-0.5), -0.5204998778130465, 1e-15)
    parecido('erfc(5) sin cancelación', erfc(5), 1.5374597944280349e-12, 1e-12)
    for (const y of [-0.999, -0.5, 0.1, 0.9, 0.999999]) cerca(`erf(erf⁻¹(${y}))`, erf(erfInv(y)), y, 1e-15)
    cerca('erf⁻¹(0,5)', erfInv(0.5), 0.4769362762044699, 1e-15)
    // J de Bessel para x grande contra la serie (x = 18, aún exacta) y valores de tabla
    cerca('Jₙ estable = serie en x = 18', besselJx(2, 18), besselJ(2, 18), 1e-10)
    cerca('J₀(50) (tabla)', besselJx(0, 50), 0.05581232766925181, 1e-13)
    cerca('J₁(30) (tabla)', besselJx(1, 30), -0.1187510626166229, 1e-13)
    cerca('J₅(100) (tabla)', besselJx(5, 100), -0.07419573696451392, 1e-12)
    cerca('∫₀^π sin = 2 (Gauss 20)', gauss20(Math.sin, 0, Math.PI), 2, 1e-15)
  }

  seccion('Bloque 0 · FFT')
  {
    const g = generador(7)
    let peor = 0
    for (const n of [1, 2, 3, 5, 7, 8, 12, 17, 31, 64, 100]) {
      const re = Array.from({ length: n }, () => g.normal())
      const im = Array.from({ length: n }, () => g.normal())
      const a = fft(re, im)
      const b = dft(re, im)
      for (let k = 0; k < n; k++) peor = Math.max(peor, Math.abs(a.re[k] - b.re[k]), Math.abs(a.im[k] - b.im[k]))
      const v = ifft(a.re, a.im)
      for (let k = 0; k < n; k++) peor = Math.max(peor, Math.abs(v.re[k] - re[k]), Math.abs(v.im[k] - im[k]))
    }
    cierto('FFT = DFT directa e ifft∘fft = id (N potencia de 2 y no)', peor < 1e-12, String(peor))
    // Parseval: Σ|x|² = (1/N) Σ|X|²
    const x = Array.from({ length: 45 }, (_, i) => Math.sin(i) + 0.3 * i)
    const X = fft(x)
    let e1 = 0
    let e2 = 0
    for (let i = 0; i < 45; i++) {
      e1 += x[i] ** 2
      e2 += (X.re[i] ** 2 + X.im[i] ** 2) / 45
    }
    parecido('Parseval discreto', e2, e1, 1e-13)
    // una exponencial compleja pura cae en un solo cajón
    const N = 32
    const s = fft(Array.from({ length: N }, (_, n) => Math.cos((2 * Math.PI * 5 * n) / N)))
    cerca('cos de 5 ciclos → X₅ = N/2', s.re[5], N / 2, 1e-12)
    cerca('y X₂₇ = N/2 (conjugado)', s.re[27], N / 2, 1e-12)
    cerca('y nada en X₄', Math.hypot(s.re[4], s.im[4]), 0, 1e-12)
    const a = [1, 2, 3, -1, 0.5]
    const b = [0.2, -1, 4]
    const c1 = convolucion(a, b)
    const c2 = convolucionDirecta(a, b)
    cierto('convolución por FFT = directa', c1.every((v, i) => Math.abs(v - c2[i]) < 1e-12))
    // FFT 2D de una onda plana
    const nx = 8
    const ny = 6
    const re = new Float64Array(nx * ny)
    const im = new Float64Array(nx * ny)
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) re[j * nx + i] = Math.cos(2 * Math.PI * ((2 * i) / nx + (1 * j) / ny))
    fft2(re, im, nx, ny)
    cerca('FFT 2D: onda (2, 1) → nx·ny/2 en (2, 1)', re[1 * nx + 2], (nx * ny) / 2, 1e-11)
    fft2(re, im, nx, ny, true)
    cerca('FFT 2D inversa', re[3 * nx + 5], Math.cos(2 * Math.PI * (10 / nx + 3 / ny)), 1e-13)
  }

  seccion('Bloque 0 · distribuciones')
  {
    const d = (id: string) => DISTRIBUCIONES.find((x) => x.id === id)!
    // valores de tabla
    cerca('Φ(1,96)', d('normal').cdf(1.96, [0, 1]), 0.9750021048517795, 1e-14)
    cerca('z₀.₉₇₅', d('normal').cuantil(0.975, [0, 1]), 1.959963984540054, 1e-12)
    cerca('t₀.₉₇₅ con 10 g.l.', d('t').cuantil(0.975, [10]), 2.228138851986273, 1e-10)
    cerca('t con 1 g.l. = Cauchy: F(1) = 3/4', cdfT(1, 1), 0.75, 1e-14)
    cerca('χ²₀.₉₅ con 1 g.l.', d('chi2').cuantil(0.95, [1]), 3.841458820694124, 1e-10)
    cerca('χ² con 2 g.l.: F(x) = 1 − e^{−x/2}', cdfChi2(3, 2), 1 - Math.exp(-1.5), 1e-14)
    cerca('F₀.₉₅(5, 10)', d('f').cuantil(0.95, [5, 10]), 3.325834530413011, 1e-9)
    cerca('F(1; a, a) = ½', cdfF(1, 7, 7), 0.5, 1e-14)
    cerca('Binomial(10; 0,3): P(X ≤ 3)', d('binomial').cdf(3, [10, 0.3]), 0.6496107184, 1e-12)
    cerca('Poisson(3): P(X ≤ 2) = 8,5e⁻³', d('poisson').cdf(2, [3]), 8.5 * Math.exp(-3), 1e-14)
    cerca('Binomial(10; 0,3): pmf(3) exacta', d('binomial').pdf(3, [10, 0.3]), 120 * 0.3 ** 3 * 0.7 ** 7, 1e-15)
    cerca('Geométrica(0,25): P(X ≤ 3) = 1 − 0,75³', d('geometrica').cdf(3, [0.25]), 1 - 0.75 ** 3, 1e-15)
    // para cada distribución continua: ∫pdf = 1, media y varianza por cuadratura, cdf(cuantil(q)) = q
    for (const dist of DISTRIBUCIONES) {
      const p = dist.params.map((x) => x.valor)
      if (dist.discreta) {
        let s = 0
        let m = 0
        let m2 = 0
        const [a, b] = dist.soporte(p)
        for (let k = a; k <= b + 400; k++) {
          const f = dist.pdf(k, p)
          s += f
          m += k * f
          m2 += k * k * f
        }
        cerca(`${dist.nombre}: Σ pmf = 1`, s, 1, 1e-10)
        cerca(`${dist.nombre}: media`, m, dist.media(p), 1e-8)
        cerca(`${dist.nombre}: varianza`, m2 - m * m, dist.varianza(p), 1e-7)
        for (const q of [0.1, 0.5, 0.9]) {
          const k = dist.cuantil(q, p)
          cierto(`${dist.nombre}: cuantil discreto ${q}`, dist.cdf(k, p) >= q - 1e-12 && dist.cdf(k - 1, p) < q)
        }
      } else {
        // x = tan θ lleva el soporte entero a un intervalo finito: las colas pesadas (t, F) no se truncan
        const infinitaIzq = dist.id === 'normal' || dist.id === 't'
        const a = dist.id === 'uniforme' ? p[0] : infinitaIzq ? -Math.PI / 2 : 0
        const b = dist.id === 'uniforme' ? p[1] : dist.id === 'beta' ? 1 : Math.PI / 2
        const plano = dist.id === 'uniforme' || dist.id === 'beta'
        const int = (g: (x: number) => number, lo = a, hi = b) =>
          plano ? gauss20(g, lo, hi, 4000) : gauss20((th) => g(Math.tan(th)) / Math.cos(th) ** 2, lo, hi, 4000)
        const s = int((x) => dist.pdf(x, p))
        const m = int((x) => x * dist.pdf(x, p))
        const v = int((x) => (x - m) ** 2 * dist.pdf(x, p))
        cerca(`${dist.nombre}: ∫ pdf = 1`, s, 1, 1e-7)
        cerca(`${dist.nombre}: media por cuadratura`, m, dist.media(p), 1e-6)
        parecido(`${dist.nombre}: varianza por cuadratura`, v, dist.varianza(p), 1e-7)
        // la cdf es la integral de la pdf: se contrasta en un punto interior
        const x0 = dist.cuantil(0.3, p)
        cerca(`${dist.nombre}: cdf(x) = ∫ pdf`, int((x) => dist.pdf(x, p), a, plano ? x0 : Math.atan(x0)), dist.cdf(x0, p), 1e-7)
        for (const q of [0.01, 0.3, 0.5, 0.95, 0.999]) cerca(`${dist.nombre}: cdf(cuantil(${q}))`, dist.cdf(dist.cuantil(q, p), p), q, 1e-10)
      }
    }
    // generador: momentos muestrales de cada distribución con semilla fija (error ≲ 5σ/√n)
    const g = generador(2024)
    for (const dist of DISTRIBUCIONES) {
      const p = dist.params.map((x) => x.valor)
      const n = 20000
      const xs = Array.from({ length: n }, () => dist.muestra(g, p))
      const sd = Math.sqrt(dist.varianza(p))
      cierto(`${dist.nombre}: media muestral`, Math.abs(media(xs) - dist.media(p)) < (5 * sd) / Math.sqrt(n), `${media(xs)} vs ${dist.media(p)}`)
    }
    const g1 = generador(5)
    const g2 = generador(5)
    cierto('misma semilla → misma sucesión', Array.from({ length: 50 }, () => g1.u()).every((v) => v === g2.u()))
    // descriptiva: cuarteto de Anscombe I
    const xa = [10, 8, 13, 9, 11, 14, 6, 4, 12, 7, 5]
    const ya = [8.04, 6.95, 7.58, 8.81, 8.33, 9.96, 7.24, 4.26, 10.84, 4.82, 5.68]
    cerca('Anscombe: media de y', media(ya), 7.500909090909091, 1e-12)
    cerca('Anscombe: varianza de x', varianza(xa), 11, 1e-12)
    cerca('Anscombe: r', correlacion(xa, ya), 0.81642051634484, 1e-12)
    cerca('cuantil tipo 7: mediana de 1..4', cuantilMuestral([1, 2, 3, 4], 0.5), 2.5, 1e-15)
  }

  seccion('Bloque 0 · álgebra lineal numérica')
  {
    const A = [[4, 1, -2, 2], [1, 2, 0, 1], [-2, 0, 3, -2], [2, 1, -2, -1]]
    const { valores, V } = jacobiSimetrica(A)
    let peor = 0
    for (let k = 0; k < 4; k++) {
      const v = V.map((f) => f[k])
      const Av = A.map((f) => f.reduce((s, a, i) => s + a * v[i], 0))
      peor = Math.max(peor, ...Av.map((c, i) => Math.abs(c - valores[k] * v[i])))
    }
    cierto('Jacobi: A v = λ v', peor < 1e-12, String(peor))
    cerca('Jacobi: Σλ = traza', valores.reduce((a, b) => a + b), 8, 1e-12)
    // referencia calculada aparte con mpmath.eigsy
    cerca('Jacobi: λ_min (mpmath, 30 cifras)', valores[0], -2.197516977439425, 1e-12)
    const VtV = mul(transpuesta(V), V)
    cierto('Jacobi: V ortonormal', VtV.every((f, i) => f.every((c, j) => Math.abs(c - (i === j ? 1 : 0)) < 1e-12)))
    // generalizado: dos masas m y 2m, tres muelles k → det(K − ω²M) = 0 a mano
    const k = 3
    const m = 1.5
    const gen = autoGeneralizado([[2 * k, -k], [-k, 2 * k]], [[m, 0], [0, 2 * m]])!
    // 2m²ω⁴ − 6kmω² + 3k² = 0
    const disc = Math.sqrt(36 * k * k * m * m - 24 * m * m * k * k)
    cerca('K v = ω² M v: ω₁²', gen.valores[0], (6 * k * m - disc) / (4 * m * m), 1e-12)
    cerca('K v = ω² M v: ω₂²', gen.valores[1], (6 * k * m + disc) / (4 * m * m), 1e-12)
    const v0 = gen.V.map((f) => f[0])
    cerca('modos M-normalizados', m * v0[0] ** 2 + 2 * m * v0[1] ** 2, 1, 1e-12)
    cierto('Cholesky rechaza una indefinida', cholesky([[1, 2], [2, 1]]) === null)
    // tridiagonal: −u'' discretizado, autovalores exactos 2 − 2cos(kπ/(n+1))
    const n = 200
    const d = new Array(n).fill(2)
    const e = new Array(n - 1).fill(-1)
    const lt = autovaloresTridiagonal(d, e, 5)
    for (let j = 0; j < 5; j++) cerca(`tridiagonal: λ${j + 1}`, lt[j], 2 - 2 * Math.cos(((j + 1) * Math.PI) / (n + 1)), 1e-13)
    const u = autovectorTridiagonal(d, e, lt[1])
    const exacto = Array.from({ length: n }, (_, i) => Math.sin((2 * Math.PI * (i + 1)) / (n + 1)))
    const ne = Math.hypot(...exacto)
    const sg = Math.sign(u[0] * exacto[0])
    cierto('tridiagonal: autovector = sin(2πi/(n+1))', exacto.every((c, i) => Math.abs(c / ne - sg * u[i]) < 1e-8))
    // raíces de polinomios: sin simetrías que escondan errores
    const r1 = raicesPolinomio([-6, 11, -6, 1])
    cierto('raíces de (x−1)(x−2)(x−3)', [1, 2, 3].every((x, i) => Math.abs(r1[i][0] - x) < 1e-12 && r1[i][1] === 0))
    // (x² + 2x + 5)(x − 0,7): −1 ± 2i y 0,7
    const r2 = raicesPolinomio([-3.5, 3.6, 1.3, 1])
    cierto('raíces complejas −1 ± 2i y 0,7', Math.abs(r2[0][0] + 1) < 1e-12 && Math.abs(Math.abs(r2[0][1]) - 2) < 1e-12 && Math.abs(r2[2][0] - 0.7) < 1e-12)
    // doble y triple: (x+1)²(x−2)³ = x⁵ − 4x⁴ + x³ + 10x² − 4x − 8
    const r3 = raicesPolinomio([-8, -4, 10, 1, -4, 1])
    cierto('raíz doble y triple exactas y reales', r3.every((r) => r[1] === 0) && Math.abs(r3[0][0] + 1) < 1e-13 && Math.abs(r3[4][0] - 2) < 1e-13, JSON.stringify(r3))
    // Wilkinson de grado 10
    const w: number[] = [1]
    for (let j = 1; j <= 10; j++) {
      const nw = new Array(w.length + 1).fill(0)
      for (let i = 0; i < w.length; i++) {
        nw[i + 1] += w[i]
        nw[i] -= j * w[i]
      }
      w.splice(0, w.length, ...nw)
    }
    const rw = raicesPolinomio(w)
    cierto('Wilkinson 10: raíces 1…10', rw.every((r, i) => Math.abs(r[0] - (i + 1)) < 1e-7))
    const x = resolverLineal([[2, 1, -1], [-3, -1, 2], [-2, 1, 2]], [8, -11, -3])!
    cierto('Gauss con pivoteo: (2, 3, −1)', Math.abs(x[0] - 2) + Math.abs(x[1] - 3) + Math.abs(x[2] + 1) < 1e-13)
    // mínimos cuadrados: recupera un polinomio exacto y coincide con la solución de las normales en un caso bien condicionado
    const ts = Array.from({ length: 12 }, (_, i) => i * 0.37 - 1.2)
    const coef = minimosCuadrados(ts.map((t) => [1, t, t * t, t ** 3]), ts.map((t) => 0.5 - 2 * t + 0.25 * t * t + 1.5 * t ** 3))!
    cierto('QR recupera 0,5 − 2t + 0,25t² + 1,5t³', [0.5, -2, 0.25, 1.5].every((c, i) => Math.abs(coef[i] - c) < 1e-12), coef.join(','))
    const lin = minimosCuadrados([[1, 1], [1, 2], [1, 3]], [1, 2, 2])!
    cerca('recta de mínimos cuadrados: ordenada 2/3', lin[0], 2 / 3, 1e-14)
    cerca('pendiente ½', lin[1], 0.5, 1e-14)
  }
}
