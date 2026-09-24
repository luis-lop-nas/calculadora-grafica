import { esIndef, evaluar, flo, MENOS, prod, s, simbolos, suma, sustituir, type E } from './expr'
import { simplificar } from './algebra'
import { integralNumerica, integrar } from './integrar'
import { identificar, lado, limite, type Punto } from './limites'

/**
 * Integrales definidas, también impropias. La regla de Barrow solo vale si la
 * primitiva es continua en todo el intervalo: primero se buscan las asíntotas
 * del integrando dentro de él, se parte por ellas y en cada trozo se toman los
 * límites laterales de F. Si alguno es infinito, la integral diverge. Sin
 * primitiva elemental se integra con cuadratura de doble exponencial, que
 * aguanta singularidades integrables en los extremos e intervalos infinitos.
 */

export type Definida =
  | { tipo: 'valor'; v: E; nota: string }
  | { tipo: 'diverge'; nota: string }

type Extremo = number | 'inf' | '-inf'

const numero = (p: Punto): Extremo => (p === 'inf' || p === '-inf' ? p : evaluar(p))

/* ---------- cuadratura de doble exponencial ---------- */

/**
 * ∫ g entre a y b con tanh-sinh (finito), exp-sinh (semirrecta) o sinh-sinh (recta
 * entera). Se va partiendo el paso por la mitad hasta que dos estimaciones
 * coinciden; si los nodos de los extremos siguen pesando, la integral no
 * converge y devuelve NaN.
 */
export function cuadratura(g: (t: number) => number, a: Extremo, b: Extremo): number {
  if (a === b) return 0
  if (typeof a === 'number' && typeof b === 'number' && a > b) return -cuadratura(g, b, a)
  if (a === 'inf' || b === '-inf') return -cuadratura(g, b, a)
  const TMAX = 4
  // nodo: [x, peso]
  let nodo: (t: number) => [number, number]
  if (typeof a === 'number' && typeof b === 'number') {
    const d = (b - a) / 2
    nodo = (t) => {
      const u = (Math.PI / 2) * Math.sinh(t)
      const w = (d * (Math.PI / 2) * Math.cosh(t)) / Math.cosh(u) ** 2
      // la distancia al extremo más cercano, sin restar números casi iguales
      const cerca = (2 * d) / (1 + Math.exp(2 * Math.abs(u)))
      return [t < 0 ? a + cerca : b - cerca, w]
    }
  } else if (typeof a === 'number') {
    nodo = (t) => {
      const e = Math.exp((Math.PI / 2) * Math.sinh(t))
      return [a + e, (Math.PI / 2) * Math.cosh(t) * e]
    }
  } else if (typeof b === 'number') {
    nodo = (t) => {
      const e = Math.exp((Math.PI / 2) * Math.sinh(t))
      return [b - e, (Math.PI / 2) * Math.cosh(t) * e]
    }
  } else {
    nodo = (t) => {
      const u = (Math.PI / 2) * Math.sinh(t)
      return [Math.sinh(u), (Math.PI / 2) * Math.cosh(t) * Math.cosh(u)]
    }
  }
  const termino = (t: number) => {
    const [x, w] = nodo(t)
    if (!Number.isFinite(x) || x === a || x === b || w === 0) return 0
    const v = g(x) * w
    return Number.isFinite(v) ? v : NaN
  }
  let h = 0.5
  let suma0 = termino(0)
  for (let k = 1; k * h <= TMAX; k++) suma0 += termino(k * h) + termino(-k * h)
  let I = h * suma0
  for (let nivel = 0; nivel < 8; nivel++) {
    h /= 2
    let nuevos = 0
    for (let k = 1; k * h <= TMAX; k += 2) nuevos += termino(k * h) + termino(-k * h)
    suma0 += nuevos
    const I2 = h * suma0
    if (!Number.isFinite(I2)) return NaN
    if (Math.abs(I2 - I) < 1e-11 * Math.max(1, Math.abs(I2)) && nivel >= 2) {
      // la cola: en |t| = TMAX el integrando transformado tiene que haber muerto
      const cola = Math.max(Math.abs(termino(TMAX)), Math.abs(termino(-TMAX)))
      return cola < 1e-9 * Math.max(1, Math.abs(I2)) ? I2 : NaN
    }
    I = I2
  }
  // sin converger (un salto dentro del intervalo): mejor no dar un número dudoso
  return NaN
}

/* ---------- asíntotas dentro del intervalo ---------- */

/** Puntos interiores donde |g| se va a infinito (o g no está definida en un punto aislado). */
export function singularidades(g: (t: number) => number, a: Extremo, b: Extremo): number[] {
  // se muestrea en una variable u ∈ (0, 1) que cubre también los tramos infinitos
  const [lo, hi] = [a === '-inf' ? -Infinity : (a as number), b === 'inf' ? Infinity : (b as number)]
  const X = (u: number) =>
    Number.isFinite(lo) && Number.isFinite(hi) ? lo + (hi - lo) * u : Number.isFinite(lo) ? lo + u / (1 - u) : Number.isFinite(hi) ? hi - (1 - u) / u : Math.tan(Math.PI * (u - 0.5))
  const N = 4000
  const us = Array.from({ length: N - 1 }, (_, i) => (i + 1) / N)
  const vs = us.map((u) => Math.abs(g(X(u))))
  const finitos = vs.filter(Number.isFinite).sort((p, q) => p - q)
  const mediana = finitos[Math.floor(finitos.length / 2)] ?? 1
  const out: number[] = []
  const anota = (x: number) => {
    if (!out.some((c) => Math.abs(c - x) < 1e-7 * Math.max(1, Math.abs(x)))) out.push(x)
  }
  // candidatos: puntos no definidos entre dos definidos, y máximos locales de |g| (los más altos)
  const candidatos: number[] = []
  for (let i = 0; i < vs.length; i++) {
    const v = vs[i]
    if (!Number.isFinite(v)) {
      if (!Number.isNaN(v) || (Number.isFinite(vs[i - 1] ?? NaN) && Number.isFinite(vs[i + 1] ?? NaN))) candidatos.push(i)
    } else if (v > (vs[i - 1] ?? 0) && v > (vs[i + 1] ?? 0) && v > 2 * mediana) candidatos.push(i)
  }
  candidatos.sort((i, j) => (Number.isFinite(vs[j]) ? vs[j] : Infinity) - (Number.isFinite(vs[i]) ? vs[i] : Infinity) || 0)
  const G = (u: number) => {
    const w = Math.abs(g(X(u)))
    return Number.isNaN(w) ? Infinity : w
  }
  for (const i of candidatos.slice(0, 200)) {
    // se afina el máximo de |g| en la celda con sección áurea
    let [p, r] = [us[Math.max(0, i - 1)], us[Math.min(us.length - 1, i + 1)]]
    const phi = (Math.sqrt(5) - 1) / 2
    for (let k = 0; k < 90 && r - p > 1e-15; k++) {
      const m1 = r - phi * (r - p)
      const m2 = p + phi * (r - p)
      if (G(m1) >= G(m2)) r = m2
      else p = m1
    }
    let c = X((p + r) / 2)
    if (Math.abs(c) < 1e-9) c = 0
    // ¿crece sin cota al acercarse? |g| a 10⁻³, 10⁻⁶ y 10⁻⁹ de c (lo peor de los dos lados)
    const cerca = (d: number) => {
      const e = d * Math.max(1, Math.abs(c))
      const v = Math.max(Math.abs(g(c - e)) || 0, Math.abs(g(c + e)) || 0)
      return Number.isFinite(v) ? v : Infinity
    }
    const [m3, m6, m9] = [cerca(1e-3), cerca(1e-6), cerca(1e-9)]
    const crece = m9 > 1.3 * m6 && m6 > 1.3 * m3 && m9 > 5 * (mediana + 1)
    if (crece || !Number.isFinite(G((p + r) / 2)) || G((p + r) / 2) > 1e9 * (mediana + 1)) anota(c)
  }
  return out.sort((p, q) => p - q)
}

/* ---------- integral definida ---------- */

export function definida(f: E, x: string, a: Punto, b: Punto): Definida {
  const g = (t: number) => evaluar(f, { [x]: t })
  const A = numero(a)
  const B = numero(b)
  if (typeof A === 'number' && !Number.isFinite(A)) throw new Error('el límite inferior no es un número')
  if (typeof B === 'number' && !Number.isFinite(B)) throw new Error('el límite superior no es un número')
  const [lo, hi] = typeof A === 'number' && typeof B === 'number' && A > B ? [B, A] : [A, B]
  const cortes = singularidades(g, lo, hi)
  const impropia = cortes.length > 0 || typeof A !== 'number' || typeof B !== 'number' || !Number.isFinite(g(A as number)) || !Number.isFinite(g(B as number))
  const texCortes = cortes.map((c) => String(+c.toPrecision(6)).replace('.', ',')).join('; ')

  const F = integrar(f, x)
  if (F && [...simbolos(f)].some((v) => v !== x)) {
    // con parámetros no hay números que muestrear: Barrow tal cual
    if (typeof A !== 'number' || typeof B !== 'number') {
      const la = typeof A === 'number' ? simplificar(sustituir(F, s(x), a as E)) : null
      const lb = typeof B === 'number' ? simplificar(sustituir(F, s(x), b as E)) : null
      const li = (p: 'inf' | '-inf') => {
        const l = limite(F, x, p)
        return l.tipo === 'valor' ? l.v : null
      }
      const va = la ?? li(A as 'inf' | '-inf')
      const vb = lb ?? li(B as 'inf' | '-inf')
      if (!va || !vb) throw new Error('con parámetros sin valor no sé tomar el límite en el infinito')
      return { tipo: 'valor', v: simplificar(suma(vb, prod(MENOS, va))), nota: 'impropia: límite de la primitiva' }
    }
    return { tipo: 'valor', v: simplificar(suma(sustituir(F, s(x), b as E), prod(MENOS, sustituir(F, s(x), a as E)))), nota: 'regla de Barrow (con parámetros: no se comprueba si hay asíntotas)' }
  }
  if (F) {
    const Fn = (t: number) => evaluar(F, { [x]: t })
    // F en un extremo o en un corte, por el lado del trozo; null si se va a infinito
    const enPunto = (p: Extremo, signo: 1 | -1, exacto?: Punto): { v: E | null; n: number } | null => {
      if (p === 'inf' || p === '-inf') {
        const l = limite(F, x, p)
        if (l.tipo !== 'valor') return null
        return { v: l.numerico ? null : l.v, n: evaluar(l.v) }
      }
      if (exacto) {
        const v = simplificar(sustituir(F, s(x), exacto as E))
        const n = evaluar(v)
        if (!esIndef(v) && Number.isFinite(n)) return { v, n }
      }
      const n = Fn(p)
      if (Number.isFinite(n) && !cortes.includes(p)) return { v: null, n }
      // F continua en el corte (x^(2/3) en 0): vale su valor, aunque el integrando no esté definido ahí
      if (Number.isFinite(n)) {
        const esc = Math.max(1, Math.abs(p))
        const dif = [1e-6, 1e-9, 1e-12].map((e) => Math.abs(Fn(p + signo * e * esc) - n))
        if (dif.every(Number.isFinite) && dif[1] < dif[0] && dif[2] < dif[1] && dif[2] < 1e-3 * Math.max(1, Math.abs(n))) return { v: null, n }
      }
      // límite simbólico (L'Hôpital con 0·∞ en x·ln x); si no concluye, numérico por el lado del trozo
      try {
        const l = limite(F, x, exacto && exacto !== 'inf' && exacto !== '-inf' ? exacto : identificar(p) ?? flo(p))
        if (l.tipo === 'infinito') return null
        if (l.tipo === 'valor') return { v: l.numerico ? null : l.v, n: evaluar(l.v) }
      } catch {
        /* se sigue en numérico */
      }
      const l = lado(Fn, p, signo)
      return typeof l === 'number' ? { v: null, n: l } : null
    }
    const puntos: Array<[Extremo, Punto | undefined]> = [[lo, lo === A ? a : b], ...cortes.map((c): [Extremo, Punto | undefined] => [c, identificar(c) ?? undefined]), [hi, hi === B ? b : a]]
    let exacto: E | null = null
    let total = 0
    let todoExacto = true
    for (let i = 0; i + 1 < puntos.length; i++) {
      const izq = enPunto(puntos[i][0], 1, puntos[i][1])
      const der = enPunto(puntos[i + 1][0], -1, puntos[i + 1][1])
      if (!izq || !der)
        return { tipo: 'diverge', nota: cortes.length ? `el integrando tiene una asíntota en x = ${texCortes}` : 'la primitiva se va a infinito en un extremo' }
      total += der.n - izq.n
      if (izq.v && der.v) exacto = exacto ? suma(exacto, der.v, prod(MENOS, izq.v)) : suma(der.v, prod(MENOS, izq.v))
      else todoExacto = false
    }
    const signo = typeof A === 'number' && typeof B === 'number' && A > B ? -1 : 1
    total *= signo
    if (todoExacto && exacto) {
      const v = simplificar(signo < 0 ? prod(MENOS, exacto) : exacto)
      const n = evaluar(v)
      // contraste independiente: una primitiva con saltos (atan de algo que pasa por ∞) no se nota en F
      const numerica = cortes.length || simbolos(v).size ? NaN : signo * cuadratura(g, lo, hi)
      if (Number.isFinite(numerica) && Math.abs(numerica - n) > 1e-6 * Math.max(1, Math.abs(numerica)))
        return { tipo: 'valor', v: identificar(numerica) ?? flo(numerica), nota: 'numérica: la primitiva encontrada tiene un salto en el intervalo' }
      if (!esIndef(v) && (simbolos(v).size || Math.abs(n - total) < 1e-7 * Math.max(1, Math.abs(total)))) {
        const nota = cortes.length ? `impropia: se parte en x = ${texCortes} y cada trozo converge` : impropia ? 'impropia: límite de la primitiva en los extremos' : 'regla de Barrow'
        return { tipo: 'valor', v, nota }
      }
    }
    const v = identificar(total) ?? flo(total)
    return { tipo: 'valor', v, nota: cortes.length ? `impropia: se parte en x = ${texCortes} y cada trozo converge` : 'límites laterales de la primitiva' }
  }

  // sin primitiva: cuadratura trozo a trozo
  const trozos: Array<[Extremo, Extremo]> = []
  const bordes: Extremo[] = [lo, ...cortes, hi]
  for (let i = 0; i + 1 < bordes.length; i++) trozos.push([bordes[i], bordes[i + 1]])
  let total = 0
  for (const [p, r] of trozos) {
    let v = cuadratura(g, p, r)
    // un salto finito (signo, a trozos) frena la doble exponencial; Simpson adaptativo no se entera
    if (!Number.isFinite(v) && typeof p === 'number' && typeof r === 'number' && Number.isFinite(g(p)) && Number.isFinite(g(r))) v = integralNumerica(g, p, r)
    if (!Number.isFinite(v))
      return {
        tipo: 'diverge',
        nota: cortes.length ? `no converge cerca de x = ${texCortes}` : typeof p === 'number' && typeof r === 'number' ? 'no converge' : 'no converge numéricamente; si el integrando oscila (sin x / x), puede converger condicionalmente y este método no lo alcanza',
      }
    total += v
  }
  if (typeof A === 'number' && typeof B === 'number' && A > B) total = -total
  const exacto = identificar(total)
  return {
    tipo: 'valor',
    v: exacto ?? flo(total),
    nota: `numérica (doble exponencial)${exacto ? ', reconocida' : ''}: sin primitiva elemental${impropia ? ' · impropia' : ''}`,
  }
}
