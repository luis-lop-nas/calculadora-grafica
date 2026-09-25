/** Bloque 2: mecánica. */
import { analizarLagrangiano, cruces, estadoEn, integrar, numerico, periodo } from '../../lib/mecanica'
import { estadoPeonza, invariantesEuler, leerPiezas, numericoPeonza, periodoEuler, precesionUniforme, retornos, rotacionEuler, rotacionLibre, tensor, type Peonza, type V3 } from '../../lib/solido'
import { compilarE } from '../../lib/cas/compilar'
import { elipticaK, gauss20 } from '../../lib/especiales'
import { resolverLineal } from '../../lib/matrices'
import lagrangiano, { PRESETS, calcular, type EstadoLagrangiano } from '../../modulos/mecanica/lagrangiano'
import orbitas, { areaBarrida, campoCentral, elementos, estadoInicial, hohmann, invariantes, periapsides, trayectoria, type EstadoOrbitas } from '../../modulos/mecanica/orbitas'
import { dormandPrince } from '../../lib/numerico'
import { boost, componer, doppler, gamma, gemelos, intervalo, rapidez, type Suceso } from '../../lib/relatividad'
import oscilaciones, { amplitudForzada, desfase, evolucion, forzadoExacto, modos, type EstadoOsc, type Modos } from '../../modulos/mecanica/oscilaciones'
import { apoyarEn, simular, solidoEn, estadoDado, tiempoAngulo, type Escena, type Movil, type Pieza } from '../../lib/escenario'
import cinematica, { EJEMPLOS, lecturasDe, formulasDe, type EstadoCinematica } from '../../modulos/mecanica/cinematica'
import { aTexto, generar, type Montaje } from '../../lib/montaje'
import { EJEMPLOS_MONTAJE, asasMontaje, moverMontaje, textoDe, type EstadoMontaje } from '../../modulos/mecanica/montaje'
import { calcularModulo } from '../../modulos/mecanica/lagrangiano'
import { analizar } from '../../lib/expresion'
import { desdeNodo, evaluar } from '../../lib/cas/expr'
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

  seccion('Mecánica · sólido rígido')
  {
    // cada fórmula de tabla frente a la integral de volumen hecha a mano (Gauss–Legendre anidado)
    const g3 = (f: (x: number, y: number, z: number) => number, [x0, x1]: number[], [y0, y1]: number[], [z0, z1]: number[]) =>
      gauss20((x) => gauss20((y) => gauss20((z) => f(x, y, z), z0, z1), y0, y1), x0, x1)
    const tensorIntegrado = (dens: number, dom: number[][]) => {
      const I = [0, 1, 2].map(() => [0, 0, 0])
      for (let i = 0; i < 3; i++)
        for (let j = 0; j < 3; j++)
          I[i][j] = dens * g3((x, y, z) => {
            const r = [x, y, z]
            return (i === j ? x * x + y * y + z * z : 0) - r[i] * r[j]
          }, dom[0], dom[1], dom[2])
      return I
    }
    const igualM = (nombre: string, A: number[][], B: number[][], tol: number) =>
      cierto(nombre, A.every((f, i) => f.every((v, j) => Math.abs(v - B[i][j]) < tol)), JSON.stringify(A.map((f, i) => f.map((v, j) => +(v - B[i][j]).toExponential(2)))))
    // caja fuera del origen: Steiner con productos de inercia
    const m = 2.1
    const [a, b, c] = [1.3, 0.7, 0.4]
    const d: V3 = [0.3, -0.5, 0.8]
    const caja = tensor(leerPiezas(`caja m=${m} a=${a} b=${b} c=${c} en (${d.join(', ')})`))
    igualM('caja desplazada: I respecto al origen = integral directa (Steiner)', caja.IO, tensorIntegrado(m / (a * b * c), [[d[0] - a / 2, d[0] + a / 2], [d[1] - b / 2, d[1] + b / 2], [d[2] - c / 2, d[2] + c / 2]]), 1e-12)
    cerca('caja: I_xx en su centro = m(b² + c²)/12', caja.Icm[0][0], (m * (b * b + c * c)) / 12, 1e-13)
    // cilindro, cono, esfera y cáscara en coordenadas cilíndricas o esféricas
    const cil = (dens: number, r: (u: number) => number, u0: number, u1: number, f: (u: number, s: number, a: number) => number) =>
      dens * gauss20((u) => gauss20((ang) => gauss20((s) => s * f(u, s, ang), 0, r(u)), 0, 2 * Math.PI, 2), u0, u1)
    {
      const [r, h, mm] = [0.6, 1.1, 1.7]
      const dens = mm / (Math.PI * r * r * h)
      const t = tensor(leerPiezas(`cilindro m=${mm} r=${r} h=${h} eje=x`))
      cerca('cilindro eje x: I_xx = mr²/2 (integral)', t.Icm[0][0], cil(dens, () => r, -h / 2, h / 2, (_u, s) => s * s), 1e-12)
      cerca('cilindro eje x: I_yy = m(3r² + h²)/12 (integral)', t.Icm[1][1], cil(dens, () => r, -h / 2, h / 2, (u, s, ang) => u * u + (s * Math.sin(ang)) ** 2), 1e-12)
    }
    {
      const [r, h, mm] = [0.5, 1.4, 0.9]
      const dens = mm / ((Math.PI * r * r * h) / 3)
      const rad = (u: number) => (r * (0.75 * h - u)) / h
      cerca('cono: el centro de masas está a h/4 de la base', cil(dens, rad, -h / 4, (3 * h) / 4, (u) => u), 0, 1e-12)
      cerca('cono: masa integrada', cil(dens, rad, -h / 4, (3 * h) / 4, () => 1), mm, 1e-12)
      const t = tensor(leerPiezas(`cono m=${mm} r=${r} h=${h} eje=y`))
      cerca('cono eje y: I_yy = 3mr²/10 (integral)', t.Icm[1][1], cil(dens, rad, -h / 4, (3 * h) / 4, (_u, s) => s * s), 1e-12)
      cerca('cono eje y: I_xx = 3mr²/20 + 3mh²/80 (integral)', t.Icm[0][0], cil(dens, rad, -h / 4, (3 * h) / 4, (u, s, ang) => u * u + (s * Math.cos(ang)) ** 2), 1e-12)
    }
    {
      const [r, mm] = [0.8, 1.3]
      const esf = mm / ((4 / 3) * Math.PI * r ** 3)
      // I_zz = ∫ ρ (r sin θ)² r² sin θ dr dθ dφ
      const Iz = esf * 2 * Math.PI * gauss20((rr) => gauss20((th) => rr ** 4 * Math.sin(th) ** 3, 0, Math.PI), 0, r)
      cerca('esfera maciza: 2mr²/5 (integral)', tensor(leerPiezas(`esfera m=${mm} r=${r}`)).Icm[2][2], Iz, 1e-12)
      const Ic = (mm / (4 * Math.PI * r * r)) * 2 * Math.PI * gauss20((th) => r ** 4 * Math.sin(th) ** 3, 0, Math.PI)
      cerca('cáscara esférica: 2mr²/3 (integral)', tensor(leerPiezas(`cascara m=${mm} r=${r}`)).Icm[0][0], Ic, 1e-12)
      cerca('varilla: ml²/12 (integral)', tensor(leerPiezas('varilla m=0.7 l=1.9 eje=y')).Icm[0][0], (0.7 / 1.9) * gauss20((x) => x * x, -0.95, 0.95), 1e-13)
    }
    // compuesto en L: suma de integrales directas, centro de masas y ejes principales
    {
      const src = 'caja m=1.5 a=1.2 b=0.3 c=0.2 en (0.6, 0.15, 0.1); caja m=0.8 a=0.3 b=0.9 c=0.2 en (0.15, 0.75, 0.1); punto m=0.4 en (1.1, 0.2, -0.3)'
      const t = tensor(leerPiezas(src))
      const I1 = tensorIntegrado(1.5 / (1.2 * 0.3 * 0.2), [[0, 1.2], [0, 0.3], [0, 0.2]])
      const I2 = tensorIntegrado(0.8 / (0.3 * 0.9 * 0.2), [[0, 0.3], [0.3, 1.2], [0, 0.2]])
      const q = [1.1, 0.2, -0.3]
      const Ip = [0, 1, 2].map((i) => [0, 1, 2].map((j) => 0.4 * ((i === j ? q[0] ** 2 + q[1] ** 2 + q[2] ** 2 : 0) - q[i] * q[j])))
      igualM('pieza en L: I_O = suma de integrales directas', t.IO, I1.map((f, i) => f.map((v, j) => v + I2[i][j] + Ip[i][j])), 1e-12)
      cerca('pieza en L: centro de masas x', t.cm[0], (1.5 * 0.6 + 0.8 * 0.15 + 0.4 * 1.1) / 2.7, 1e-14)
      cierto('pieza en L: hay productos de inercia', Math.abs(t.Icm[0][1]) > 1e-3)
      for (let k = 0; k < 3; k++) {
        const v = t.ejes.map((f) => f[k])
        cierto(`eje principal ${k + 1}: I v = λ v`, t.Icm.every((f, i) => Math.abs(f.reduce((acc, x, j) => acc + x * v[j], 0) - t.principales[k] * v[i]) < 1e-12))
      }
      cerca('traza invariante = Σ momentos principales', t.principales.reduce((x, y) => x + y, 0), t.Icm[0][0] + t.Icm[1][1] + t.Icm[2][2], 1e-13)
    }
  }
  {
    // simétrico: ω⊥ gira en el cuerpo con Ω = (I₃ − I₁)ω₃/I₁ (solución exacta)
    const I: V3 = [1.3, 1.3, 2.2]
    const w0: V3 = [0.4, -0.7, 3.1]
    const tr = rotacionLibre(I, w0, 7.3)
    const yf = tr.y[tr.y.length - 1]
    const W = ((I[2] - I[0]) * w0[2]) / I[0]
    cerca('Euler simétrico: ω₁(t) = ω₁cos Ωt − ω₂ sin Ωt', yf[0], w0[0] * Math.cos(W * 7.3) - w0[1] * Math.sin(W * 7.3), 1e-9)
    cerca('Euler simétrico: ω₂(t) = ω₁ sin Ωt + ω₂ cos Ωt', yf[1], w0[0] * Math.sin(W * 7.3) + w0[1] * Math.cos(W * 7.3), 1e-9)
    cerca('Euler simétrico: ω₃ constante', yf[2], w0[2], 1e-10)
    // asimétrico: conservación, ortogonalidad y periodo de Jacobi 4K(k)/λ en los dos regímenes
    const J: V3 = [1.1, 1.9, 2.7]
    for (const w of [[0.2, 1.5, 0.35], [0.9, 0.6, 0.1]] as V3[]) {
      const inv0 = invariantesEuler(J, [...w, 1, 0, 0, 0, 1, 0, 0, 0, 1])
      const T = periodoEuler(J, w)
      cierto(`ω₀ = (${w.join(', ')}): hay periodo de Jacobi`, T !== null)
      const tr2 = rotacionLibre(J, w, 3.2 * (T ?? 1))
      cierto(`ω₀ = (${w.join(', ')}): E y L (vector en el espacio) conservados`, tr2.y.every((y) => {
        const v = invariantesEuler(J, y)
        return Math.abs(v.E - inv0.E) < 1e-9 && v.L.every((x, i) => Math.abs(x - inv0.L[i]) < 1e-9)
      }))
      const R = tr2.y[tr2.y.length - 1].slice(3)
      cierto(`ω₀ = (${w.join(', ')}): R sigue siendo ortogonal`, [0, 1, 2].every((i) => [0, 1, 2].every((j) => Math.abs(R[3 * i] * R[3 * j] + R[3 * i + 1] * R[3 * j + 1] + R[3 * i + 2] * R[3 * j + 2] - (i === j ? 1 : 0)) < 1e-9)))
      const cs = cruces(tr2, (y) => y[1])
      parecido(`ω₀ = (${w.join(', ')}): periodo medido = 4K(k)/λ`, (cs[cs.length - 1] - cs[0]) / (cs.length - 1), T ?? NaN, 1e-8)
    }
    // teorema de la raqueta: estable en torno a los ejes mayor y menor, vuelco en torno al intermedio
    const K: V3 = [1, 2, 3]
    const desvio = (w: V3, k: number) => Math.max(...rotacionLibre(K, w, 30).y.map((y) => Math.hypot(...[0, 1, 2].filter((i) => i !== k).map((i) => y[i]))))
    cierto('raqueta: girando en torno al eje menor sigue ahí', desvio([3, 0.01, 0.01], 0) < 0.05)
    cierto('raqueta: girando en torno al eje mayor sigue ahí', desvio([0.01, 0.01, 3], 2) < 0.05)
    cierto('raqueta: en torno al intermedio da la vuelta (ω₂ cambia de signo)', Math.min(...rotacionLibre(K, [0.01, 3, 0.01], 30).y.map((y) => y[1])) < -2.9)
  }
  {
    // peonza pesada: ecuación de θ frente a la de libro, precesión uniforme y puntos de retorno
    const p: Peonza = { ia: 1.4, ic: 0.6, mgl: 2.3, theta0: 0.7, phid0: 0.3, thetad0: 0.4, w3: 9 }
    const num = numericoPeonza(p)
    const y = [0.83, 0.2, -1.1, 0.35, 0.9, 7.2]
    const [th, , , thd, phd, psd] = y
    const w3 = psd + phd * Math.cos(th)
    const acc = num.aceleraciones(y)
    cerca('peonza: θ̈ = (I₁φ̇² sin θ cos θ − I₃ω₃φ̇ sin θ + mgl sin θ)/I₁', acc[0], (p.ia * phd ** 2 * Math.sin(th) * Math.cos(th) - p.ic * w3 * phd * Math.sin(th) + p.mgl * Math.sin(th)) / p.ia, 1e-12)
    cerca('peonza: φ̈ de p_φ constante', acc[1], (-2 * p.ia * thd * phd * Math.sin(th) * Math.cos(th) + p.ic * w3 * thd * Math.sin(th)) / (p.ia * Math.sin(th) ** 2), 1e-11)
    const tr = integrar(num, estadoPeonza(p), 12)
    const E0 = num.energia(tr.y[0])
    cierto('peonza: energía y ω₃ conservados', tr.y.every((q) => Math.abs(num.energia(q) - E0) < 1e-9 && Math.abs(q[5] + q[4] * Math.cos(q[0]) - p.w3) < 1e-9))
    const rt = retornos(p)
    cierto('peonza: la cúbica da dos puntos de retorno', rt !== null)
    const minimos = cruces(tr, (q) => q[3]).map((t) => estadoEn(tr, t)[0])
    const maximos = cruces(tr, (q) => -q[3]).map((t) => estadoEn(tr, t)[0])
    cierto('peonza: cabecea varias veces', minimos.length >= 3 && maximos.length >= 3)
    for (const x of minimos) cerca('nutación: θ mínimo = raíz de la cúbica', x, rt![0], 1e-8)
    for (const x of maximos) cerca('nutación: θ máximo = raíz de la cúbica', x, rt![1], 1e-8)
    const phid = precesionUniforme(p)!
    const pu = { ...p, phid0: phid, thetad0: 0 }
    const tu = integrar(numericoPeonza(pu), estadoPeonza(pu), 20)
    cierto('precesión uniforme: θ no se mueve', tu.y.every((q) => Math.abs(q[0] - p.theta0) < 1e-8))
    cerca('precesión uniforme: φ̇ constante', tu.y[tu.y.length - 1][4], phid, 1e-8)
    parecido('trompo rápido: precesión lenta ≈ mgl/(I₃ω₃)', precesionUniforme({ ...p, w3: 400 })!, p.mgl / (p.ic * 400), 1e-4)
    const R = rotacionEuler(0.7, 1.2, -0.4)
    cierto('rotación z-x-z: tercera columna = (sin θ sin φ, −sin θ cos φ, cos θ)', Math.abs(R[0][2] - Math.sin(0.7) * Math.sin(1.2)) < 1e-15 && Math.abs(R[1][2] + Math.sin(0.7) * Math.cos(1.2)) < 1e-15 && Math.abs(R[2][2] - Math.cos(0.7)) < 1e-15)
  }

  seccion('Mecánica · relatividad especial')
  {
    const b = 0.63
    const g = gamma(b)
    const sucesos: Suceso[] = [[1.7, -0.4], [0.3, 2.9], [-1.2, 0.8], [2.6, 2.1]]
    for (let i = 0; i < 3; i++) cerca(`intervalo invariante (${i + 1}–${i + 2})`, intervalo(boost(b, sucesos[i]), boost(b, sucesos[i + 1])), intervalo(sucesos[i], sucesos[i + 1]), 1e-12)
    const ida = boost(-b, boost(b, sucesos[1]))
    cierto('boost(−β) ∘ boost(β) = identidad', Math.abs(ida[0] - sucesos[1][0]) < 1e-13 && Math.abs(ida[1] - sucesos[1][1]) < 1e-13)
    // un reloj quieto en S′ en x′ = 0 marca t′ = 1 cuando en S han pasado γ
    cerca('dilatación: (t′ = 1, x′ = 0) es t = γ en S', boost(-b, [1, 0])[0], g, 1e-13)
    // dos boosts seguidos = uno con la velocidad compuesta, y las rapideces se suman
    const b2 = -0.41
    const dos = boost(b2, boost(b, sucesos[3]))
    const uno = boost(componer(b, b2), sucesos[3])
    cierto('boost(β₂)∘boost(β₁) = boost((β₁ + β₂)/(1 + β₁β₂))', Math.abs(dos[0] - uno[0]) < 1e-12 && Math.abs(dos[1] - uno[1]) < 1e-12)
    cerca('las rapideces se suman', rapidez(componer(b, b2)), rapidez(b) + rapidez(b2), 1e-13)
    cerca('componer con la luz da la luz', componer(0.999999, 0.9), 1, 1e-6)
    // simultaneidad: sucesos con igual t′ cumplen Δt = β Δx en S
    const p1 = boost(-b, [0.8, -1.3])
    const p2 = boost(-b, [0.8, 2.2])
    cerca('simultáneos en S′: Δt = β Δx en S', p2[0] - p1[0], b * (p2[1] - p1[1]), 1e-13)
    // contracción: los extremos de una varilla quieta en S′ (x′ = 0 y x′ = L₀) cortados por t = 0
    const L0 = 1.9
    const corte = (xp: number) => {
      const q = boost(-b, [0, xp])
      const r = boost(-b, [3, xp])
      return q[1] - (q[0] * (r[1] - q[1])) / (r[0] - q[0])
    }
    cerca('contracción: medida a t = 0 en S, L = L₀/γ', corte(L0) - corte(0), L0 / g, 1e-12)
    // gemelos: tiempo propio del viajero sumando los dos tramos, Doppler y salto de simultaneidad
    const L = 3.4
    const gm = gemelos(b, L)
    const giro: Suceso = [gm.T / 2, L]
    const tauTramos = Math.sqrt(intervalo([0, 0], giro)) + Math.sqrt(intervalo(giro, [gm.T, 0]))
    cerca('gemelos: τ = suma de tiempos propios de los tramos', gm.tau, tauTramos, 1e-12)
    const D = doppler(b)
    cerca('gemelos: T = (τ/2)(D + 1/D) contando señales Doppler', (gm.tau / 2) * (D + 1 / D), gm.T, 1e-12)
    // en el sistema de ida, el suceso de casa simultáneo al giro tiene el mismo t′
    const tGiroIda = boost(b, giro)[0]
    cerca('gemelos: casa simultánea al giro (ida) = T/2 − βL', tGiroIda / g, gm.antes, 1e-12)
    const tGiroVuelta = boost(-b, giro)[0]
    cerca('gemelos: casa simultánea al giro (vuelta) = T/2 + βL', tGiroVuelta / g, gm.despues, 1e-12)
  }

  seccion('Mecánica · escenarios de cinemática')
  {
    const mv = (p: Partial<Movil>): Movil => ({ id: 'm', tipo: 'pelota', nombre: 'A', m: 1, r: 0.2, movimiento: 'libre', x0: 0, y0: 0.2, v0: 0, ang: 0, a: 0, parar: true, rozar: false, R: 2, w0: 1, alfa: 0, fase: 0, ...p })
    const esc = (piezas: Pieza[], moviles: Movil[], extra: Partial<Escena> = {}): Escena => ({ g: 9.8, aire: 'no', kAire: 0, e: 0, muE: 0.5, muD: 0.4, tMax: 10, piezas, moviles, ...extra })
    const edificio: Pieza = { id: 'e', tipo: 'edificio', x: -5, ancho: 5, alto: 20, muE: 0.5, muD: 0.4 }
    const primero = (S: ReturnType<typeof simular>, tipo: string) => S.recorridos[0].sucesos.find((e) => e.tipo === tipo)
    // caída libre de h = 20 m: t = √(2h/g), v = √(2gh)
    let S = simular(esc([edificio], [mv({ x0: 2, y0: 20.2 })]))
    cerca('caída libre: t = √(2h/g)', primero(S, 'impacto')!.t, Math.sqrt((2 * 20) / 9.8), 1e-9)
    cerca('caída libre: v = √(2gh)', primero(S, 'impacto')!.v!, Math.sqrt(2 * 9.8 * 20), 1e-6)
    // tiro parabólico desde el suelo: alcance v²sin2θ/g, altura v²sin²θ/2g
    S = simular(esc([], [mv({ x0: 0, y0: 0.2 + 1e-9, v0: 20, ang: 40 })], { muD: 0, muE: 0 }))
    const th = (40 * Math.PI) / 180
    cerca('tiro parabólico: alcance = v₀² sin 2θ / g', primero(S, 'impacto')!.x, (400 * Math.sin(2 * th)) / 9.8, 1e-6)
    cerca('tiro parabólico: h máx = v₀² sin²θ / 2g', primero(S, 'altura-max')!.y - 0.2, (400 * Math.sin(th) ** 2) / (2 * 9.8), 1e-4)
    // tiro horizontal desde la azotea, sin rozamiento en ella: alcance v₀√(2h/g) desde el borde
    S = simular(esc([{ ...edificio, muE: 0, muD: 0 }], [mv({ x0: 0.2 + 1e-9, y0: 20.2, v0: 10 })]))
    cerca('tiro horizontal: alcance = v₀ √(2h/g)', primero(S, 'impacto')!.x - 0.2, 10 * Math.sqrt((2 * 20) / 9.8), 1e-6)
    // deslizamiento con rozamiento: d = v₀²/(2 μ g)
    S = simular(esc([], [mv({ v0: 8 })]))
    cerca('frenada por rozamiento: d = v₀²/(2μg)', primero(S, 'parada')!.x, 64 / (2 * 0.4 * 9.8), 1e-6)
    cerca('frenada por rozamiento: t = v₀/(μg)', primero(S, 'parada')!.t, 8 / (0.4 * 9.8), 1e-9)
    // rampa: a = g(sin θ − μ cos θ)
    const rampa: Pieza = { id: 'r', tipo: 'rampa', x: 0, ancho: 10, alto: 10 * Math.tan(Math.PI / 6), muE: 0.2, muD: 0.1, derecha: false }
    S = simular(esc([rampa], [mv({ tipo: 'bloque', x0: 1, y0: 20 })], { tMax: 6 }))
    const q = S.recorridos[0].muestras.find((m) => m.t >= 2.5)!
    cerca('rampa: a = g(sin θ − μ cos θ)', Math.hypot(q.ax, q.ay), 9.8 * (0.5 - 0.1 * Math.cos(Math.PI / 6)), 1e-9)
    // en una rampa con tan θ ≤ μₑ no arranca
    S = simular(esc([{ ...rampa, muE: 0.7, muD: 0.6 }], [mv({ tipo: 'bloque', x0: 5, y0: 5 * Math.tan(Math.PI / 6) + 0.2 / Math.cos(Math.PI / 6) })], { tMax: 2 }))
    cierto('rampa con tan θ ≤ μₑ: se queda quieto', S.recorridos[0].quieto === 0, String(S.recorridos[0].quieto))
    // arranca desde el reposo en la rampa: v(t) = a t desde el primer paso (el rozamiento, en contra del movimiento)
    {
      const th = Math.PI / 6
      S = simular(esc([{ ...rampa, muE: 0.2, muD: 0.1 }], [mv({ tipo: 'bloque', x0: 2, y0: (10 - 2) * Math.tan(th) + 0.2 / Math.cos(th) })], { tMax: 1 }))
      const a = 9.8 * (Math.sin(th) - 0.1 * Math.cos(th))
      const q1 = S.recorridos[0].muestras.find((m) => m.t >= 0.5 - 1e-9)!
      cerca('rampa desde el reposo: |v| = g(sin θ − μ cos θ) t', Math.hypot(q1.vx, q1.vy), a * q1.t, 1e-9)
    }
    // esquinas: una pelota que va a rozar la arista de un muro no la atraviesa
    for (const y0 of [3.1, 3.2, 3.3]) {
      const muro: Pieza = { id: 'w', tipo: 'muro', x: 5, ancho: 1, alto: 3, muE: 0.5, muD: 0.4 }
      S = simular(esc([muro], [mv({ r: 0.25, x0: 0, y0, v0: 30 })], { tMax: 1 }))
      const pen = Math.max(...S.recorridos[0].muestras.map((q) => {
        if (q.x > 5 && q.x < 6 && q.y < 3) return 1
        return 0.25 - Math.hypot(q.x - Math.max(5, Math.min(6, q.x)), q.y - Math.max(0, Math.min(3, q.y)))
      }))
      cierto(`esquina de un muro (y₀ = ${y0}): no la atraviesa`, pen < 1e-6, `penetra ${pen}`)
      if (y0 > 3.15) cierto(`esquina de un muro (y₀ = ${y0}): cuenta el choque`, S.recorridos[0].sucesos.some((e) => e.texto.includes('esquina')))
    }
    // una esquina entrante (pie de un edificio) no desvía: la pelota que rueda hacia él choca con la pared
    {
      const ed: Pieza = { id: 'e', tipo: 'edificio', x: 5, ancho: 4, alto: 6, muE: 0.5, muD: 0.4 }
      S = simular(esc([ed], [mv({ r: 0.2, x0: 0, y0: 0.2, v0: 5 })], { tMax: 2, muE: 0, muD: 0 }))
      const imp = primero(S, 'impacto')
      cierto('pie de un edificio: choca con la pared, no con la esquina', !!imp && imp.texto.includes('pared'), imp?.texto)
    }
    // solidoEn / apoyarEn: nada se coloca dentro de un edificio
    {
      const ed: Pieza = { id: 'e', tipo: 'edificio', x: 0, ancho: 8, alto: 20, muE: 0.5, muD: 0.4 }
      const E0 = esc([ed], [])
      cierto('solidoEn: dentro del edificio', solidoEn(E0, 3, 5) && !solidoEn(E0, 9, 5) && !solidoEn(E0, 3, 21))
      cerca('apoyarEn: dentro del edificio sube a la azotea', apoyarEn(E0, 3, 5, 0.25), 20.25, 1e-12)
      cerca('apoyarEn: al lado, en el suelo', apoyarEn(E0, 10, 5, 0.25), 0.25, 1e-12)
    }
    // rebote: la altura tras el bote es e²·h
    S = simular(esc([], [mv({ y0: 5.2 })], { e: 0.8, tMax: 4 }))
    cerca('rebote: h₁ = e² h₀', primero(S, 'altura-max')!.y - 0.2, 0.64 * 5, 1e-4)
    // sin rozamiento ni choques, la energía se conserva
    S = simular(esc([], [mv({ y0: 30, v0: 12, ang: 70 })], { tMax: 2 }))
    const E = (m: (typeof S.recorridos)[0]['muestras'][0]) => 0.5 * (m.vx ** 2 + m.vy ** 2) + 9.8 * m.y
    cierto('vuelo libre: energía conservada', S.recorridos[0].muestras.every((m) => Math.abs(E(m) - E(S.recorridos[0].muestras[0])) < 1e-9))
    // aire lineal: velocidad límite mg/b
    S = simular(esc([], [mv({ m: 2, y0: 3000 })], { aire: 'lineal', kAire: 1, tMax: 20 }))
    cerca('aire lineal: v límite = mg/b', -S.recorridos[0].muestras.at(-1)!.vy, (2 * 9.8) / 1, 1e-3)
    S = simular(esc([], [mv({ m: 2, y0: 3000 })], { aire: 'cuadratico', kAire: 0.1, tMax: 20 }))
    cerca('aire cuadrático: v límite = √(mg/c)', -S.recorridos[0].muestras.at(-1)!.vy, Math.sqrt((2 * 9.8) / 0.1), 1e-4)
    // MRUA que frena y MCU
    const coche = mv({ movimiento: 'mrua', v0: 20, a: -4 })
    cerca('MRUA: distancia de frenado v₀²/2|a|', estadoDado(esc([], []), coche, 100).s, 50, 1e-12)
    const noria = mv({ movimiento: 'mcu', x0: 0, y0: 5, R: 3, w0: 0.5 })
    const e1 = estadoDado(esc([], []), noria, 1.3)
    cerca('MCU: |a| = ω²R', Math.hypot(e1.ax, e1.ay), 0.25 * 3, 1e-12)
    cerca('MCU: |v| = ωR', Math.hypot(e1.vx, e1.vy), 1.5, 1e-12)
    cerca('MCU: periodo 2π/ω', tiempoAngulo(0.5, 0, 2 * Math.PI)!, 4 * Math.PI, 1e-12)
    cerca('MCUA desde el reposo: θ = ½αt²', tiempoAngulo(0, 0.5, 2 * Math.PI)!, Math.sqrt((2 * 2 * Math.PI) / 0.5), 1e-12)
    // encuentro de dos MRU enfrentados: t = (d − r₁ − r₂)/(v₁ + v₂)
    S = simular(esc([], [mv({ id: 'a', movimiento: 'mru', v0: 15, r: 0.8 }), mv({ id: 'b', movimiento: 'mru', x0: 100, v0: 10, ang: 180, r: 0.8 })]))
    cerca('MRU: encuentro', S.encuentros[0]?.t ?? NaN, (100 - 1.6) / 25, 1e-9)
    // los ejemplos del módulo se simulan sin errores y dan lecturas
    const base = cinematica.inicial as EstadoCinematica
    for (const ej of EJEMPLOS) {
      const st = { ...base, ...ej.e, sel: ej.e.moviles?.[0]?.id ?? null } as EstadoCinematica
      const L = lecturasDe(st)
      const F = formulasDe(st)
      cierto(`cinemática: ejemplo «${ej.t}»`, L.length > 4 && F.length > 0 && L.every(([, v]) => !/NaN|Infinity/.test(v)), JSON.stringify(L))
    }
  }

  seccion('Mecánica · lagrangiano montado con piezas')
  {
    // el L generado vale lo mismo que el escrito a mano en estados cualesquiera
    const valorL = (coords: string, L: string, params: Record<string, number>, estado: Record<string, number>) => {
      const q = coords.split(/,\s*/)
      const vars = [...q, ...q.map((x) => x + "'"), ...Object.keys(params)]
      return evaluar(desdeNodo(analizar(L, { variables: vars }), { funciones: {}, valores: {} }), { ...params, ...estado })
    }
    const comparar = (nombre: string, mt: Montaje, Lmano: string, traduce: (p: Record<string, number>) => Record<string, number>) => {
      const g = generar(mt)
      for (const est of [
        [0.3, -1.1, 0.7, 0.2],
        [2.1, 0.4, -1.3, 0.9],
      ]) {
        const estado: Record<string, number> = {}
        g.coords.forEach((q, i) => {
          estado[q] = est[i]
          estado[q + "'"] = est[g.coords.length + i]
        })
        const a = valorL(g.coords.join(', '), g.L, g.params, estado)
        const b = valorL(g.coords.join(', '), Lmano, traduce(g.params), estado)
        // V puede diferir en una constante: se compara L − L(q = 0, q̇ = 0)
        const cero: Record<string, number> = {}
        for (const k of Object.keys(estado)) cero[k] = 0
        const a0 = valorL(g.coords.join(', '), g.L, g.params, cero)
        const b0 = valorL(g.coords.join(', '), Lmano, traduce(g.params), cero)
        cerca(`${nombre}: L generado = L de libro`, a - a0, b - b0, 1e-10)
      }
    }
    const P = (i: number) => EJEMPLOS_MONTAJE[i].mt
    comparar('péndulo', P(0), "1/2*m1*l1^2*theta'^2 + m1*g*l1*cos(theta)", (p) => p)
    comparar('doble péndulo', P(1), "(m1+m2)/2*l1^2*theta'^2 + m2/2*l2^2*phi'^2 + m2*l1*l2*theta'*phi'*cos(theta-phi) + (m1+m2)*g*l1*cos(theta) + m2*g*l2*cos(phi)", (p) => p)
    comparar('péndulo elástico', P(3), "m1/2*(r'^2 + r^2*theta'^2) + m1*g*r*cos(theta) - k1/2*(r-l1)^2", (p) => p)
    comparar('carro con péndulo', P(4), "(m1+m2)/2*x'^2 + m2*l2*x'*theta'*cos(theta) + m2/2*l2^2*theta'^2 + m2*g*l2*cos(theta)", (p) => p)
    comparar('Atwood con polea de masa M', P(5), "(m1+m2+mp1/2)/2*x'^2 + (m1-m2)*g*x", (p) => p)
    // rueda (disco) que rueda sin deslizar por una rampa de 25°: a = g sin α/(1 + 1/2); la caja, g sin α
    {
      const g = generar(P(8))
      const est = { coords: g.coords.join(', '), L: g.L, params: Object.entries(g.params).map(([k, v]) => `${k} = ${v}`).join(', '), ci: "x = 0, s = 0, x' = 0, s' = 0", puntos: '', tMax: 1 }
      const c = calcularModulo({ ...(lagrangiano.inicial as EstadoLagrangiano), ...est, modo: 'escribir' })
      if ('error' in c) cierto('rueda: se resuelve', false, c.error)
      else {
        const a = c.num.aceleraciones([0, 0, 0, 0])
        const al = Math.sin((25 * Math.PI) / 180) * 9.8
        cerca('rueda que rueda: a = g sin α / (1 + I/mR²)', a[0], al / 1.5, 1e-12)
        cerca('caja sin rozamiento: a = g sin α', a[1], al, 1e-12)
      }
    }
    // Atwood: se para cuando se acaba la cuerda
    {
      const st = { ...(lagrangiano.inicial as EstadoLagrangiano), modo: 'construir' as const, montaje: P(5), tMax: 10 }
      const c = calcularModulo(st)
      cierto('Atwood: la simulación se para al acabarse la cuerda', !('error' in c) && !!c.tr.parada && c.tr.t[c.tr.t.length - 1] < 3, 'error' in c ? c.error : String(c.tr.t.at(-1)))
    }
    // todos los ejemplos de montaje generan un L que el módulo integra
    for (const e of EJEMPLOS_MONTAJE) {
      const st = { ...(lagrangiano.inicial as EstadoLagrangiano), modo: 'construir' as const, montaje: e.mt, tMax: Math.min(e.tMax, 5) }
      const c = calcularModulo(st)
      cierto(`montaje «${e.t}» se resuelve`, !('error' in c), 'error' in c ? c.error : '')
      // y sus asas vuelven a su sitio
      const est: EstadoMontaje = { montaje: e.mt, selPieza: null, sigPieza: 100, tMax: e.tMax }
      for (const asa of asasMontaje(est)) {
        const parche = moverMontaje(asa.id, { p: asa.p, mayus: false }, est)
        const otra = asasMontaje({ ...est, ...(parche ?? {}) }).find((a) => a.id === asa.id)
        const d = otra ? Math.hypot(asa.p[0] - otra.p[0], asa.p[1] - otra.p[1]) : Infinity
        cierto(`montaje «${e.t}»: el asa ${asa.id} vuelve a su sitio`, d < 1e-2, `se movió ${d}`)
      }
      // el texto generado se vuelve a leer igual
      const t = textoDe(e.mt)
      cierto(`montaje «${e.t}»: el texto de L se relee`, !('error' in t) && aTexto(generar(e.mt).Lexpr).length > 0)
    }
  }
}
