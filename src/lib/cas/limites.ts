import {
  clave, contiene, esIndef, esNum, esUno, evaluar, fn, MENOS, NEPER, PI, pot, prod, q, s, simbolos, suma, sustituir, valor, flo, type E,
} from './expr'
import { derivar } from './derivar'
import { racional, simplificar } from './algebra'
import { grado, principalP } from './polinomios'

/* ---------- reconocer un número ---------- */

/** Mejor fracción p/q con q ≤ max por fracciones continuas. */
function fraccion(v: number, max = 1000): [number, number] | null {
  if (!Number.isFinite(v)) return null
  let [h0, h1, k0, k1] = [0, 1, 1, 0]
  let x = v
  for (let i = 0; i < 40; i++) {
    const a = Math.floor(x)
    ;[h0, h1] = [h1, a * h1 + h0]
    ;[k0, k1] = [k1, a * k1 + k0]
    if (k1 > max) return null
    if (Math.abs(h1 / k1 - v) < 1e-12 * Math.max(1, Math.abs(v))) return [h1, k1]
    const resto = x - a
    if (resto < 1e-14) return [h1, k1]
    x = 1 / resto
  }
  return null
}

/**
 * Forma exacta de un número que salió de un cálculo numérico, si es de las
 * habituales: p/q, p/q·π, p/q·e, √(p/q), p/q·√2… Solo se acepta con 10⁻⁹ de
 * margen relativo; si no, se queda el decimal.
 */
export function identificar(v: number): E | null {
  if (!Number.isFinite(v)) return null
  if (Math.abs(v) < 1e-12) return q(0)
  const intentos: Array<[number, (p: E) => E]> = [
    [1, (p) => p],
    [Math.PI, (p) => prod(p, PI)],
    [Math.E, (p) => prod(p, NEPER)],
    [Math.SQRT2, (p) => prod(p, pot(q(2), q(1, 2)))],
    [Math.sqrt(3), (p) => prod(p, pot(q(3), q(1, 2)))],
    [Math.sqrt(5), (p) => prod(p, pot(q(5), q(1, 2)))],
    [Math.LN2, (p) => prod(p, fn('ln', [q(2)]))],
    [1 / Math.PI, (p) => prod(p, pot(PI, MENOS))],
    [Math.sqrt(Math.PI), (p) => prod(p, pot(PI, q(1, 2)))],
  ]
  for (const [base, forma] of intentos) {
    const f = fraccion(v / base, base === 1 ? 10000 : 200)
    if (f && Math.abs((f[0] / f[1]) * base - v) < 1e-9 * Math.max(1, Math.abs(v))) return forma(q(f[0], f[1]))
  }
  // √(p/q)
  const c = fraccion(v * v, 200)
  if (c && Math.abs(Math.sign(v) * Math.sqrt(c[0] / c[1]) - v) < 1e-10 * Math.max(1, Math.abs(v)))
    return prod(q(Math.sign(v)), pot(q(c[0], c[1]), q(1, 2)))
  return null
}

/* ---------- límites ---------- */

export type Punto = E | 'inf' | '-inf'

export type Limite =
  | { tipo: 'valor'; v: E; numerico: boolean; nota?: string }
  | { tipo: 'infinito'; signo: 1 | -1 }
  | { tipo: 'no existe'; izquierda: string; derecha: string }

const finito = (x: E) => !esIndef(x) && Number.isFinite(evaluar(x))

/** Separa numerador y denominador; una suma de fracciones se junta sobre el denominador común. */
function cociente(e: E): [E, E] | null {
  const partir = (y: E): [E, E] => {
    const fs = y.t === '*' ? y.a : [y]
    const negativo = (f: E) => f.t === '^' && esNum(f.e) && valor(f.e) < 0
    const arriba = fs.filter((f) => !negativo(f))
    const abajo = fs.filter(negativo).map((f) => pot((f as Extract<E, { t: '^' }>).b, prod(MENOS, (f as Extract<E, { t: '^' }>).e)))
    return [prod(...arriba), prod(...abajo)]
  }
  if (e.t === '+') {
    const partes = e.a.map(partir)
    if (partes.every(([, d]) => esUno(d))) return null
    // mínimo común múltiplo: por cada base, el mayor exponente (x, x², x³ → x³, no x⁶)
    const mcm = new Map<string, { b: E; e: number; eE: E }>()
    for (const [, d] of partes) {
      for (const f of d.t === '*' ? d.a : [d]) {
        if (esNum(f)) continue
        const [b, eE] = f.t === '^' ? [f.b, f.e] : [f, q(1)]
        const e = esNum(eE) ? valor(eE) : 1
        const k = clave(b)
        if (!mcm.has(k) || mcm.get(k)!.e < e) mcm.set(k, { b, e, eE })
      }
    }
    const D = prod(...[...mcm.values()].map(({ b, eE }) => pot(b, eE)))
    const N = suma(...partes.map(([n, d]) => prod(n, D, pot(d, MENOS))))
    return [N, D]
  }
  const [n, d] = partir(e)
  return esUno(d) ? null : [n, d]
}

export type Lado = number | 'inf' | '-inf' | 'nodef' | null

/**
 * Estimación numérica por un lado. Se acerca con h = 10⁻², …, 10⁻⁵ (o x = 10², …,
 * 10⁵ hacia ∞) y extrapola con Richardson suponiendo error a·h + b·h²: más cerca
 * la cancelación (1 − cos h con h = 10⁻⁸ da 0 exacto) estropea más de lo que gana.
 */
export function lado(f: (t: number) => number, a: number | 'inf' | '-inf', signo: 1 | -1): Lado {
  const hs = [1e-2, 1e-3, 1e-4, 1e-5]
  const puntos = a === 'inf' ? hs.map((h) => 1 / h) : a === '-inf' ? hs.map((h) => -1 / h) : hs.map((h) => a + signo * h)
  const vs = puntos.map(f)
  if (vs.every(Number.isNaN)) return 'nodef'
  if (!vs.every(Number.isFinite)) return null
  const [, v1, v2, v3] = vs
  if (Math.abs(v3) > 1e4 && Math.abs(v3) > Math.abs(v2) * 2 && Math.abs(v2) > Math.abs(v1) * 2) return v3 > 0 ? 'inf' : '-inf'
  // crecimiento sin cota aunque lento (ln h): pasos del mismo signo que no se achican
  const [d1, d2, d3] = [vs[1] - vs[0], v2 - v1, v3 - v2]
  if (Math.abs(v3) > 5 && d1 * d2 > 0 && d2 * d3 > 0 && Math.abs(d3) >= 0.5 * Math.abs(d2) && Math.abs(d2) >= 0.5 * Math.abs(d1)) return d3 > 0 ? 'inf' : '-inf'
  const r1 = vs.slice(1).map((v, i) => (10 * v - vs[i]) / 9)
  const r2 = r1.slice(1).map((v, i) => (100 * v - r1[i]) / 99)
  const [p, u] = r2
  if (Math.abs(u - p) > 1e-4 * Math.max(1, Math.abs(u)) && Math.abs(v3 - v2) > 1e-4 * Math.max(1, Math.abs(v3))) return null
  return Math.abs(u - p) < Math.abs(v3 - v2) ? u : v3
}

/** L'Hôpital si N/D es 0/0 o ∞/∞; null si no aplica o no concluye. */
function lhopital(N: E, D: E, x: string, a: Punto, pasos: number): Limite | null {
  const lN = limite(N, x, a, pasos)
  const lD = limite(D, x, a, pasos)
  const nulo = (l: Limite) => l.tipo === 'valor' && Math.abs(evaluar(l.v)) < 1e-14
  // 1/x en 0 vale ±∞ según el lado: para L'Hôpital cuenta como ∞
  const inf = (l: Limite) =>
    l.tipo === 'infinito' || (l.tipo === 'no existe' && [l.izquierda, l.derecha].every((v) => v.includes('∞') || v === 'no está definida'))
  if (!((nulo(lN) && nulo(lD)) || (inf(lN) && inf(lD)))) return null
  const nuevo = simplificar(prod(derivar(N, x), pot(derivar(D, x), MENOS)))
  if (clave(nuevo).length > 20000) return null
  const l = limite(nuevo, x, a, pasos + 1)
  return l.tipo !== 'valor' || !l.numerico ? l : null
}

/** `pasos` cuenta las aplicaciones de L'Hôpital: los sublímites no lo gastan. */
export function limite(e0: E, x: string, a: Punto, pasos = 0): Limite {
  const e = simplificar(e0)
  const otras = [...simbolos(e)].filter((v) => v !== x)

  if (a !== 'inf' && a !== '-inf') {
    // sustitución directa: vale si no deja nada indefinido (con parámetros, si no queda un 0/0)
    const directo = simplificar(sustituir(e, s(x), a))
    if (!contieneIndef(directo) && (otras.length || finito(directo))) return { tipo: 'valor', v: directo, numerico: false }
  }

  // cociente de polinomios en el infinito: se comparan los grados
  if ((a === 'inf' || a === '-inf') && !otras.length) {
    const rac = racional(e, x)
    if (rac && rac[0].length) {
      const [n, d] = rac
      const gn = grado(n)
      const gd = grado(d)
      const cn = principalP(n)
      const cd = principalP(d)
      const cocienteLc = (Number(cn.n) / Number(cn.d)) / (Number(cd.n) / Number(cd.d))
      if (gn < gd) return { tipo: 'valor', v: q(0), numerico: false }
      if (gn === gd) return { tipo: 'valor', v: q(cn.n * cd.d, cn.d * cd.n), numerico: false }
      const signo = Math.sign(cocienteLc) * (a === '-inf' && (gn - gd) % 2 === 1 ? -1 : 1)
      return { tipo: 'infinito', signo: signo > 0 ? 1 : -1 }
    }
  }

  // f^g con x en los dos: e^(g·ln f), que convierte 1^∞, 0⁰ e ∞⁰ en un producto
  if (e.t === '^' && contiene(e.b, x) && contiene(e.e, x) && pasos < 8 && !otras.length) {
    const l = limite(prod(e.e, fn('ln', [e.b])), x, a, pasos + 1)
    if (l.tipo === 'valor') return { ...l, v: simplificar(pot(NEPER, l.v)) }
    if (l.tipo === 'infinito') return l.signo > 0 ? l : { tipo: 'valor', v: q(0), numerico: false }
  }

  // 0·∞: (lo que tiende a ∞) / (1 / lo que tiende a 0). Se pasan por separado,
  // porque como producto la forma canónica lo volvería a juntar
  if (e.t === '*' && !cociente(e) && pasos < 8 && !otras.length) {
    const lims = e.a.map((f) => [f, limite(f, x, a, pasos)] as const)
    const ceros = lims.filter(([, l]) => l.tipo === 'valor' && Math.abs(evaluar(l.v)) < 1e-14).map(([f]) => f)
    if (ceros.length && lims.some(([, l]) => l.tipo === 'infinito')) {
      const resto = prod(...e.a.filter((f) => !ceros.includes(f)))
      const cero = prod(...ceros)
      // según cuál quede abajo, L'Hôpital acaba o da vueltas: se prueban las dos
      const l1 = lhopital(cero, pot(resto, MENOS), x, a, pasos)
      if (l1 && l1.tipo !== 'no existe') return l1
      const l2 = lhopital(resto, pot(cero, MENOS), x, a, pasos)
      if (l2 && l2.tipo !== 'no existe') return l2
      if (l1 ?? l2) return (l1 ?? l2)!
    }
  }

  // composición con lo que ya se sabe: 1/g, g^p, ln g, e^g, atan g cuando g → ±∞ o g → 0
  if (!otras.length && pasos < 8) {
    const r = componer(e, x, a, pasos)
    if (r) return r
  }

  // una suma: término a término si ninguno choca con otro (∞ − ∞ no se toca)
  if (e.t === '+' && pasos < 8 && !otras.length) {
    const ls = e.a.map((t) => limite(t, x, a, pasos))
    if (ls.every((l) => l.tipo === 'valor')) {
      const vs = ls as Array<Extract<Limite, { tipo: 'valor' }>>
      const v = simplificar(suma(...vs.map((l) => l.v)))
      if (finito(v)) return { tipo: 'valor', v, numerico: vs.some((l) => l.numerico) }
    }
    const infs = ls.filter((l) => l.tipo === 'infinito') as Array<Extract<Limite, { tipo: 'infinito' }>>
    if (infs.length && infs.every((l) => l.signo === infs[0].signo) && ls.every((l) => l.tipo !== 'no existe')) return infs[0]
  }

  // 0/0 o ∞/∞
  const c = cociente(e)
  if (c && pasos < 8 && !otras.length) {
    const l = lhopital(c[0], c[1], x, a, pasos)
    if (l) return l
  }

  if (otras.length) throw new Error(`con ${otras.join(', ')} sin valor solo sé calcularlo sustituyendo`)

  const f = (t: number) => evaluar(e, { [x]: t })
  const numA = a === 'inf' || a === '-inf' ? a : evaluar(a)
  const texto = (v: Lado) => (v === null ? 'no converge' : v === 'nodef' ? 'no está definida' : v === 'inf' ? '+∞' : v === '-inf' ? '−∞' : String(+v.toPrecision(8)))
  const resultado = (v: number | 'inf' | '-inf', nota?: string): Limite => {
    if (v === 'inf' || v === '-inf') return { tipo: 'infinito', signo: v === 'inf' ? 1 : -1 }
    const exacto = identificar(v)
    return { tipo: 'valor', v: exacto ?? flo(v), numerico: true, nota }
  }
  if (numA === 'inf' || numA === '-inf') {
    const v = lado(f, numA, 1)
    if (v === null || v === 'nodef') return { tipo: 'no existe', izquierda: '', derecha: texto(v) }
    return resultado(v)
  }
  const der = lado(f, numA, 1)
  const izq = lado(f, numA, -1)
  // definida solo por un lado (x·ln x en 0, √x en 0): vale ese lado
  if (izq === 'nodef' && der !== null && der !== 'nodef') return resultado(der, 'solo por la derecha: a la izquierda no está definida')
  if (der === 'nodef' && izq !== null && izq !== 'nodef') return resultado(izq, 'solo por la izquierda: a la derecha no está definida')
  if (der === null || izq === null || der === 'nodef' || izq === 'nodef') return { tipo: 'no existe', izquierda: texto(izq), derecha: texto(der) }
  const iguales = typeof der === 'number' && typeof izq === 'number' ? Math.abs(der - izq) < 1e-5 * Math.max(1, Math.abs(der)) : der === izq
  if (!iguales) return { tipo: 'no existe', izquierda: texto(izq), derecha: texto(der) }
  return resultado(typeof der === 'number' && typeof izq === 'number' ? (der + izq) / 2 : der)
}

/**
 * Límites que salen de otro límite más sencillo: 1/g → 0 si g → ±∞, gᵖ con p
 * constante, ln g, eᵍ y atan g. Evita depender de la estimación numérica, que
 * con 1/√x o 1/ln x se acerca demasiado despacio para fiarse.
 */
function componer(e: E, x: string, a: Punto, pasos: number): Limite | null {
  const valorDe = (l: Limite) => (l.tipo === 'valor' ? evaluar(l.v) : NaN)
  if (e.t === '^' && !contiene(e.e, x) && contiene(e.b, x) && esNum(e.e)) {
    const p = valor(e.e)
    const lb = limite(e.b, x, a, pasos)
    if (lb.tipo === 'infinito') {
      if (p < 0) return { tipo: 'valor', v: q(0), numerico: false }
      if (p > 0) {
        // (−∞)^p: solo con p entero se sabe el signo
        const signo = lb.signo > 0 ? 1 : Number.isInteger(p) ? (p % 2 ? -1 : 1) : 0
        return signo ? { tipo: 'infinito', signo: signo as 1 | -1 } : null
      }
    }
    if (lb.tipo === 'valor' && p < 0 && Math.abs(valorDe(lb)) < 1e-300) {
      // 1/g con g → 0: infinito solo si g no cambia de signo alrededor (se mira numéricamente)
      if (a === 'inf' || a === '-inf') {
        const g = (t: number) => evaluar(e.b, { [x]: t })
        const v = g(a === 'inf' ? 1e6 : -1e6)
        if (Number.isFinite(v) && v !== 0) return { tipo: 'infinito', signo: v > 0 || Number.isInteger(p) && p % 2 === 0 ? 1 : -1 }
      }
    }
    return null
  }
  // b^g con b constante > 1 (eˣ, 2ˣ)
  if (e.t === '^' && !contiene(e.b, x) && contiene(e.e, x)) {
    const b = evaluar(e.b)
    const lg = limite(e.e, x, a, pasos)
    if (!(b > 1) || lg.tipo !== 'infinito') return null
    return lg.signo > 0 ? { tipo: 'infinito', signo: 1 } : { tipo: 'valor', v: q(0), numerico: false }
  }
  // producto: los límites de los factores, si no hay 0·∞
  if (e.t === '*') {
    const ls = e.a.map((f) => (contiene(f, x) ? limite(f, x, a, pasos) : ({ tipo: 'valor', v: f, numerico: false } as Limite)))
    if (ls.some((l) => l.tipo === 'no existe')) {
      // acotada por algo que tiende a 0 (sin x / x en ∞, x·cos(1/x) en 0): el producto tiende a 0
      const acotada = (f: E) => f.t === 'fn' && ['sin', 'cos', 'atan', 'tanh'].includes(f.v)
      const malos = e.a.filter((_, i) => ls[i].tipo === 'no existe')
      if (!malos.every(acotada)) return null
      const resto = e.a.filter((_, i) => ls[i].tipo !== 'no existe')
      if (!resto.length) return null
      const lr = limite(prod(...resto), x, a, pasos)
      return lr.tipo === 'valor' && Math.abs(evaluar(lr.v)) < 1e-300 ? { tipo: 'valor', v: q(0), numerico: false } : null
    }
    const infs = ls.filter((l) => l.tipo === 'infinito') as Array<Extract<Limite, { tipo: 'infinito' }>>
    const vals = ls.filter((l) => l.tipo === 'valor') as Array<Extract<Limite, { tipo: 'valor' }>>
    if (!infs.length) {
      const v = simplificar(prod(...vals.map((l) => l.v)))
      return finito(v) ? { tipo: 'valor', v, numerico: vals.some((l) => l.numerico) } : null
    }
    const nums = vals.map((l) => evaluar(l.v))
    if (nums.some((n) => !Number.isFinite(n) || n === 0)) return null
    const signo = infs.reduce((acc, l) => acc * l.signo, 1) * nums.reduce((acc, n) => acc * Math.sign(n), 1)
    return { tipo: 'infinito', signo: signo > 0 ? 1 : -1 }
  }
  if (e.t === 'fn' && e.a.length === 1 && contiene(e.a[0], x)) {
    const lg = limite(e.a[0], x, a, pasos)
    if (lg.tipo !== 'infinito') return null
    switch (e.v) {
      case 'ln':
        return lg.signo > 0 ? { tipo: 'infinito', signo: 1 } : null
      case 'atan':
        return { tipo: 'valor', v: prod(q(lg.signo, 2), PI), numerico: false }
      case 'sqrt':
        return lg.signo > 0 ? { tipo: 'infinito', signo: 1 } : null
      case 'tanh':
        return { tipo: 'valor', v: q(lg.signo), numerico: false }
      default:
        return null
    }
  }
  return null
}

function contieneIndef(x: E): boolean {
  if (esIndef(x)) return true
  if (x.t === '+' || x.t === '*' || x.t === 'fn') return x.a.some(contieneIndef)
  if (x.t === '^') return contieneIndef(x.b) || contieneIndef(x.e)
  return false
}

/* ---------- Taylor ---------- */

export function taylor(e: E, x: string, a: E, n: number): E {
  if (n > 20) throw new Error('como mucho grado 20')
  const terminos: E[] = []
  let d = e
  let factorial = 1n
  for (let k = 0; k <= n; k++) {
    if (k > 0) {
      d = simplificar(derivar(d, x))
      factorial *= BigInt(k)
    }
    let c = simplificar(sustituir(d, s(x), a))
    // singularidad evitable (sin x / x en 0): el coeficiente es el límite
    if (!finito(c) && ![...simbolos(c)].length) {
      const l = limite(d, x, a)
      if (l.tipo !== 'valor') throw new Error(`la derivada ${k}-ésima no está definida en el punto`)
      c = l.v
    }
    terminos.push(prod(c, q(1n, factorial), pot(suma(s(x), prod(MENOS, a)), q(k))))
  }
  return suma(...terminos)
}
