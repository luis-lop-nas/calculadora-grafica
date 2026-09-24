/** Bloque 1: señales y sistemas. */
import { coeficientesFourier, integrarTrozos, rupturas, sumaParcial, transformada } from '../../lib/senales'
import { compilar } from '../../lib/expresion'
import fourier, { energia, sobreoscilacion, type EstadoFourier } from '../../modulos/senales/fourier'
import { anchoDeBanda, dftEscalada, dtftMuestras, reconstruir } from '../../modulos/senales/transformada'
import { erfInv } from '../../lib/especiales'
import { convolucionEn, convolucionRejilla } from '../../modulos/senales/convolucion'
import { edoPorLaplace, laplace, laplaceInversa, leerExpr } from '../../lib/cas/laplace'
import { evaluar } from '../../lib/cas/expr'
import { ejecutar } from '../../lib/cas/cas'
import { asintotasLugar, bode, lazoCerrado, margenes, metricas, mulP, nyquist, polos, respuesta, routh, type FT } from '../../lib/control'
import { raicesPolinomio } from '../../lib/matrices'
import circuito, { estadoEn, fasores, parametros, respuestaAmplitud, type EstadoCircuito } from '../../modulos/senales/circuito'
import { rk4 } from '../../lib/numerico'
import filtros, { butterworth, coeficientes, filtrar, polosCerosZ, respuestaFrecuencia, type Coefs, type EstadoFiltro } from '../../modulos/senales/filtros'
import { cerca, cierto, lectura, parecido, seccion } from './comun'

export function pruebasSenales() {
  seccion('Señales · series de Fourier contra sus formas cerradas')
  {
    const PI = Math.PI
    const N = 400
    const peor = (f: (n: number) => number, g: (n: number) => number, desde = 1) => {
      let e = 0
      for (let n = desde; n <= N; n++) e = Math.max(e, Math.abs(f(n) - g(n)))
      return e
    }
    const sq = coeficientesFourier(Math.sign, 2 * PI, N)
    cierto('cuadrada: bₙ = 4/(nπ) impares, 0 pares (n ≤ 400)', peor((n) => sq.b[n], (n) => (n % 2 ? 4 / (n * PI) : 0)) < 1e-12)
    cierto('cuadrada: aₙ = 0', peor((n) => sq.a[n], () => 0, 0) < 1e-12)
    const saw = coeficientesFourier((t) => t / PI, 2 * PI, N)
    cierto('sierra: bₙ = 2(−1)ⁿ⁺¹/(nπ)', peor((n) => saw.b[n], (n) => (2 * (-1) ** (n + 1)) / (n * PI)) < 1e-12)
    cerca('sierra: (1/T)∫f² = 1/3', saw.potencia, 1 / 3, 1e-14)
    const tri = coeficientesFourier(Math.abs, 2 * PI, N)
    cerca('triangular: a₀ = π', tri.a[0], PI, 1e-13)
    cierto('triangular: aₙ = −4/(πn²) impares', peor((n) => tri.a[n], (n) => (n % 2 ? -4 / (PI * n * n) : 0)) < 1e-12)
    const par = coeficientesFourier((t) => t * t, 2 * PI, N)
    cierto('parábola: aₙ = 4(−1)ⁿ/n²', peor((n) => par.a[n], (n) => (4 * (-1) ** n) / (n * n)) < 1e-12)
    // Parseval con t²: π⁴/5 = π⁴/9 + 8Σ1/n⁴ → la cola tras N es 8/(3N³)
    cerca('parábola: Parseval (Σ1/n⁴ = π⁴/90)', energia(par, N) + 8 / (3 * N ** 3), PI ** 4 / 5, 1e-9)
    // eᵗ en (−π, π): sin simetría, ningún coeficiente se anula
    const sh = (2 * Math.sinh(PI)) / PI
    const ex = coeficientesFourier(Math.exp, 2 * PI, N)
    cierto('eᵗ: aₙ = (−1)ⁿ 2 sinh π /(π(1+n²))', peor((n) => ex.a[n], (n) => ((-1) ** n * sh) / (1 + n * n), 0) < 1e-11)
    cierto('eᵗ: bₙ = (−1)ⁿ⁺¹ 2n sinh π /(π(1+n²))', peor((n) => ex.b[n], (n) => ((-1) ** (n + 1) * n * sh) / (1 + n * n)) < 1e-11)
    // pulso rect(t) con T = 4π: aₙ = 2 sin(n/4)/(πn)
    const rc = coeficientesFourier(compilar('rect(t)', ['t']) as (t: number) => number, 4 * PI, N)
    cerca('pulso: a₀ = 1/π·½·… = 2/T', rc.a[0], 2 / (4 * PI), 1e-14)
    cierto('pulso: aₙ = 2 sin(n/4)/(πn)', peor((n) => rc.a[n], (n) => (2 * Math.sin(n / 4)) / (PI * n)) < 1e-12)
    const r = rupturas(compilar('rect(t)', ['t']) as (t: number) => number, -2 * PI, 2 * PI)
    cierto('saltos de rect(t) en ±½ exactos', r.length === 2 && Math.abs(r[0] + 0.5) < 1e-12 && Math.abs(r[1] - 0.5) < 1e-12, r.join(','))
    // Gibbs: el máximo de S_N en el primer lóbulo tiende a (2/π)Si(π) = 1,1789797…
    const gibbs = sobreoscilacion(Math.sign, sq, 399)!
    cerca('Gibbs: sobreoscilación con N = 399 → 8,949 %', gibbs, (100 * ((2 / PI) * 1.851937051982466 - 1)) / 2, 2e-3)
    cierto('Gibbs no desaparece al subir N (N = 49 también ≈ 9 %)', Math.abs(sobreoscilacion(Math.sign, sq, 49)! - 8.95) < 0.2)
    let maxF = -Infinity
    for (let i = 1; i < 2000; i++) maxF = Math.max(maxF, sumaParcial(sq, 99, (i / 2000) * PI, true))
    cierto('Fejér: σ_N de la cuadrada nunca pasa de 1 (núcleo positivo)', maxF <= 1 + 1e-12, String(maxF))
    cerca('S_N(π/2) → 1 (error O(1/N))', sumaParcial(sq, 399, PI / 2), 1, 3e-3)
    // el módulo: lecturas coherentes con lo anterior
    const s: EstadoFourier = { ...(fourier.inicial as EstadoFourier), expr: 'sgn(t)', periodoPi: 2, N: 399 }
    const filas = fourier.lecturas!(s)
    cerca('módulo: saltos en un periodo de la cuadrada', lectura(filas, 'Saltos en un periodo'), 2, 0)
    cerca('módulo: (1/T)∫f²', lectura(filas, '(1/T)∫f² (Parseval)'), 1, 1e-6)
  }

  seccion('Señales · transformada de Fourier continua')
  {
    const nus = [0, 0.37, 1.3, 2.2]
    const g = transformada((t) => Math.exp(-Math.PI * t * t), 8, nus)
    cierto('e^{−πt²} ↦ e^{−πν²}', nus.every((v, i) => Math.abs(g.re[i] - Math.exp(-Math.PI * v * v)) < 1e-13 && Math.abs(g.im[i]) < 1e-13))
    const rect = compilar('rect(t)', ['t']) as (t: number) => number
    const r = transformada(rect, 2, nus)
    cierto('rect ↦ sinc (normalizada)', nus.every((v, i) => Math.abs(r.re[i] - (v === 0 ? 1 : Math.sin(Math.PI * v) / (Math.PI * v))) < 1e-13))
    const tri = compilar('tri(t)', ['t']) as (t: number) => number
    const tr = transformada(tri, 2, nus)
    cierto('tri ↦ sinc²', nus.every((v, i) => Math.abs(tr.re[i] - (v === 0 ? 1 : (Math.sin(Math.PI * v) / (Math.PI * v)) ** 2)) < 1e-12))
    // desplazamiento en el tiempo: x(t − 0,3) ↦ e^{−2πiν·0,3} X(ν)
    const d = transformada((t) => Math.exp(-Math.PI * (t - 0.3) ** 2), 8, [0.7])
    const G = Math.exp(-Math.PI * 0.49)
    cerca('desplazamiento: parte real', d.re[0], G * Math.cos(2 * Math.PI * 0.7 * 0.3), 1e-13)
    cerca('desplazamiento: parte imaginaria', d.im[0], -G * Math.sin(2 * Math.PI * 0.7 * 0.3), 1e-13)
    const e = transformada((t) => Math.exp(-Math.abs(t)), 40, [0.4])
    parecido('e^{−|t|} ↦ 2/(1 + 4π²ν²)', e.re[0], 2 / (1 + 4 * Math.PI ** 2 * 0.16), 1e-12)
    cerca('integral a trozos de sgn(t) en [−1, 2] (salto partido)', integrarTrozos(Math.sign, -1, 2), 1, 1e-14)
    // sgn·t² es continua pero con f'' saltando en 0: no es una ruptura y la cuadratura cruza el pico (≈10⁻¹¹)
    cerca('integral de sgn·t² en [−1, 2] (curvatura que salta)', integrarTrozos((t) => Math.sign(t) * t * t, -1, 2), 8 / 3 - 1 / 3, 1e-10)
  }

  seccion('Señales · muestreo y DFT')
  {
    const gauss = (t: number) => Math.exp(-Math.PI * t * t)
    // Poisson: Tₛ Σ x(nTₛ) e^{−2πiνnTₛ} = Σₖ X(ν − k fₛ), con fₛ = 1,3 para que las copias se solapen de verdad
    const fs = 1.3
    const nus = [0, 0.21, 0.65, 1.1]
    const D = dtftMuestras(gauss, fs, 10, nus)
    const periodizado = (nu: number) => {
      let s = 0
      for (let k = -20; k <= 20; k++) s += Math.exp(-Math.PI * (nu - k * fs) ** 2)
      return s
    }
    cierto('sumación de Poisson: DTFT de las muestras = espectro periodizado', nus.every((v, i) => Math.abs(D.re[i] - periodizado(v)) < 1e-13 && Math.abs(D.im[i]) < 1e-13))
    // Shannon: sinc²(t) tiene banda |ν| ≤ 1; con fₛ = 3 > 2 la reconstrucción es exacta salvo la cola truncada
    const sinc2 = (t: number) => (t === 0 ? 1 : (Math.sin(Math.PI * t) / (Math.PI * t)) ** 2)
    let peor = 0
    for (const t of [0.13, 0.5, 1.77, -2.4]) peor = Math.max(peor, Math.abs(reconstruir(sinc2, 3, 400, t) - sinc2(t)))
    cierto('Whittaker–Shannon reconstruye sinc² con fₛ = 3', peor < 1e-6, String(peor))
    const mal = Math.abs(reconstruir((t) => Math.cos(2 * Math.PI * 3 * t), 4, 50, 0.1) - Math.cos(2 * Math.PI * 3 * 0.1))
    cierto('con fₛ = 4 < 2·3 un coseno de 3 Hz sale con alias (error grande)', mal > 0.1, String(mal))
    // la DFT escalada y con la fase corregida aproxima X(νₖ) (gaussiana: sin fuga ni pliegue apreciables)
    const bins = dftEscalada(gauss, 6, 256, 'rectangular')
    cierto('Δt·Xₖ·e^{2πiνₖL} = X(νₖ) para la gaussiana', bins.every((b) => Math.abs(b.re - gauss(b.nu)) < 1e-12 && Math.abs(b.im) < 1e-12))
    const B = anchoDeBanda(gauss, 6)
    const exacto = erfInv(0.999) / Math.sqrt(2 * Math.PI)
    cierto('banda del 99,9 %: la gaussiana da erf⁻¹(0,999)/√(2π) (paso 0,02)', B >= exacto && B < exacto + 0.021, `${B} vs ${exacto}`)
  }

  seccion('Señales · convolución')
  {
    const rect = compilar('rect(t)', ['t']) as (t: number) => number
    const tri = (t: number) => Math.max(0, 1 - Math.abs(t))
    cierto('rect ∗ rect = tri (cuadratura partida en los saltos)', [-1.3, -0.62, 0, 0.37, 0.9, 1.4].every((t) => Math.abs(convolucionEn(rect, rect, 3, t) - tri(t)) < 1e-13))
    // exponenciales causales: e^{−t}H ∗ e^{−2t}H = (e^{−t} − e^{−2t})H
    const e1 = (t: number) => (t > 0 ? Math.exp(-t) : t < 0 ? 0 : 0.5)
    const e2 = (t: number) => (t > 0 ? Math.exp(-2 * t) : t < 0 ? 0 : 0.5)
    cierto('e^{−t}H ∗ e^{−2t}H = e^{−t} − e^{−2t}', [0.3, 1.1, 2.7].every((t) => Math.abs(convolucionEn(e1, e2, 40, t) - (Math.exp(-t) - Math.exp(-2 * t))) < 1e-13))
    cerca('y(t) = 0 antes de t = 0 (causalidad)', convolucionEn(e1, e2, 40, -0.5), 0, 1e-15)
    // gaussianas: e^{−t²} ∗ e^{−t²/2} = √(2π/3) e^{−t²/3}
    const g1 = (t: number) => Math.exp(-t * t)
    const g2 = (t: number) => Math.exp(-t * t / 2)
    cerca('gauss ∗ gauss = √(2π/3)·e^{−t²/3}', convolucionEn(g1, g2, 12, 0.8), Math.sqrt((2 * Math.PI) / 3) * Math.exp(-0.64 / 3), 1e-13)
    // la rejilla por FFT converge con O(Δt) en los saltos: con M = 2048 el error es < 2Δt
    const y = convolucionRejilla(rect, rect, 3)
    const dt = 6 / 2048
    cierto('rejilla por FFT ≈ tri con error < 2Δt', y.every(([t, v]) => Math.abs(v - tri(t)) < 2 * dt))
  }

  seccion('Señales · Laplace contra la tabla de los libros')
  {
    // cada par: f(t) y F(s) escrita a mano; se evalúan en dos s, y además cuenta la verificación numérica
    const pares: Array<[string, (s: number) => number]> = [
      ['1', (s) => 1 / s],
      ['t^3', (s) => 6 / s ** 4],
      ['exp(-2t)', (s) => 1 / (s + 2)],
      ['sin(3t)', (s) => 3 / (s * s + 9)],
      ['cos(3t)', (s) => s / (s * s + 9)],
      ['exp(-t)*cos(2t)', (s) => (s + 1) / ((s + 1) ** 2 + 4)],
      ['exp(2t)*sin(t)', (s) => 1 / ((s - 2) ** 2 + 1)],
      ['t*sin(2t)', (s) => (4 * s) / (s * s + 4) ** 2],
      ['t*cos(2t)', (s) => (s * s - 4) / (s * s + 4) ** 2],
      ['t^2*exp(3t)', (s) => 2 / (s - 3) ** 3],
      ['sinh(2t)', (s) => 2 / (s * s - 4)],
      ['cosh(2t)', (s) => s / (s * s - 4)],
      ['sqrt(t)', (s) => Math.sqrt(Math.PI) / (2 * s ** 1.5)],
      ['heaviside(t-2)', (s) => Math.exp(-2 * s) / s],
      ['(t-1)*heaviside(t-1)', (s) => Math.exp(-s) / s ** 2],
      ['sin(t)*heaviside(t-pi)', (s) => -Math.exp(-Math.PI * s) / (s * s + 1)],
      ['sin(t)^2', (s) => 2 / (s * (s * s + 4))],
      ['cos(t)^3', (s) => ((s * s + 7) * s) / ((s * s + 1) * (s * s + 9))],
      ['sin(2t)*cos(3t)', (s) => 0.5 * (5 / (s * s + 25) - 1 / (s * s + 1))],
      ['sin(2t+1)', (s) => (s * Math.sin(1) + 2 * Math.cos(1)) / (s * s + 4)],
      ['dirac(t-2)', (s) => Math.exp(-2 * s)],
      ['t*dirac(t-1)+exp(-t)', (s) => Math.exp(-s) + 1 / (s + 1)],
    ]
    for (const [f, F] of pares) {
      let r
      try {
        r = laplace(leerExpr(f, 't'))
      } catch (e) {
        cierto(`L{${f}} no falla`, false, (e as Error).message)
        continue
      }
      const rr = r
      cierto(`L{${f}} = tabla (s = 4,3 y 7,1)`, [4.3, 7.1].every((s) => Math.abs(evaluar(rr.resultado, { s }) - F(s)) < 1e-12 * Math.max(1, Math.abs(F(s)))))
      cierto(`L{${f}} comprobada con la integral`, r.verificada, String(r.error))
    }
    const inversas: Array<[string, ((t: number) => number) | null]> = [
      ['1/(s+2)', (t) => Math.exp(-2 * t)],
      ['1/(s*(s+1))', (t) => 1 - Math.exp(-t)],
      ['(s+3)/(s^2+2s+5)', (t) => Math.exp(-t) * (Math.cos(2 * t) + Math.sin(2 * t))],
      ['1/(s*(s+1)^2)', (t) => 1 - Math.exp(-t) - t * Math.exp(-t)],
      ['1/(s^2+1)^2', (t) => (Math.sin(t) - t * Math.cos(t)) / 2],
      ['s/(s^2+4)^2', (t) => (t * Math.sin(2 * t)) / 4],
      ['s/(s^2-2)', (t) => Math.cosh(Math.SQRT2 * t)],
      ['1/(s^2-2)^2', (t) => (Math.SQRT2 * t * Math.cosh(Math.SQRT2 * t) - Math.sinh(Math.SQRT2 * t)) / (4 * Math.SQRT2)],
      ['(2s^2+3s-1)/((s-1)*(s+2)*(s-3))', (t) => (-2 / 3) * Math.exp(t) + (1 / 15) * Math.exp(-2 * t) + 2.6 * Math.exp(3 * t)],
      ['exp(-2s)/(s+1)', (t) => (t > 2 ? Math.exp(-(t - 2)) : 0)],
      ['(1-exp(-s))/s^2', (t) => t - (t > 1 ? t - 1 : 0)],
      ['s^(-3/2)', (t) => (2 * Math.sqrt(t)) / Math.sqrt(Math.PI)],
      ['1/(s^3+s+1)', null],
    ]
    for (const [F, f] of inversas) {
      let r
      try {
        r = laplaceInversa(leerExpr(F, 's'))
      } catch (e) {
        cierto(`L⁻¹{${F}} no falla`, false, (e as Error).message)
        continue
      }
      const rr = r
      if (f) cierto(`L⁻¹{${F}} = tabla (t = 0,7; 1,6; 3,3)`, [0.7, 1.6, 3.3].every((t) => Math.abs(evaluar(rr.resultado, { t }) - f(t)) < 1e-12 * Math.max(1, Math.abs(f(t)))))
      cierto(`L⁻¹{${F}} comprobada transformándola de vuelta`, r.verificada, String(r.error))
    }
    cierto('1/(s³+s+1) se marca como aproximada', laplaceInversa(leerExpr('1/(s^3+s+1)', 's')).aproximada)
    const edos: Array<[string, number[], (t: number) => number]> = [
      ["y''+y=sin(t)", [0, 0], (t) => (Math.sin(t) - t * Math.cos(t)) / 2],
      ["y''+3y'+2y=exp(-t)", [1, 0], (t) => (t + 1) * Math.exp(-t)],
      ["y'+y=heaviside(t-1)", [0], (t) => (t > 1 ? 1 - Math.exp(-(t - 1)) : 0)],
      ["y''+4y=0", [1, 2], (t) => Math.cos(2 * t) + Math.sin(2 * t)],
      ["y''+2y'+5y=dirac(t-1)", [0, 0], (t) => (t > 1 ? 0.5 * Math.exp(-(t - 1)) * Math.sin(2 * (t - 1)) : 0)],
      ["y'''-y'=0", [2, 1, 3], (t) => -1 + 2 * Math.exp(t) + Math.exp(-t)],
    ]
    for (const [e, ci, sol] of edos) {
      let r
      try {
        r = edoPorLaplace(e, ci)
      } catch (err) {
        cierto(`${e} no falla`, false, (err as Error).message)
        continue
      }
      const rr = r
      cierto(`${e}: solución de libro`, [0.4, 1.7, 3.9].every((t) => Math.abs(evaluar(rr.resultado, { t }) - sol(t)) < 1e-11))
      cierto(`${e}: verificada (integral y sustitución)`, r.verificada, `${r.error} ${r.residuo}`)
    }
    const filas = ejecutar(['laplace(t*exp(-2t))', 'ilaplace(1/(s^2+4))'])
    cierto('CAS: orden laplace', filas[0].salida === String.raw`\frac{1}{\left(s + 2\right)^{2}}`, filas[0].salida ?? filas[0].error ?? '')
    cierto('CAS: orden ilaplace', !!filas[1].salida && filas[1].salida.includes(String.raw`\sin`), filas[1].salida ?? filas[1].error ?? '')
  }

  seccion('Señales · control')
  {
    const G1: FT = { num: [1], den: [1, 1] }
    const b1 = bode(G1, [1])[0]
    cerca('1/(s+1) en ω = 1: −3,0103 dB', b1.mag, -10 * Math.log10(2), 1e-12)
    cerca('1/(s+1) en ω = 1: −45°', b1.fase, -45, 1e-12)
    // 2.º orden: sobreoscilación e^{−ζπ/√(1−ζ²)} y t_p = π/(ωₙ√(1−ζ²)), con ζ = 0,3 y ωₙ = 2
    const z = 0.3
    const wn = 2
    const T2: FT = { num: [wn * wn], den: [wn * wn, 2 * z * wn, 1] }
    const y2 = respuesta(T2, 10, 40000)
    const m2 = metricas(y2, 1)
    cerca('sobreoscilación del 2.º orden', m2.sobreoscilacion, 100 * Math.exp((-z * Math.PI) / Math.sqrt(1 - z * z)), 1e-6)
    cerca('tiempo de pico del 2.º orden', m2.tPico, Math.PI / (wn * Math.sqrt(1 - z * z)), 10 / 40000)
    // L = 10/(s(s+2)(s+5)): ω₁₈₀ = √10, MG = 20·log 7; ω_c de ω²(ω²+4)(ω²+25) = 100 por bisección aparte
    const L: FT = { num: [10], den: mulP(mulP([0, 1], [2, 1]), [5, 1]) }
    const mg = margenes(L)
    cerca('ω₁₈₀ = √10', mg.w180!, Math.sqrt(10), 1e-10)
    cerca('MG = 20·log₁₀ 7', mg.mg!, 20 * Math.log10(7), 1e-9)
    let lo = 0
    let hi = 4
    for (let i = 0; i < 200; i++) {
      const x = (lo + hi) / 2
      if (x * (x + 4) * (x + 25) > 100) hi = x
      else lo = x
    }
    const wc = Math.sqrt(lo)
    cerca('ω_c: |L(iω_c)| = 1', mg.wc!, wc, 1e-10)
    cerca('MF = 90° − atan(ω/2) − atan(ω/5)', mg.mf!, 90 - (Math.atan(wc / 2) * 180) / Math.PI - (Math.atan(wc / 5) * 180) / Math.PI, 1e-8)
    // Nyquist contra los polos del lazo cerrado, con plantas estables e inestables en lazo abierto
    const casos: Array<[FT, number]> = [
      [L, 1], [L, 5], [L, 10], [L, 100],
      [{ num: [1], den: mulP([-1, 1], [4, 1]) }, 2],
      [{ num: [1], den: mulP([-1, 1], [4, 1]) }, 10],
      [{ num: [1, 3], den: mulP(mulP([0, 1], [1, 1]), [6, 1]) }, 30],
      [{ num: [1, -1], den: mulP([1, 1], [2, 1]) }, 4],
    ]
    for (const [G, K] of casos) {
      const LK: FT = { num: G.num.map((v) => v * K), den: G.den }
      const n = nyquist(LK)
      const rhp = polos(lazoCerrado(LK)).filter(([a]) => a > 1e-9).length
      cierto(`Nyquist Z = N + P = ${rhp} (K = ${K}, den ${G.den.join(',')})`, n.Z === rhp, `N=${n.N} P=${n.P}`)
      cierto(`Routh cuenta ${rhp} raíces con Re > 0 (K = ${K})`, routh(lazoCerrado(LK).den).cambios === rhp)
    }
    // Routh en casos especiales: pivote nulo (s⁴+s³+2s²+2s+3, dos raíces con Re > 0) y fila de ceros
    const p1 = [3, 2, 2, 1, 1]
    cierto('Routh con pivote nulo: 2 raíces inestables', routh(p1).cambios === 2 && raicesPolinomio(p1).filter(([a]) => a > 0).length === 2)
    const p2 = [1, 1, 2, 1, 1] // (s²+1)(s²+s+1): raíces en el eje, ninguna con Re > 0
    const r2 = routh(p2)
    cierto('Routh con fila de ceros: 0 cambios y avisa', r2.cambios === 0 && r2.especial !== null)
    const p3 = mulP([-2, 0, 1], [3, 1]) // (s² − 2)(s + 3): una raíz positiva, fila de ceros
    cierto('Routh con fila de ceros y raíz real positiva: 1 cambio', routh(p3).cambios === 1)
    // asíntotas del lugar
    const as = asintotasLugar(L)!
    cerca('centroide del lugar = −7/3', as.centroide, -7 / 3, 1e-12)
    cierto('ángulos 60°, 180°, 300°', as.angulos.join() === '60,180,300')
    // escalón en lazo cerrado frente a la inversa exacta de T(s)/s
    const exacta = laplaceInversa(leerExpr('10/(s*(s^3+7s^2+10s+10))', 's'))
    const yNum = respuesta(lazoCerrado(L), 8, 800)
    let peor = 0
    for (const [t, v] of yNum) peor = Math.max(peor, Math.abs(v - evaluar(exacta.resultado, { t })))
    cierto('escalón por espacio de estados = L⁻¹{T(s)/s} exacta', peor < 1e-9, String(peor))
    // error en régimen permanente de tipo 0: 1/(s+1) con K = 4 → T(0) = 4/5
    const mT = metricas(respuesta(lazoCerrado({ num: [4], den: [1, 1] }), 10, 2000), 4 / 5)
    cerca('tipo 0: valor final 4/5', mT.final, 0.8, 1e-15)
    const fin = respuesta(lazoCerrado({ num: [4], den: [1, 1] }), 10, 2000).at(-1)![1]
    cerca('la respuesta llega a 4/5', fin, 0.8, 1e-9)
  }

  seccion('Señales · circuitos RLC')
  {
    // transitorio en forma cerrada contra RK4 de la EDO del circuito, en los tres regímenes y los dos montajes
    const base = circuito.inicial as EstadoCircuito
    for (const [tipo, R] of [['serie', 1], ['serie', 4], ['serie', 7], ['paralelo', 0.8], ['paralelo', 1], ['paralelo', 5]] as Array<[EstadoCircuito['tipo'], number]>) {
      const s: EstadoCircuito = { ...base, tipo, R, L: 1, C: 0.25, A: 3, x0: 1.2, y0: -0.7 }
      // serie: estado (v_C, i): v_C′ = i/C, i′ = (V − R i − v_C)/L. paralelo: (v, i_L): v′ = (I − v/R − i_L)/C, i_L′ = v/L
      const f = tipo === 'serie'
        ? (_t: number, y: number[]) => [y[1] / s.C, (s.A - s.R * y[1] - y[0]) / s.L]
        : (_t: number, y: number[]) => [(s.A - y[0] / s.R - y[1]) / s.C, y[0] / s.L]
      let y = [s.x0, s.y0]
      const h = 1e-4
      let peor = 0
      for (let k = 1; k <= 50000; k++) {
        y = rk4(f, (k - 1) * h, y, h)
        if (k % 5000 === 0) {
          const e = estadoEn(s, k * h)
          peor = Math.max(peor, Math.abs(e.vC - y[0]), Math.abs((tipo === 'serie' ? e.i : e.u) - y[1]))
        }
      }
      cierto(`${tipo} R = ${R} (${parametros(s).regimen}): forma cerrada = RK4`, peor < 1e-9, String(peor))
    }
    // alterna: leyes de Kirchhoff con fasores y resonancia
    const s: EstadoCircuito = { ...base, modo: 'alterna', tipo: 'serie', R: 0.8, L: 0.5, C: 0.2, A: 4, w: 1.7 }
    const fz = fasores(s)
    cierto('serie: V_R + V_L + V_C = V', Math.hypot(fz.VR[0] + fz.VL[0] + fz.VC[0] - 4, fz.VR[1] + fz.VL[1] + fz.VC[1]) < 1e-12)
    const w0 = 1 / Math.sqrt(0.5 * 0.2)
    cerca('serie: en ω₀ la corriente es V/R', respuestaAmplitud(s, w0), 4 / 0.8, 1e-12)
    // puntos de media potencia ω₂ − ω₁ = R/L exactamente en el serie
    const mitad = 4 / 0.8 / Math.SQRT2
    const bis = (a: number, b: number) => {
      for (let i = 0; i < 200; i++) {
        const m = (a + b) / 2
        if ((respuestaAmplitud(s, m) - mitad) * (respuestaAmplitud(s, a) - mitad) <= 0) b = m
        else a = m
      }
      return (a + b) / 2
    }
    cerca('serie: ancho de banda = R/L = ω₀/Q', bis(w0, 50) - bis(0.01, w0), 0.8 / 0.5, 1e-10)
    const sp: EstadoCircuito = { ...s, tipo: 'paralelo', R: 7 }
    const fp = fasores(sp)
    cierto('paralelo: I_R + I_L + I_C = I', Math.hypot(fp.IR![0] + fp.IL![0] + fp.IC![0] - 4, fp.IR![1] + fp.IL![1] + fp.IC![1]) < 1e-12)
    cerca('paralelo: Q = R√(C/L)', parametros(sp).Q, 7 * Math.sqrt(0.2 / 0.5), 1e-14)
  }

  seccion('Señales · filtros digitales')
  {
    const base = filtros.inicial as EstadoFiltro
    const coef = (p: Partial<EstadoFiltro>) => coeficientes({ ...base, ...p }) as Coefs
    // media móvil de M: |H| = |sin(Mω/2)/(M sin(ω/2))| (núcleo de Dirichlet)
    const mm = coef({ diseno: 'media', M: 7 })
    cierto('media móvil = núcleo de Dirichlet', [0.3, 1.1, 2.9].every((w) => Math.abs(Math.hypot(...respuestaFrecuencia(mm, w)) - Math.abs(Math.sin(3.5 * w) / (7 * Math.sin(w / 2)))) < 1e-14))
    // IIR de 1.er orden: H = α/(1 − (1−α)e^{−iω}) y h[n] = α(1−α)ⁿ
    const al = 0.3
    const i1 = coef({ diseno: 'iir1', alfa: al })
    cierto('IIR 1.er orden: |H| cerrada', [0.2, 1.4, 3].every((w) => Math.abs(Math.hypot(...respuestaFrecuencia(i1, w)) - al / Math.hypot(1 - (1 - al) * Math.cos(w), (1 - al) * Math.sin(w))) < 1e-14))
    const h1 = filtrar(i1, Array.from({ length: 30 }, (_, n) => (n === 0 ? 1 : 0)))
    cierto('IIR 1.er orden: h[n] = α(1−α)ⁿ', h1.every((v, n) => Math.abs(v - al * (1 - al) ** n) < 1e-15))
    // Butterworth: |H(e^{iω})|² = 1/(1 + (Ω/Ωc)^{2N}) con Ω = 2 tan(ω/2): la bilineal transporta la respuesta analógica exacta
    for (const [N, wc] of [[2, 0.5], [4, 0.8], [7, 1.9]]) {
      const bw = butterworth(N, wc)
      const Wc = 2 * Math.tan(wc / 2)
      let peor = 0
      for (const w of [0.05, 0.4, 0.8, 1.3, 2.2, 3]) {
        const m2 = Math.hypot(...respuestaFrecuencia(bw, w)) ** 2
        peor = Math.max(peor, Math.abs(m2 - 1 / (1 + (2 * Math.tan(w / 2) / Wc) ** (2 * N))))
      }
      cierto(`Butterworth N = ${N}: |H|² = respuesta analógica transportada`, peor < 1e-12, String(peor))
      cerca(`Butterworth N = ${N}: |H(e^{iωc})| = 1/√2`, Math.hypot(...respuestaFrecuencia(bw, wc)), Math.SQRT1_2, 1e-12)
      cierto(`Butterworth N = ${N}: polos dentro del círculo unidad`, polosCerosZ(bw).polos.every(([a, b]) => Math.hypot(a, b) < 1))
    }
    // FIR: la respuesta al impulso son los propios coeficientes; el peine anula las raíces M-ésimas de la unidad
    const fir = coef({ diseno: 'propio', b: '0.5, -1, 2, 0.25', a: '1' })
    cierto('FIR: h[n] = bₙ', filtrar(fir, [1, 0, 0, 0, 0]).every((v, n) => Math.abs(v - [0.5, -1, 2, 0.25, 0][n]) < 1e-15))
    const pe = coef({ diseno: 'peine', M: 6 })
    cierto('peine: H(e^{2πik/M}) = 0', [0, 1, 2, 3].every((k) => Math.hypot(...respuestaFrecuencia(pe, (2 * Math.PI * k) / 6)) < 1e-12))
    // resonador: polos exactamente en r·e^{±iθ}
    const rs = coef({ diseno: 'resonador', r: 0.9, theta: 1.2 })
    const pr = polosCerosZ(rs).polos
    cierto('resonador: polos en r·e^{±iθ}', pr.every(([a, b]) => Math.abs(Math.hypot(a, b) - 0.9) < 1e-12 && Math.abs(Math.abs(Math.atan2(b, a)) - 1.2) < 1e-12))
  }
}
