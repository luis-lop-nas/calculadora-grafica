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
}
