/**
 * Análisis dimensional de los módulos de física: sus magnitudes con dimensión y unidad SI, y
 * las ecuaciones que usan, comprobadas término a término. Muchos módulos calculan en unidades
 * naturales (μ₀ = 1, ħ = m = 1…); aquí va la física con sus unidades de verdad.
 */
import { ADIM, DIM, d, ecuacion, L, M, mags, T, TEMP, N, I, type Dim, type Dims, type Dimensional } from '../lib/dimensiones'

const tabla = (dims: Dims, ecs: Array<[string, string]>, magnitudes: Array<[string, string, Dim, string?]>, nota?: string): Dimensional => ({
  magnitudes: mags(...magnitudes),
  ecuaciones: ecs.map(([n, src]) => ecuacion(n, src, dims)),
  nota,
})

export function dimOrbitas(): Dimensional {
  const D: Dims = { r: L, a: L, v: DIM.velocidad, mu: d(L, 3, T, -2), G: DIM.G, M, m: M, E: DIM.energia, eps: d(L, 2, T, -2), Lz: d(L, 2, T, -1), P: T, h: d(L, 2, T, -1) }
  return tabla(
    D,
    [
      ['Energía por unidad de masa', 'eps = v^2/2 - mu/r'],
      ['Parámetro gravitatorio', 'mu = G*M'],
      ['Tercera ley de Kepler', 'P = 2*pi*sqrt(a^3/mu)'],
      ['Vis viva', 'v^2 = mu*(2/r - 1/a)'],
      ['Momento angular por unidad de masa', 'h = r*v'],
    ],
    [
      ['r', 'distancia al centro', L],
      ['a', 'semieje mayor', L],
      ['v', 'velocidad', DIM.velocidad],
      ['\\mu = GM', 'parámetro gravitatorio', D.mu],
      ['G', 'constante de gravitación', DIM.G],
      ['\\varepsilon', 'energía por unidad de masa', D.eps],
      ['h', 'momento angular por unidad de masa', D.h],
      ['P', 'periodo', T],
    ],
    'El módulo usa μ = 1 y distancias sin unidad: aquí, las dimensiones de la física.',
  )
}

export function dimOscilaciones(): Dimensional {
  const D: Dims = { m: M, k: DIM.rigidez, b: DIM.amortiguamiento, x: L, t: T, F0: DIM.fuerza, Omega: DIM.frecuencia, omega0: DIM.frecuencia, zeta: ADIM, A: L, v: DIM.velocidad, a: DIM.aceleracion }
  return tabla(
    D,
    [
      ['Oscilador forzado', 'm*a + b*v + k*x = F0*cos(Omega*t)'],
      ['Frecuencia propia', 'omega0 = sqrt(k/m)'],
      ['Amortiguamiento relativo', 'zeta = b/(2*sqrt(k*m))'],
      ['Amplitud forzada', 'A = F0/sqrt((k - m*Omega^2)^2 + (b*Omega)^2)'],
    ],
    [
      ['m', 'masa', M],
      ['k', 'constante del muelle', DIM.rigidez],
      ['b', 'amortiguamiento', DIM.amortiguamiento],
      ['F_0', 'fuerza aplicada', DIM.fuerza],
      ['\\Omega,\\ \\omega_0', 'frecuencias angulares', DIM.frecuencia],
      ['\\zeta', 'amortiguamiento relativo', ADIM],
      ['A', 'amplitud', L],
    ],
  )
}

export function dimSolido(): Dimensional {
  const D: Dims = { I: DIM.inercia, m: M, r: L, omega: DIM.frecuencia, Lang: DIM.momentoAngular, tau: DIM.energia, E: DIM.energia, g: DIM.aceleracion, l: L, Omega: DIM.frecuencia, alpha: d(T, -2) }
  return tabla(
    D,
    [
      ['Momento de inercia', 'I = m*r^2'],
      ['Momento angular', 'Lang = I*omega'],
      ['Energía de rotación', 'E = 1/2*I*omega^2'],
      ['Ecuación de Euler (un eje)', 'tau = I*alpha'],
      ['Precesión de la peonza', 'Omega = m*g*l/(I*omega)'],
    ],
    [
      ['I', 'momento de inercia', DIM.inercia],
      ['\\omega,\\ \\Omega', 'velocidades angulares', DIM.frecuencia],
      ['L', 'momento angular', DIM.momentoAngular],
      ['\\tau', 'momento de fuerza', DIM.energia],
      ['E', 'energía de rotación', DIM.energia],
    ],
    'El momento de fuerza tiene las dimensiones de una energía (N·m), pero no es una energía: el radián no cuenta.',
  )
}

export function dimRelatividad(): Dimensional {
  const D: Dims = { c: DIM.velocidad, v: DIM.velocidad, beta: ADIM, gamma: ADIM, t: T, x: L, s: L, m: M, E: DIM.energia, p: DIM.momento, tau: T, Lp: L, L0: L }
  return tabla(
    D,
    [
      ['Factor de Lorentz', 'gamma = 1/sqrt(1 - v^2/c^2)'],
      ['Intervalo', 's^2 = c^2*t^2 - x^2'],
      ['Dilatación del tiempo', 't = gamma*tau'],
      ['Contracción de longitudes', 'Lp = L0/gamma'],
      ['Energía y momento', 'E^2 = (p*c)^2 + (m*c^2)^2'],
    ],
    [
      ['c', 'velocidad de la luz', DIM.velocidad],
      ['\\beta = v/c', 'velocidad relativa', ADIM],
      ['\\gamma', 'factor de Lorentz', ADIM],
      ['s', 'intervalo', L],
      ['\\tau', 'tiempo propio', T],
      ['E', 'energía', DIM.energia],
      ['p', 'momento lineal', DIM.momento],
    ],
    'Con c = 1, t y x tienen la misma unidad: el diagrama los dibuja igual.',
  )
}

export function dimElectrostatica(): Dimensional {
  const D: Dims = { q: DIM.carga, r: L, epsilon0: DIM.epsilon0, E: DIM.campoE, V: DIM.potencial, F: DIM.fuerza, Phi: d(DIM.campoE, 1, L, 2), p: d(DIM.carga, 1, L, 1), U: DIM.energia, rho: d(DIM.carga, 1, L, -3) }
  return tabla(
    D,
    [
      ['Ley de Coulomb', 'F = q^2/(4*pi*epsilon0*r^2)'],
      ['Campo de una carga', 'E = q/(4*pi*epsilon0*r^2)'],
      ['Potencial de una carga', 'V = q/(4*pi*epsilon0*r)'],
      ['E = −∇V (V entre longitud)', 'E = V/r'],
      ['Ley de Gauss', 'Phi = q/epsilon0'],
      ['Energía de dos cargas', 'U = q*V'],
    ],
    [
      ['q', 'carga', DIM.carga],
      ['\\varepsilon_0', 'permitividad del vacío', DIM.epsilon0],
      ['E', 'campo eléctrico', DIM.campoE],
      ['V', 'potencial', DIM.potencial],
      ['\\Phi_E', 'flujo eléctrico', D.Phi],
      ['p', 'momento dipolar', D.p],
    ],
    'El módulo usa unidades de Gauss (k = 1); en el SI, k = 1/(4πε₀).',
  )
}

export function dimMagnetostatica(): Dimensional {
  const D: Dims = { B: DIM.campoB, mu0: DIM.mu0, Ic: I, r: L, l: L, n: d(L, -1), R: L, z: L, F: DIM.fuerza, v: DIM.velocidad, q: DIM.carga, Phi: d(DIM.campoB, 1, L, 2) }
  return tabla(
    D,
    [
      ['Hilo infinito', 'B = mu0*Ic/(2*pi*r)'],
      ['Centro de una espira', 'B = mu0*Ic/(2*R)'],
      ['Eje de una espira', 'B = mu0*Ic*R^2/(2*(R^2 + z^2)^(3/2))'],
      ['Solenoide', 'B = mu0*n*Ic'],
      ['Ampère (∮ B·dl)', 'B*l = mu0*Ic'],
      ['Fuerza de Lorentz', 'F = q*v*B'],
    ],
    [
      ['B', 'campo magnético', DIM.campoB],
      ['\\mu_0', 'permeabilidad del vacío', DIM.mu0],
      ['I', 'corriente', I],
      ['n', 'espiras por unidad de longitud', D.n],
      ['\\Phi_B', 'flujo magnético', D.Phi],
    ],
    'El módulo usa μ₀ = 1.',
  )
}

export function dimOndas(): Dimensional {
  const D: Dims = { lambda: L, f: DIM.frecuencia, v: DIM.velocidad, k: DIM.numeroOnda, omega: DIM.frecuencia, c: DIM.velocidad, n: ADIM, vg: DIM.velocidad, T: T, A: L, x: L, t: T, y: L }
  return tabla(
    D,
    [
      ['Velocidad de fase', 'v = lambda*f'],
      ['Número de onda', 'k = 2*pi/lambda'],
      ['Onda armónica', 'y = A*sin(k*x - omega*t)'],
      ['Índice de refracción', 'n = c/v'],
      ['Velocidad de grupo (dω/dk)', 'vg = omega/k'],
    ],
    [
      ['\\lambda', 'longitud de onda', L],
      ['f', 'frecuencia', DIM.frecuencia],
      ['k', 'número de onda', DIM.numeroOnda],
      ['\\omega', 'frecuencia angular', DIM.frecuencia],
      ['n', 'índice de refracción', ADIM],
      ['v_g', 'velocidad de grupo', DIM.velocidad],
    ],
    'La fase kx − ωt es adimensional: por eso va dentro del seno.',
  )
}

export function dimDifraccion(): Dimensional {
  const D: Dims = { d: L, a: L, D: L, y: L, lambda: L, m: ADIM, theta: ADIM, t: L, n: ADIM, I0: d(M, 1, T, -3), Iy: d(M, 1, T, -3) }
  return tabla(
    D,
    [
      ['Máximos de la red / doble rendija', 'd*sin(theta) = m*lambda'],
      ['Posición en la pantalla', 'y = m*lambda*D/d'],
      ['Mínimos de una rendija', 'a*sin(theta) = m*lambda'],
      ['Lámina delgada', '2*n*t = m*lambda'],
      ['Intensidad de una rendija', 'Iy = I0*(sin(pi*a*y/(lambda*D))/(pi*a*y/(lambda*D)))^2'],
    ],
    [
      ['d,\\ a', 'separación y anchura de las rendijas', L],
      ['\\lambda', 'longitud de onda', L],
      ['D', 'distancia a la pantalla', L],
      ['m', 'orden', ADIM],
      ['I', 'intensidad', D.I0],
    ],
  )
}

export function dimGeometrica(): Dimensional {
  const D: Dims = { s: L, sp: L, f: L, P: d(L, -1), n: ADIM, R: L, y: L, yp: L, beta: ADIM, theta: ADIM }
  return tabla(
    D,
    [
      ['Lente delgada', '1/sp - 1/s = 1/f'],
      ['Potencia', 'P = 1/f'],
      ['Constructor de lentes', '1/f = (n - 1)*(2/R)'],
      ['Espejo esférico', 'f = R/2'],
      ['Aumento lateral', 'beta = yp/y'],
    ],
    [
      ['s,\\ s\'', 'distancias objeto e imagen', L],
      ['f', 'distancia focal', L],
      ['P', 'potencia (dioptrías)', D.P],
      ['n', 'índice de refracción', ADIM],
      ['\\beta', 'aumento lateral', ADIM],
    ],
  )
}

export function dimTermodinamica(): Dimensional {
  const D: Dims = { P: DIM.presion, V: DIM.volumen, V0: DIM.volumen, n: N, R: DIM.R, T: TEMP, W: DIM.energia, Q: DIM.energia, U: DIM.energia, S: DIM.entropia, cv: DIM.R, a: d(M, 1, L, 5, T, -2, N, -2), b: d(L, 3, N, -1), eta: ADIM, Tc: TEMP, Tf: TEMP }
  return tabla(
    D,
    [
      ['Gas ideal', 'P*V = n*R*T'],
      ['Primer principio', 'U = Q - W'],
      ['Trabajo a presión constante', 'W = P*V'],
      ['Entropía isoterma', 'S = n*R*log(V/V0)'],
      ['Energía interna', 'U = n*cv*T'],
      ['Van der Waals', '(P + a*n^2/V^2)*(V - n*b) = n*R*T'],
      ['Rendimiento de Carnot', 'eta = 1 - Tf/Tc'],
    ],
    [
      ['P', 'presión', DIM.presion],
      ['V', 'volumen', DIM.volumen],
      ['n', 'cantidad de sustancia', N],
      ['T', 'temperatura', TEMP],
      ['R', 'constante de los gases', DIM.R],
      ['Q,\\ W,\\ U', 'calor, trabajo, energía interna', DIM.energia],
      ['S', 'entropía', DIM.entropia],
      ['a', 'Van der Waals: atracción', D.a],
      ['b', 'Van der Waals: covolumen', D.b],
    ],
  )
}

export function dimPozo(): Dimensional {
  const D: Dims = { hbar: DIM.accion, m: M, a: L, En: DIM.energia, nq: ADIM, k: DIM.numeroOnda, V0: DIM.energia, psi: d(L, -0.5), x: L }
  return tabla(
    D,
    [
      ['Niveles del pozo infinito', 'En = nq^2*pi^2*hbar^2/(2*m*a^2)'],
      ['Número de onda', 'k = sqrt(2*m*En)/hbar'],
      ['Función de onda', 'psi = sqrt(2/a)*sin(nq*pi*x/a)'],
    ],
    [
      ['\\hbar', 'constante de Planck reducida', DIM.accion],
      ['m', 'masa', M],
      ['a', 'anchura del pozo', L],
      ['E_n', 'energía del nivel', DIM.energia],
      ['\\psi', 'función de onda en 1D', D.psi],
    ],
    'El módulo usa ħ = m = 1. |ψ|² es una densidad de probabilidad: en 1D, 1/L.',
  )
}

export function dimPaquete(): Dimensional {
  const D: Dims = { hbar: DIM.accion, m: M, k: DIM.numeroOnda, p: DIM.momento, sigma: L, t: T, x: L, vg: DIM.velocidad, tau: ADIM, dx: L, dp: DIM.momento }
  return tabla(
    D,
    [
      ['De Broglie', 'p = hbar*k'],
      ['Velocidad de grupo', 'vg = hbar*k/m'],
      ['Tiempo de ensanchamiento', 'tau = hbar*t/(m*sigma^2)'],
      ['Incertidumbre', 'dx*dp = hbar/2'],
    ],
    [
      ['\\hbar', 'constante de Planck reducida', DIM.accion],
      ['k', 'número de onda', DIM.numeroOnda],
      ['p', 'momento', DIM.momento],
      ['\\sigma', 'anchura del paquete', L],
      ['v_g', 'velocidad de grupo', DIM.velocidad],
    ],
    'El módulo usa ħ = m = 1.',
  )
}

export function dimOrbitales(): Dimensional {
  const D: Dims = { hbar: DIM.accion, me: M, qe: DIM.carga, epsilon0: DIM.epsilon0, a0: L, En: DIM.energia, nq: ADIM, r: L, Z: ADIM, P1s: d(L, -1) }
  return tabla(
    D,
    [
      ['Radio de Bohr', 'a0 = 4*pi*epsilon0*hbar^2/(me*qe^2)'],
      ['Niveles del hidrógeno', 'En = -me*qe^4/(2*(4*pi*epsilon0)^2*hbar^2*nq^2)'],
      ['Densidad radial del 1s', 'P1s = 4*r^2/a0^3*exp(-2*Z*r/a0)'],
    ],
    [
      ['a_0', 'radio de Bohr', L],
      ['E_n', 'energía del nivel', DIM.energia],
      ['q_e', 'carga del electrón', DIM.carga],
      ['m_e', 'masa del electrón', M],
      ['\\hbar', 'constante de Planck reducida', DIM.accion],
    ],
    'El módulo mide las distancias en radios de Bohr.',
  )
}

export function dimCircuito(): Dimensional {
  const D: Dims = { R: DIM.resistencia, Lb: DIM.inductancia, C: DIM.capacidad, q: DIM.carga, Ic: I, V: DIM.potencial, t: T, omega0: DIM.frecuencia, tau: T, Z: DIM.resistencia, omega: DIM.frecuencia, P: DIM.potencia, Qf: ADIM }
  return tabla(
    D,
    [
      ['Malla RLC', 'Lb*Ic/t + R*Ic + q/C = V'],
      ['Frecuencia de resonancia', 'omega0 = 1/sqrt(Lb*C)'],
      ['Constante de tiempo RC', 'tau = R*C'],
      ['Constante de tiempo RL', 'tau = Lb/R'],
      ['Impedancia', 'Z^2 = R^2 + (omega*Lb - 1/(omega*C))^2'],
      ['Potencia', 'P = V*Ic'],
      ['Factor de calidad', 'Qf = omega0*Lb/R'],
    ],
    [
      ['R', 'resistencia', DIM.resistencia],
      ['L', 'autoinducción', DIM.inductancia],
      ['C', 'capacidad', DIM.capacidad],
      ['q', 'carga', DIM.carga],
      ['I', 'corriente', I],
      ['V', 'tensión', DIM.potencial],
      ['\\tau', 'constante de tiempo', T],
      ['Q', 'factor de calidad', ADIM],
    ],
  )
}
