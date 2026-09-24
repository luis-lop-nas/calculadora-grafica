import { compilar, compilarVector } from './expresion'

/**
 * EDPs escritas a mano, resueltas por el método de líneas: diferencias finitas
 * centradas de segundo orden en el espacio y RK4 en el tiempo, con el paso de
 * tiempo sacado de la propia ecuación (se miden sus derivadas respecto de u_xx,
 * u_x y u) para no salirse de la región de estabilidad.
 *
 * Una ecuación sin derivada temporal es estacionaria: se resuelve como el
 * estado final de u_τ = ±(izquierda − derecha), con el signo que la hace
 * difusiva, primero en una malla gruesa y afinando.
 */

export type Contorno = 'dirichlet' | 'neumann' | 'periodica'

export interface ConfigEdp {
  dim: 1 | 2
  ecU: string
  /** Vacía si solo hay un campo. */
  ecV: string
  parametros: string
  iniU: string
  iniUt: string
  iniV: string
  iniVt: string
  contorno: Contorno
  /** Dirichlet: el valor en el borde; Neumann: ∂u/∂n hacia fuera. Expresión en x, y, t. */
  bordeU: string
  bordeV: string
  x: [number, number]
  n: number
}

const CAMPOS = ['u', 'v'] as const
const DER = ['', '_x', '_y', '_xx', '_yy', '_xy'] as const
export const VARIABLES_EDP = ['x', 'y', 't', ...CAMPOS.flatMap((c) => [...DER.map((d) => c + d), c + '_t'])]

type F = (...v: number[]) => number
/** Recibe [x, y, t, u, u_x, …, v_t, parámetros…]. */
type FV = (v: number[]) => number

interface Ecuacion {
  campo: 'u' | 'v'
  /** 0: estacionaria; 1: u_t = F; 2: u_tt = F. */
  orden: 0 | 1 | 2
  F: FV
  /** Para la estacionaria: +1 o −1, el que deja u_τ difusiva. */
  signo: number
  texto: string
}

/** lap(u) y Δu se escriben a mano como u_xx + u_yy (o u_xx en 1D). */
export function expandir(src: string, dim: 1 | 2): string {
  const lap = (c: string) => (dim === 1 ? `(${c}_xx)` : `(${c}_xx+${c}_yy)`)
  return src
    .replace(/(?:lap|laplaciano)\s*\(\s*([uv])\s*\)/gi, (_, c) => lap(c.toLowerCase()))
    .replace(/[Δ∆]\s*([uv])/g, (_, c) => lap(c))
}

export function leerParametros(src: string): Record<string, number> {
  const out: Record<string, number> = {}
  for (const trozo of src.split(/[;,\n]/)) {
    const t = trozo.trim()
    if (!t) continue
    const m = t.match(/^([A-Za-z][A-Za-z0-9]*)\s*=\s*(.+)$/)
    if (!m) throw new Error(`«${t}»: se escribe nombre = valor`)
    const nombre = m[1].toLowerCase()
    if (VARIABLES_EDP.includes(nombre)) throw new Error(`«${nombre}» ya es una variable de la ecuación`)
    const v = compilar(m[2], Object.keys(out))(...Object.values(out))
    if (!Number.isFinite(v)) throw new Error(`«${t}» no da un número`)
    out[nombre] = v
  }
  return out
}

function leerEcuacion(src: string, campo: 'u' | 'v', dim: 1 | 2, params: Record<string, number>): Ecuacion {
  const t = expandir(src, dim)
  const partes = t.split('=')
  if (partes.length !== 2) throw new Error('falta un signo = (o sobra alguno)')
  const vars = [...VARIABLES_EDP, ...Object.keys(params)]
  const m = partes[0].trim().toLowerCase().match(/^([uv])_(tt|t)$/)
  if (m) {
    if (m[1] !== campo) throw new Error(`la ecuación de ${campo} tiene que empezar por ${campo}_t o ${campo}_tt`)
    return { campo, orden: m[2] === 'tt' ? 2 : 1, F: compilarVector(partes[1], vars), signo: 1, texto: t }
  }
  if (/_t\b|_tt\b/.test(t.replace(/\s/g, ''))) throw new Error(`la derivada en el tiempo va sola a la izquierda: ${campo}_t = … o ${campo}_tt = …`)
  const R = compilarVector(`(${partes[0]})-(${partes[1]})`, vars)
  // el signo que hace u_τ = σ·R difusiva: σ·∂R/∂u_xx > 0
  const base = [...VARIABLES_EDP.map(() => 0.3), ...Object.values(params)]
  const k = VARIABLES_EDP.indexOf(`${campo}_xx`)
  const r0 = R(base)
  base[k] += 1
  const d = R(base) - r0
  if (!Number.isFinite(d) || Math.abs(d) < 1e-12)
    throw new Error(`una ecuación estacionaria tiene que llevar ${campo}_xx (sin derivada en t no hay evolución que seguir)`)
  return { campo, orden: 0, F: R, signo: Math.sign(d), texto: t }
}

export interface Problema {
  cfg: ConfigEdp
  ecs: Ecuacion[]
  params: Record<string, number>
  ini: F[]
  iniT: Array<F | null>
  borde: F[]
  estacionaria: boolean
  aviso: string | null
}

export function preparar(cfg: ConfigEdp): Problema {
  const params = leerParametros(cfg.parametros)
  const ecs = [leerEcuacion(cfg.ecU, 'u', cfg.dim, params)]
  if (cfg.ecV.trim()) ecs.push(leerEcuacion(cfg.ecV, 'v', cfg.dim, params))
  const estacionaria = ecs.every((e) => e.orden === 0)
  if (!estacionaria && ecs.some((e) => e.orden === 0)) throw new Error('las dos ecuaciones tienen que ser de evolución, o las dos estacionarias')
  const vars = ['x', 'y', 't', ...Object.keys(params)]
  const pv = Object.values(params)
  const f2 = (src: string, que: string): F => {
    try {
      const f = compilar(src.trim() || '0', vars)
      return (x: number, y: number, t = 0) => f(x, y, t, ...pv)
    } catch (e) {
      throw new Error(`${que}: ${(e as Error).message}`)
    }
  }
  const ini = ecs.map((e) => f2(e.campo === 'u' ? cfg.iniU : cfg.iniV, `${e.campo}(x, 0)`))
  const iniT = ecs.map((e) => (e.orden === 2 ? f2(e.campo === 'u' ? cfg.iniUt : cfg.iniVt, `${e.campo}_t(x, 0)`) : null))
  const borde = ecs.map((e) => f2(e.campo === 'u' ? cfg.bordeU : cfg.bordeV, `borde de ${e.campo}`))

  // difusión hacia atrás: mal planteada, explota en cuanto hay ruido
  let aviso: string | null = null
  for (const e of ecs) {
    if (e.orden === 0) continue
    const base = [...VARIABLES_EDP.map(() => 0.3), ...Object.values(params)]
    const k = VARIABLES_EDP.indexOf(`${e.campo}_xx`)
    const r0 = e.F(base)
    base[k] += 1
    const d = e.F(base) - r0
    if (e.orden === 1 && d < -1e-12) aviso = `${e.campo}_t = −(…)·${e.campo}_xx es el calor hacia atrás: el problema está mal planteado y explota`
    if (e.orden === 2 && d < -1e-12) aviso = `${e.campo}_tt = −(…)·${e.campo}_xx no es una onda sino una ecuación elíptica en (x, t): explota`
  }
  return { cfg, ecs, params, ini, iniT, borde, estacionaria, aviso }
}

/* ---------- la malla y su estado ---------- */

export interface Sim {
  p: Problema
  n: number
  ny: number
  hx: number
  hy: number
  x0: number
  /** Nodo i ↦ x0 + i·hx (en periódica el último nodo no repite el primero). */
  xs: Float64Array
  ys: Float64Array
  /** Por campo: valores y, si es de orden 2, su derivada temporal. */
  u: Float64Array[]
  w: Array<Float64Array | null>
  t: number
  dt: number
  pasos: number
  /** Historia de u para el diagrama x–t (solo 1D). */
  historia: Float64Array[]
  tiemposHistoria: number[]
  roto: string | null
  /** Estacionaria: residuo máximo y si ya ha convergido. */
  residuo: number
  /** El primer residuo medido: la parada es relativa a él. */
  residuo0: number
  convergida: boolean
  nivel: number
}

function nodos(cfg: ConfigEdp, n: number) {
  const [a, b] = cfg.x
  const per = cfg.contorno === 'periodica'
  const h = (b - a) / (per ? n : n - 1)
  const xs = new Float64Array(n)
  for (let i = 0; i < n; i++) xs[i] = a + i * h
  return { h, xs }
}

export function crearSim(p: Problema, n = p.cfg.n): Sim {
  const { h, xs } = nodos(p.cfg, n)
  const ny = p.cfg.dim === 2 ? n : 1
  const ys = p.cfg.dim === 2 ? xs.slice() : new Float64Array([0])
  const tam = n * ny
  const u = p.ecs.map((_, k) => {
    const a = new Float64Array(tam)
    for (let j = 0; j < ny; j++) for (let i = 0; i < n; i++) a[j * n + i] = p.ini[k](xs[i], ys[j], 0)
    return a
  })
  const w = p.ecs.map((e, k) => {
    if (e.orden !== 2) return null
    const a = new Float64Array(tam)
    for (let j = 0; j < ny; j++) for (let i = 0; i < n; i++) a[j * n + i] = p.iniT[k]!(xs[i], ys[j], 0)
    return a
  })
  const sim: Sim = {
    p, n, ny, hx: h, hy: p.cfg.dim === 2 ? h : 1, x0: p.cfg.x[0], xs, ys, u, w, t: 0, dt: 0, pasos: 0,
    historia: [], tiemposHistoria: [], roto: null, residuo: Infinity, residuo0: 0, convergida: false, nivel: 0,
  }
  for (const a of u) if (!a.every(Number.isFinite)) sim.roto = 'la condición inicial no está definida en toda la malla'
  aplicarBorde(sim, sim.u, 0)
  sim.dt = pasoEstable(sim)
  if (p.cfg.dim === 1) guardarHistoria(sim)
  return sim
}

/** Dirichlet: los nodos del borde toman el valor dado. */
function aplicarBorde(sim: Sim, u: Float64Array[], t: number) {
  if (sim.p.cfg.contorno !== 'dirichlet') return
  const { n, ny, xs, ys } = sim
  u.forEach((a, k) => {
    const g = sim.p.borde[k]
    if (sim.p.cfg.dim === 1) {
      a[0] = g(xs[0], 0, t)
      a[n - 1] = g(xs[n - 1], 0, t)
      return
    }
    for (let i = 0; i < n; i++) {
      a[i] = g(xs[i], ys[0], t)
      a[(ny - 1) * n + i] = g(xs[i], ys[ny - 1], t)
    }
    for (let j = 0; j < ny; j++) {
      a[j * n] = g(xs[0], ys[j], t)
      a[j * n + n - 1] = g(xs[n - 1], ys[j], t)
    }
  })
}

/**
 * Valor de un campo en (i, j) con los nodos fantasma del contorno: en
 * periódica se da la vuelta; en Neumann u₋₁ = u₁ + 2h·g, que es ∂u/∂n = g.
 */
function valor(sim: Sim, a: Float64Array, k: number, i: number, j: number, t: number): number {
  const { n, ny } = sim
  const c = sim.p.cfg.contorno
  if (c === 'periodica') {
    i = ((i % n) + n) % n
    j = ((j % ny) + ny) % ny
    return a[j * n + i]
  }
  let extra = 0
  if (i < 0 || i >= n || j < 0 || j >= ny) {
    // solo Neumann llega aquí (en Dirichlet los nodos del borde no se evolucionan)
    const g = sim.p.borde[k]
    let ii = i
    let jj = j
    if (i < 0) {
      ii = -i
      extra += 2 * sim.hx * g(sim.xs[0], sim.ys[Math.max(0, Math.min(ny - 1, j))], t)
    } else if (i >= n) {
      ii = 2 * (n - 1) - i
      extra += 2 * sim.hx * g(sim.xs[n - 1], sim.ys[Math.max(0, Math.min(ny - 1, j))], t)
    }
    if (sim.p.cfg.dim === 2) {
      if (j < 0) {
        jj = -j
        extra += 2 * sim.hy * g(sim.xs[Math.max(0, Math.min(n - 1, i))], sim.ys[0], t)
      } else if (j >= ny) {
        jj = 2 * (ny - 1) - j
        extra += 2 * sim.hy * g(sim.xs[Math.max(0, Math.min(n - 1, i))], sim.ys[ny - 1], t)
      }
    } else jj = 0
    return a[jj * n + ii] + extra
  }
  return a[j * n + i]
}

const NV = VARIABLES_EDP.length


/** Vector de argumentos con los parámetros ya puestos al final. */
function vectorArgs(sim: Sim): number[] {
  return [...new Array<number>(NV).fill(0), ...Object.values(sim.p.params)]
}

/** Rellena `arg` con x, y, t y las derivadas de todos los campos en el nodo (i, j). */
function argumentos(sim: Sim, u: Float64Array[], w: Array<Float64Array | null>, i: number, j: number, t: number, arg: number[]) {
  const { n, hx, hy } = sim
  const dos = sim.p.cfg.dim === 2
  arg[0] = sim.xs[i]
  arg[1] = sim.ys[j]
  arg[2] = t
  const interior = i > 0 && i < n - 1 && (!dos || (j > 0 && j < sim.ny - 1))
  const q = j * n + i
  for (let k = 0; k < u.length; k++) {
    const a = u[k]
    const base = sim.p.ecs[k].campo === 'u' ? 3 : 10
    const c = a[q]
    let l: number, r: number, d = 0, s = 0, xy = 0
    if (interior) {
      l = a[q - 1]
      r = a[q + 1]
      if (dos) {
        d = a[q - n]
        s = a[q + n]
        xy = a[q + n + 1] - a[q - n + 1] - a[q + n - 1] + a[q - n - 1]
      }
    } else {
      l = valor(sim, a, k, i - 1, j, t)
      r = valor(sim, a, k, i + 1, j, t)
      if (dos) {
        d = valor(sim, a, k, i, j - 1, t)
        s = valor(sim, a, k, i, j + 1, t)
        xy = valor(sim, a, k, i + 1, j + 1, t) - valor(sim, a, k, i + 1, j - 1, t) - valor(sim, a, k, i - 1, j + 1, t) + valor(sim, a, k, i - 1, j - 1, t)
      }
    }
    arg[base] = c
    arg[base + 1] = (r - l) / (2 * hx)
    arg[base + 3] = (r - 2 * c + l) / (hx * hx)
    arg[base + 2] = dos ? (s - d) / (2 * hy) : 0
    arg[base + 4] = dos ? (s - 2 * c + d) / (hy * hy) : 0
    arg[base + 5] = dos ? xy / (4 * hx * hy) : 0
    const wk = w[k]
    arg[base + 6] = wk ? wk[q] : 0
  }
}

/** Lado derecho del sistema semidiscreto: d/dt de (u, w) en cada nodo. */
function derivadas(sim: Sim, u: Float64Array[], w: Array<Float64Array | null>, t: number, du: Float64Array[], dw: Array<Float64Array | null>) {
  const { n, ny } = sim
  const dir = sim.p.cfg.contorno === 'dirichlet'
  const arg = vectorArgs(sim)
  const ecs = sim.p.ecs
  const i0 = dir ? 1 : 0
  const i1 = dir ? n - 1 : n
  const j0 = dir && sim.p.cfg.dim === 2 ? 1 : 0
  const j1 = dir && sim.p.cfg.dim === 2 ? ny - 1 : ny
  for (const a of du) a.fill(0)
  for (const a of dw) a?.fill(0)
  for (let j = j0; j < j1; j++)
    for (let i = i0; i < i1; i++) {
      argumentos(sim, u, w, i, j, t, arg)
      const q = j * n + i
      for (let k = 0; k < ecs.length; k++) {
        const e = ecs[k]
        const f = e.F(arg)
        if (e.orden === 2) {
          du[k][q] = w[k]![q]
          dw[k]![q] = f
        } else du[k][q] = e.orden === 0 ? e.signo * f : f
      }
    }
}

/**
 * Paso estable: se miden ∂F/∂u_xx (difusión), ∂F/∂u_x (transporte) y ∂F/∂u
 * (reacción) en unos cuantos nodos y se toma el más restrictivo de los tres.
 */
function pasoEstable(sim: Sim): number {
  const { n, ny, hx, hy } = sim
  const dos = sim.p.cfg.dim === 2
  const arg = vectorArgs(sim)
  let D = 0
  let A = 0
  let K = 0
  let segundo = false
  for (let m = 0; m < 40; m++) {
    const i = 1 + ((m * 37) % Math.max(1, n - 2))
    const j = dos ? 1 + ((m * 53) % Math.max(1, ny - 2)) : 0
    argumentos(sim, sim.u, sim.w, i, j, sim.t, arg)
    sim.p.ecs.forEach((e) => {
      const b = e.campo === 'u' ? 3 : 10
      if (e.orden === 2) segundo = true
      const f0 = e.F(arg)
      const parcial = (idx: number) => {
        const h = 1e-4 * (1 + Math.abs(arg[idx]))
        const guarda = arg[idx]
        arg[idx] += h
        const d = (e.F(arg) - f0) / h
        arg[idx] = guarda
        return Number.isFinite(d) ? Math.abs(d) : 0
      }
      D = Math.max(D, parcial(b + 3), dos ? parcial(b + 4) : 0)
      A = Math.max(A, parcial(b + 1), dos ? parcial(b + 2) : 0)
      K = Math.max(K, parcial(b), parcial(b === 3 ? 10 : 3))
    })
  }
  const lam = 4 * D * (1 / (hx * hx) + (dos ? 1 / (hy * hy) : 0))
  const cands: number[] = []
  if (sim.p.estacionaria) {
    // Euler explícito: estable si λ·dt ≤ 2
    if (lam > 0) cands.push(1.8 / lam)
  } else if (segundo) {
    if (lam > 0) cands.push(2 / Math.sqrt(lam))
  } else if (lam > 0) cands.push(2.2 / lam)
  if (A > 0) cands.push(1.2 / (A / Math.min(hx, dos ? hy : hx)))
  if (K > 0) cands.push(1 / K)
  return cands.length ? 0.85 * Math.min(...cands) : 0.01
}

function guardarHistoria(sim: Sim) {
  sim.historia.push(sim.u[0].slice())
  sim.tiemposHistoria.push(sim.t)
  if (sim.historia.length > 400) {
    // se quita una fila de cada dos: la historia entera sigue cabiendo con la mitad de resolución
    sim.historia = sim.historia.filter((_, i) => i % 2 === 0)
    sim.tiemposHistoria = sim.tiemposHistoria.filter((_, i) => i % 2 === 0)
  }
}

function pasoRK4(sim: Sim) {
  const dt = sim.dt
  const t = sim.t
  const K = sim.u.length
  const tam = sim.n * sim.ny
  const nuevo = () => sim.u.map(() => new Float64Array(tam))
  const nuevoW = () => sim.w.map((a) => (a ? new Float64Array(tam) : null))
  const k1u = nuevo()
  const k1w = nuevoW()
  derivadas(sim, sim.u, sim.w, t, k1u, k1w)
  const mezcla = (ku: Float64Array[], kw: Array<Float64Array | null>, c: number, tt: number) => {
    const u = sim.u.map((a, k) => a.map((v, q) => v + c * dt * ku[k][q]))
    const w = sim.w.map((a, k) => (a ? a.map((v, q) => v + c * dt * kw[k]![q]) : null))
    aplicarBorde(sim, u, tt)
    return { u, w }
  }
  const s2 = mezcla(k1u, k1w, 0.5, t + dt / 2)
  const k2u = nuevo()
  const k2w = nuevoW()
  derivadas(sim, s2.u, s2.w, t + dt / 2, k2u, k2w)
  const s3 = mezcla(k2u, k2w, 0.5, t + dt / 2)
  const k3u = nuevo()
  const k3w = nuevoW()
  derivadas(sim, s3.u, s3.w, t + dt / 2, k3u, k3w)
  const s4 = mezcla(k3u, k3w, 1, t + dt)
  const k4u = nuevo()
  const k4w = nuevoW()
  derivadas(sim, s4.u, s4.w, t + dt, k4u, k4w)
  for (let k = 0; k < K; k++) {
    const a = sim.u[k]
    for (let q = 0; q < tam; q++) a[q] += (dt / 6) * (k1u[k][q] + 2 * k2u[k][q] + 2 * k3u[k][q] + k4u[k][q])
    const w = sim.w[k]
    if (w) for (let q = 0; q < tam; q++) w[q] += (dt / 6) * (k1w[k]![q] + 2 * k2w[k]![q] + 2 * k3w[k]![q] + k4w[k]![q])
  }
  sim.t = t + dt
  aplicarBorde(sim, sim.u, sim.t)
}

function pasoEstacionario(sim: Sim) {
  const tam = sim.n * sim.ny
  const du = sim.u.map(() => new Float64Array(tam))
  derivadas(sim, sim.u, sim.w, 0, du, sim.w.map(() => null))
  let res = 0
  sim.u.forEach((a, k) => {
    for (let q = 0; q < tam; q++) {
      a[q] += sim.dt * du[k][q]
      const r = Math.abs(du[k][q])
      if (r > res) res = r
    }
  })
  aplicarBorde(sim, sim.u, 0)
  sim.residuo = res
}

/** Nuevo simulador en otra malla con u interpolado bilinealmente de la anterior. */
function afinar(sim: Sim, n: number): Sim {
  const nueva = crearSim(sim.p, n)
  const muestra = (a: Float64Array, x: number, y: number) => {
    const fx = (x - sim.x0) / sim.hx
    const fy = sim.p.cfg.dim === 2 ? (y - sim.ys[0]) / sim.hy : 0
    const i = Math.max(0, Math.min(sim.n - 2, Math.floor(fx)))
    const j = sim.p.cfg.dim === 2 ? Math.max(0, Math.min(sim.ny - 2, Math.floor(fy))) : 0
    const tx = fx - i
    const ty = sim.p.cfg.dim === 2 ? fy - j : 0
    const v = (ii: number, jj: number) => a[Math.min(sim.ny - 1, jj) * sim.n + Math.min(sim.n - 1, ii)]
    return (1 - tx) * (1 - ty) * v(i, j) + tx * (1 - ty) * v(i + 1, j) + (1 - tx) * ty * v(i, j + 1) + tx * ty * v(i + 1, j + 1)
  }
  nueva.u.forEach((a, k) => {
    for (let j = 0; j < nueva.ny; j++) for (let i = 0; i < nueva.n; i++) a[j * nueva.n + i] = muestra(sim.u[k], nueva.xs[i], nueva.ys[j])
  })
  aplicarBorde(nueva, nueva.u, 0)
  nueva.pasos = sim.pasos
  nueva.residuo0 = sim.residuo0
  nueva.nivel = sim.nivel + 1
  return nueva
}

/** La malla gruesa con la que arranca la estacionaria. */
export function crearEstacionaria(p: Problema): Sim {
  const n0 = Math.max(9, Math.round(p.cfg.n / 4))
  return crearSim(p, n0)
}

/**
 * Avanza hasta gastar `presupuesto` milisegundos o llegar a `tFin`. Devuelve el
 * simulador (la estacionaria lo cambia al afinar la malla).
 */
export function avanzar(sim: Sim, presupuesto: number, tFin = Infinity): Sim {
  if (sim.roto || sim.convergida) return sim
  const ini = performance.now()
  const cfg = sim.p.cfg
  let s = sim
  while (performance.now() - ini < presupuesto) {
    if (s.p.estacionaria) {
      for (let k = 0; k < 20; k++) pasoEstacionario(s)
      s.pasos += 20
      if (!Number.isFinite(s.residuo)) {
        s.roto = 'la iteración diverge: la ecuación estacionaria no es de tipo difusivo (elíptica) con ese signo'
        return s
      }
      if (!s.residuo0) s.residuo0 = s.residuo || 1
      // en las mallas gruesas basta con acercarse: lo fino lo arregla la siguiente
      if (s.residuo < (s.n >= cfg.n ? 1e-7 : 1e-3) * s.residuo0) {
        if (s.n >= cfg.n) {
          s.convergida = true
          return s
        }
        s = afinar(s, Math.min(cfg.n, 2 * s.n - 1))
      }
      continue
    }
    if (s.t >= tFin) return s
    pasoRK4(s)
    s.pasos++
    if (s.pasos % 50 === 0) s.dt = pasoEstable(s)
    if (!s.u.every((a) => a.every(Number.isFinite)) || s.u.some((a) => a.some((v) => Math.abs(v) > 1e12))) {
      s.roto = `la solución explota en t ≈ ${s.t.toPrecision(3)}`
      return s
    }
    if (cfg.dim === 1) {
      const ultimo = s.tiemposHistoria[s.tiemposHistoria.length - 1] ?? 0
      if (s.t - ultimo >= Math.max(s.dt, (s.t || 1) / 300)) guardarHistoria(s)
    }
  }
  return s
}

/** Suma una gota gaussiana a u (o al campo k) centrada en (x, y). */
export function gota(sim: Sim, x: number, y: number, k = 0, alto = 1) {
  const L = sim.p.cfg.x[1] - sim.p.cfg.x[0]
  const r = 0.05 * L
  const a = sim.u[k]
  for (let j = 0; j < sim.ny; j++)
    for (let i = 0; i < sim.n; i++) {
      const d2 = (sim.xs[i] - x) ** 2 + (sim.p.cfg.dim === 2 ? (sim.ys[j] - y) ** 2 : 0)
      a[j * sim.n + i] += alto * Math.exp(-d2 / (r * r))
    }
  aplicarBorde(sim, sim.u, sim.t)
  sim.convergida = false
}

export function extremos(a: Float64Array): [number, number] {
  let lo = Infinity
  let hi = -Infinity
  for (const v of a) {
    if (v < lo) lo = v
    if (v > hi) hi = v
  }
  return [lo, hi]
}

/** ∫u en el dominio (trapecios). */
export function integral(sim: Sim, k = 0): number {
  const a = sim.u[k]
  const per = sim.p.cfg.contorno === 'periodica'
  const peso = (i: number, n: number) => (per ? 1 : i === 0 || i === n - 1 ? 0.5 : 1)
  let s = 0
  for (let j = 0; j < sim.ny; j++) for (let i = 0; i < sim.n; i++) s += peso(i, sim.n) * (sim.p.cfg.dim === 2 ? peso(j, sim.ny) : 1) * a[j * sim.n + i]
  return s * sim.hx * (sim.p.cfg.dim === 2 ? sim.hy : 1)
}


