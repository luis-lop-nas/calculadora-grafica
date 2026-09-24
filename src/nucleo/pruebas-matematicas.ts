/**
 * Comprueba la matemática, no la interfaz: contrasta lo que calculan los módulos
 * contra valores conocidos, identidades y las propias ecuaciones diferenciales.
 * Se ejecuta con `npm run mate`.
 */
import { besselJ, cerosBessel, hermite, laguerre, legendre, legendreP } from '../lib/especiales'
import { euler, rk2, rk4, trayectoria } from '../lib/numerico'
import {
  auto2, autovalores3, clasificar, det, gramSchmidt, nucleo, producto, proyectar, raicesCubica, rango,
} from '../lib/matrices'
import * as K from '../lib/complejo'
import { contorno, equilibrios, jacobiano } from '../lib/contorno'
import { abeliano, centro, diedral, inverso, orden, simetrico, subgrupos, zn } from '../lib/grupos'

import { caja, hidrogeno, oscilador } from '../modulos/cuantica/orbitales'
import { dispersion, nivelesFinito, transmision, type EstadoPozo } from '../modulos/cuantica/pozo'
import pozo from '../modulos/cuantica/pozo'
import { coeficientes as coefOnda, forma2d, forma3d, omega, solucionCuerda, type EstadoOnda } from '../modulos/edp/onda'
import onda from '../modulos/edp/onda'
import { estacionario, solucion1d, solucionSeparable, type EstadoCalor } from '../modulos/edp/calor'
import calor from '../modulos/edp/calor'
import { datoDeContorno, solucion as solLaplace, type EstadoLaplace } from '../modulos/edp/laplace'
import laplace from '../modulos/edp/laplace'
import { derivadas } from '../modulos/campos/superficies'
import { autovaloresRobin, modosCalor, valorCalor } from '../modulos/edp/calor'
import segundo, { integrar as integra2, tiro, type EstadoSegundo } from '../modulos/edo/segundoorden'
import { analizar, integrar as integraEDO, residuo, solucionCerrada, type Analisis } from '../lib/edo'
import { compilarEdo, solucionEn, valoresIniciales } from '../lib/edo'
import { avanzar, crearEstacionaria, crearSim, integral as integralEdp, preparar as prepararEdp, type ConfigEdp } from '../lib/edp'
import { leerCondiciones, particular, resolverEdo, serieTaylor, VARIABLES_EDO } from '../lib/cas/edo'
import vectorial from '../modulos/campos/vectorial'
import parametricas from '../modulos/campos/parametricas'
import hilbert from '../modulos/algebra/hilbert'
import aplicaciones from '../modulos/algebra/aplicaciones'
import { convertir, mismaDimension, unidad } from '../lib/unidades'
import { analizar as analizarExpr } from '../lib/expresion'
import { clave as claveE, desdeNodo, evaluar as evaluarE, s as simb, sustituir as sustE } from '../lib/cas/expr'
import { tex as texE } from '../lib/cas/tex'
import { definida as definidaE } from '../lib/cas/definida'
import type { Punto } from '../lib/cas/limites'
import { derivar as derivarE } from '../lib/cas/derivar'
import { desarrollar as desarrollarE, factorizar as factorizarE, simplificar as simplificarE } from '../lib/cas/algebra'
import { resolver as resolverE, resolverSistema } from '../lib/cas/resolver'
import { limite as limiteE, taylor as taylorE } from '../lib/cas/limites'
import { integrar as integrarE } from '../lib/cas/integrar'
import { evaluar as evaluarGeo, evalConica, dist as distGeo, type Obj as ObjGeo } from '../lib/geometria'
import { MODULOS } from './registro'
import { uEn } from '../modulos/edp/laplace'
import { analizarFilas3, cortarMalla, medidasSolido, recortarACaja } from '../lib/objetos3d'
import { construirRejilla, marching } from '../lib/mallado'
import { analizarFilas, asintotas, ceros, extremos, inflexiones, integral as integral2d } from '../lib/objetos2d'

declare const process: { exitCode?: number }

import { cerca, cierto, cuenta, lectura, parecido, seccion } from './pruebas/comun'
import { pruebasBase } from './pruebas/base'
import { pruebasSenales } from './pruebas/senales'
import { pruebasMecanica } from './pruebas/mecanica'
import { pruebasFisica } from './pruebas/fisica'

/* ═══════════ funciones especiales ═══════════ */
seccion('Funciones especiales')
{
  const x = 0.7
  cerca('H₃ = 8x³−12x', hermite(3, x), 8 * x ** 3 - 12 * x, 1e-12)
  cerca('H₄ = 16x⁴−48x²+12', hermite(4, x), 16 * x ** 4 - 48 * x * x + 12, 1e-12)
  cerca('P₃ = (5x³−3x)/2', legendreP(3, x), (5 * x ** 3 - 3 * x) / 2, 1e-12)
  cerca('P₄ = (35x⁴−30x²+3)/8', legendreP(4, x), (35 * x ** 4 - 30 * x * x + 3) / 8, 1e-12)
  cerca('P₂⁰ = (3x²−1)/2', legendre(2, 0, x), (3 * x * x - 1) / 2, 1e-12)
  cerca('P₂¹ = −3x√(1−x²)', legendre(2, 1, x), -3 * x * Math.sqrt(1 - x * x), 1e-12)
  cerca('L₂¹ = x²/2−3x+3', laguerre(2, 1, x), (x * x) / 2 - 3 * x + 3, 1e-12)

  // valores tabulados de Abramowitz-Stegun
  cerca('J₀(1)', besselJ(0, 1), 0.7651976866, 1e-9)
  cerca('J₁(1)', besselJ(1, 1), 0.4400505857, 1e-9)
  cerca('J₂(1)', besselJ(2, 1), 0.1149034849, 1e-9)
  cerca('J₀(5)', besselJ(0, 5), -0.1775967713, 1e-9)
  // recurrencia J_{n−1} + J_{n+1} = (2n/x) J_n
  for (const [n, z] of [[1, 2.3], [3, 7.1]] as const)
    cerca(`recurrencia de Bessel n=${n}`, besselJ(n - 1, z) + besselJ(n + 1, z), ((2 * n) / z) * besselJ(n, z), 1e-9)

  cerca('primer cero de J₀', cerosBessel(0, 2)[0], 2.404825557695773, 1e-8)
  cerca('segundo cero de J₀', cerosBessel(0, 2)[1], 5.520078110286311, 1e-8)
  cerca('primer cero de J₁', cerosBessel(1, 1)[0], 3.831705970207512, 1e-8)
  cerca('primer cero de J₂', cerosBessel(2, 1)[0], 5.135622301840683, 1e-8)
  for (const n of [0, 1, 2, 3])
    for (const c of cerosBessel(n, 3)) cerca(`J${n} se anula en su cero`, besselJ(n, c), 0, 1e-9)
}

/* ═══════════ integradores ═══════════ */
seccion('Métodos numéricos')
{
  const f = (_t: number, y: number[]) => [y[0]]
  const avanza = (paso: typeof rk4, h: number) => {
    let y = [1]
    for (let i = 0; i < Math.round(1 / h); i++) y = paso(f, i * h, y, h)
    return y[0]
  }
  cerca('RK4 sobre y′=y da e', avanza(rk4, 0.01), Math.E, 1e-9)
  const ordenes: Array<[string, typeof rk4, number]> = [['Euler', euler, 2], ['RK2', rk2, 4], ['RK4', rk4, 16]]
  for (const [nombre, paso, razon] of ordenes) {
    const e1 = Math.abs(avanza(paso, 0.02) - Math.E)
    const e2 = Math.abs(avanza(paso, 0.01) - Math.E)
    cierto(`orden de ${nombre} (error ÷ ${razon} al partir h)`, Math.abs(e1 / e2 - razon) / razon < 0.15, `${(e1 / e2).toFixed(2)}`)
  }
  // el oscilador armónico conserva la energía
  const osc = (_t: number, y: number[]) => [y[1], -y[0]]
  const tr = trayectoria(osc, [1, 0], 0.001, 100000)
  const fin = tr[tr.length - 1]
  cerca('RK4 conserva la energía del oscilador', (fin[0] ** 2 + fin[1] ** 2) / 2, 0.5, 1e-9)
}

/* ═══════════ álgebra lineal ═══════════ */
seccion('Álgebra lineal')
{
  const A = [
    [2, -1, 0],
    [1, 3, 4],
    [0, 5, -2],
  ]
  cerca('determinante 3×3', det(A), 2 * (3 * -2 - 4 * 5) - -1 * (1 * -2 - 4 * 0), 1e-12)
  const B = [
    [1, 2, 3],
    [2, 4, 6],
    [1, 1, 1],
  ]
  cerca('rango de una matriz con filas dependientes', rango(B), 2, 0)
  for (const k of nucleo(B)) {
    const Ak = B.map((f) => f.reduce((s, v, i) => s + v * k[i], 0))
    cierto('B·k = 0 para k del núcleo', Math.hypot(...Ak) < 1e-9, `${Ak}`)
  }
  const C = [
    [2, 1],
    [1, 2],
  ]
  const vs = auto2(C)
  cerca('autovalor mayor de [[2,1],[1,2]]', vs[0].re, 3, 1e-12)
  cerca('autovalor menor', vs[1].re, 1, 1e-12)
  for (const l of vs) {
    if (!l.vector) continue
    const Av = [C[0][0] * l.vector[0] + C[0][1] * l.vector[1], C[1][0] * l.vector[0] + C[1][1] * l.vector[1]]
    cierto('A·v = λ·v', Math.hypot(Av[0] - l.re * l.vector[0], Av[1] - l.re * l.vector[1]) < 1e-9)
  }
  cierto('centro', clasificar([[0, 1], [-1, 0]]).nombre === 'centro')
  cierto('diag(1,0) es degenerado inestable', clasificar([[1, 0], [0, 0]]).estable === 'inestable')
  cierto('diag(-1,0) es degenerado estable', clasificar([[-1, 0], [0, 0]]).estable === 'estable')
  cierto('matriz nilpotente no es estable', clasificar([[0, 1], [0, 0]]).estable === 'inestable')
  cierto('punto de silla', clasificar([[1, 0], [0, -1]]).nombre === 'punto de silla')
  cierto('nodo estable', clasificar([[-1, 0], [0, -2]]).nombre === 'nodo estable')
  cierto('foco inestable', clasificar([[0.2, 1], [-1, 0.2]]).nombre.startsWith('foco inestable'))
  const T = [
    [1, 2, 3],
    [0, 4, 5],
    [0, 0, 6],
  ]
  const l3 = autovalores3(T).sort((a, b) => a - b)
  cerca('autovalores de una triangular = diagonal', l3[0], 1, 1e-6)
  cerca('autovalores de una triangular = diagonal', l3[1], 4, 1e-6)
  cerca('autovalores de una triangular = diagonal', l3[2], 6, 1e-6)
  for (const [raices, coef] of [
    [[1, 2, 3], [1, -6, 11, -6]],
    [[1, 4, 6], [1, -11, 34, -24]],
    [[-2, 1, 5], [1, -4, -7, 10]],
    [[-3, -1, 2], [1, 2, -5, -6]],
  ] as const) {
    const r = raicesCubica(coef[0], coef[1], coef[2], coef[3])
    cierto(`la cúbica con raíces ${raices} devuelve tres`, r.length === 3, `${r}`)
    raices.forEach((v, i) => cerca(`raíz ${i + 1} de ${raices}`, r[i], v, 1e-8))
  }

  const base = gramSchmidt([
    [1, 1, 0],
    [1, 0, 1],
  ])
  cierto('Gram-Schmidt da dos vectores', base.length === 2)
  cerca('‖u₁‖ = 1', Math.hypot(...base[0]), 1, 1e-12)
  cerca('⟨u₁, u₂⟩ = 0', producto(base[0], base[1]), 0, 1e-12)
  const w = [0.3, -1.2, 2]
  const p = proyectar(w, base)
  const res = w.map((c, i) => c - p[i])
  cerca('el residuo es ortogonal al subespacio', producto(p, res), 0, 1e-12)
  cerca('Pitágoras ‖w‖² = ‖p‖² + ‖r‖²', producto(w, w), producto(p, p) + producto(res, res), 1e-12)
  const p2 = proyectar(p, base)
  cerca('la proyección es idempotente', Math.hypot(...p2.map((c, i) => c - p[i])), 0, 1e-12)
}

/* ═══════════ complejos ═══════════ */
seccion('Aritmética compleja')
{
  cerca('e^{iπ} = −1 (parte real)', K.exp([0, Math.PI])[0], -1, 1e-12)
  cerca('e^{iπ} = −1 (parte imaginaria)', K.exp([0, Math.PI])[1], 0, 1e-12)
  const s = K.sqrt([0, 1])
  cerca('(√i)² = i', K.mul(s, s)[1], 1, 1e-12)
  const z: K.C = [0.7, -0.4]
  const id = K.suma(K.mul(K.sin(z), K.sin(z)), K.mul(K.cos(z), K.cos(z)))
  cerca('sin²z + cos²z = 1', id[0], 1, 1e-12)
  cerca('sin²z + cos²z = 1 (imaginaria)', id[1], 0, 1e-12)
  // sistema complejo con solución conocida:  (1+i)x + 2y = 3+i ;  x − iy = 1
  const sol = K.resolver(
    [
      [[1, 1], [2, 0]],
      [[1, 0], [0, -1]],
    ],
    [[3, 1], [1, 0]],
  )
  const c1 = K.suma(K.mul([1, 1], sol[0]), K.mul([2, 0], sol[1]))
  cerca('el solver complejo cumple la ecuación 1', K.abs(K.resta(c1, [3, 1])), 0, 1e-12)
  const c2 = K.suma(K.mul([1, 0], sol[0]), K.mul([0, -1], sol[1]))
  cerca('el solver complejo cumple la ecuación 2', K.abs(K.resta(c2, [1, 0])), 0, 1e-12)
  let singular = false
  try { K.resolver([[[1, 0], [2, 0]], [[2, 0], [4, 0]]], [[1, 0], [2, 0]]) } catch { singular = true }
  cierto('el solver complejo rechaza sistemas singulares', singular)
}

/* ═══════════ unidades físicas ═══════════ */
seccion('Unidades físicas')
{
  cerca('1500 m = 1.5 km', convertir(1500, 'm', 'km'), 1.5, 1e-12)
  cerca('1 h = 3600 s', convertir(1, 'h', 's'), 3600, 1e-12)
  cerca('72 km/h = 20 m/s', convertir(72, 'kmh', 'ms'), 20, 1e-12)
  cerca('0 °C = 273.15 K', convertir(0, 'C', 'K'), 273.15, 1e-12)
  cerca('100 °C = 212 °F', convertir(100, 'C', 'Fahr'), 212, 1e-10)
  cierto('metros y segundos son incompatibles', !mismaDimension(unidad('m'), unidad('s')))
  let incompatible = false
  try { convertir(1, 'm', 's') } catch { incompatible = true }
  cierto('la conversión incompatible lanza', incompatible)
}

/** Laplaciano numérico en 3D. */
const lap3 = (f: (x: number, y: number, z: number) => number, x: number, y: number, z: number, h = 1e-3) =>
  (f(x + h, y, z) + f(x - h, y, z) + f(x, y + h, z) + f(x, y - h, z) + f(x, y, z + h) + f(x, y, z - h) - 6 * f(x, y, z)) /
  (h * h)

/** Laplaciano numérico en 2D. */
const lap2 = (f: (x: number, y: number) => number, x: number, y: number, h = 1e-3) =>
  (f(x + h, y) + f(x - h, y) + f(x, y + h) + f(x, y - h) - 4 * f(x, y)) / (h * h)

/** Simpson en [a, b]. */
function simpson(f: (x: number) => number, a: number, b: number, n = 4000) {
  const m = n % 2 ? n + 1 : n
  const h = (b - a) / m
  let s = f(a) + f(b)
  for (let i = 1; i < m; i++) s += f(a + i * h) * (i % 2 ? 4 : 2)
  return (s * h) / 3
}

/* ═══════════ cuántica ═══════════ */
seccion('Cuántica: la ecuación de Schrödinger')
{
  // −½Δψ − ψ/r = Eψ  con  E = −1/(2n²)   (unidades atómicas)
  for (const [n, l, m] of [[1, 0, 0], [2, 0, 0], [2, 1, 0], [3, 2, 0], [3, 1, 1]] as const) {
    const psi = hidrogeno(n, l, m)
    const p: [number, number, number] = [0.83, 0.52, 1.31]
    const r = Math.hypot(...p)
    const v = psi(...p)
    const H = -0.5 * lap3(psi, ...p, 2e-3) - v / r
    cerca(`hidrógeno (${n},${l},${m}) cumple Schrödinger`, H / v, -1 / (2 * n * n), 2e-5)
  }
  // nodos radiales de los estados s: n−1 cambios de signo a lo largo de un radio
  for (const n of [1, 2, 3, 4]) {
    const psi = hidrogeno(n, 0, 0)
    let cambios = 0
    let prev = psi(0, 0, 1e-4)
    for (let i = 1; i <= 20000; i++) {
      const v = psi(0, 0, (i * 60) / 20000)
      if (prev * v < 0) cambios++
      prev = v
    }
    cierto(`el orbital ${n}s tiene ${n - 1} nodos radiales`, cambios === n - 1, `salen ${cambios}`)
  }
  // el orbital p_z se anula en el plano z = 0
  cerca('p_z se anula en z = 0', hidrogeno(2, 1, 0)(0.7, 0.4, 0), 0, 1e-12)
  // ortogonalidad radial ⟨1s|2s⟩ = ∫ R₁₀ R₂₀ r² dr = 0
  const R10 = hidrogeno(1, 0, 0)
  const R20 = hidrogeno(2, 0, 0)
  const norma1 = simpson((r) => R10(0, 0, r) ** 2 * r * r, 1e-6, 60)
  const norma2 = simpson((r) => R20(0, 0, r) ** 2 * r * r, 1e-6, 60)
  const cruzado = simpson((r) => R10(0, 0, r) * R20(0, 0, r) * r * r, 1e-6, 60)
  cerca('⟨1s|2s⟩ = 0', cruzado / Math.sqrt(norma1 * norma2), 0, 1e-8)

  // pozo cúbico: Δψ = −k²ψ y ψ = 0 en las paredes
  for (const [a, b, c] of [[1, 1, 1], [2, 1, 3]] as const) {
    const psi = caja(a, b, c)
    cerca(`caja (${a},${b},${c}) se anula en la pared x = 1`, psi(1, 0.3, -0.4), 0, 1e-12)
    cerca(`caja (${a},${b},${c}) se anula en la pared y = −1`, psi(0.2, -1, 0.5), 0, 1e-12)
    const p: [number, number, number] = [0.21, -0.37, 0.64]
    const k2 = (Math.PI / 2) ** 2 * (a * a + b * b + c * c)
    parecido(`caja (${a},${b},${c}) cumple Δψ = −k²ψ`, lap3(psi, ...p) / psi(...p), -k2)
  }

  // oscilador isótropo: −½Δψ + ½r²ψ = (n + 3/2) ψ
  for (const [a, b, c] of [[0, 0, 0], [1, 0, 2], [2, 1, 1]] as const) {
    const psi = oscilador(a, b, c)
    const p: [number, number, number] = [0.43, -0.71, 0.29]
    const r2 = p[0] ** 2 + p[1] ** 2 + p[2] ** 2
    const H = -0.5 * lap3(psi, ...p, 2e-3) + 0.5 * r2 * psi(...p)
    cerca(`oscilador (${a},${b},${c}) tiene E = n+3/2`, H / psi(...p), a + b + c + 1.5, 1e-5)
  }
}

seccion('Cuántica: pozos y barrera')
{
  // la transmisión del sistema lineal 4×4 tiene que coincidir con la fórmula cerrada
  for (const [E, V0, a] of [[1, 8, 2], [4, 8, 2], [7.9, 8, 1], [12, 8, 2], [20, 5, 0.7], [0.5, 20, 3]] as const) {
    const d = dispersion(E, V0, a)
    cerca(`T por matching = T analítica (E=${E}, V₀=${V0}, a=${a})`, d.T, transmision(E, V0, a), 1e-9)
    cerca(`unitariedad T+R=1 (E=${E}, V₀=${V0}, a=${a})`, d.T + d.R, 1, 1e-9)
  }
  // límite de barrera opaca: T ≈ 16 E(V₀−E)/V₀² · e^{−2κa}
  {
    const E = 0.5
    const V0 = 20
    const a = 3
    const q = Math.sqrt(2 * (V0 - E))
    const aprox = ((16 * E * (V0 - E)) / (V0 * V0)) * Math.exp(-2 * q * a)
    cierto('T en barrera opaca coincide con la aproximación exponencial', Math.abs(transmision(E, V0, a) / aprox - 1) < 0.02)
  }
  // resonancias: T = 1 exactamente cuando k₂a es múltiplo de π
  {
    const V0 = 8
    const a = 2
    for (const n of [1, 2, 3]) {
      const k2 = (n * Math.PI) / a
      const E = V0 + (k2 * k2) / 2
      cerca(`resonancia n=${n}: T = 1`, transmision(E, V0, a), 1, 1e-9)
    }
  }
  // pozo finito: cada nivel cumple su ecuación trascendente
  for (const [a, V0] of [[2, 8], [1, 20], [3, 2.5]] as const) {
    const ns = nivelesFinito(a, V0)
    for (const { E, par } of ns) {
      const k = Math.sqrt(2 * E)
      const q = Math.sqrt(2 * (V0 - E))
      const resto = par ? k * Math.tan(k * a) - q : k / Math.tan(k * a) + q
      cerca(`nivel ${par ? 'par' : 'impar'} del pozo (a=${a}, V₀=${V0}) cumple su ecuación`, resto, 0, 1e-6)
    }
    const z0 = a * Math.sqrt(2 * V0)
    cierto(
      `nº de estados ligados = ⌈z₀/(π/2)⌉ para (a=${a}, V₀=${V0})`,
      ns.length === Math.ceil(z0 / (Math.PI / 2)),
      `${ns.length} frente a ${Math.ceil(z0 / (Math.PI / 2))}`,
    )
    cierto('los niveles salen ordenados y dentro del pozo', ns.every((v, i) => v.E > 0 && v.E < V0 && (i === 0 || v.E > ns[i - 1].E)))
  }
  // pozo muy profundo → niveles del pozo infinito
  {
    const a = 2
    const V0 = 4000
    const ns = nivelesFinito(a, V0)
    for (const n of [1, 2, 3]) {
      const infinito = ((n * Math.PI) ** 2) / (2 * (2 * a) ** 2)
      cierto(`nivel ${n} tiende al del pozo infinito`, Math.abs(ns[n - 1].E / infinito - 1) < 0.02, `${ns[n - 1].E} vs ${infinito}`)
    }
  }
  // lo que enseña el panel
  {
    const s = { ...pozo.inicial, sistema: 'barrera', E: 4, V0: 8, a: 2 } as EstadoPozo
    const filas = pozo.lecturas!(s)
    cerca('el panel enseña T+R = 1', lectura(filas, 'T + R'), 1, 1e-5)
  }
}

/* ═══════════ ecuación de onda ═══════════ */
seccion('Ecuación de onda')
{
  const base = onda.inicial as EstadoOnda
  const dx = (u: (x: number, t: number) => number, x: number, t: number, h = 1e-4) =>
    (u(x + h, t) - u(x - h, t)) / (2 * h)

  // cuerda pinzada con extremos fijos: coeficientes contra la fórmula cerrada
  {
    const s: EstadoOnda = { ...base, dim: 1, contorno: 'fijo-fijo', inicial: 'pinzada', velocidad: 'reposo', x0: 0.3, terminos: 30 }
    const { A, B } = coefOnda(s)
    const a = s.x0
    for (const n of [1, 2, 3, 7]) {
      const exacto = (2 * Math.sin(n * Math.PI * a)) / (Math.PI ** 2 * n * n * a * (1 - a))
      cerca(`A${n} de la cuerda pinzada`, A[n - 1], exacto, 1e-5)
    }
    cierto('soltada en reposo, todos los B_n son cero', B.every((v) => Math.abs(v) < 1e-12))
  }

  // los tres contornos: la ecuación se cumple y cada condición de borde también
  for (const contorno of ['fijo-fijo', 'fijo-libre', 'libre-libre'] as const) {
    const s: EstadoOnda = {
      ...base, dim: 1, contorno, inicial: 'propia', exprU0: 'exp(-40*(x-0.45)^2)',
      velocidad: 'reposo', terminos: 90, c: 1.3,
    }
    const u = solucionCuerda(s)
    const h = 1e-3
    for (const [x, t] of [[0.37, 0.21], [0.62, 0.8]] as const) {
      const utt = (u(x, t + h) - 2 * u(x, t) + u(x, t - h)) / (h * h)
      const uxx = (u(x + h, t) - 2 * u(x, t) + u(x - h, t)) / (h * h)
      parecido(`u_tt = c²u_xx con extremos ${contorno}`, utt, s.c * s.c * uxx, 2e-3)
    }
    const t = 0.43
    if (contorno === 'fijo-fijo') {
      cerca('fijo-fijo: u(0,t) = 0', u(0, t), 0, 1e-12)
      cerca('fijo-fijo: u(L,t) = 0', u(1, t), 0, 1e-12)
    } else if (contorno === 'fijo-libre') {
      cerca('fijo-libre: u(0,t) = 0', u(0, t), 0, 1e-12)
      cerca('fijo-libre: u_x(L,t) = 0', dx(u, 1, t), 0, 1e-6)
    } else {
      cerca('libre-libre: u_x(0,t) = 0', dx(u, 0, t), 0, 1e-6)
      cerca('libre-libre: u_x(L,t) = 0', dx(u, 1, t), 0, 1e-6)
    }
    // la serie reproduce la condición inicial
    for (const x of [0.25, 0.45, 0.7]) {
      const u0 = Math.exp(-40 * (x - 0.45) ** 2)
      cierto(`la serie recupera u(x,0) con extremos ${contorno}`, Math.abs(u(x, 0) - u0) < 5e-3, `${u(x, 0)} vs ${u0}`)
    }
  }

  // segunda condición inicial: la serie reproduce u_t(x, 0)
  {
    const s: EstadoOnda = {
      ...base, dim: 1, contorno: 'fijo-fijo', inicial: 'propia', exprU0: '0',
      velocidad: 'propia', exprV0: 'sin(2*pi*x)', terminos: 60, c: 1,
    }
    const u = solucionCuerda(s)
    const h = 1e-4
    for (const x of [0.2, 0.55, 0.85]) {
      cerca(`u(x,0) = 0 en x=${x}`, u(x, 0), 0, 1e-9)
      const ut = (u(x, h) - u(x, -h)) / (2 * h)
      cierto(`u_t(x,0) = sen(2πx) en x=${x}`, Math.abs(ut - Math.sin(2 * Math.PI * x)) < 5e-3, `${ut}`)
    }
  }

  // cuerda libre golpeada: el centro de masas se mueve con velocidad constante
  {
    const s: EstadoOnda = {
      ...base, dim: 1, contorno: 'libre-libre', inicial: 'propia', exprU0: '0',
      velocidad: 'martillo', x0: 0.5, terminos: 80, c: 1,
    }
    const u = solucionCuerda(s)
    const media = (t: number) => simpson((x) => u(x, t), 0, 1, 2000)
    const v = (media(1) - media(0)) / 1
    cierto('el impulso del martillo se conserva', Math.abs(media(2) - (media(0) + 2 * v)) < 1e-6)
    cierto('la cuerda libre se traslada', Math.abs(v) > 0.1)
  }

  // la serie y la fórmula de d'Alembert dan lo mismo
  {
    const s: EstadoOnda = { ...base, dim: 1, contorno: 'fijo-fijo', inicial: 'gaussiana', velocidad: 'reposo', x0: 0.5, terminos: 140, c: 1 }
    const u = solucionCuerda(s)
    const f0 = (x: number) => u(x, 0)
    const impar = (x: number) => {
      const y = ((x % 2) + 2) % 2
      return y <= 1 ? f0(y) : -f0(2 - y)
    }
    for (const [x, t] of [[0.4, 0.15], [0.8, 0.37], [0.2, 0.9]] as const)
      cerca("la serie coincide con d'Alembert", u(x, t), 0.5 * (impar(x - t) + impar(x + t)), 1e-6)
  }

  // membrana rectangular: el modo cumple u_tt = c²Δu y se anula en el borde
  {
    const s: EstadoOnda = { ...base, dim: 2, forma: 'rectangular', m: 2, n: 3, razon: 1.4, mezcla: 0, c: 1.2 }
    const F = forma2d(s)
    const w = omega(s)
    const p: [number, number] = [0.31, 0.77]
    parecido('la membrana cumple Δu = −(ω/c)²u', lap2(F, ...p) / F(...p), -((w / s.c) ** 2))
    cerca('la membrana está fija en x = 0', F(0, 0.5), 0, 1e-12)
    cerca('la membrana está fija en x = 1', F(1, 0.5), 0, 1e-12)
    cerca('la membrana está fija en y = b', F(0.5, s.razon), 0, 1e-12)
    cerca('ω del rectángulo', w, s.c * Math.PI * Math.hypot(s.m, s.n / s.razon), 1e-12)
  }
  // membrana circular
  {
    const s: EstadoOnda = { ...base, dim: 2, forma: 'circular', m: 2, n: 2, c: 1 }
    const F = forma2d(s)
    const lam = cerosBessel(s.m, s.n)[s.n - 1]
    cerca('la membrana circular está fija en r = 1', F(1, 0.8), 0, 1e-9)
    const [r, th] = [0.43, 0.9]
    const h = 1e-3
    const urr = (F(r + h, th) - 2 * F(r, th) + F(r - h, th)) / (h * h)
    const ur = (F(r + h, th) - F(r - h, th)) / (2 * h)
    const utt = (F(r, th + h) - 2 * F(r, th) + F(r, th - h)) / (h * h)
    parecido('Δu en polares = −λ²u', (urr + ur / r + utt / (r * r)) / F(r, th), -(lam * lam))
    cerca('ω del disco', omega(s), s.c * lam, 1e-12)
  }
  // caja 3D
  {
    const s: EstadoOnda = { ...base, dim: 3, m: 2, n: 1, q: 3, c: 1 }
    const F = forma3d(s)
    const caja1 = (X: number, Y: number, Z: number) => F(2 * X - 1, 2 * Y - 1, 2 * Z - 1)
    const p: [number, number, number] = [0.33, 0.61, 0.27]
    const k2 = Math.PI ** 2 * (s.m ** 2 + s.n ** 2 + s.q ** 2)
    parecido('el modo de la caja cumple Δu = −k²u', lap3(caja1, ...p) / caja1(...p), -k2)
    cerca('la caja está fija en x = 0', caja1(0, 0.4, 0.6), 0, 1e-12)
    cerca('la caja está fija en z = 1', caja1(0.4, 0.6, 1), 0, 1e-12)
    cerca('ω de la caja', omega(s), s.c * Math.PI * Math.hypot(s.m, s.n, s.q), 1e-12)
  }
}

/* ═══════════ ecuación del calor ═══════════ */
seccion('Ecuación del calor')
{
  const base = calor.inicial as EstadoCalor
  // un modo puro cumple u_t = k u_xx exactamente
  {
    const s: EstadoCalor = { ...base, dim: 1, contorno: 'dirichlet', inicial: 'modo', modo: 3, k: 0.7, terminos: 8 }
    const u = solucion1d(s)
    const h = 1e-4
    for (const [x, t] of [[0.31, 0.02], [0.68, 0.11]] as const) {
      const ut = (u(x, t + h) - u(x, t - h)) / (2 * h)
      const uxx = (u(x + h, t) - 2 * u(x, t) + u(x - h, t)) / (h * h)
      parecido('u_t = k·u_xx', ut, s.k * uxx, 1e-3)
    }
    cerca('la barra está a cero en x = 0', u(0, 0.05), 0, 1e-12)
    cerca('la barra está a cero en x = 1', u(1, 0.05), 0, 1e-12)
    // el modo n decae como e^{−k n²π² t}
    cerca('decaimiento del modo 3', u(0.5, 0.1) / u(0.5, 0), Math.exp(-s.k * 9 * Math.PI ** 2 * 0.1), 1e-9)
  }
  // extremos aislados: la media se conserva
  {
    const s: EstadoCalor = { ...base, dim: 1, contorno: 'neumann', inicial: 'gaussiana', k: 0.5, terminos: 60 }
    const u = solucion1d(s)
    const media = (t: number) => simpson((x) => u(x, t), 0, 1, 2000)
    cerca('Neumann conserva la media', media(0.3), media(0), 1e-6)
  }
  // extremos fijos a T₀ y T₁: el estado estacionario es la recta
  {
    const s: EstadoCalor = { ...base, dim: 1, contorno: 'mixta', T0: -0.6, T1: 0.8, inicial: 'escalon', k: 1, terminos: 80 }
    const u = solucion1d(s)
    const uS = estacionario(s)
    cerca('u(0) = T₀', u(0, 0.05), s.T0, 1e-9)
    cerca('u(1) = T₁', u(1, 0.05), s.T1, 1e-9)
    for (const x of [0.25, 0.5, 0.75]) cerca(`u(${x}, ∞) = recta`, u(x, 8), uS(x), 1e-6)
  }
  // separable en 2D: u(x,y,t) = X(x,t)·X(y,t) cumple u_t = kΔu
  {
    const s: EstadoCalor = { ...base, dim: 2, inicial: 'gaussiana', k: 0.3, terminos: 40 }
    const eje = solucionSeparable(s)
    const u = (x: number, y: number, t: number) => eje(x, t) * eje(y, t)
    const h = 1e-4
    const [x, y, t] = [0.42, 0.63, 0.03]
    const ut = (u(x, y, t + h) - u(x, y, t - h)) / (2 * h)
    const uxx = (u(x + h, y, t) - 2 * u(x, y, t) + u(x - h, y, t)) / (h * h)
    const uyy = (u(x, y + h, t) - 2 * u(x, y, t) + u(x, y - h, t)) / (h * h)
    parecido('u_t = k(u_xx + u_yy) en la placa', ut, s.k * (uxx + uyy), 1e-3)
    cerca('la placa está a cero en el borde', u(0, 0.5, 0.02), 0, 1e-12)
  }
}

seccion('Calor: focos que se ponen y se mueven')
{
  const base = calor.inicial as EstadoCalor
  const g = (x: number, c: number, sg: number) => Math.exp(-((x - c) ** 2) / (2 * sg * sg))
  const focos = [[0.3, 0.35, 0.6, 1], [0.72, 0.6, 0.4, -0.7]]
  // la suma de series reproduce el dato: Σ aᵢ·g(x−xᵢ)·g(y−yᵢ)
  {
    const s: EstadoCalor = { ...base, dim: 2, inicial: 'focos', focos, ancho: 0.08, terminos: 60 }
    for (const p of [[0.3, 0.35], [0.72, 0.6], [0.5, 0.5]]) {
      const dato = focos.reduce((acc, f) => acc + f[3] * g(p[0], f[0], 0.08) * g(p[1], f[1], 0.08), 0)
      cerca(`placa con focos: u(${p}, 0) = dato`, valorCalor(s, p, 0), dato, 2e-3)
    }
    // por linealidad la suma sigue siendo solución de u_t = kΔu
    const h = 1e-4
    const u = (x: number, y: number, t: number) => valorCalor(s, [x, y], t)
    const [x, y, t] = [0.41, 0.52, 0.02]
    const ut = (u(x, y, t + h) - u(x, y, t - h)) / (2 * h)
    const lap = (u(x + h, y, t) + u(x - h, y, t) + u(x, y + h, t) + u(x, y - h, t) - 4 * u(x, y, t)) / (h * h)
    parecido('placa con focos: u_t = kΔu', ut, s.k * lap, 2e-3)
    cerca('placa con focos: borde a cero', u(0, 0.4, 0.01), 0, 1e-12)
  }
  // en el cubo, lo mismo con tres ejes
  {
    const s: EstadoCalor = { ...base, dim: 3, inicial: 'focos', focos, ancho: 0.08, terminos: 60 }
    const p = focos[0].slice(0, 3)
    const dato = focos.reduce((acc, f) => acc + f[3] * g(p[0], f[0], 0.08) * g(p[1], f[1], 0.08) * g(p[2], f[2], 0.08), 0)
    cerca('cubo con focos: u(F₁, 0) = dato', valorCalor(s, p, 0), dato, 2e-3)
    cierto('cubo con focos: el foco frío está por debajo de cero', valorCalor(s, focos[1].slice(0, 3), 0) < 0)
  }
  // en la barra, el dato con focos lo recupera la serie de cada contorno
  {
    const s: EstadoCalor = { ...base, dim: 1, contorno: 'neumann', inicial: 'focos', focos, ancho: 0.08, terminos: 80 }
    const u = solucion1d(s)
    for (const x of [0.3, 0.72]) {
      const dato = focos.reduce((acc, f) => acc + f[3] * g(x, f[0], 0.08), 0)
      cerca(`barra aislada con focos: u(${x}, 0) = dato`, u(x, 0), dato, 3e-3)
    }
  }
}

seccion('Calor: condiciones de contorno')
{
  const base = calor.inicial as EstadoCalor
  // Robin: los autovalores salen de λcosλ + h senλ = 0, uno por intervalo
  {
    for (const h of [0.5, 4, 15]) {
      const ls = autovaloresRobin(h, 6)
      cierto(`Robin h=${h}: salen 6 autovalores`, ls.length === 6, `${ls.length}`)
      ls.forEach((l, n) => {
        cerca(`Robin h=${h}: λ${n + 1} cumple su ecuación`, l * Math.cos(l) + h * Math.sin(l), 0, 1e-9)
        cierto(`Robin h=${h}: λ${n + 1} está en ((n−½)π, nπ)`, l > (n + 0.5) * Math.PI && l < (n + 1) * Math.PI)
      })
      // al crecer h, los autovalores tienden a nπ (extremo cada vez más «fijo»)
      if (h === 15) cierto('con h grande λ₁ se acerca a π', Math.abs(ls[0] - Math.PI) < 0.25, `${ls[0]}`)
    }
  }
  // la solución con Robin cumple la EDP y las dos condiciones de borde
  {
    const s: EstadoCalor = { ...base, dim: 1, contorno: 'robin', h: 4, inicial: 'propia', expr: 'x*(1-x)*4', k: 0.5, terminos: 40 }
    const u = solucion1d(s)
    const h = 1e-4
    for (const [x, t] of [[0.33, 0.02], [0.71, 0.07]] as const) {
      const ut = (u(x, t + h) - u(x, t - h)) / (2 * h)
      const uxx = (u(x + h, t) - 2 * u(x, t) + u(x - h, t)) / (h * h)
      parecido('con Robin también u_t = k·u_xx', ut, s.k * uxx, 2e-3)
    }
    const t = 0.05
    cerca('Robin: u(0,t) = 0', u(0, t), 0, 1e-9)
    const ux1 = (u(1 + h, t) - u(1 - h, t)) / (2 * h)
    parecido('Robin: u_x(1,t) = −h·u(1,t)', ux1, -s.h * u(1, t), 1e-3)
  }
  // condición inicial propia: la serie la reproduce
  {
    const s: EstadoCalor = { ...base, dim: 1, contorno: 'dirichlet', inicial: 'propia', expr: 'x*(1-x)*4', terminos: 60 }
    const u = solucion1d(s)
    for (const x of [0.2, 0.5, 0.8]) cierto(`la serie recupera u(x,0) en x=${x}`, Math.abs(u(x, 0) - 4 * x * (1 - x)) < 5e-3)
  }
  // Neumann: el modo constante es la media y no decae
  {
    const s: EstadoCalor = { ...base, dim: 1, contorno: 'neumann', inicial: 'gaussiana', k: 0.5, terminos: 50 }
    cerca('el primer modo de Neumann tiene λ = 0', modosCalor(s)[0].lambda, 0, 1e-15)
    const u = solucion1d(s)
    cierto('con extremos aislados la temperatura tiende a la media', Math.abs(u(0.2, 50) - u(0.8, 50)) < 1e-6)
  }
}

/* ═══════════ ecuación de Laplace ═══════════ */
seccion('Ecuación de Laplace')
{
  const base = laplace.inicial as EstadoLaplace
  // disco: armónica dentro, valor del borde y propiedad de la media
  {
    const s: EstadoLaplace = { ...base, dominio: 'disco', dato: 'seno', modo: 3, terminos: 40 }
    const u = solLaplace(s)
    const enCartesianas = (x: number, y: number) => u(Math.hypot(x, y), Math.atan2(y, x))
    for (const [x, y] of [[0.3, 0.2], [-0.4, 0.5]] as const)
      cierto('Δu = 0 dentro del disco', Math.abs(lap2(enCartesianas, x, y, 2e-3)) < 2e-3, `${lap2(enCartesianas, x, y, 2e-3)}`)
    const g = datoDeContorno(s)
    for (const th of [0.4, 2.1, 4.7]) cerca('u en el borde = dato', u(0.9999, th), g(th), 1e-3)
    const media = simpson((th) => g(th), 0, 2 * Math.PI, 4000) / (2 * Math.PI)
    cerca('propiedad de la media: u(0) = media del borde', u(0, 0), media, 1e-6)
  }
  // principio del máximo con un dato discontinuo
  {
    const s: EstadoLaplace = { ...base, dominio: 'disco', dato: 'escalon', terminos: 60 }
    const u = solLaplace(s)
    let mx = -Infinity
    for (let i = 1; i < 40; i++)
      for (let j = 0; j < 60; j++) mx = Math.max(mx, u((i / 40) * 0.9, (2 * Math.PI * j) / 60))
    cierto('el máximo interior no supera el del borde', mx < 1 + 1e-9, `${mx}`)
  }
  // cuadrado: armónica dentro y dato en el lado de arriba
  {
    const s: EstadoLaplace = { ...base, dominio: 'rectangulo', dato: 'seno', modo: 2, terminos: 40 }
    const u = solLaplace(s)
    for (const [x, y] of [[0.4, 0.5], [0.7, 0.3]] as const)
      cierto('Δu = 0 dentro del cuadrado', Math.abs(lap2(u, x, y, 2e-3)) < 2e-3, `${lap2(u, x, y, 2e-3)}`)
    const f = datoDeContorno(s)
    for (const x of [0.25, 0.6]) cerca('u(x, 1) = dato de arriba', u(x, 1), f(x), 1e-6)
    for (const x of [0.25, 0.6]) cerca('u(x, 0) = 0', u(x, 0), 0, 1e-9)
    cerca('u(0, y) = 0', u(0, 0.5), 0, 1e-12)
  }
}

/* ═══════════ campos, superficies y EDOs ═══════════ */
seccion('Leer y resolver una EDO escrita entera')
{
  const an = (eq: string) => {
    const r = analizar(eq)
    cierto(`«${eq}» se entiende`, !('error' in r && r.error), 'error' in r ? String(r.error) : '')
    return r as Analisis
  }
  // clasificación
  {
    const a = an("y' + 2*y = 0")
    cierto('y′+2y=0 es de orden 1', a.orden === 1)
    cierto('y′+2y=0 es lineal', a.lineal)
    cierto('y′+2y=0 tiene coeficientes constantes', a.constantes)
    cierto('y′+2y=0 es homogénea', a.homogenea)
    cerca('a₀ = 2', a.a[0](0), 2, 1e-9)
    cerca('a₁ = 1', a.a[1](0), 1, 1e-9)
    cerca('f = 0', a.f(3.1), 0, 1e-12)
  }
  {
    const a = an("y'' + 3*y' + 2*y = exp(-x)")
    cierto('es de orden 2', a.orden === 2)
    cierto('no es homogénea', !a.homogenea)
    cerca('a₂ = 1', a.a[2](0), 1, 1e-9)
    cerca('a₁ = 3', a.a[1](0), 3, 1e-9)
    cerca('a₀ = 2', a.a[0](0), 2, 1e-9)
    cerca('f(1) = e^{−1}', a.f(1), Math.exp(-1), 1e-9)
  }
  {
    const a = an("x*y'' + y' + x*y = 0")
    cierto('detecta coeficientes variables', a.lineal && !a.constantes)
    cerca('a₂(2) = 2', a.a[2](2), 2, 1e-9)
  }
  {
    const a = an("y'' + 0.2*y' + sin(y) = 0")
    cierto('detecta que no es lineal', !a.lineal)
  }
  cierto('avisa si falta el igual', 'error' in analizar("y'' + y") && !!(analizar("y'' + y") as any).error)
  cierto('avisa si no hay derivadas', 'error' in analizar('y = 3') && !!(analizar('y = 3') as any).error)

  // soluciones en forma cerrada, contra la fórmula de toda la vida
  const casos: Array<[string, number, number, (x: number) => number]> = [
    ["y'' + 3*y' + 2*y = 0", 1, 0, (x) => 2 * Math.exp(-x) - Math.exp(-2 * x)],
    ["y'' + 4*y' + 4*y = 0", 1, 0, (x) => (1 + 2 * x) * Math.exp(-2 * x)],
    ["y'' + 2*y' + 5*y = 10", 0, 0, (x) => 2 - Math.exp(-x) * (2 * Math.cos(2 * x) + Math.sin(2 * x))],
    ["y' + y = 3", 0, 0, (x) => 3 * (1 - Math.exp(-x))],
    ["y' + 2*y = 0", 1.5, 0, (x) => 1.5 * Math.exp(-2 * x)],
  ]
  for (const [eq, y0, p0, exacta] of casos) {
    const a = an(eq)
    const c = solucionCerrada(a, y0, p0)
    cierto(`«${eq}» tiene fórmula cerrada`, c !== null)
    if (!c) continue
    for (const x of [0, 0.4, 1.3, 3]) cerca(`«${eq}» en x=${x}`, c.y(x), exacta(x), 1e-9)
    // y la fórmula cumple la ecuación
    cierto(`«${eq}»: la fórmula tiene residuo nulo`, residuo(a, c.y, 4) < 1e-6, `${residuo(a, c.y, 4)}`)
    // y coincide con la integración numérica
    let dif = 0
    for (const p of integraEDO(a, y0, p0, 6)) dif = Math.max(dif, Math.abs(p[1] - c.y(p[0])))
    cierto(`«${eq}»: fórmula y numérica coinciden`, dif < 1e-7, `${dif}`)
  }
  // las condiciones iniciales se cumplen exactamente
  {
    const a = an("y'' + 0.4*y' + 9*y = 0")
    const c = solucionCerrada(a, -0.7, 2.3)!
    cerca('y(0) = y₀', c.y(0), -0.7, 1e-9)
    cerca("y′(0) = y′₀", (c.y(1e-6) - c.y(-1e-6)) / 2e-6, 2.3, 1e-5)
  }
  // sin fórmula cerrada, pero con solución numérica que cumple la ecuación
  // el coeficiente principal que se anula en el arranque es un punto singular
  {
    const a = an("x*y'' + y' + x*y = 0")
    cerca('el coeficiente principal se anula en x = 0', a.a[2](0), 0, 1e-12)
    cierto('la integración no arranca desde un punto singular', integraEDO(a, 1, 0, 5).length < 3)
  }
  for (const eq of ["y'' + 3*y' + 2*y = exp(-x)", "y'' + x*y = 0", "(1+x*x)*y'' + y = 0"]) {
    const a = an(eq)
    cierto(`«${eq}» no ofrece fórmula cerrada`, solucionCerrada(a, 1, 0) === null)
    const tr = integraEDO(a, 1, 0, 5)
    cierto(`«${eq}» sí se integra`, tr.length > 100)
    // la traza cumple la ecuación: se comprueba con las propias derivadas de la traza
    const h = tr[1][0] - tr[0][0]
    let peor = 0
    for (let i = 2; i < tr.length - 2; i += 50) {
      const ypp = (tr[i + 1][1] - 2 * tr[i][1] + tr[i - 1][1]) / (h * h)
      const yp = (tr[i + 1][1] - tr[i - 1][1]) / (2 * h)
      const x = tr[i][0]
      const r = a.a[0](x) * tr[i][1] + a.a[1](x) * yp + a.a[2](x) * ypp - a.f(x)
      peor = Math.max(peor, Math.abs(r))
    }
    cierto(`«${eq}»: la numérica cumple la ecuación`, peor < 1e-5, `${peor}`)
  }
}

seccion('EDO simbólica: métodos de libro, condiciones y numérica')
{
  // [ecuación, condiciones, método esperado (trozo), solución exacta del problema]
  const casos: Array<[string, string, string, (x: number) => number]> = [
    ["y' + 2*y = 0", 'y(0) = 1', 'factor integrante', (x) => Math.exp(-2 * x)],
    ["y' = x*y", 'y(0) = 2', 'factor integrante', (x) => 2 * Math.exp((x * x) / 2)],
    ["y' + y/x = x^2", 'y(1) = 1', 'factor integrante', (x) => x ** 3 / 4 + 0.75 / x],
    ["y' = y*(1 - y)", 'y(0) = 0.5', 'separación', (x) => 1 / (1 + Math.exp(-x))],
    ["y' = y^2", 'y(0) = 1', 'separación', (x) => 1 / (1 - x)],
    ["y' - y = x*y^2", 'y(0) = 1', 'Bernoulli', (x) => 1 / (1 - x)],
    ["y'' + 3*y' + 2*y = 0", "y(0) = 1, y'(0) = 0", 'característica', (x) => 2 * Math.exp(-x) - Math.exp(-2 * x)],
    ["y'' + y = sin(x)", "y(0) = 0, y'(0) = 1", 'particular', (x) => 1.5 * Math.sin(x) - (x * Math.cos(x)) / 2],
    ["y'' + 4*y = cos(2*x)", "y(0) = 0, y'(0) = 0", 'particular', (x) => (x * Math.sin(2 * x)) / 4],
    ["y'' - y = x^2", "y(0) = 0, y'(0) = 0", 'particular', (x) => Math.exp(x) + Math.exp(-x) - x * x - 2],
    ["y'' + 4*y' + 4*y = exp(-2*x)", "y(0) = 0, y'(0) = 0", 'particular', (x) => (x * x * Math.exp(-2 * x)) / 2],
    ["y''' - y = 0", "y(0) = 1, y'(0) = 1, y''(0) = 1", 'característica', (x) => Math.exp(x)],
    ["x^2*y'' - 2*x*y' + 2*y = 0", "y(1) = 1, y'(1) = 0", 'Cauchy', (x) => 2 * x - x * x],
    ["x^2*y'' + x*y' + y = 0", "y(1) = 0, y'(1) = 1", 'Cauchy', (x) => Math.sin(Math.log(x))],
    ["y'' + y = x", 'y(0) = 0, y(pi/2) = 1', 'particular', (x) => x + (1 - Math.PI / 2) * Math.sin(x)],
    ["y'' + y' = 0", "y(0) = 1, y'(0) = -1", 'característica', (x) => Math.exp(-x)],
  ]
  for (const [eq, cs, metodo, exacta] of casos) {
    const sol = resolverEdo(eq)
    cierto(`«${eq}»: método ${metodo}`, sol.metodo.toLowerCase().includes(metodo.toLowerCase()), sol.metodo)
    cierto(`«${eq}»: la general cumple la ecuación`, sol.verificada)
    const conds = leerCondiciones(cs)
    const p = particular(sol, conds)
    cierto(`«${eq}» con ${cs}: particular explícita`, !!p?.y, p?.nota ?? '')
    const xs = eq.startsWith('x^2*') || eq.includes('/x') ? [1, 1.5, 2.3] : [0, 0.4, 0.9]
    if (p?.y) for (const x of xs) cerca(`«${eq}» con ${cs}: y(${x})`, evaluarE(p.y, { x }), exacta(x), 1e-8)
    // y la numérica (Dormand–Prince, con disparo si hace falta) llega a lo mismo
    const ed = compilarEdo(eq, VARIABLES_EDO, sol.orden)
    const ini = valoresIniciales(ed, conds.map((c) => ({ k: c.k, x0: evaluarE(c.x0), v: evaluarE(c.v) })))
    cierto(`«${eq}»: valores iniciales numéricos`, !('error' in ini), 'error' in ini ? ini.error : '')
    if ('error' in ini) continue
    const tr = solucionEn(ed, ini.x0, ini.Y0, xs[0], xs[2])
    let peor = 0
    for (const q of tr.puntos) peor = Math.max(peor, Math.abs(q[1] - exacta(q[0])) / (1 + Math.abs(exacta(q[0]))))
    cierto(`«${eq}»: numérica contra exacta`, peor < 1e-6, peor.toExponential(2))
  }

  // implícitas y homogéneas
  {
    const sol = resolverEdo("2*x*y + (x^2 + 3*y^2)*y' = 0")
    cierto('2xy + (x² + 3y²)y′ = 0 es exacta', sol.metodo.includes('exacta') && !!sol.implicita)
    const p = particular(sol, leerCondiciones('y(1) = 1'))
    cierto('exacta: Φ(1, 1) − C = 0', !!p?.phi && Math.abs(evaluarE(p.phi, { x: 1, y: 1 })) < 1e-12)
  }
  cierto('y′ = (x + y)/x se resuelve', ((s) => s.verificada && !!s.explicita)(resolverEdo("y' = (x + y)/x")))
  // el despeje da dos ramas (±√…): la condición inicial elige la buena
  for (const [ec, c, x0, y0] of [["y' = -x/y", 'y(0) = 2', 0, 2], ["y' = -x/y", 'y(0) = -3', 0, -3], ["(2*x + y) + (x + 2*y)*y' = 0", 'y(0) = 1', 0, 1]] as const) {
    const p = particular(resolverEdo(ec), leerCondiciones(c))
    cerca(`${ec} con ${c}: la rama que pasa por el punto`, p?.y ? evaluarE(p.y, { x: x0 }) : NaN, y0, 1e-12)
  }
  // variación de parámetros con ∫ sin x·tan x (potencias trigonométricas y fracciones simples)
  cierto('y″ + y = tan x: variación de parámetros, comprobada', ((s) => s.verificada && !!s.explicita)(resolverEdo("y'' + y = tan(x)")))
  // la particular que no es elemental deja al menos la homogénea
  {
    const sol = resolverEdo("y'' + y = exp(x^2)")
    cierto('y″ + y = e^{x²}: da la homogénea', !!sol.homogenea && !sol.explicita)
  }
  // Taylor: Airy y″ + x·y = 0, y(0) = 1, y′(0) = 0 → 1 − x³/6 + x⁶/180 − …
  {
    const t = serieTaylor("y'' + x*y = 0", leerCondiciones("y(0) = 1, y'(0) = 0"))
    cierto('Airy tiene serie', !!t)
    if (t) {
      cerca('Airy: serie en 0,5', evaluarE(t.serie, { x: 0.5 }), 1 - 0.5 ** 3 / 6 + 0.5 ** 6 / 180, 1e-12)
      const ed = compilarEdo("y'' + x*y = 0", VARIABLES_EDO, 2)
      const tr = solucionEn(ed, 0, [1, 0], 0, 0.5)
      // lo que falta es el término siguiente, −x⁹/12960 ≈ 1,5·10⁻⁷
      cerca('Airy: serie contra numérica en 0,5', evaluarE(t.serie, { x: 0.5 }) - 0.5 ** 9 / 12960, tr.puntos[tr.puntos.length - 1][1], 1e-8)
    }
  }
  // la numérica avisa de la explosión de y′ = y² en x = 1
  {
    const ed = compilarEdo("y' = y^2", VARIABLES_EDO, 1)
    const tr = solucionEn(ed, 0, [1], -1, 3)
    cierto('y′ = y²: se para cerca de x = 1', tr.paradas.length === 1 && Math.abs(tr.paradas[0].x - 1) < 0.02, JSON.stringify(tr.paradas))
  }
  // sin despejar: la derivada más alta se busca por Newton
  {
    const ed = compilarEdo("exp(y') + y' = 1 + x", VARIABLES_EDO, 1)
    const tr = solucionEn(ed, 0, [0], 0, 1)
    cierto('ecuación implícita en y′ se integra', tr.puntos.length > 10 && !tr.paradas.length)
  }
}

seccion('EDP escrita a mano: método de líneas contra soluciones exactas')
{
  const base: ConfigEdp = { dim: 1, ecU: '', ecV: '', parametros: '', iniU: '0', iniUt: '0', iniV: '0', iniVt: '0', contorno: 'dirichlet', bordeU: '0', bordeV: '0', x: [0, Math.PI], n: 101 }
  const hasta = (c: Partial<ConfigEdp>, T: number) => {
    const p = prepararEdp({ ...base, ...c })
    let s = p.estacionaria ? crearEstacionaria(p) : crearSim(p)
    for (let k = 0; k < 4000 && !s.roto && !s.convergida && (p.estacionaria || s.t < T); k++) s = avanzar(s, 50, T)
    return s
  }
  const error = (s: ReturnType<typeof crearSim>, exacta: (x: number, y: number, t: number) => number) => {
    let e = 0
    let m = 0
    for (let j = 0; j < s.ny; j++)
      for (let i = 0; i < s.n; i++) {
        const v = exacta(s.xs[i], s.ys[j], s.t)
        e = Math.max(e, Math.abs(s.u[0][j * s.n + i] - v))
        m = Math.max(m, Math.abs(v))
      }
    return e / (m || 1)
  }
  const casos: Array<[string, Partial<ConfigEdp>, number, (x: number, y: number, t: number) => number, number]> = [
    ['calor, Dirichlet', { ecU: 'u_t = u_xx', iniU: 'sin(x)' }, 1, (x, _, t) => Math.exp(-t) * Math.sin(x), 2e-4],
    ['calor, Neumann', { ecU: 'u_t = u_xx', iniU: 'cos(x)', contorno: 'neumann' }, 1, (x, _, t) => Math.exp(-t) * Math.cos(x), 2e-4],
    ['calor con parámetro', { ecU: 'u_t = k*u_xx', parametros: 'k = 0.5', iniU: 'sin(2*x)' }, 1, (x, _, t) => Math.exp(-2 * t) * Math.sin(2 * x), 1e-3],
    ['onda', { ecU: 'u_tt = u_xx', iniU: 'sin(x)' }, 2, (x, _, t) => Math.cos(t) * Math.sin(x), 5e-4],
    ['onda con velocidad inicial', { ecU: 'u_tt = 4*u_xx', iniUt: 'sin(x)' }, 1, (x, _, t) => (Math.sin(2 * t) / 2) * Math.sin(x), 5e-4],
    ['transporte periódico', { ecU: 'u_t = -u_x', iniU: 'sin(2*x)', contorno: 'periodica' }, 1, (x, _, t) => Math.sin(2 * (x - t)), 3e-3],
    ['borde dependiente de x', { ecU: 'u_t = u_xx', iniU: 'x/pi', bordeU: 'x/pi' }, 1, (x) => x / Math.PI, 1e-12],
    ['Poisson 1D (estacionaria)', { ecU: 'u_xx = -1', x: [0, 1] }, 0, (x) => (x * (1 - x)) / 2, 1e-5],
    ['calor 2D', { dim: 2, ecU: 'u_t = lap(u)', iniU: 'sin(x)*sin(y)', n: 41 }, 0.5, (x, y, t) => Math.exp(-2 * t) * Math.sin(x) * Math.sin(y), 1e-3],
    ['onda 2D', { dim: 2, ecU: 'u_tt = lap(u)', iniU: 'sin(x)*sin(2*y)', n: 41 }, 1, (x, y, t) => Math.cos(Math.sqrt(5) * t) * Math.sin(x) * Math.sin(2 * y), 4e-3],
    ['Poisson 2D', { dim: 2, ecU: 'lap(u) = -2*pi^2*sin(pi*x)*sin(pi*y)', x: [0, 1], n: 41 }, 0, (x, y) => Math.sin(Math.PI * x) * Math.sin(Math.PI * y), 1e-3],
  ]
  for (const [nombre, c, T, exacta, tol] of casos) {
    const s = hasta(c, T)
    cierto(`EDP ${nombre}: no se rompe`, !s.roto, s.roto ?? '')
    const e = error(s, exacta)
    cierto(`EDP ${nombre}: error relativo < ${tol}`, e < tol, e.toExponential(2))
  }
  // orden 2 en el espacio: al doblar la malla, el error baja ~4 veces
  {
    const e1 = error(hasta({ ecU: 'u_t = u_xx', iniU: 'sin(x)', n: 21 }, 0.5), (x, _, t) => Math.exp(-t) * Math.sin(x))
    const e2 = error(hasta({ ecU: 'u_t = u_xx', iniU: 'sin(x)', n: 41 }, 0.5), (x, _, t) => Math.exp(-t) * Math.sin(x))
    cerca('EDP: orden de convergencia espacial ≈ 2', Math.log2(e1 / e2), 2, 0.15)
  }
  // lo que tiene que avisar
  cierto('EDP: el calor hacia atrás avisa', !!prepararEdp({ ...base, ecU: 'u_t = -u_xx' }).aviso)
  let fallo = ''
  try {
    prepararEdp({ ...base, ecU: 'u_t + u_xx = 0' })
  } catch (e) {
    fallo = (e as Error).message
  }
  cierto('EDP: u_t fuera de la izquierda da un error claro', fallo.includes('sola a la izquierda'), fallo)
  // la masa se conserva con Neumann 0 en el calor
  {
    const p = prepararEdp({ ...base, ecU: 'u_t = u_xx', iniU: 'exp(-4*(x-1)^2)', contorno: 'neumann' })
    const s0 = crearSim(p)
    const m0 = integralEdp(s0)
    let s = s0
    while (s.t < 0.5) s = avanzar(s, 50, 0.5)
    cerca('EDP: con Neumann 0 el calor conserva ∫u', integralEdp(s), m0, 1e-3 * m0)
  }
}

seccion('EDO de segundo orden')
{
  const base = segundo.inicial as EstadoSegundo
  // valor inicial lineal: contra la solución analítica en los tres regímenes
  {
    const casos: Array<[string, number, number, (t: number) => number]> = [
      ['subamortiguado', 0.5, 4, (t) => {
        const wd = Math.sqrt(4 - 0.0625)
        return Math.exp(-0.25 * t) * (Math.cos(wd * t) + (0.25 / wd) * Math.sin(wd * t))
      }],
      ['crítico', 4, 4, (t) => (1 + 2 * t) * Math.exp(-2 * t)],
      ['sobreamortiguado', 7, 4, (t) => {
        const r = Math.sqrt(33)
        const l1 = (-7 + r) / 2
        const l2 = (-7 - r) / 2
        const A = -l2 / (l1 - l2)
        const B = 1 - A
        return A * Math.exp(l1 * t) + B * Math.exp(l2 * t)
      }],
    ]
    for (const [nombre, c, k, exacta] of casos) {
      const s: EstadoSegundo = { ...base, problema: 'inicial', modelo: 'lineal', c, k, F0: 0, T: 6, inicio: [[1, 0]] }
      const tr = integra2(s, 1, 0, 6000)
      for (const t of [1, 2.5, 5]) {
        const p = tr[Math.round((t / s.T) * (tr.length - 1))]
        cierto(`${nombre}: y(${t}) coincide con la solución analítica`, Math.abs(p[1] - exacta(p[0])) < 1e-7, `${p[1]} vs ${exacta(p[0])}`)
      }
      cierto(`${nombre}: el panel lo nombra bien`, segundo.rotulo!({ ...s }).nombre.includes(nombre.replace('crítico', 'crítico')))
    }
  }
  // forzado: la amplitud estacionaria es la de la teoría
  {
    const c = 0.6
    const k = 4
    const F0 = 1
    const W = 1.7
    const s: EstadoSegundo = { ...base, problema: 'inicial', modelo: 'lineal', c, k, F0, W, T: 120, inicio: [[0, 0]] }
    const tr = integra2(s, 0, 0, 40000)
    const cola = tr.slice(Math.floor(tr.length * 0.8))
    const amp = Math.max(...cola.map((p) => Math.abs(p[1])))
    const teorica = F0 / Math.hypot(k - W * W, c * W)
    cierto('la amplitud estacionaria del forzado coincide', Math.abs(amp / teorica - 1) < 0.01, `${amp} vs ${teorica}`)
  }
  // problema de contorno por tiro
  {
    // y'' = 0 con y(0)=α, y(T)=β → recta, pendiente (β−α)/T
    const s: EstadoSegundo = { ...base, problema: 'contorno', modelo: 'general', expr: '0', frontera: [[1, 4]], T: 3 }
    const t = tiro(s)
    cierto('el tiro resuelve y″ = 0', t.resuelto)
    cerca('pendiente del tiro para la recta', t.v, (4 - 1) / 3, 1e-9)
  }
  {
    // y'' + k y = 0 con y(0)=0, y(T)=1 → y = sen(√k t)/sen(√k T)
    const k = 2
    const T = 3
    const s: EstadoSegundo = { ...base, problema: 'contorno', modelo: 'lineal', c: 0, k, F0: 0, frontera: [[0, 1]], T }
    const t = tiro(s)
    cierto('el tiro resuelve y″ + k y = 0', t.resuelto)
    cerca('pendiente del tiro', t.v, Math.sqrt(k) / Math.sin(Math.sqrt(k) * T), 1e-6)
    cierto('lo resuelve en pocas iteraciones por ser lineal', t.intentos.length - 2 <= 2, `${t.intentos.length - 2}`)
  }
  {
    // caso singular: √k·T = π con β ≠ 0 no tiene solución
    const T = 3
    const k = (Math.PI / T) ** 2
    const s: EstadoSegundo = { ...base, problema: 'contorno', modelo: 'lineal', c: 0, k, F0: 0, frontera: [[0, 1]], T }
    cierto('el problema singular se detecta como no resuelto', !tiro(s).resuelto)
  }
  // el péndulo pequeño oscila con periodo 2π
  {
    const s: EstadoSegundo = { ...base, problema: 'inicial', modelo: 'general', expr: '-sin(y)', T: 40, inicio: [[0.01, 0]] }
    const tr = integra2(s, 0.01, 0, 20000)
    const cruces: number[] = []
    for (let i = 1; i < tr.length; i++) if (tr[i - 1][1] < 0 && tr[i][1] >= 0) cruces.push(tr[i][0])
    cierto('el péndulo de amplitud pequeña tiene periodo ≈ 2π', Math.abs((cruces[1] - cruces[0]) - 2 * Math.PI) < 0.01, `${cruces[1] - cruces[0]}`)
  }
}

seccion('Campos vectoriales')
{
  const con = (P: string, Q: string, R: string, p: number[]) =>
    vectorial.lecturas!({ ...vectorial.inicial, P, Q, R, sonda: [p] })
  // torbellino (−y, x, 0): div = 0, rot = 2ẑ
  {
    const f = con('-y', 'x', '0', [0.4, -0.3, 0.6])
    cerca('div del torbellino', lectura(f, 'div F'), 0, 1e-6)
    cerca('‖rot‖ del torbellino', lectura(f, '‖rot F‖'), 2, 1e-5)
  }
  // gradiente de r²: div = 6, rot = 0
  {
    const f = con('2*x', '2*y', '2*z', [0.5, 0.2, -0.4])
    cerca('div de ∇(r²)', lectura(f, 'div F'), 6, 1e-5)
    cerca('rot de un gradiente', lectura(f, '‖rot F‖'), 0, 1e-6)
  }
  // campo radial 1/r²: solenoidal fuera del origen
  {
    const f = con('x/(x*x+y*y+z*z)^1.5', 'y/(x*x+y*y+z*z)^1.5', 'z/(x*x+y*y+z*z)^1.5', [0.6, -0.5, 0.7])
    cerca('div del campo de Coulomb fuera del origen', lectura(f, 'div F'), 0, 1e-5)
    cerca('rot del campo de Coulomb', lectura(f, '‖rot F‖'), 0, 1e-6)
  }
  // hilo con corriente: irrotacional y solenoidal fuera del eje
  {
    const f = con('-y/(x*x+y*y)', 'x/(x*x+y*y)', '0', [0.7, 0.4, 0.1])
    cerca('div del campo del hilo', lectura(f, 'div F'), 0, 1e-5)
    cerca('rot del campo del hilo fuera del eje', lectura(f, '‖rot F‖'), 0, 1e-5)
  }
  // dipolo: sin divergencia fuera del origen
  {
    const f = con(
      '3*x*z/(x*x+y*y+z*z)^2.5',
      '3*y*z/(x*x+y*y+z*z)^2.5',
      '(2*z*z-x*x-y*y)/(x*x+y*y+z*z)^2.5',
      [0.5, 0.4, 0.6],
    )
    cerca('div del dipolo', lectura(f, 'div F'), 0, 1e-4)
  }
}

seccion('Superficies')
{
  // f = x³y − 2xy²
  const f = (x: number, y: number) => x ** 3 * y - 2 * x * y * y
  const [a, b] = [0.7, -0.45]
  const d = derivadas(f, a, b)
  cerca('f_x', d.fx, 3 * a * a * b - 2 * b * b, 1e-6)
  cerca('f_y', d.fy, a ** 3 - 4 * a * b, 1e-6)
  cerca('f_xx', d.fxx, 6 * a * b, 1e-3)
  cerca('f_yy', d.fyy, -4 * a, 1e-3)
  cerca('f_xy', d.fxy, 3 * a * a - 4 * b, 1e-3)
  // el plano tangente aproxima a segundo orden
  for (const h of [0.01, 0.005]) {
    const real = f(a + h, b + h)
    const plano = f(a, b) + d.fx * h + d.fy * h
    cierto(`el plano tangente falla en O(h²) con h=${h}`, Math.abs(real - plano) < 6 * h * h)
  }
  // punto crítico de la silla x²−y²: discriminante negativo
  {
    const g = (x: number, y: number) => x * x - y * y
    const dg = derivadas(g, 0, 0)
    cierto('la silla tiene discriminante negativo', dg.fxx * dg.fyy - dg.fxy ** 2 < 0)
  }
  // curvas de nivel: los puntos que devuelve están sobre el nivel pedido
  {
    const circ = (x: number, y: number) => x * x + y * y
    for (const [p, q] of contorno(circ, { x: [-2, 2], y: [-2, 2] }, 1, 200, 200).slice(0, 40)) {
      cerca('la curva de nivel cae sobre f = 1', circ(p[0], p[1]), 1, 2e-3)
      cerca('la curva de nivel cae sobre f = 1', circ(q[0], q[1]), 1, 2e-3)
    }
  }
}

seccion('Superficies paramétricas')
{
  const area = (x: string, y: string, z: string, r: number[][]) =>
    lectura(parametricas.lecturas!({ ...parametricas.inicial, x, y, z, rango: r }), 'Área ∬‖rᵤ×r ᵥ‖')
  const P = Math.PI
  cierto(
    'área de la esfera = 4π',
    Math.abs(area('sin(v)*cos(u)', 'sin(v)*sin(u)', 'cos(v)', [[0, 2 * P], [0, P]]) / (4 * P) - 1) < 0.01,
  )
  cierto(
    'área del toro (R=2, r=1) = 4π²Rr',
    Math.abs(area('(2+cos(v))*cos(u)', '(2+cos(v))*sin(u)', 'sin(v)', [[0, 2 * P], [0, 2 * P]]) / (4 * P * P * 2) - 1) < 0.01,
  )
  cierto(
    'área del cuadrado plano [0,1]² = 1',
    Math.abs(area('u', 'v', '0', [[0, 1], [0, 1]]) - 1) < 1e-3,
  )
}

seccion('Sistemas dinámicos')
{
  // Lotka-Volterra: equilibrios en (0,0) y (1,1)
  const f = (x: number, y: number) => x * (1 - y)
  const q = (x: number, y: number) => y * (x - 1)
  const eq = equilibrios(f, q, { x: [-2, 3], y: [-2, 3] }, 60)
  cierto('Lotka-Volterra tiene 2 equilibrios', eq.length === 2, `salen ${eq.length}`)
  cierto('uno es el origen', eq.some((p) => Math.hypot(p[0], p[1]) < 1e-6))
  cierto('el otro es (1,1)', eq.some((p) => Math.hypot(p[0] - 1, p[1] - 1) < 1e-6))
  const J = jacobiano(f, q, 1, 1)
  cerca('jacobiano de Lotka-Volterra en (1,1): ∂f/∂x', J[0][0], 0, 1e-6)
  cerca('jacobiano en (1,1): ∂f/∂y', J[0][1], -1, 1e-6)
  cerca('jacobiano en (1,1): ∂g/∂x', J[1][0], 1, 1e-6)
  cierto('el equilibrio de coexistencia es un centro', clasificar(J).nombre === 'centro')
  // Van der Pol: el origen es inestable y hay un ciclo límite
  const vdp = (x: number, y: number) => y
  const vdq = (x: number, y: number) => 2 * (1 - x * x) * y - x
  cierto('el origen de Van der Pol es inestable', clasificar(jacobiano(vdp, vdq, 0, 0)).estable === 'inestable')
  const tr = trayectoria((_t, y) => [vdp(y[0], y[1]), vdq(y[0], y[1])], [0.1, 0], 0.005, 12000)
  const cola = tr.slice(-2000)
  const radios = cola.map((p) => Math.hypot(p[0], p[1]))
  cierto('la órbita acaba en un ciclo límite acotado', Math.max(...radios) < 6 && Math.min(...radios) > 0.5)
}

seccion('Bases de Hilbert')
{
  // f(x) = x en la base de Legendre: toda la norma está en el primer armónico
  {
    const filas = hilbert.lecturas!({ ...hilbert.inicial, base: 'legendre', objetivo: 'propia', expr: 'x', N: 6 })
    cerca('‖x‖² en [−1,1] = 2/3', lectura(filas, '‖f‖²'), 2 / 3, 1e-4)
    cerca('Parseval recupera la norma', lectura(filas, 'Σ|cₙ|² (Parseval)'), 2 / 3, 1e-4)
    cerca('el resto es nulo', lectura(filas, 'Resto ‖f‖² − Σ|cₙ|²'), 0, 1e-4)
    cerca('la serie reproduce x exactamente', lectura(filas, '‖f − S_N‖'), 0, 1e-4)
  }
  // escalón en Fourier: ‖f‖² = 2π y el resto baja al subir N
  {
    const chico = hilbert.lecturas!({ ...hilbert.inicial, base: 'fourier', objetivo: 'escalon', N: 5 })
    const grande = hilbert.lecturas!({ ...hilbert.inicial, base: 'fourier', objetivo: 'escalon', N: 40 })
    cerca('‖escalón‖² = 2π', lectura(chico, '‖f‖²'), 2 * Math.PI, 1e-3)
    cierto(
      'el error L² baja al añadir términos',
      lectura(grande, '‖f − S_N‖') < lectura(chico, '‖f − S_N‖') * 0.5,
    )
    cierto('Parseval nunca pasa de la norma', lectura(grande, 'Σ|cₙ|² (Parseval)') <= lectura(grande, '‖f‖²') + 1e-6)
  }
}

seccion('Grupos, anillos y cuerpos')
{
  const phi = (n: number) => {
    let c = 0
    const mcd = (a: number, b: number): number => (b ? mcd(b, a % b) : a)
    for (let i = 1; i < n; i++) if (mcd(i, n) === 1) c++
    return c
  }
  for (const G of [zn(12), simetrico(3), simetrico(4), diedral(4), diedral(6)]) {
    const N = G.etiquetas.length
    // la tabla es un cuadrado latino
    for (let i = 0; i < N; i++) {
      cierto(`${G.nombre}: la fila ${i} no repite`, new Set(G.op[i]).size === N)
      cierto(`${G.nombre}: la columna ${i} no repite`, new Set(G.op.map((f) => f[i])).size === N)
    }
    // asociatividad
    let asociativo = true
    for (let a = 0; a < N && asociativo; a++)
      for (let b = 0; b < N && asociativo; b++)
        for (let c = 0; c < N; c++)
          if (G.op[G.op[a][b]][c] !== G.op[a][G.op[b][c]]) {
            asociativo = false
            break
          }
    cierto(`${G.nombre} es asociativo`, asociativo)
    // neutro e inversos
    for (let a = 0; a < N; a++) {
      cierto(`${G.nombre}: e es neutro`, G.op[a][G.neutro] === a && G.op[G.neutro][a] === a)
      cierto(`${G.nombre}: cada elemento tiene inverso`, G.op[a][inverso(G, a)] === G.neutro)
      cierto(`${G.nombre}: el orden divide a |G| (Lagrange)`, N % orden(G, a) === 0)
    }
    // Lagrange sobre los subgrupos
    for (const H of subgrupos(G)) cierto(`${G.nombre}: |H| divide a |G|`, N % H.length === 0, `|H| = ${H.length}`)
  }
  cierto('S₃ no es abeliano', !abeliano(simetrico(3)))
  cierto('Z₁₂ es abeliano', abeliano(zn(12)))
  cierto('|S₄| = 24', simetrico(4).etiquetas.length === 24)
  cierto('|D₆| = 12', diedral(6).etiquetas.length === 12)
  cierto('el centro de D₄ tiene 2 elementos', centro(diedral(4)).length === 2)
  cierto('el centro de S₃ es trivial', centro(simetrico(3)).length === 1)
  for (const n of [7, 12, 18]) {
    const unidades = [...Array(n).keys()].filter((a) => {
      const mcd = (x: number, y: number): number => (y ? mcd(y, x % y) : x)
      return mcd(a, n) === 1
    })
    cierto(`|U(Z${n})| = φ(${n})`, unidades.length === phi(n), `${unidades.length} vs ${phi(n)}`)
  }
}

seccion('Aplicaciones lineales: lo que sale en el panel')
{
  // regresión: con tres autovalores reales distintos el panel los daba desplazados
  const A = [
    [1, 2, 3],
    [0, 4, 5],
    [0, 0, 6],
  ]
  const filas = aplicaciones.lecturas!({ ...aplicaciones.inicial, A })
  cerca('determinante en el panel', lectura(filas, 'Determinante'), 24, 1e-4)
  cerca('traza en el panel', lectura(filas, 'Traza'), 11, 1e-4)
  cerca('rango en el panel', lectura(filas, 'Rango'), 3, 0)
  cerca('λ1 en el panel', lectura(filas, 'λ1 (real)'), 1, 1e-4)
  cerca('λ2 en el panel', lectura(filas, 'λ2 (real)'), 4, 1e-4)
  cerca('λ3 en el panel', lectura(filas, 'λ3 (real)'), 6, 1e-4)
  // una matriz singular: rango 2, núcleo de dimensión 1
  const B = [
    [1, 2, 3],
    [2, 4, 6],
    [1, 0, 1],
  ]
  const g = aplicaciones.lecturas!({ ...aplicaciones.inicial, A: B })
  cerca('determinante nulo', lectura(g, 'Determinante'), 0, 1e-9)
  cerca('rango 2', lectura(g, 'Rango'), 2, 0)
  cerca('dim ker = 1', lectura(g, 'dim ker'), 1, 0)
}


/* ═══════════ Gráficas: vista algebraica al estilo GeoGebra ═══════════ */
seccion('Gráficas: qué es cada fila y sus puntos notables')
{
  const tipo = (src: string) => analizarFilas([{ src, visible: true }], {}).objetos[0].k
  cierto('y = 2x es función', tipo('y = 2x') === 'funcion')
  cierto('f(x) = x² es función', tipo('f(x) = x^2') === 'funcion')
  cierto('x² + y² = 9 es implícita', tipo('x^2 + y^2 = 9') === 'implicita')
  cierto('y < sin(x) es región', tipo('y < sin(x)') === 'inecuacion')
  cierto('1 < x < 3 es región', tipo('1 < x < 3') === 'inecuacion')
  cierto('(cos t, sin t) es paramétrica', tipo('(cos(t), sin(t))') === 'parametrica')
  cierto('r = 1 + cos θ es polar', tipo('r = 1 + cos(θ)') === 'polar')
  cierto('A = (1, 2) es punto', tipo('A = (1, 2)') === 'punto')
  cierto('a = 3 es deslizador', tipo('a = 3') === 'deslizador')
  cierto('x = y² es función de y', tipo('x = y^2') === 'funcionY')
  cierto('x + y sin igual es error', tipo('x + y') === 'error')

  const a = analizarFilas([{ src: 'a sin(bx)', visible: true }], { a: { v: 2, min: -5, max: 5 }, b: { v: 3, min: -5, max: 5 } })
  cierto('deslizadores automáticos a y b', a.parametros.join(',') === 'a,b', a.parametros.join(','))
  const o = a.objetos[0]
  cerca('a·sin(bx) con a=2, b=3', o.k === 'funcion' ? o.f(0.5) : NaN, 2 * Math.sin(1.5), 1e-12)

  const dep = analizarFilas(
    [
      { src: 'f(x) = x^3', visible: true },
      { src: "g(x) = f'(x) + f(1)", visible: true },
    ],
    {},
  ).objetos[1]
  cerca("g = f′ + f(1) en x = 2", dep.k === 'funcion' ? dep.f(2) : NaN, 13, 1e-5)

  const r = analizarFilas([{ src: 'f(x) = x^2, 0 < x < 1', visible: true }], {}).objetos[0]
  cierto('restricción: fuera del dominio no hay valor', r.k === 'funcion' && Number.isNaN(r.f(2)) && r.f(0.5) === 0.25)
  const pc = analizarFilas([{ src: '(t, t^2), 0 <= t <= a', visible: true }], { a: { v: 3, min: 0, max: 5 } }).objetos[0]
  cierto('dominio de la paramétrica con parámetro', pc.k === 'parametrica' && pc.dom[0] === 0 && pc.dom[1] === 3)
  const rec = analizarFilas([{ src: 'f(x) = f(x) + 1', visible: true }], {}).objetos[0]
  cierto('una función recursiva da NaN, no cuelga', rec.k === 'funcion' && Number.isNaN(rec.f(1)))
  const reg = analizarFilas([{ src: 'x^2 + y^2 <= 4', visible: true }], {}).objetos[0]
  cierto('región: dentro y fuera del disco', reg.k === 'inecuacion' && reg.condiciones[0].F(0, 0) >= 0 && reg.condiciones[0].F(3, 0) < 0)

  const cub = (x: number) => x ** 3 - 3 * x
  const r3 = ceros(cub, -6, 6)
  cierto('x³ − 3x: tres raíces', r3.length === 3)
  cerca('raíz √3', r3[2], Math.sqrt(3), 1e-9)
  const ex = extremos(cub, -6, 6)
  cierto('x³ − 3x: máximo en −1 y mínimo en 1', ex.length === 2 && ex[0].tipo === 'máx' && ex[1].tipo === 'mín')
  cerca('mínimo en x = 1', ex[1].x, 1, 1e-6)
  const inf = inflexiones(cub, -6, 6)
  cierto('x³ − 3x: una inflexión', inf.length === 1)
  cerca('inflexión en 0', inf[0]?.x ?? NaN, 0, 1e-6)
  cierto('tan x: los polos no son raíces', ceros(Math.tan, -2, 2).length === 1)
  cerca('∫₀^π sin = 2', integral2d(Math.sin, 0, Math.PI), 2, 1e-10)

  const as1 = asintotas((x) => (2 * x * x + 1) / (x * x - 1), -6, 6)
  cierto('(2x²+1)/(x²−1): verticales ±1', as1.verticales.length === 2 && as1.verticales[0] === -1 && as1.verticales[1] === 1, as1.verticales.join(','))
  cierto('(2x²+1)/(x²−1): horizontal y = 2', as1.oblicuas.length === 1 && as1.oblicuas[0].m === 0 && as1.oblicuas[0].b === 2, JSON.stringify(as1.oblicuas))
  const as2 = asintotas((x) => x + 1 / x, -6, 6)
  cierto('x + 1/x: vertical en 0', as2.verticales.length === 1 && as2.verticales[0] === 0, as2.verticales.join(','))
  cierto('x + 1/x: oblicua y = x', as2.oblicuas.length === 1 && as2.oblicuas[0].m === 1 && as2.oblicuas[0].b === 0, JSON.stringify(as2.oblicuas))
  const as3 = asintotas((x) => 1 / (x * x), -6, 6)
  cierto('1/x²: polo par en 0', as3.verticales.length === 1 && as3.verticales[0] === 0, as3.verticales.join(','))
  const as4 = asintotas(Math.sin, -6, 6)
  cierto('sin x: sin asíntotas', as4.verticales.length === 0 && as4.oblicuas.length === 0, JSON.stringify(as4))
  const as5 = asintotas(Math.exp, -6, 6)
  cierto('eˣ: horizontal y = 0 solo hacia −∞', as5.oblicuas.length === 1 && as5.oblicuas[0].lado === '-' && as5.oblicuas[0].b === 0, JSON.stringify(as5.oblicuas))
  // lo que la revisión encontró mal
  cierto('ln x: asíntota vertical en el borde del dominio', asintotas(Math.log, -12, 12).verticales.join() === '0', asintotas(Math.log, -12, 12).verticales.join())
  cierto('ln|x|: asíntota vertical aunque |1/f| baje despacio', asintotas((x) => Math.log(Math.abs(x)), -12, 12).verticales.join() === '0')
  cierto('|x| no tiene asíntota: la recta y = x es la propia función', asintotas(Math.abs, -12, 12).oblicuas.length === 0)
  cierto('(x² − 4)/(x − 2) = x + 2 con un hueco: sin asíntotas', asintotas((x) => (x * x - 4) / (x - 2), -12, 12).oblicuas.length === 0)
  const as6 = asintotas((x) => Math.exp(-x * x), -12, 12)
  cierto('e^(−x²): y = 0 hacia los dos lados en una sola asíntota', as6.oblicuas.length === 1 && as6.oblicuas[0].lado === '±', JSON.stringify(as6.oblicuas))
  cierto('(x² − 4)/(x − 2): sin inflexiones de ruido', inflexiones((x) => (x * x - 4) / (x - 2), -12, 12).length === 0)
  cierto('floor x: ni una raíz por muestra ni extremos', ceros(Math.floor, -12, 12).length === 1 && extremos(Math.floor, -12, 12).length === 0)
  const sx = extremos((x) => Math.sin(x) / x, -1, 1)
  cierto('sin x / x: el máximo en 0 lleva su valor límite 1', sx.length === 1 && Math.abs(sx[0].y - 1) < 1e-9, JSON.stringify(sx))
  cierto('x³: punto crítico sin cambio de signo no es extremo', extremos((x) => x ** 3, -2, 2).length === 0)
}


/* ═══════════ CAS ═══════════ */
seccion('CAS: cada resultado se comprueba por otro camino')
{
  const E = (src: string) => desdeNodo(analizarExpr(src), { funciones: {}, valores: {} }, derivarE)
  const en = (e: ReturnType<typeof E>, x: number) => evaluarE(e, { x })
  const puntos = [0.37, 0.81, 1.3, 2.2]

  for (const f of ['x^3 sin(x)', 'e^(x^2)', 'ln(x^2+1)', 'x^x', 'atan(x)/x', 'sqrt(1+x^2)', 'tan(2x)', 'asin(x/3)', 'cosh(x)^2', 'x^2 e^(-x) cos(3x)']) {
    const d = derivarE(E(f), 'x')
    for (const t of puntos) {
      const h = 1e-5
      parecido(`d/dx ${f} en ${t}`, en(d, t), (en(E(f), t + h) - en(E(f), t - h)) / (2 * h), 1e-6)
    }
  }

  const integrables = [
    'x^3 - 2x + 1', 'sin(3x)', '1/(1+x^2)', 'e^(2x+1)', '1/x', '(2x+1)^5', '1/sqrt(4-x^2)', 'cos(x)^2', 'sin(x)^2', '3^x', 'ln(x)', '1/(3x+2)', 'x(x+1)^2', '1/(4+9x^2)', 'cosh(2x)', '1/cos(x)^2', 'atan(x)',
    // partes
    'x e^x', 'x^2 sin(x)', 'x^3 e^(-2x)', 'x ln(x)', 'ln(x)^2', 'x atan(x)', 'e^x sin(x)', 'e^(2x) cos(3x)', 'x^2 cosh(x)',
    // fracciones simples
    '1/(x^2-1)', '(x+1)/(x^2+x-2)', '1/(x^3+x)', '(2x+3)/(x^2+2x+5)', '1/((x-1)^2 (x+2))', '(x^3+1)/(x^2-4)', '1/(x^2+4x+13)', 'x/(x^4-1)', '(x^2+1)/(x (x-1)^3)',
    // cambio de variable
    'x e^(x^2)', 'sin(x)^3 cos(x)', 'ln(x)/x', 'x/sqrt(x^2+1)', '1/(x ln(x))', 'cos(x)/(1+sin(x)^2)', 'e^x/(1+e^(2x))', 'sin(sqrt(x))/sqrt(x)', 'x cos(x^2)', 'sec(x)^2 tan(x)',
    // potencias trigonométricas, sec, csc y sustituciones trigonométricas
    'cos(x)^3', 'sin(x)^3', 'sin(x)^4', 'sin(x)^2 cos(x)^2', 'sin(2x)^3 cos(2x)^2', 'sin(x)^5 cos(x)^4', 'sec(x)', 'sec(x)^3', '1/sin(x)', 'tan(x)^2', 'tan(x)^3', 'sin(x) tan(x)', 'sin(x)^2/cos(x)',
    'sqrt(1-x^2)', 'sqrt(9-4x^2)', 'sqrt(x^2+4)', 'sqrt(x^2-1)', '1/sqrt(x^2+1)', '1/sqrt(x^2-4)',
  ]
  for (const f of integrables) {
    const F = integrarE(E(f), 'x')
    cierto(`∫ ${f} está en la tabla`, F !== null)
    if (!F) continue
    const dF = derivarE(F, 'x')
    for (const t of puntos) if (Number.isFinite(en(E(f), t))) parecido(`(∫ ${f})′ en ${t}`, en(dF, t), en(E(f), t), 1e-7)
  }
  for (const f of ['e^(x^2)', 'sin(x)/x', 'x^x', 'sqrt(1+x^3)']) cierto(`∫ ${f} no es elemental: no se inventa`, integrarE(E(f), 'x') === null)

  for (const f of ['x^3-6x^2+11x-6', 'x^4-1', '6x^2+x-2', '2x^2-8', 'x^5-x', '(x^2+1)^2 (x-3)^3', '4x^3-4x^2-x+1', '2a x + 4a']) {
    const g = factorizarE(E(f))
    cierto(`factorizar ${f} y desarrollar da lo mismo`, claveE(desarrollarE(g)) === claveE(desarrollarE(E(f))), texE(g))
  }
  cierto('x³−6x²+11x−6 = (x−1)(x−2)(x−3)', texE(factorizarE(E('x^3-6x^2+11x-6'))) === '\\left(x - 1\\right) \\left(x - 2\\right) \\left(x - 3\\right)', texE(factorizarE(E('x^3-6x^2+11x-6'))))
  cierto('(x²−1)/(x−1) se simplifica a x + 1', texE(simplificarE(E('(x^2-1)/(x-1)'))) === 'x + 1')
  cierto('sin² + cos² = 1', texE(simplificarE(E('sin(x)^2+cos(x)^2'))) === '1')
  cierto('√72 = 6√2', texE(E('sqrt(72)')) === '6 \\sqrt{2}')
  cierto('(x+1)⁵ desarrollado', texE(desarrollarE(E('(x+1)^5'))) === 'x^{5} + 5 x^{4} + 10 x^{3} + 10 x^{2} + 5 x + 1')

  for (const ec of ['x^2-5x+6', 'x^2-2', '6x^2+x-2', 'x^3-2', 'e^x-5', 'ln(x)-2', 'x^4-5x^2+4', '2^x-8', 'cos(x)-x', 'x e^x - 1']) {
    const sol = resolverE(E(ec), 'x')
    const todas = [...sol.exactas.map((r) => evaluarE(r, { k: 0 })), ...sol.aproximadas]
    cierto(`${ec} = 0 tiene solución`, todas.length > 0)
    for (const r of todas) cerca(`${ec} en x = ${r.toFixed(6)}`, en(E(ec), r), 0, 1e-8)
  }
  cierto('x² + 1 = 0: sin reales, dos complejas', resolverE(E('x^2+1'), 'x').exactas.length === 0 && resolverE(E('x^2+1'), 'x').complejas.length === 2)
  const sen = resolverE(E('sin(x) - 1/2'), 'x')
  cierto('sin x = 1/2: dos familias periódicas', sen.periodica && sen.exactas.length === 2)
  for (const r of sen.exactas) for (const k of [-1, 0, 2]) cerca(`sin(x) = 1/2 con k = ${k}`, Math.sin(evaluarE(r, { k })), 0.5, 1e-12)
  const sis = resolverSistema([E('x+y+z-6'), E('2x-y'), E('x+z-4')], ['x', 'y', 'z'])
  cierto('sistema 3×3 compatible determinado', sis.tipo === 'unica' && sis.valores.map((v) => evaluarE(v)).join() === '1,2,3')
  cierto('sistema incompatible', resolverSistema([E('x+y-1'), E('x+y-2')], ['x', 'y']).tipo === 'incompatible')

  const lim = (f: string, a: string | 'inf') => {
    const l = limiteE(E(f), 'x', a === 'inf' || a === '-inf' ? a : E(a))
    return l.tipo === 'valor' ? evaluarE(l.v) : l.tipo === 'infinito' ? l.signo * Infinity : NaN
  }
  cerca('lím sin x / x', lim('sin(x)/x', '0'), 1, 0)
  cerca('lím (1 − cos x)/x²', lim('(1-cos(x))/x^2', '0'), 0.5, 0)
  cerca('lím (1 + 1/x)^x', lim('(1+1/x)^x', 'inf'), Math.E, 0)
  cerca('lím x ln x en 0⁺', lim('x ln(x)', '0'), 0, 0)
  cerca('lím (eˣ − 1)/x', lim('(e^x-1)/x', '0'), 1, 0)
  cerca('lím (2x² + 1)/(x² − 3) en ∞', lim('(2x^2+1)/(x^2-3)', 'inf'), 2, 0)
  cerca('lím (x − sin x)/x³', lim('(x-sin(x))/x^3', '0'), 1 / 6, 1e-12)
  cierto('lím √x en ∞ = ∞', lim('sqrt(x)', 'inf') === Infinity)
  cierto('lím 1/x en 0 no existe', limiteE(E('1/x'), 'x', E('0')).tipo === 'no existe')
  // lo que antes se escapaba a la estimación numérica y no convergía
  cerca('lím 1/√x en ∞ = 0', lim('1/sqrt(x)', 'inf'), 0, 0)
  cerca('lím −1/ln x en ∞ = 0', lim('-1/ln(x)', 'inf'), 0, 0)
  cerca('lím x² e^(−x) en ∞ = 0', lim('x^2 e^(-x)', 'inf'), 0, 0)
  cerca('lím sin x / x en ∞ = 0 (acotada por algo que tiende a 0)', lim('sin(x)/x', 'inf'), 0, 0)
  cerca('lím x ln x − x en 0 = 0 (suma término a término)', lim('x ln(x) - x', '0'), 0, 0)
  cerca('lím atan x en −∞ = −π/2', lim('atan(x)', '-inf'), -Math.PI / 2, 1e-15)

  // integrales definidas: Barrow solo si la primitiva es continua; impropias por límites
  {
    const def = (f: string, a: string, b: string) => {
      const P = (t: string): Punto => (t === 'inf' ? 'inf' : t === '-inf' ? '-inf' : E(t))
      const r = definidaE(E(f), 'x', P(a), P(b))
      return r.tipo === 'valor' ? evaluarE(r.v) : NaN
    }
    for (const [f, a, b] of [['1/x^2', '-1', '1'], ['1/x', '-1', '1'], ['tan(x)', '0', 'pi'], ['1/(x-2)', '0', '3'], ['1/x', '1', 'inf'], ['ln(x)/x', '1', 'inf'], ['1/x', '0', '1']])
      cierto(`∫ ${f} de ${a} a ${b} diverge (no se aplica Barrow a ciegas)`, Number.isNaN(def(f, a, b)))
    cerca('∫₁^∞ dx/x² = 1', def('1/x^2', '1', 'inf'), 1, 1e-12)
    cerca('∫₀¹ dx/√x = 2', def('1/sqrt(x)', '0', '1'), 2, 1e-12)
    cerca('∫₀¹ ln x dx = −1', def('ln(x)', '0', '1'), -1, 1e-12)
    cerca('∫₀¹ x ln x dx = −1/4', def('x ln(x)', '0', '1'), -0.25, 1e-12)
    cerca('∫₋₁⁸ x^(−1/3) dx = 9/2 (se parte en 0)', def('x^(-1/3)', '-1', '8'), 4.5, 1e-9)
    cerca('∫_{−∞}^{∞} e^(−x²) dx = √π', def('e^(-x^2)', '-inf', 'inf'), Math.sqrt(Math.PI), 1e-10)
    cerca('∫_{−∞}^{∞} dx/(1 + x²) = π', def('1/(1+x^2)', '-inf', 'inf'), Math.PI, 1e-12)
    cerca('∫₀^π sin x / x dx (Si(π))', def('sin(x)/x', '0', 'pi'), 1.851937051982466, 1e-10)
    cerca('∫_e^∞ dx/(x ln² x) = 1', def('1/(x ln(x)^2)', 'e', 'inf'), 1, 1e-12)
    cerca('∫₋₁¹ atan(1/x) dx = 0 (salto del integrando, primitiva continua)', def('atan(1/x)', '-1', '1'), 0, 1e-12)
    cerca('∫₋₁¹ √(1 − x²) dx = π/2', def('sqrt(1-x^2)', '-1', '1'), Math.PI / 2, 1e-12)
    cerca('∫₃⁰ x² dx = −9', def('x^2', '3', '0'), -9, 1e-12)
  }
  // simplificación
  cierto('(x³ − 8)/(x² − 4) = (x² + 2x + 4)/(x + 2)', texE(simplificarE(E('(x^3-8)/(x^2-4)'))) === '\\frac{x^{2} + 2 x + 4}{x + 2}', texE(simplificarE(E('(x^3-8)/(x^2-4)'))))
  cierto('ln 8 / ln 2 = 3', texE(simplificarE(E('ln(8)/ln(2)'))) === '3')
  cierto('5! = 120 y C(10, 3) = 120 exactos', texE(E('5!')) === '120' && texE(E('nCr(10, 3)')) === '120')
  cierto('−1/4 se escribe con el signo fuera', texE(E('-1/4')) === '-\\frac{1}{4}')

  const coef = (e: ReturnType<typeof E>, n: number) => {
    // coeficiente de xⁿ: derivada n-ésima en 0 / n!
    let d = e
    let f = 1
    for (let k = 1; k <= n; k++) {
      d = derivarE(d, 'x')
      f *= k
    }
    return evaluarE(sustE(d, simb('x'), E('0'))) / f
  }
  const tS = taylorE(E('sin(x)/x'), 'x', E('0'), 6)
  cerca('Taylor sin x / x: x⁴/120', coef(tS, 4), 1 / 120, 1e-14)
  cerca('Taylor sin x / x: x⁶', coef(tS, 6), -1 / 5040, 1e-14)
  const tL = taylorE(E('ln(1+x)'), 'x', E('0'), 5)
  for (let k = 1; k <= 5; k++) cerca(`Taylor ln(1+x): x^${k}`, coef(tL, k), (k % 2 ? 1 : -1) / k, 1e-14)
}


/* ═══════════ Geometría con regla y compás ═══════════ */
seccion('Geometría: cada construcción cumple la propiedad que la define')
{
  const o = (id: string, def: string, args = '', x = 0, y = 0, v = 0): ObjGeo => ({ id, def, args, x, y, v, visible: true })
  const pt = (vals: Map<string, any>, id: string) => vals.get(id).p as { x: number; y: number }
  const A = o('A', 'libre', '', -3, -1.5)
  const B = o('B', 'libre', '', 3, -2)
  const C = o('C', 'libre', '', 0.7, 2.6)
  const base = [A, B, C]

  const v1 = evaluarGeo([...base, o('m', 'mediatriz', 'A,B'), o('n', 'mediatriz', 'B,C'), o('O', 'interseccion', 'm,n'), o('c', 'circ_cp', 'O,A')])
  const O = pt(v1, 'O')
  cerca('circuncentro equidistante de A y B', distGeo(O, pt(v1, 'A')), distGeo(O, pt(v1, 'B')), 1e-12)
  cerca('circuncentro equidistante de A y C', distGeo(O, pt(v1, 'A')), distGeo(O, pt(v1, 'C')), 1e-12)
  const c3 = evaluarGeo([...base, o('c', 'circ3', 'A,B,C')]).get('c') as any
  cerca('circunferencia por tres puntos = circuncentro', distGeo(c3.c, O), 0, 1e-12)

  const v2 = evaluarGeo([o('O', 'libre', '', 0.5, -0.3), o('R', 'libre', '', 3, -0.3), o('c', 'circ_cp', 'O,R'), o('P', 'libre', '', 5, 2), o('t', 'tangente', 'P,c', 0, 0, 0), o('u', 'tangente', 'P,c', 0, 0, 1)])
  for (const id of ['t', 'u']) {
    const l = v2.get(id) as any
    const d = { x: l.b.x - l.a.x, y: l.b.y - l.a.y }
    const cen = { x: 0.5, y: -0.3 }
    cerca(`tangente ${id}: distancia al centro = radio`, Math.abs(d.x * (cen.y - l.a.y) - d.y * (cen.x - l.a.x)) / Math.hypot(d.x, d.y), 2.5, 1e-10)
  }

  const v3 = evaluarGeo([...base, o('l', 'recta', 'A,B'), o('c', 'circ_cp', 'C,A'), o('P', 'interseccion', 'l,c', 0, 0, 0), o('Q', 'interseccion', 'l,c', 0, 0, 1)])
  for (const id of ['P', 'Q']) {
    const p = pt(v3, id)
    cerca(`corte ${id} está en la circunferencia`, distGeo(p, pt(v3, 'C')), distGeo(pt(v3, 'A'), pt(v3, 'C')), 1e-10)
    cerca(`corte ${id} está en la recta`, (p.x - -3) * (-2 - -1.5) - (p.y - -1.5) * (3 - -3), 0, 1e-10)
  }
  const v3b = evaluarGeo([...base, o('c', 'circ_cp', 'A,B'), o('d', 'circ_cp', 'B,C'), o('P', 'interseccion', 'c,d')])
  const p3 = pt(v3b, 'P')
  cerca('corte de dos circunferencias', distGeo(p3, pt(v3b, 'A')), distGeo(pt(v3b, 'A'), pt(v3b, 'B')), 1e-10)

  const v4 = evaluarGeo([o('F', 'libre', '', -2, 1), o('G', 'libre', '', 3, -1), o('P', 'libre', '', 1, 3), o('e', 'elipse', 'F,G,P'), o('l', 'recta', 'F,G'), o('X', 'interseccion', 'l,e')])
  const e = v4.get('e') as any
  cerca('la elipse pasa por P', evalConica(e.q, { x: 1, y: 3 }), 0, 1e-10)
  const X = pt(v4, 'X')
  cerca('elipse: suma de distancias constante', distGeo(X, { x: -2, y: 1 }) + distGeo(X, { x: 3, y: -1 }), distGeo({ x: 1, y: 3 }, { x: -2, y: 1 }) + distGeo({ x: 1, y: 3 }, { x: 3, y: -1 }), 1e-9)
  const h = evaluarGeo([o('F', 'libre', '', -2, 0), o('G', 'libre', '', 2, 0), o('P', 'libre', '', 3, 1), o('h', 'hiperbola', 'F,G,P')]).get('h') as any
  cerca('la hipérbola pasa por P', evalConica(h.q, { x: 3, y: 1 }), 0, 1e-10)
  const pa = evaluarGeo([o('F', 'libre', '', 0, 1), o('D', 'libre', '', -1, -1), o('E', 'libre', '', 1, -1), o('d', 'recta', 'D,E'), o('p', 'parabola', 'F,d')]).get('p') as any
  cerca('parábola: (2, 1) equidista de foco y directriz', evalConica(pa.q, { x: 2, y: 1 }), 0, 1e-10)
  const cinco = [[0, 2], [1, 1.5], [2, 0], [-1, -1.2], [-2, 0.3]]
  const k5 = evaluarGeo([...cinco.map(([x, y], i) => o(`P${i}`, 'libre', '', x, y)), o('k', 'conica5', 'P0,P1,P2,P3,P4')]).get('k') as any
  cinco.forEach(([x, y], i) => cerca(`cónica por cinco puntos pasa por P${i}`, evalConica(k5.q, { x, y }), 0, 1e-10))

  // transformaciones
  const v5 = evaluarGeo([...base, o('D', 'libre', '', 0, -3), o('E', 'libre', '', 1, 3), o('r', 'recta', 'D,E'), o('A2', 'simetria_axial', 'A,r'), o('A3', 'rotacion', 'A,B', 0, 0, 90), o('A4', 'homotecia', 'A,B', 0, 0, -2)])
  cerca('la simetría conserva la distancia al eje (D)', distGeo(pt(v5, 'A2'), { x: 0, y: -3 }), distGeo(pt(v5, 'A'), { x: 0, y: -3 }), 1e-12)
  cerca('rotación 90°: misma distancia al centro', distGeo(pt(v5, 'A3'), pt(v5, 'B')), distGeo(pt(v5, 'A'), pt(v5, 'B')), 1e-12)
  const u = { x: pt(v5, 'A').x - 3, y: pt(v5, 'A').y + 2 }
  const w = { x: pt(v5, 'A3').x - 3, y: pt(v5, 'A3').y + 2 }
  cerca('rotación 90°: perpendicular', u.x * w.x + u.y * w.y, 0, 1e-12)
  cerca('homotecia de razón −2', distGeo(pt(v5, 'A4'), pt(v5, 'B')), 2 * distGeo(pt(v5, 'A'), pt(v5, 'B')), 1e-12)
  const ee = evaluarGeo([o('F', 'libre', '', -2, 1), o('G', 'libre', '', 3, -1), o('P', 'libre', '', 1, 3), o('e', 'elipse', 'F,G,P'), o('D', 'libre', '', 0, -3), o('E', 'libre', '', 1, 3), o('r', 'recta', 'D,E'), o('e2', 'simetria_axial', 'e,r'), o('P2', 'simetria_axial', 'P,r')])
  cerca('la elipse reflejada pasa por el reflejo de P', evalConica((ee.get('e2') as any).q, pt(ee, 'P2')), 0, 1e-9)

  const hex = evaluarGeo([o('A', 'libre', '', 0, 0), o('B', 'libre', '', 2, 0), o('h', 'regular', 'A,B', 0, 0, 6), o('s', 'area', 'h')])
  const vh = (hex.get('h') as any).pts
  cierto('hexágono regular: seis lados iguales', vh.every((p: any, i: number) => Math.abs(distGeo(p, vh[(i + 1) % 6]) - 2) < 1e-12))
  cerca('área del hexágono de lado 2', (hex.get('s') as any).v, 6 * Math.sqrt(3), 1e-12)

  const ins = evaluarGeo([o('O', 'libre'), o('c', 'circ_cr', 'O', 0, 0, 3), o('A', 'sobre', 'c', 0, 0, 3.6), o('B', 'sobre', 'c', 0, 0, -0.3), o('P', 'sobre', 'c', 0, 0, 1.6), o('α', 'angulo', 'B,P,A'), o('β', 'angulo', 'B,O,A')])
  cerca('ángulo inscrito = mitad del central', (ins.get('α') as any).v * 2, (ins.get('β') as any).v, 1e-9)

  const lug = evaluarGeo([o('O', 'libre'), o('c', 'circ_cr', 'O', 0, 0, 3), o('P', 'sobre', 'c', 0, 0, 0.8), o('A', 'libre', '', 5, 1), o('M', 'medio', 'A,P'), o('L', 'lugar', 'M,P')])
  const pl = (lug.get('L') as any).pts.filter((p: any) => Number.isFinite(p.x))
  cierto('lugar de los puntos medios: circunferencia de radio 3/2 y centro A/2', pl.length > 300 && pl.every((p: any) => Math.abs(distGeo(p, { x: 2.5, y: 0.5 }) - 1.5) < 1e-12))
}


/* ═══════════ Geometría en el espacio ═══════════ */
seccion('Espacio: sólidos, filas y curvas de corte')
{
  const m = (f: Parameters<typeof medidasSolido>[0], a: number, h = 0, n = 0) => medidasSolido(f, a, h, n)
  cerca('volumen del cubo de lado 2', m('cubo', 2).volumen, 8, 1e-12)
  cerca('área del cono r = 3, h = 4', m('cono', 3, 4).area, Math.PI * 3 * (3 + 5), 1e-12)
  cerca('volumen del cilindro', m('cilindro', 2, 5).volumen, 20 * Math.PI, 1e-12)
  cerca('prisma de 4 lados, radio √2: volumen de un cubo de lado 2', m('prisma', Math.SQRT2, 2, 4).volumen, 8, 1e-12)
  cerca('prisma de 4 lados, radio √2: área', m('prisma', Math.SQRT2, 2, 4).area, 24, 1e-12)
  cerca('pirámide cuadrada: V = base·h/3', m('piramide', Math.SQRT2, 3, 4).volumen, 4, 1e-12)
  cerca('tetraedro de arista 1', m('tetraedro', 1).volumen, Math.SQRT2 / 12, 1e-15)
  cerca('octaedro de arista 1: dos pirámides', m('octaedro', 1).volumen, Math.SQRT2 / 3, 1e-15)
  cerca('icosaedro de arista 1', m('icosaedro', 1).volumen, 2.1816949906249, 1e-12)
  cerca('dodecaedro de arista 1', m('dodecaedro', 1).volumen, 7.6631189606246, 1e-12)
  // un prisma de muchos lados tiende al cilindro
  cerca('prisma de 2000 lados ≈ cilindro', m('prisma', 1, 1, 2000).volumen, Math.PI, 1e-5)

  const tipos = analizarFilas3(['x^2+y^2+z^2=4', 'x^2 - y^2', 'A = (1, 2, 3)', '(cos(t), sin(t), t)', '(u, v, u v)', 'recta(A, (0,0,0))', 'esfera((0,0,0), 2)', 'cubo((0,0,0), 1)', 'corte(1, 7)', 'a x + y = 1', 'x + y + z'], {})
  const k = tipos.objetos.map((o) => o.k).join(',')
  cierto('cada fila del espacio se reconoce', k === 'implicita,implicita,punto,curva,param,linea,implicita,solido,corte,implicita,error', k)
  cierto('deslizador automático en el espacio', tipos.parametros.join() === 'a', tipos.parametros.join())

  const r = recortarACaja([0, 0, 0], [1, 1, 0], 3)
  cierto('recta recortada a la caja', !!r && Math.abs(r[0] + 3) < 1e-12 && Math.abs(r[1] - 3) < 1e-12)

  const esf = (x: number, y: number, z: number) => x * x + y * y + z * z - 4
  const pla = (x: number, y: number, z: number) => x + y + z - 1
  const seg = cortarMalla(marching(construirRejilla(esf, 3, 64), 1, 0).pos, pla)
  cierto('corte esfera ∩ plano: hay curva', seg.length > 300)
  let peor = 0
  let peorR = 0
  const rc = Math.sqrt(4 - 1 / 3)
  for (let i = 0; i < seg.length; i += 3) {
    const [x, y, z] = [seg[i], seg[i + 1], seg[i + 2]]
    peor = Math.max(peor, Math.abs(pla(x, y, z)))
    peorR = Math.max(peorR, Math.abs(Math.hypot(x - 1 / 3, y - 1 / 3, z - 1 / 3) - rc))
  }
  cierto('los puntos del corte están en el plano', peor < 1e-5, String(peor))
  cierto('y en la circunferencia de radio √(4 − 1/3)', peorR < 0.03, String(peorR))
}


pruebasBase()
pruebasSenales()
pruebasMecanica()
pruebasFisica()

/* ═══════════ Asas: soltar un asa donde está no cambia nada ═══════════ */
seccion('Asas: ida y vuelta en todos los módulos')
{
  let probadas = 0
  for (const m of MODULOS) {
    const vista = typeof m.vista === 'function' ? m.vista(m.inicial) : m.vista
    if (vista.tipo === 'html' || !vista.interaccion) continue
    const inter = vista.interaccion
    for (const asa of inter.asas(m.inicial)) {
      const parche = inter.mover(asa.id, { p: asa.p, mayus: false }, m.inicial)
      const s2 = { ...m.inicial, ...(parche ?? {}) }
      const vista2 = typeof m.vista === 'function' ? m.vista(s2) : m.vista
      const otra = (vista2.tipo === 'html' ? [] : vista2.interaccion?.asas(s2) ?? []).find((a) => a.id === asa.id)
      const d = otra ? Math.hypot(...asa.p.map((c, i) => c - otra.p[i])) : Infinity
      const escala = Math.max(1, ...asa.p.map(Math.abs))
      cierto(`${m.id}: el asa ${asa.id} vuelve a su sitio`, d < 2e-3 * escala, `se movió ${d}`)
      probadas++
    }
  }
  cierto('hay asas que probar en muchos módulos', probadas >= 25, String(probadas))

  // propiedad de la media en Laplace: u en el centro = media en cualquier circunferencia dentro
  const lap = laplace.inicial as EstadoLaplace
  for (const [x, y, r] of [[0.2, -0.1, 0.3], [-0.4, 0.3, 0.2], [0, 0, 0.6]]) {
    let media = 0
    for (let k = 0; k < 512; k++) media += uEn(lap, x + r * Math.cos((2 * Math.PI * k) / 512), y + r * Math.sin((2 * Math.PI * k) / 512))
    cerca(`Laplace: media en |z − (${x}, ${y})| = ${r}`, media / 512, uEn(lap, x, y), 2e-3)
  }
}

/* ═══════════ resumen ═══════════ */
console.log('')
if (cuenta.fallos === 0) {
  console.log(`✓ ${cuenta.total} comprobaciones matemáticas en verde`)
} else {
  console.log(`✗ ${cuenta.fallos} de ${cuenta.total} comprobaciones fallan:\n`)
  for (const p of cuenta.problemas) console.log('  · ' + p)
  process.exitCode = 1
}
