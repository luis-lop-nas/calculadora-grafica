import { campo, flujoEsfera, imagenes, lineaDeCampo, potencial, type Carga } from '../../lib/electro'
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
}
