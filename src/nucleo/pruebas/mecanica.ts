/** Bloque 2: mecánica. */
import { analizarLagrangiano, estadoEn, integrar, numerico, periodo } from '../../lib/mecanica'
import { compilarE } from '../../lib/cas/compilar'
import { elipticaK } from '../../lib/especiales'
import { resolverLineal } from '../../lib/matrices'
import lagrangiano, { PRESETS, calcular, type EstadoLagrangiano } from '../../modulos/mecanica/lagrangiano'
import orbitas, { areaBarrida, campoCentral, elementos, estadoInicial, hohmann, invariantes, periapsides, trayectoria, type EstadoOrbitas } from '../../modulos/mecanica/orbitas'
import { dormandPrince } from '../../lib/numerico'
import oscilaciones, { amplitudForzada, desfase, evolucion, forzadoExacto, modos, type EstadoOsc, type Modos } from '../../modulos/mecanica/oscilaciones'
import { cerca, cierto, parecido, seccion } from './comun'

export function pruebasMecanica() {
  seccion('Mecánica · tu lagrangiano')
  {
    // péndulo: m l² θ̈ + m g l sin θ = 0 y H = p²/(2ml²) − mgl cos θ
    const pen = analizarLagrangiano('theta', "1/2*m*l^2*theta'^2 + m*g*l*cos(theta)")
    const P = { m: 1.7, l: 0.8, g: 9.81 }
    const vars = ['theta', "theta'", 't']
    const M = compilarE(pen.M[0][0], vars, P)(Float64Array.from([0.3, 1.1, 0]))
    const f = compilarE(pen.f[0], vars, P)(Float64Array.from([0.3, 1.1, 0]))
    cerca('péndulo: M = m l²', M, 1.7 * 0.64, 1e-14)
    cerca('péndulo: f = −m g l sin θ', f, -1.7 * 9.81 * 0.8 * Math.sin(0.3), 1e-14)
    cierto('péndulo: tiene hamiltoniano', pen.hamilton !== null)
    const Hq = compilarE(pen.hamilton!.H, ['theta', 'p_theta'], P)(Float64Array.from([0.3, 2.2]))
    cerca('péndulo: H(q, p) = p²/(2ml²) − mgl cos θ', Hq, 2.2 ** 2 / (2 * 1.7 * 0.64) - 1.7 * 9.81 * 0.8 * Math.cos(0.3), 1e-13)
    const qd = compilarE(pen.hamilton!.qd[0], ['theta', 'p_theta'], P)(Float64Array.from([0.3, 2.2]))
    cerca('péndulo: θ̇ = ∂H/∂p = p/(ml²)', qd, 2.2 / (1.7 * 0.64), 1e-14)
    // periodo con amplitud grande: 4√(l/g) K(sin(θ₀/2))
    const num = numerico(pen, P)
    for (const th0 of [0.3, 1.5, 2.8]) {
      const tr = integrar(num, [th0, 0], 40, 1e-12)
      cerca(`péndulo θ₀ = ${th0}: periodo = 4√(l/g)K(sin θ₀/2)`, periodo(tr, 1)!, 4 * Math.sqrt(0.8 / 9.81) * elipticaK(Math.sin(th0 / 2)), 1e-8)
      const E0 = num.energia([th0, 0])
      // el cero de la energía es arbitrario (con θ₀ ≈ π/2, E₀ ≈ 0): la escala es m·g·l
      cierto(`péndulo θ₀ = ${th0}: energía conservada (< 10⁻⁹·mgl)`, tr.y.every((y) => Math.abs(num.energia(y) - E0) < 1e-9 * 1.7 * 9.81 * 0.8))
    }
    // doble péndulo contra las ecuaciones de libro en puntos cualesquiera
    const dp = analizarLagrangiano('theta, phi', PRESETS[1].L)
    const p2 = { m1: 1.3, m2: 0.7, l1: 1.1, l2: 0.9, g: 9.81 }
    const nd = numerico(dp, p2)
    let peor = 0
    for (const [t1, t2, w1, w2] of [[0.7, -1.9, 1.3, -0.4], [2.5, 0.2, -3, 1.1], [-1.1, 3, 0.4, 2.7]]) {
      const a = nd.aceleraciones([t1, t2, w1, w2])
      const { m1, m2, l1, l2, g } = p2
      const den = 2 * m1 + m2 - m2 * Math.cos(2 * t1 - 2 * t2)
      const a1 = (-g * (2 * m1 + m2) * Math.sin(t1) - m2 * g * Math.sin(t1 - 2 * t2) - 2 * Math.sin(t1 - t2) * m2 * (w2 * w2 * l2 + w1 * w1 * l1 * Math.cos(t1 - t2))) / (l1 * den)
      const a2 = (2 * Math.sin(t1 - t2) * (w1 * w1 * l1 * (m1 + m2) + g * (m1 + m2) * Math.cos(t1) + w2 * w2 * l2 * m2 * Math.cos(t1 - t2))) / (l2 * den)
      peor = Math.max(peor, Math.abs(a[0] - a1), Math.abs(a[1] - a2))
    }
    cierto('doble péndulo: Euler–Lagrange = ecuaciones de libro', peor < 1e-12, String(peor))
    const trd = integrar(nd, [2, 2.5, 0, 0], 20)
    const Ed = nd.energia([2, 2.5, 0, 0])
    cierto('doble péndulo caótico: energía conservada (< 10⁻⁸)', trd.y.every((y) => Math.abs(nd.energia(y) - Ed) < 1e-8 * Math.abs(Ed)))
    // carro y péndulo: (mc+m)ẍ + m l θ̈ cos θ − m l θ̇² sin θ = 0 ; m l ẍ cos θ + m l² θ̈ + m g l sin θ = 0
    const cp = analizarLagrangiano('x, theta', PRESETS[3].L, ['mc', 'm', 'l', 'g'])
    const pc = { mc: 2, m: 1.3, l: 0.7, g: 9.81 }
    const [x, th, xd, thd] = [0.4, 1.1, -0.3, 2.1]
    const a = numerico(cp, pc).aceleraciones([x, th, xd, thd])
    const sol = resolverLineal(
      [[pc.mc + pc.m, pc.m * pc.l * Math.cos(th)], [pc.m * pc.l * Math.cos(th), pc.m * pc.l ** 2]],
      [pc.m * pc.l * thd ** 2 * Math.sin(th), -pc.m * pc.g * pc.l * Math.sin(th)],
    )!
    cierto('carro y péndulo: aceleraciones de libro', Math.abs(a[0] - sol[0]) + Math.abs(a[1] - sol[1]) < 1e-13)
    // oscilador: x = cos(√(k/m) t)
    const os = numerico(analizarLagrangiano('x', "m/2*x'^2 - k/2*x^2"), { m: 1, k: 4 })
    const tro = integrar(os, [1, 0], 10)
    cierto('oscilador: x(t) = cos 2t', [0.7, 3.3, 9.1].every((t) => Math.abs(estadoEn(tro, t)[0] - Math.cos(2 * t)) < 1e-9))
    // Atwood: aceleración constante (m1 − m2)g/(m1 + m2)
    const at = numerico(analizarLagrangiano('x', PRESETS[4].L), { m1: 1.2, m2: 1, g: 9.8 })
    cerca('Atwood: ẍ = (m₁ − m₂)g/(m₁ + m₂)', at.aceleraciones([0.3, 0.5])[0], (0.2 * 9.8) / 2.2, 1e-14)
    // todos los presets se analizan e integran sin error
    for (const p of PRESETS) {
      const c = calcular({ ...(lagrangiano.inicial as EstadoLagrangiano), ...p })
      cierto(`preset «${p.t}» se resuelve`, !('error' in c) && !c.tr.parada, 'error' in c ? c.error : c.tr.parada ?? '')
    }
    cierto('φ como coordenada no es el número áureo', !analizarLagrangiano('phi', "phi'^2/2 - phi^2/2").libres.length)
    cierto('un parámetro de varias letras se lee entero', analizarLagrangiano('x', "mc*x'^2", ['mc']).libres.join() === 'mc')
  }

  seccion('Mecánica · órbitas y Kepler')
  {
    const base = orbitas.inicial as EstadoOrbitas
    const s: EstadoOrbitas = { ...base, mu: 1.3, r0: 1.1, v0: 1.25, gamma: 17, eps: 0, vueltas: 4 }
    const y0 = estadoInicial(s)
    const { E, L } = invariantes(s.mu, 0, y0)
    const el = elementos(s.mu, E, L)
    const tr = trayectoria(s)
    const ps = periapsides(tr)
    cierto('hay periapsides que medir', ps.length >= 3, String(ps.length))
    cerca('periodo radial = 2π√(a³/μ)', (ps[ps.length - 1].t - ps[0].t) / (ps.length - 1), el.T, 1e-8 * el.T)
    cerca('perihelio = L²/(μ(1 + e))', ps[0].r, el.rp, 1e-9)
    const rmax = Math.max(...tr.y.map((y) => Math.hypot(y[0], y[1])))
    cerca('afelio = L²/(μ(1 − e))', rmax, el.ra, 1e-6)
    cerca('sin corrección no hay precesión', Math.atan2(Math.sin(ps[1].ang - ps[0].ang), Math.cos(ps[1].ang - ps[0].ang)), 0, 1e-8)
    // 2.ª ley: dA/dt = L/2 (la velocidad se interpola con Hermite cúbico entre pasos: ~10⁻⁹ relativo)
    for (const [a, b] of [[0, el.T / 8], [0.43 * el.T, 0.61 * el.T]]) parecido(`área barrida en [${a.toFixed(2)}, ${b.toFixed(2)}] = L·Δt/2`, areaBarrida(tr, a, b), (L * (b - a)) / 2, 1e-8)
    cierto('energía y momento conservados', tr.y.every((y) => Math.abs(invariantes(s.mu, 0, y).E - E) < 1e-9 && Math.abs(invariantes(s.mu, 0, y).L - L) < 1e-9))
    // precesión por la corrección ε/r³: a primer orden 6πεμ/L⁴ por vuelta
    const sp: EstadoOrbitas = { ...s, eps: 2e-4, vueltas: 3 }
    const pp = periapsides(trayectoria(sp))
    const Lp = invariantes(sp.mu, sp.eps, estadoInicial(sp)).L
    const med = Math.atan2(Math.sin(pp[1].ang - pp[0].ang), Math.cos(pp[1].ang - pp[0].ang))
    parecido('precesión = 6πεμ/L⁴ a primer orden', med, (6 * Math.PI * sp.eps * sp.mu) / Lp ** 4, 3e-3)
    // Hohmann integrado a mano: sale de r₁ con v + Δv₁ y a t_H está en r₂, en θ = π, con ṙ = 0 y v + Δv₂ = √(μ/r₂)
    const mu = 1.7
    const r1 = 0.9
    const r2 = 2.6
    const h = hohmann(mu, r1, r2)
    const sol = dormandPrince(campoCentral(mu, 0), 0, [r1, 0, 0, Math.sqrt(mu / r1) + h.dv1], h.tTransferencia, 1e-12)
    const yf = sol.y[sol.y.length - 1]
    cerca('Hohmann: llega a r₂', Math.hypot(yf[0], yf[1]), r2, 1e-8)
    cerca('Hohmann: en el punto opuesto (θ = π)', Math.abs(Math.atan2(yf[1], yf[0])), Math.PI, 1e-8)
    cerca('Hohmann: llega sin velocidad radial', (yf[0] * yf[2] + yf[1] * yf[3]) / r2, 0, 1e-8)
    cerca('Hohmann: v + Δv₂ = √(μ/r₂)', Math.hypot(yf[2], yf[3]) + h.dv2, Math.sqrt(mu / r2), 1e-8)
  }

  seccion('Mecánica · oscilaciones acopladas')
  {
    const base = oscilaciones.inicial as EstadoOsc
    const m = 1.3
    const k = 2.1
    const dos = modos({ ...base, modo: 'cadena', N: 2, m, k, extremos: 'fijos' }) as Modos
    cerca('dos masas y tres muelles: ω₁ = √(k/m)', dos.w[0], Math.sqrt(k / m), 1e-12)
    cerca('dos masas y tres muelles: ω₂ = √(3k/m)', dos.w[1], Math.sqrt((3 * k) / m), 1e-12)
    const N = 5
    const fija = modos({ ...base, modo: 'cadena', N, m, k, extremos: 'fijos' }) as Modos
    fija.w.forEach((w, i) => cerca(`cadena fija N=5: ω${i + 1} = 2√(k/m) sin(nπ/(2(N+1)))`, w, 2 * Math.sqrt(k / m) * Math.sin(((i + 1) * Math.PI) / (2 * (N + 1))), 1e-11))
    const libre = modos({ ...base, modo: 'cadena', N: 4, m, k, extremos: 'libres' }) as Modos
    libre.w.forEach((w, i) => cerca(`cadena libre N=4: ω${i} = 2√(k/m) sin(nπ/(2N))`, w, 2 * Math.sqrt(k / m) * Math.sin((i * Math.PI) / 8), 1e-7))
    // M y K sin simetrías: la superposición modal tiene que cumplir M ẍ + K x = 0 integrada aparte
    const s: EstadoOsc = { ...base, modo: 'matrices', Mtxt: '2, 0.3, 0; 0.3, 1.1, -0.2; 0, -0.2, 0.7', Ktxt: '5, -1.7, 0.4; -1.7, 3.2, -0.9; 0.4, -0.9, 2.6' }
    const md = modos(s) as Modos
    cierto('M y K escritas: hay modos', !('error' in md))
    const n = 3
    for (let i = 0; i < n; i++) {
      const v = md.V.map((f) => f[i])
      const Kv = md.K.map((f) => f.reduce((a, x, j) => a + x * v[j], 0))
      const Mv = md.M.map((f) => f.reduce((a, x, j) => a + x * v[j], 0))
      cierto(`modo ${i + 1}: K v = ω² M v`, Kv.every((x, p) => Math.abs(x - md.w[i] ** 2 * Mv[p]) < 1e-11))
    }
    const x0 = [0.7, -0.4, 1.1]
    const Minv = (b: number[]) => resolverLineal(md.M, b) as number[]
    const sol = dormandPrince((_t, y) => [...y.slice(n), ...Minv(md.K.map((f) => -f.reduce((a, x, j) => a + x * y[j], 0)))], 0, [...x0, 0, 0, 0], 13.7, 1e-12)
    const yf = sol.y[sol.y.length - 1]
    const ev = evolucion(md, x0, 13.7)
    for (let p = 0; p < n; p++) cerca(`superposición modal = integración directa (x${p + 1} en t = 13,7)`, ev[p], yf[p], 1e-8)
    for (let p = 0; p < n; p++) cerca(`superposición en t = 0 reproduce x₀ (x${p + 1})`, evolucion(md, x0, 0)[p], x0[p], 1e-12)
  }
  {
    // pico de resonancia en amplitud: Ω = ω₀√(1 − 2ζ²), buscado por sección áurea
    const m = 0.8
    const k = 3.3
    const c = 0.9
    const w0 = Math.sqrt(k / m)
    const z = c / (2 * Math.sqrt(k * m))
    let a = 0.01
    let b = 2 * w0
    const g = (Math.sqrt(5) - 1) / 2
    for (let i = 0; i < 200; i++) {
      const x1 = b - g * (b - a)
      const x2 = a + g * (b - a)
      if (amplitudForzada(m, k, c, 1, x1) > amplitudForzada(m, k, c, 1, x2)) b = x2
      else a = x1
    }
    cerca('pico de amplitud en ω₀√(1 − 2ζ²)', (a + b) / 2, w0 * Math.sqrt(1 - 2 * z * z), 1e-6)
    cerca('en resonancia de fase (Ω = ω₀) el desfase es π/2', desfase(m, k, c, w0), Math.PI / 2, 1e-12)
    // forzado completo frente a Dormand–Prince en los tres regímenes, con x(0) = x′(0) = 0
    const casos: Array<[string, number]> = [['subamortiguado', 0.9], ['crítico', 2 * Math.sqrt(k * m)], ['sobreamortiguado', 7.4]]
    for (const [nombre, cc] of casos) {
      const F0 = 1.7
      const W = 1.3
      const sol = dormandPrince((t, y) => [y[1], (F0 * Math.cos(W * t) - cc * y[1] - k * y[0]) / m], 0, [0, 0], 9.1, 1e-12)
      const yf = sol.y[sol.y.length - 1]
      cerca(`forzado ${nombre}: solución exacta = numérica en t = 9,1`, forzadoExacto(m, k, cc, F0, W, 9.1), yf[0], 1e-8)
      cerca(`forzado ${nombre}: parte de x(0) = 0`, forzadoExacto(m, k, cc, F0, W, 0), 0, 1e-13)
    }
  }
}
