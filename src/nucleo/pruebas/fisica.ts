import { campo, flujoEsfera, imagenes, lineaDeCampo, potencial, type Carga } from '../../lib/electro'
import { campoCuadratura, campoPoligonal, campoTramo, circulacion, poligonal, type P3 } from '../../lib/magneto'
import { campoEspacio, campoPlano, circulacionBorde, circulacionPlana, curvaPlana, estrellada, flujoCerrado, flujoPlano, flujoRotacional, integralDivergencia, integralRegion, parametrizacion } from '../../lib/teoremas'
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
}
