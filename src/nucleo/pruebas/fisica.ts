import { DIM, ecuacion, igual, leerDim, texto, unidadSI } from '../../lib/dimensiones'
import * as DIMF from '../../modulos/dimensional'
import { MODULOS } from '../registro'
import { campo, flujoEsfera, imagenes, lineaDeCampo, potencial, type Carga } from '../../lib/electro'
import { campoCuadratura, campoPoligonal, campoTramo, circulacion, poligonal, type P3 } from '../../lib/magneto'
import { campoEspacio, campoPlano, circulacionBorde, circulacionPlana, curvaPlana, estrellada, flujoCerrado, flujoPlano, flujoRotacional, integralDivergencia, integralRegion, parametrizacion } from '../../lib/teoremas'
import { brewster, campoPolarizado, critico, elipse, fase, fresnel, picoEnvolvente } from '../../lib/ondas'
import { airy, anillosOscuros, fraunhofer2D, intensidadMichelson, intensidadNumerica, intensidadRendijas, J11, reflectanciaAiry, reflectanciaMatriz, rendijas } from '../../lib/optica'
import { besselJx, gauss20 } from '../../lib/especiales'
import { cauchy, corteEje, reflejoEsferico, desviacionMinima, desviacionPrisma, det, focales, imagen, matrizLentes, matrizSistema, trazar } from '../../lib/rayos'
import { camino, ciclo, critico as criticoVdW, entropia, espinodal, gibbsVdW, maxwell, pVdW, rendimientoTeorico, resumen, SUSTANCIAS, type Gas, type ParamCiclo, type TipoCiclo } from '../../lib/termo'
import termodinamica, { latenteVdW, type EstadoTermo } from '../../modulos/fisica/termodinamica'
import { cerca, cierto, parecido, seccion } from './comun'

export function pruebasFisica() {
  seccion('Física · electrostática')
  {
    // Gauss con cargas descentradas, una fuera: flujo = 4π q_enc
    const cargas: Carga[] = [{ q: 1.3, x: 0.2, y: -0.1 }, { q: -0.7, x: -0.5, y: 0.6 }, { q: 2.1, x: 3, y: 1 }]
    cerca('Gauss: flujo por la esfera = 4π q_enc', flujoEsfera(cargas, 0.1, 0.2, 1.2), 4 * Math.PI * 0.6, 1e-8)
    cerca('Gauss: sin carga dentro el flujo es 0', flujoEsfera(cargas, -2, -1.5, 0.9), 0, 1e-9)
    // plano a tierra en x = 0
    const q = { q: 1.5, x: 0.8, y: 0.3 }
    const todo = [q, ...imagenes([q], 'plano', 0)]
    cierto('imagen en el plano: V = 0 en x = 0', [-2, -0.4, 0.3, 1.7].every((y) => Math.abs(potencial(todo, 0, y, 0.37 * y)) < 1e-14))
    cerca('imagen en el plano: fuerza q²/(4d²) hacia el plano', q.q * campo(imagenes([q], 'plano', 0), q.x, q.y)[0], -(q.q ** 2) / (4 * q.x ** 2), 1e-14)
    // esfera a tierra de radio R
    const R = 1
    const qe = { q: 2, x: 1.7, y: 0.9 }
    const ims = imagenes([qe], 'esfera', R)
    const conj = [qe, ...ims]
    let peor = 0
    for (const [th, ph] of [[0.3, 1.1], [1.2, -2.4], [2.5, 0.7], [1.57, 3]]) peor = Math.max(peor, Math.abs(potencial(conj, R * Math.sin(th) * Math.cos(ph), R * Math.sin(th) * Math.sin(ph), R * Math.cos(th))))
    cerca('imagen en la esfera: V = 0 en toda la superficie', peor, 0, 1e-13)
    cerca('esfera: la carga inducida (Gauss) es −qR/a', flujoEsfera(conj, 0, 0, 1.05 * R) / (4 * Math.PI), (-qe.q * R) / Math.hypot(qe.x, qe.y), 1e-8)
    // dipolo lejano
    const dip: Carga[] = [{ q: 1, x: 0.05, y: 0 }, { q: -1, x: -0.05, y: 0 }]
    parecido('dipolo en el eje: E = 2p/r³', campo(dip, 20, 0)[0], (2 * 0.1) / 20 ** 3, 1e-4)
    parecido('dipolo en el plano medio: E = −p/r³', campo(dip, 0, 20)[0], -0.1 / 20 ** 3, 1e-4)
    // líneas de campo de dos cargas en el eje: q₁ cos θ₁ + q₂ cos θ₂ se conserva a lo largo de la línea
    const par: Carga[] = [{ q: 1, x: -0.5, y: 0 }, { q: -2, x: 0.5, y: 0 }]
    const marco = { x: [-3, 3] as [number, number], y: [-3, 3] as [number, number] }
    const inv = ([x, y]: [number, number]) => par.reduce((a, c) => a + (c.q * (x - c.x)) / Math.hypot(x - c.x, y - c.y), 0)
    const ln = lineaDeCampo(par, -0.5 + 0.02 * Math.cos(1.1), 0.02 * Math.sin(1.1), 1, marco)
    const i0 = inv(ln.pts[1])
    cerca('línea de campo: Σ qᵢ cos θᵢ constante', Math.max(...ln.pts.slice(1, -1).map((p) => Math.abs(inv(p) - i0))), 0, 1e-6)
    cierto('línea de campo: sale de +q y acaba en −2q', ln.fin === 1)
  }

  seccion('Física · magnetostática (μ₀ = 1)')
  {
    // hilo recto finito por el eje z: |B| = I/(4πd)·2L/√(L² + d²), en la dirección ẑ × x̂ = ŷ
    const [L, d, I] = [1.7, 0.6, 2.3]
    const Bh = campoTramo([0, 0, -L], [0, 0, L], [d, 0, 0], I)
    cerca('hilo finito: B_y = (I/4πd)·2L/√(L² + d²)', Bh[1], (I / (4 * Math.PI * d)) * ((2 * L) / Math.hypot(L, d)), 1e-15)
    cierto('hilo finito: sin componentes x ni z', Math.abs(Bh[0]) < 1e-16 && Math.abs(Bh[2]) < 1e-16)
    // espira de radio R en el plano xy
    const R = 1.3
    const espira = (s: number): P3 => [R * Math.cos(s), R * Math.sin(s), 0]
    const pts = poligonal(espira, 0, 2 * Math.PI, 4000)
    const z = 0.7
    const eje = (I * R * R) / (2 * (R * R + z * z) ** 1.5)
    parecido('espira: B en el eje = IR²/(2(R² + z²)^{3/2}) (poligonal, error O(1/N²))', campoPoligonal(pts, [0, 0, z], I)[2], eje, 2e-6)
    parecido('espira: B en el eje por cuadratura de la curva lisa', campoCuadratura(espira, 0, 2 * Math.PI, [0, 0, z], I)[2], eje, 1e-10)
    const P: P3 = [0.9, -0.4, 0.35]
    const b1 = campoPoligonal(pts, P, I)
    const b2 = campoCuadratura(espira, 0, 2 * Math.PI, P, I)
    cierto('espira fuera del eje: poligonal = cuadratura', [0, 1, 2].every((k) => Math.abs(b1[k] - b2[k]) < 2e-6 * Math.hypot(...b2)))
    // Ampère: circulación = I por cada vez que el camino enlaza la corriente
    const B = (p: P3) => campoPoligonal(pts, p, I)
    cerca('Ampère: camino que enlaza la espira una vez', circulacion(B, [R, 0, 0.1], 0.5, [0, 1, 0]), I, 1e-8)
    cerca('Ampère: camino que no la enlaza', circulacion(B, [0.2, 0, 0.3], 0.5, [0, 1, 0]), 0, 1e-8)
    const doble = poligonal(espira, 0, 4 * Math.PI, 8000)
    cerca('Ampère: espira de dos vueltas enlazada = 2I', circulacion((p) => campoPoligonal(doble, p, I), [R, 0, 0.1], 0.5, [0, 1, 0]), 2 * I, 1e-8)
    // Helmholtz: dos espiras separadas R, en el centro (4/5)^{3/2} I/R y B″(0) = 0
    const helm = (zc: number) => (p: P3) => campoPoligonal(pts.map(([x, y]) => [x, y, zc] as P3), p, I)
    const Bc = (zz: number) => helm(R / 2)([0, 0, zz])[2] + helm(-R / 2)([0, 0, zz])[2]
    parecido('Helmholtz: B(0) = (4/5)^{3/2} I/R', Bc(0), (0.8 ** 1.5 * I) / R, 2e-6)
    const dosEspiras = (zz: number) => ((I * R * R) / 2) * ((R * R + (zz - R / 2) ** 2) ** -1.5 + (R * R + (zz + R / 2) ** 2) ** -1.5)
    parecido('Helmholtz: B(z) poligonal = suma de las dos fórmulas de eje', Bc(0.31), dosEspiras(0.31), 2e-6)
    // la segunda diferencia lleva un término h²B⁗/12 (B ≈ B₀(1 − 144z⁴/125R⁴)); Richardson lo quita
    const D = (h: number) => (Bc(h) - 2 * Bc(0) + Bc(-h)) / (h * h)
    cerca('Helmholtz: B″(0) = 0 (segunda diferencia con Richardson)', (4 * D(0.025) - D(0.05)) / 3, 0, 1e-4 * (Bc(0) / (R * R)))
    // solenoide largo: hélice de 200 vueltas frente a la lámina de corriente n I (L/2)/√(R² + L²/4)
    const [Rs, Ls, N] = [0.5, 4, 200]
    const helice = (s: number): P3 => [Rs * Math.cos(s), Rs * Math.sin(s), -Ls / 2 + (Ls * s) / (2 * Math.PI * N)]
    const sol = poligonal(helice, 0, 2 * Math.PI * N, 200 * 64)
    parecido('solenoide: B en el centro ≈ n I (L/2)/√(R² + L²/4)', campoPoligonal(sol, [0, 0, 0], I)[2], ((N / Ls) * I * (Ls / 2)) / Math.hypot(Rs, Ls / 2), 1e-3)
  }

  seccion('Campos · teoremas integrales (los dos lados por separado)')
  {
    // Green: F = (−y, x)/2 en una elipse descentrada → área πab por los dos lados
    const [a, b] = [2, 1.3]
    const elipse = curvaPlana('0.4 + 2*cos(t)', '-0.2 + 1.3*sin(t)', 0, 2 * Math.PI)
    const area = campoPlano('-y/2', 'x/2')
    cerca('Green: ∮ (−y dx + x dy)/2 en la elipse = πab', circulacionPlana(area, elipse), Math.PI * a * b, 1e-11)
    cerca('Green: ∬ rot = πab', integralRegion(area.rot, elipse, [0.4, -0.2]), Math.PI * a * b, 1e-11)
    // campo y curva sin simetrías: cardioide desplazada
    const F = campoPlano('exp(x)*sin(y) - y^3', 'x^3 + x*y')
    const card = curvaPlana('0.3 + (1 + 0.4*cos(t))*cos(t)', '-0.1 + (1 + 0.4*cos(t))*sin(t)', 0, 2 * Math.PI)
    cierto('la cardioide es estrellada respecto de su polo', estrellada(card, [0.3, -0.1]))
    const lin = circulacionPlana(F, card)
    cierto('Green: el caso probado no es trivial', Math.abs(lin) > 0.5, String(lin))
    cerca('Green: ∮ P dx + Q dy = ∬ (Q_x − P_y) dA (cardioide)', integralRegion(F.rot, card, [0.3, -0.1]), lin, 1e-10)
    cerca('Green (flujo): ∮ F·n ds = ∬ div F dA (cardioide)', integralRegion(F.div, card, [0.3, -0.1]), flujoPlano(F, card), 1e-10)
    const radial = campoPlano('x', 'y')
    cerca('flujo de (x, y) por un círculo de radio 1,5 = 2πR²', flujoPlano(radial, curvaPlana('1.5*cos(t)', '1.5*sin(t)', 0, 2 * Math.PI)), 2 * Math.PI * 2.25, 1e-12)
    // Stokes: (−y, x, 0) en la semiesfera superior → 2πR², y un campo cualquiera en un paraboloide
    const R = 1.4
    const semi = parametrizacion(['1.4*sin(u)*cos(v)', '1.4*sin(u)*sin(v)', '1.4*cos(u)'], ['u', 'v'], [[0, Math.PI / 2], [0, 2 * Math.PI]])
    const giro = campoEspacio('-y', 'x', '0')
    cerca('Stokes: ∬ rot F·dS en la semiesfera = 2πR²', flujoRotacional(giro, semi), 2 * Math.PI * R * R, 1e-11)
    cerca('Stokes: ∮ F·dr por el ecuador = 2πR²', circulacionBorde(giro, semi), 2 * Math.PI * R * R, 1e-11)
    const G = campoEspacio('y*z^2', 'x^2 - z', 'exp(x)*y')
    const parab = parametrizacion(['0.2 + u*cos(v)', '-0.3 + u*sin(v)', '1 - u^2'], ['u', 'v'], [[0, 1.1], [0, 2 * Math.PI]])
    const sup = flujoRotacional(G, parab)
    cierto('Stokes: el caso probado no es trivial', Math.abs(sup) > 0.1, String(sup))
    cerca('Stokes: ∬ rot G·dS = ∮ G·dr (paraboloide)', circulacionBorde(G, parab), sup, 1e-10)
    // Gauss: (x³, y³, z³) en la bola → 12πR⁵/5, y un campo cualquiera en un cilindro
    const bola = parametrizacion(['u*sin(v)*cos(w)', 'u*sin(v)*sin(w)', 'u*cos(v)'], ['u', 'v', 'w'], [[0, R], [0, Math.PI], [0, 2 * Math.PI]])
    const cubos = campoEspacio('x^3', 'y^3', 'z^3')
    cerca('Gauss: ∭ div F en la bola = 12πR⁵/5', integralDivergencia(cubos, bola), (12 * Math.PI * R ** 5) / 5, 1e-9)
    cerca('Gauss: ∯ F·dS por la esfera = 12πR⁵/5', flujoCerrado(cubos, bola), (12 * Math.PI * R ** 5) / 5, 1e-9)
    const H = campoEspacio('x*y^2 + 1', 'sin(z) + x*y', 'x*z + y^2*z')
    const cil = parametrizacion(['0.3 + u*cos(v)', 'u*sin(v)', 'w'], ['u', 'v', 'w'], [[0, 0.9], [0, 2 * Math.PI], [-0.4, 1.1]])
    const vol = integralDivergencia(H, cil)
    cierto('Gauss: el caso probado no es trivial', Math.abs(vol) > 0.1, String(vol))
    cerca('Gauss: ∭ div H = ∯ H·dS (cilindro)', flujoCerrado(H, cil), vol, 1e-10)
  }

  seccion('Física · ondas y polarización')
  {
    // elipse: semiejes y orientación frente a los extremos de |E| a lo largo de un periodo
    const [a, b, d] = [1.3, 0.7, 1.1]
    const el = elipse(a, b, d)
    const r2 = (f: number) => {
      const [x, y] = campoPolarizado(a, b, d, f)
      return x * x + y * y
    }
    const extremo = (signo: 1 | -1) => {
      let mejor = 0
      for (let i = 0; i < 2000; i++) if (signo * r2((i / 2000) * 2 * Math.PI) > signo * r2(mejor)) mejor = (i / 2000) * 2 * Math.PI
      let lo = mejor - 0.01
      let hi = mejor + 0.01
      for (let i = 0; i < 100; i++) {
        const m1 = lo + (hi - lo) / 3
        const m2 = hi - (hi - lo) / 3
        if (signo * r2(m1) > signo * r2(m2)) hi = m2
        else lo = m1
      }
      return (lo + hi) / 2
    }
    const fM = extremo(1)
    cerca('polarización: semieje mayor = máx |E|', el.semiMayor, Math.sqrt(r2(fM)), 1e-12)
    cerca('polarización: semieje menor = mín |E|', el.semiMenor, Math.sqrt(r2(extremo(-1))), 1e-12)
    const [xM, yM] = campoPolarizado(a, b, d, fM)
    // la posición de un máximo buscado por su valor solo se fija a √ε ≈ 1e-8 (la función es plana allí)
    cerca('polarización: orientación ψ = dirección del máximo', Math.sin(2 * (Math.atan2(yM, xM) - el.psi)), 0, 1e-7)
    cerca('Stokes: S₀² = S₁² + S₂² + S₃² (luz polarizada)', el.S[0] ** 2, el.S[1] ** 2 + el.S[2] ** 2 + el.S[3] ** 2, 1e-13)
    const circ = elipse(1, 1, Math.PI / 2)
    cierto('circular: S₁ = S₂ = 0 y χ = π/4', Math.abs(circ.S[1]) < 1e-15 && Math.abs(circ.S[2]) < 1e-15 && Math.abs(circ.chi - Math.PI / 4) < 1e-15)
    cerca('lineal a 45°: ψ = π/4, χ = 0', elipse(1, 1, 0).psi, Math.PI / 4, 1e-15)
    // Fresnel
    const [n1, n2] = [1, 1.52]
    for (const ti of [0.2, 0.7, 1.3]) {
      const f = fresnel(n1, n2, ti)
      cerca(`Fresnel θ = ${ti}: R_s + T_s = 1`, f.Rs + f.Ts, 1, 1e-14)
      cerca(`Fresnel θ = ${ti}: R_p + T_p = 1`, f.Rp + f.Tp, 1, 1e-14)
      // relaciones de Stokes con el camino inverso (de n₂ a n₁ con el ángulo refractado)
      const g = fresnel(n2, n1, f.thetaT)
      cerca(`Stokes θ = ${ti}: r′_s = −r_s`, g.rs[0], -f.rs[0], 1e-14)
      cerca(`Stokes θ = ${ti}: t_s t′_s = 1 − r_s²`, f.ts[0] * g.ts[0], 1 - f.rs[0] ** 2, 1e-14)
      cerca(`Stokes θ = ${ti}: t_p t′_p = 1 − r_p²`, f.tp[0] * g.tp[0], 1 - f.rp[0] ** 2, 1e-14)
    }
    cerca('incidencia normal: R = ((n₁ − n₂)/(n₁ + n₂))²', fresnel(n1, n2, 0).Rs, ((n1 - n2) / (n1 + n2)) ** 2, 1e-15)
    cerca('Brewster: r_p = 0 en tan θ_B = n₂/n₁', fresnel(n1, n2, brewster(n1, n2)).Rp, 0, 1e-30)
    const tc = critico(n2, n1)
    cerca('ángulo crítico: sin θ_c = n₂/n₁', Math.sin(tc), n1 / n2, 1e-15)
    const tir = fresnel(n2, n1, tc + 0.2)
    cierto('reflexión total: R_s = R_p = 1 y T = 0', tir.total && Math.abs(tir.Rs - 1) < 1e-14 && Math.abs(tir.Rp - 1) < 1e-14 && tir.Ts === 0)
    const nn = n1 / n2
    const th = tc + 0.2
    cerca('reflexión total: desfase de s, tan(δ/2) = √(sin²θ − n²)/cos θ', Math.abs(fase(tir.rs)), 2 * Math.atan(Math.sqrt(Math.sin(th) ** 2 - nn * nn) / Math.cos(th)), 1e-13)
    // paquete gaussiano con ω = k²/2: el pico va exactamente a v_g = k₀
    const k0 = 3
    cerca('paquete ω = k²/2: el pico está en x = v_g t = k₀ t', picoEnvolvente((k) => (k * k) / 2, k0, 0.5, 4, 11, 3), 12, 1e-6)
    cerca('paquete ω = ck: el pico viaja sin deformarse a c', picoEnvolvente((k) => 1.7 * k, k0, 0.5, 5, 8, 3), 8.5, 1e-6)
  }

  seccion('Física · óptica ondulatoria')
  {
    // N rendijas: fórmula cerrada frente a la integral de Fraunhofer sobre las aberturas
    const [N, a, d, lam] = [4, 0.3, 1.1, 0.5]
    for (const sn of [0.037, 0.19, 0.4545, 0.71]) cerca(`${N} rendijas en sin θ = ${sn}: fórmula = integral`, intensidadRendijas(N, a, d, lam, sn), intensidadNumerica(rendijas(N, a, d), lam, sn), 1e-12)
    cerca('red: máximo principal de orden 2 vale sinc²(2a/d)', intensidadRendijas(N, a, d, lam, (2 * lam) / d), (Math.sin((2 * Math.PI * a) / d) / ((2 * Math.PI * a) / d)) ** 2, 1e-12)
    cerca('red: primer cero junto al máximo central en sin θ = λ/(Nd)', intensidadRendijas(N, a, d, lam, lam / (N * d)), 0, 1e-28)
    // Airy: la integral de Hankel de la abertura circular frente a 2J₁(u)/u
    const R = 0.7
    for (const rho of [0.3, 0.9, 1.7]) {
      const amp = gauss20((r) => 2 * Math.PI * besselJx(0, 2 * Math.PI * rho * r) * r, 0, R, 8) / (Math.PI * R * R)
      cerca(`Airy: ∫ J₀ r dr = 2J₁(u)/u en ρ = ${rho}`, amp * amp, airy(2 * Math.PI * rho * R), 1e-12)
    }
    cerca('Airy: primer anillo oscuro en sin θ = 1,21967 λ/D', J11 / Math.PI, 1.2196698912665045, 1e-15)
    cerca('Airy: intensidad nula en el primer cero de J₁', airy(J11), 0, 1e-28)
    // FFT 2D de un rectángulo de píxeles = producto de núcleos de Dirichlet discretos
    const n = 64
    const [wx, wy] = [9, 5]
    const t = new Float64Array(n * n)
    for (let j = 0; j < wy; j++) for (let i = 0; i < wx; i++) t[(j + 3) * n + (i + 11)] = 1
    const I = fraunhofer2D(t, n)
    const dir = (k: number, w: number) => (k === 0 ? 1 : Math.sin((Math.PI * k * w) / n) / (w * Math.sin((Math.PI * k) / n))) ** 2
    let peor = 0
    for (const [kx, ky] of [[0, 0], [3, 0], [0, 7], [5, -9], [-13, 4], [20, 17]]) peor = Math.max(peor, Math.abs(I[(ky + n / 2) * n + (kx + n / 2)] - dir(kx, wx) * dir(ky, wy)))
    cerca('FFT 2D de un rectángulo = Dirichlet × Dirichlet', peor, 0, 1e-13)
    // disco pixelado: el primer mínimo sale donde Airy, salvo la pixelación del borde (tolerancia medio bin)
    const m = 512
    const Rp = 16
    const disco = new Float64Array(m * m)
    for (let j = 0; j < m; j++) for (let i = 0; i < m; i++) if ((i - m / 2) ** 2 + (j - m / 2) ** 2 <= Rp * Rp) disco[j * m + i] = 1
    const D = fraunhofer2D(disco, m)
    const fila = Array.from({ length: 40 }, (_, k) => D[(m / 2) * m + m / 2 + k])
    let k0 = 1
    while (k0 < 39 && !(fila[k0] < fila[k0 - 1] && fila[k0] <= fila[k0 + 1])) k0++
    const sub = k0 + (0.5 * (fila[k0 - 1] - fila[k0 + 1])) / (fila[k0 - 1] - 2 * fila[k0] + fila[k0 + 1])
    cerca('FFT de un disco: primer mínimo en j₁,₁ n/(2πR) bins (± pixelación)', sub, (J11 * m) / (2 * Math.PI * Rp), 0.5)
    // películas delgadas: Airy = matriz característica; λ/4 antirreflejante; λ/2 ausente
    for (const l of [420, 533, 690]) cerca(`película: Airy = matriz característica en λ = ${l} nm`, reflectanciaAiry(1, 1.38, 1.52, 250, l), reflectanciaMatriz(1, 1.38, 1.52, 250, l), 1e-15)
    const ns = 1.52
    const nf = Math.sqrt(ns)
    cerca('capa λ/4 con n_f = √n_s: R = 0', reflectanciaAiry(1, nf, ns, 550 / (4 * nf), 550), 0, 1e-30)
    cerca('capa λ/2: como si no estuviera', reflectanciaMatriz(1, 1.9, ns, 550 / (2 * 1.9), 550), ((1 - ns) / (1 + ns)) ** 2, 1e-15)
    // Michelson: intensidad nula en los anillos oscuros
    const an = anillosOscuros(12.4, 0.55, 0.5)
    cierto('Michelson: hay varios anillos', an.length >= 4, String(an.length))
    cerca('Michelson: los anillos oscuros tienen intensidad 0', Math.max(...an.map((th) => intensidadMichelson(12.4, 0.55, th))), 0, 1e-24)
  }

  seccion('Física · óptica geométrica')
  {
    // lente delgada: 1/s + 1/s′ = 1/f y m = −s′/s
    const im = imagen([{ z: 0, f: 10 }], -30)
    cerca('lente delgada: s′ = 15 para s = 30, f = 10', im.z, 15, 1e-12)
    cerca('lente delgada: aumento m = −s′/s = −1/2', im.m, -0.5, 1e-14)
    const virt = imagen([{ z: 0, f: 10 }], -6)
    cerca('objeto dentro de la focal: imagen virtual en s′ = −15', virt.z, -15, 1e-12)
    cierto('objeto dentro de la focal: la imagen no es real', !virt.real)
    // dos lentes: focal 1/f = 1/f₁ + 1/f₂ − d/(f₁f₂)
    const par = [{ z: 2, f: 12 }, { z: 7, f: -20 }]
    const F = focales(par)
    cerca('dos lentes: 1/f = 1/f₁ + 1/f₂ − d/(f₁f₂)', 1 / F.f, 1 / 12 + 1 / -20 - 5 / (12 * -20), 1e-15)
    cerca('dos lentes: det ABCD = 1', det(matrizLentes(par)), 1, 1e-15)
    cerca('det de la matriz objeto → última lente = 1', det(matrizSistema(par, -40)), 1, 1e-15)
    // la imagen de ABCD frente al corte de dos rayos trazados desde la punta del objeto
    const z0 = -40
    const zf = 200
    const r1 = trazar(par, z0, [1, 0], zf)
    const r2 = trazar(par, z0, [1, -0.03], zf)
    const [a1, b1] = [r1.at(-2)!, r1.at(-1)!]
    const [a2, b2] = [r2.at(-2)!, r2.at(-1)!]
    const m1 = (b1[1] - a1[1]) / (b1[0] - a1[0])
    const m2 = (b2[1] - a2[1]) / (b2[0] - a2[0])
    const zc = a1[0] + (a2[1] - a1[1]) / (m1 - m2)
    const ip = imagen(par, z0)
    cerca('dos lentes: imagen ABCD = corte de dos rayos trazados', zc, ip.z, 1e-9)
    cerca('dos lentes: altura de la imagen = m', a1[1] + m1 * (zc - a1[0]), ip.m, 1e-10)
    // foco posterior: un rayo paralelo cruza el eje en la BFD
    const rp = trazar(par, -10, [0.5, 0], 300)
    const [p, q] = [rp.at(-2)!, rp.at(-1)!]
    cerca('dos lentes: un rayo paralelo corta el eje en la distancia focal posterior', p[0] - p[1] / ((q[1] - p[1]) / (q[0] - p[0])), 7 + F.posterior, 1e-9)
    const kepler = matrizLentes([{ z: 0, f: 24 }, { z: 32, f: 8 }])
    cerca('anteojo de Kepler (d = f₁ + f₂): afocal, C = 0', kepler[1][0], 0, 1e-16)
    cerca('anteojo de Kepler: aumento angular D = −f₁/f₂', kepler[1][1], -3, 1e-14)
    // espejo esférico: trazado exacto frente a la fórmula cerrada y al foco paraxial R/2
    const R = 8
    for (const h of [1, 3, 5.5]) cerca(`espejo cóncavo R = 8, h = ${h}: corte exacto a R − R/(2 cos α) del vértice`, corteEje(R, h), -(R - R / (2 * Math.cos(Math.asin(h / R)))), 1e-12)
    cerca('espejo: rayo casi axial → foco paraxial a R/2', corteEje(R, 1e-4), -R / 2, 1e-8)
    cierto('espejo cóncavo: el reflejo vuelve hacia la luz', reflejoEsferico(R, 3)!.d[0] < 0)
    cierto('espejo: aberración esférica, los rayos altos cortan más cerca del espejo', corteEje(R, 5) > corteEje(R, 2))
    // prisma: mínima desviación numérica frente a n = sin((A + δ)/2)/sin(A/2)
    const A = Math.PI / 3
    const n = cauchy(486.1)
    const g = (Math.sqrt(5) - 1) / 2
    let lo = 0.3
    let hi = 1.4
    for (let i = 0; i < 200; i++) {
      const x1 = hi - g * (hi - lo)
      const x2 = lo + g * (hi - lo)
      if ((desviacionPrisma(A, n, x1) ?? 9) < (desviacionPrisma(A, n, x2) ?? 9)) hi = x2
      else lo = x1
    }
    const t = (lo + hi) / 2
    cerca('prisma: desviación mínima numérica = fórmula', desviacionPrisma(A, n, t)!, desviacionMinima(A, n), 1e-14)
    cerca('prisma: en el mínimo el paso es simétrico, θ₁′ = A/2', Math.asin(Math.sin(t) / n), A / 2, 1e-7)
    cierto('prisma: el azul se desvía más que el rojo', desviacionMinima(A, cauchy(450)) > desviacionMinima(A, cauchy(650)))
  }

  seccion('Física · termodinámica')
  {
    const PARES: Array<[TipoCiclo, number, number]> = [['carnot', 3, 0.5], ['otto', 8, 2.5], ['diesel', 18, 2], ['brayton', 10, 2.4], ['stirling', 3, 2.5]]
    for (const gamma of [5 / 3, 7 / 5]) {
      const gas: Gas = { n: 1, gamma }
      for (const [tipo, a, b] of PARES) {
        const p: ParamCiclo = { tipo, V1: 20, P1: 150, a, b }
        const r = resumen(gas, p)
        const et = `${tipo}, γ = ${gamma.toFixed(3)}`
        cerca(`${et}: η del balance = fórmula del libro`, r.eta, rendimientoTeorico(gas, p), 1e-12)
        cerca(`${et}: primer principio, ΣQ = ΣW en el ciclo`, r.tramos.reduce((x, t) => x + t.Q - t.W, 0), 0, 1e-9)
        cerca(`${et}: la entropía vuelve a su valor (Clausius)`, r.tramos.reduce((x, t) => x + t.dS, 0), 0, 1e-12)
        cierto(`${et}: η no pasa de Carnot entre sus temperaturas extremas`, r.eta <= 1 - r.Tmin / r.Tmax + 1e-12)
        // segundo método: recorrer el camino e integrar P dV y T dS por trapecios
        const c = ciclo(gas, p)
        let W = 0
        let Qabs = 0
        let S = 0
        for (const t of c.tramos) {
          const pts = camino(gas, c.estados[t.de], c.estados[t.a], t.tipo, 4000)
          for (let i = 1; i < pts.length; i++) {
            const [u, v] = [pts[i - 1], pts[i]]
            W += ((u.P + v.P) / 2) * (v.V - u.V)
            const dS = entropia(gas, v.V, v.T, u.V, u.T)
            const dQ = ((u.T + v.T) / 2) * dS
            S += dS
            if (dQ > 0) Qabs += dQ
          }
        }
        parecido(`${et}: ∮P dV trazado = W de las fórmulas`, W, r.W, 1e-6)
        parecido(`${et}: η = ∮P dV / Σ(T dS > 0) sobre el camino`, W / Qabs, rendimientoTeorico(gas, p), 1e-6)
        cerca(`${et}: ∮dS sobre el camino = 0`, S, 0, 1e-10)
        if (tipo === 'carnot') cerca(`${et}: Carnot, η = 1 − T_c/T_h`, r.eta, 1 - r.Tmin / r.Tmax, 1e-12)
      }
      const st: ParamCiclo = { tipo: 'stirling', V1: 20, P1: 150, a: 3, b: 2.5, regenerador: true }
      cerca(`Stirling con regenerador ideal = Carnot (γ = ${gamma.toFixed(3)})`, resumen(gas, st).eta, 1 - 1 / 2.5, 1e-12)
    }
    cierto('Otto: más compresión, más rendimiento', rendimientoTeorico({ n: 1, gamma: 1.4 }, { tipo: 'otto', V1: 1, P1: 1, a: 10, b: 2 }) > rendimientoTeorico({ n: 1, gamma: 1.4 }, { tipo: 'otto', V1: 1, P1: 1, a: 8, b: 2 }))
    cierto('Diesel frente a Otto a igual r: el Otto rinde más', rendimientoTeorico({ n: 1, gamma: 1.4 }, { tipo: 'otto', V1: 1, P1: 1, a: 16, b: 2 }) > rendimientoTeorico({ n: 1, gamma: 1.4 }, { tipo: 'diesel', V1: 1, P1: 1, a: 16, b: 2 }))

    // van der Waals: la tabla clásica a T_r = 0.9 es p = 0.647, v_l = 0.6034, v_g = 2.3488
    const m9 = maxwell(0.9)!
    cerca('vdW, T_r = 0.9: presión de vapor 0.6470', m9.p, 0.647, 5e-4)
    cerca('vdW, T_r = 0.9: v_l = 0.6034', m9.vl, 0.6034, 5e-5)
    cerca('vdW, T_r = 0.9: v_g = 2.3488', m9.vg, 2.3488, 5e-5)
    for (const T of [0.55, 0.7, 0.85, 0.95, 0.99]) {
      const m = maxwell(T)!
      cerca(`vdW, T_r = ${T}: la isoterma pasa por p_s en v_l y en v_g`, Math.max(Math.abs(pVdW(m.vl, T) - m.p), Math.abs(pVdW(m.vg, T) - m.p)), 0, 1e-10)
      cerca(`vdW, T_r = ${T}: áreas iguales ⇔ g(v_l) = g(v_g)`, gibbsVdW(m.vl, T) - gibbsVdW(m.vg, T), 0, 1e-9)
      const sp = espinodal(T)!
      const dp = (v: number) => (pVdW(v + 1e-6, T) - pVdW(v - 1e-6, T)) / 2e-6
      cerca(`vdW, T_r = ${T}: dp/dv = 0 en la espinodal`, Math.max(Math.abs(dp(sp[0])), Math.abs(dp(sp[1]))), 0, 1e-5)
      cierto(`vdW, T_r = ${T}: v_l < espinodal < v_g`, m.vl < sp[0] && sp[1] < m.vg)
      // Clapeyron: L = T Δv dp_s/dT, con la derivada numérica de la presión de vapor
      const h = 1e-5
      const dps = (maxwell(T + h)!.p - maxwell(T - h)!.p) / (2 * h)
      parecido(`vdW, T_r = ${T}: Clapeyron, L = T Δv dp_s/dT`, T * (m.vg - m.vl) * dps, latenteVdW(T), 1e-6)
    }
    parecido('vdW: pendiente de la curva de vapor en el punto crítico = 4', (1 - maxwell(0.999)!.p) / 0.001, 4, 2e-3)
    const co2 = criticoVdW(SUSTANCIAS[0])
    cerca('vdW, CO₂: T_c = 8a/27Rb ≈ 304 K', co2.T, 304.1, 1)
    cerca('vdW, CO₂: p_c = a/27b² ≈ 74 bar', co2.p / 1e5, 74, 1)

    // las asas de todos los ciclos y de van der Waals vuelven a su sitio
    const m0 = termodinamica.inicial as EstadoTermo
    const inter = (st: EstadoTermo) => {
      const v = typeof termodinamica.vista === 'function' ? termodinamica.vista(st) : termodinamica.vista
      return v.tipo === '2d' ? v.interaccion! : null
    }
    for (const est of [...PARES.map(([ciclo]) => ({ ...m0, ciclo })), { ...m0, ciclo: 'stirling' as TipoCiclo, gas: 'mono' as const }, { ...m0, modo: 'vdw' as const }]) {
      const it = inter(est)!
      for (const asa of it.asas(est)) {
        const s2 = { ...est, ...(it.mover(asa.id, { p: asa.p, mayus: false }, est) ?? {}) }
        const otra = it.asas(s2).find((q) => q.id === asa.id)!
        cerca(`termodinámica (${est.modo === 'vdw' ? 'vdW' : est.ciclo}): el asa ${asa.id} vuelve a su sitio`, Math.hypot(otra.p[0] - asa.p[0], otra.p[1] - asa.p[1]) / Math.max(1, Math.abs(asa.p[1])), 0, 1e-9)
      }
    }
  }

  seccion('Análisis dimensional')
  {
    cierto('[F] = M·L·T⁻²', texto(DIM.fuerza) === 'M·L·T⁻²', texto(DIM.fuerza))
    cierto('la fuerza se reconoce como N', unidadSI(DIM.fuerza) === 'N')
    cierto('la energía se reconoce como J', unidadSI(DIM.energia) === 'J')
    cierto('la presión se reconoce como Pa', unidadSI(DIM.presion) === 'Pa')
    cierto('la tensión se reconoce como V', unidadSI(DIM.potencial) === 'V')
    cierto('leer «M L^2 T^-2» = energía', igual(leerDim('M L^2 T^-2')!, DIM.energia))
    cierto('leer «L/T» = velocidad', igual(leerDim('L/T')!, DIM.velocidad))
    const dims = { m: DIM.masa, v: DIM.velocidad, g: DIM.aceleracion, h: DIM.longitud, E: DIM.energia, t: DIM.tiempo, omega: DIM.frecuencia }
    cierto('E = ½mv² + mgh es homogénea', !!ecuacion('', 'E = 1/2*m*v^2 + m*g*h', dims).dim)
    const mal = ecuacion('', 'E = 1/2*m*v^2 + m*g', dims)
    cierto('E = ½mv² + mg no es homogénea (y se dice)', !mal.dim && /homogénea/.test(mal.error ?? ''), mal.error)
    const seno = ecuacion('', 'h = sin(t)', dims)
    cierto('sin(t) con t en segundos: el argumento no es adimensional', !seno.dim && /adimensional/.test(seno.error ?? ''), seno.error)
    cierto('sin(ωt) sí vale', !!ecuacion('', 'h = h*sin(omega*t)', dims).dim)
    cierto('una mayúscula no se confunde con la constante e', !!ecuacion('', 'E = m*g*h', dims).dim)
    for (const [k, f] of Object.entries(DIMF)) {
      const d = (f as () => { ecuaciones: Array<{ nombre: string; dim: unknown; error?: string }> })()
      for (const e of d.ecuaciones) cierto(`${k}: «${e.nombre}» es homogénea`, !!e.dim, e.error)
    }
    // todos los módulos que declaran dimensiones dan ecuaciones homogéneas con su estado inicial
    for (const m of MODULOS) {
      const d = m.dimensiones?.(m.inicial)
      if (!d) continue
      for (const e of d.ecuaciones) cierto(`${m.id}: «${e.nombre}» es homogénea`, !!e.dim, e.error)
    }
  }
}
