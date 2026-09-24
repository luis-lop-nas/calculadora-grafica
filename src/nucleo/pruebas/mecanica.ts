/** Bloque 2: mecánica. */
import { analizarLagrangiano, estadoEn, integrar, numerico, periodo } from '../../lib/mecanica'
import { compilarE } from '../../lib/cas/compilar'
import { elipticaK } from '../../lib/especiales'
import { resolverLineal } from '../../lib/matrices'
import lagrangiano, { PRESETS, calcular, type EstadoLagrangiano } from '../../modulos/mecanica/lagrangiano'
import { cerca, cierto, seccion } from './comun'

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
}
