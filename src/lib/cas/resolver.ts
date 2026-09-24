import {
  clave, contiene, DOS, esCero, esNum, evaluar, fn, MEDIO, MENOS, NEPER, partirTermino, PI, pot, prod, q, s, simbolos, suma, sustituir,
  valor, CERO, type E,
} from './expr'
import { derivar } from './derivar'
import { desarrollar, polinomio, racional, simplificar } from './algebra'
import { aExpr, factorizarP, grado, raicesReales } from './polinomios'
import { identificar } from './limites'

export interface Solucion {
  /** Soluciones exactas, ya simplificadas. */
  exactas: E[]
  /** Las que solo se pudieron aproximar. */
  aproximadas: number[]
  complejas: E[]
  /** Hay familias con k ∈ ℤ. */
  periodica: boolean
  nota?: string
}

const K = s('k')

const vacia = (): Solucion => ({ exactas: [], aproximadas: [], complejas: [], periodica: false })

function ordenar(sol: Solucion): Solucion {
  const vistas = new Set<string>()
  sol.exactas = sol.exactas.filter((x) => {
    const k = clave(x)
    if (vistas.has(k)) return false
    vistas.add(k)
    return true
  })
  sol.exactas.sort((a, b) => evaluar(a, { k: 0 }) - evaluar(b, { k: 0 }))
  sol.aproximadas.sort((a, b) => a - b)
  return sol
}

/** Raíces de a·x² + b·x + c con coeficientes cualesquiera. */
function cuadratica(a: E, b: E, c: E): { reales: E[]; complejas: E[] } {
  const disc = simplificar(suma(pot(b, DOS), prod(q(-4), a, c)))
  const dosA = pot(prod(DOS, a), MENOS)
  const menosB = prod(MENOS, b)
  if (esNum(disc) && valor(disc) < 0) {
    const im = prod(pot(prod(MENOS, disc), MEDIO), dosA)
    const re = simplificar(prod(menosB, dosA))
    return { reales: [], complejas: [suma(re, prod(MENOS, im, s('i'))), suma(re, prod(im, s('i')))] }
  }
  if (esCero(disc)) return { reales: [simplificar(prod(menosB, dosA))], complejas: [] }
  const raiz = pot(disc, MEDIO)
  return {
    reales: [simplificar(prod(suma(menosB, prod(MENOS, raiz)), dosA)), simplificar(prod(suma(menosB, raiz), dosA))],
    complejas: [],
  }
}

/** Cuántas veces aparece x en el árbol. */
function apariciones(e: E, x: string): number {
  switch (e.t) {
    case 's':
      return e.v === x ? 1 : 0
    case '+':
    case '*':
    case 'fn':
      return e.a.reduce((n, y) => n + apariciones(y, x), 0)
    case '^':
      return apariciones(e.b, x) + apariciones(e.e, x)
    default:
      return 0
  }
}

/**
 * Despeja x cuando aparece una sola vez: se deshace capa a capa lo que la
 * envuelve. Las trigonométricas dan familias con k ∈ ℤ.
 */
function despejar(lado: E, otro: E, x: string, sol: Solucion): boolean {
  let ramas: Array<[E, E]> = [[lado, otro]]
  for (let paso = 0; paso < 40; paso++) {
    const siguientes: Array<[E, E]> = []
    let todas = true
    for (const [l, o] of ramas) {
      if (l.t === 's' && l.v === x) {
        siguientes.push([l, o])
        continue
      }
      todas = false
      const conX = (y: E) => contiene(y, x)
      if (l.t === '+') {
        const dentro = l.a.find(conX)!
        siguientes.push([dentro, suma(o, prod(MENOS, suma(...l.a.filter((y) => y !== dentro))))])
      } else if (l.t === '*') {
        const dentro = l.a.find(conX)!
        siguientes.push([dentro, prod(o, pot(prod(...l.a.filter((y) => y !== dentro)), MENOS))])
      } else if (l.t === '^') {
        if (conX(l.b)) {
          if (!esNum(l.e)) return false
          const inv = pot(o, pot(l.e, MENOS))
          siguientes.push([l.b, inv])
          // xⁿ = c con n par: también −ⁿ√c
          if (l.e.t === 'q' && l.e.n % 2n === 0n && l.e.d === 1n) siguientes.push([l.b, prod(MENOS, inv)])
        } else siguientes.push([l.e, prod(fn('ln', [o]), pot(fn('ln', [l.b]), MENOS))])
      } else if (l.t === 'fn') {
        const u = l.a[0]
        const v = contiene(o, 'k') ? NaN : evaluar(o)
        const fuera = (a: number) => Number.isFinite(v) && Math.abs(v) > a
        switch (l.v) {
          case 'ln':
            siguientes.push([u, pot(NEPER, o)])
            break
          case 'sin': {
            if (fuera(1)) continue
            const a = fn('asin', [o])
            siguientes.push([u, suma(a, prod(DOS, K, PI))], [u, suma(PI, prod(MENOS, a), prod(DOS, K, PI))])
            sol.periodica = true
            break
          }
          case 'cos': {
            if (fuera(1)) continue
            const a = fn('acos', [o])
            siguientes.push([u, suma(a, prod(DOS, K, PI))], [u, suma(prod(MENOS, a), prod(DOS, K, PI))])
            sol.periodica = true
            break
          }
          case 'tan':
            siguientes.push([u, suma(fn('atan', [o]), prod(K, PI))])
            sol.periodica = true
            break
          case 'asin':
            siguientes.push([u, fn('sin', [o])])
            break
          case 'acos':
            siguientes.push([u, fn('cos', [o])])
            break
          case 'atan':
            siguientes.push([u, fn('tan', [o])])
            break
          case 'sinh':
            siguientes.push([u, fn('asinh', [o])])
            break
          case 'cosh':
            if (Number.isFinite(v) && v < 1) continue
            siguientes.push([u, fn('acosh', [o])], [u, prod(MENOS, fn('acosh', [o]))])
            break
          case 'tanh':
            siguientes.push([u, fn('atanh', [o])])
            break
          case 'abs':
            if (Number.isFinite(v) && v < 0) continue
            siguientes.push([u, o], [u, prod(MENOS, o)])
            break
          default:
            return false
        }
      } else return false
    }
    ramas = siguientes
    if (todas) break
  }
  for (const [, o] of ramas) {
    const v = simplificar(o)
    const n = evaluar(v, { k: 0 })
    // una rama que no da un real (ln de un negativo, √ de negativo) no es solución
    if (!simbolos(v).size || [...simbolos(v)].every((z) => z === 'k')) {
      if (!Number.isFinite(n)) continue
    }
    sol.exactas.push(v)
  }
  return true
}

/** Raíces reales por barrido y bisección, reconocidas si se puede. */
function numerica(F: E, x: string, sol: Solucion) {
  const f = (t: number) => evaluar(F, { [x]: t })
  const a = -100
  const b = 100
  const n = 40000
  let prev = f(a)
  for (let i = 1; i <= n; i++) {
    const t = a + ((b - a) * i) / n
    const v = f(t)
    if (Number.isFinite(prev) && Number.isFinite(v) && prev * v <= 0) {
      let lo = t - (b - a) / n
      let hi = t
      for (let k = 0; k < 100; k++) {
        const m = (lo + hi) / 2
        if (f(lo) * f(m) <= 0) hi = m
        else lo = m
      }
      const raiz = (lo + hi) / 2
      // un cambio de signo por un polo no es una raíz
      if (Math.abs(f(raiz)) < 1e-6 && !sol.aproximadas.some((y) => Math.abs(y - raiz) < 1e-7)) {
        const exacta = identificar(raiz)
        if (exacta && Math.abs(evaluar(sustituir(F, s(x), exacta))) < 1e-9) sol.exactas.push(exacta)
        else sol.aproximadas.push(raiz)
      }
    }
    prev = v
  }
  sol.nota = 'numérico: raíces reales en [−100, 100]'
}

export function resolver(F0: E, x: string): Solucion {
  const sol = vacia()
  let F = simplificar(F0)
  if (esCero(F)) return { ...sol, nota: 'se cumple para todo x' }
  if (!contiene(F, x)) return { ...sol, nota: 'no depende de ' + x }

  // un cociente se anula donde lo hace el numerador (y no el denominador)
  const soloX = [...simbolos(F)].every((v) => v === x)
  let denominador: E | null = null
  if (soloX) {
    const rac = racional(F, x)
    if (rac && rac[1].length > 1) {
      F = aExpr(rac[0], x)
      denominador = aExpr(rac[1], x)
    }
  }
  const valido = (r: E) => !denominador || Math.abs(evaluar(sustituir(denominador, s(x), r))) > 1e-12

  const p = soloX ? polinomio(F, x) : null
  if (p) {
    for (const { p: f } of factorizarP(p).factores) {
      const g = grado(f)
      const c = (k: number) => q(f[k].n, f[k].d)
      if (g === 1) sol.exactas.push(prod(MENOS, c(0), pot(c(1), MENOS)))
      else if (g === 2) {
        const r = cuadratica(c(2), c(1), c(0))
        sol.exactas.push(...r.reales)
        sol.complejas.push(...r.complejas)
      } else if (f.filter((c) => c.n !== 0n).length === 2 && f[0].n !== 0n) {
        // a·xⁿ + b = 0: se despeja exacta, ⁿ√(−b/a)
        despejar(aExpr(f, x), CERO, x, sol)
      } else {
        sol.aproximadas.push(...raicesReales(f))
        sol.nota = 'factores de grado ≥ 3 sin raíces racionales: aproximadas'
      }
    }
    sol.exactas = sol.exactas.filter(valido)
    return ordenar(sol)
  }

  // polinomio de grado 1 o 2 en x con coeficientes simbólicos
  const des = desarrollar(F)
  const coef = coeficientes(des, x)
  if (coef && coef.length <= 3) {
    if (coef.length === 2) sol.exactas.push(simplificar(prod(MENOS, coef[0], pot(coef[1], MENOS))))
    else {
      const r = cuadratica(coef[2], coef[1], coef[0])
      sol.exactas.push(...r.reales)
      sol.complejas.push(...r.complejas)
    }
    return ordenar(sol)
  }

  if (apariciones(F, x) === 1 && despejar(F, CERO, x, sol)) return ordenar(sol)
  if (soloX) numerica(F, x, sol)
  else sol.nota = 'no sé despejarla con parámetros'
  sol.exactas = sol.exactas.filter(valido)
  return ordenar(sol)
}

/** Coeficientes de un polinomio en x con coeficientes simbólicos (sin x dentro). */
function coeficientes(e: E, x: string): E[] | null {
  const out: E[][] = []
  for (const t of e.t === '+' ? e.a : [e]) {
    const [c, resto] = partirTermino(t)
    const fs = !resto ? [] : resto.t === '*' ? resto.a : [resto]
    let k = 0
    const otros: E[] = [c]
    for (const f of fs) {
      if (f.t === 's' && f.v === x) k += 1
      else if (f.t === '^' && f.b.t === 's' && f.b.v === x && f.e.t === 'q' && f.e.d === 1n && f.e.n > 0n) k += Number(f.e.n)
      else if (contiene(f, x)) return null
      else otros.push(f)
    }
    while (out.length <= k) out.push([])
    out[k].push(prod(...otros))
  }
  return out.map((ts) => simplificar(suma(...ts)))
}

/* ---------- sistemas lineales ---------- */

export type SolucionSistema =
  | { tipo: 'unica'; valores: E[] }
  | { tipo: 'infinitas'; valores: E[]; libres: string[] }
  | { tipo: 'incompatible' }

export function resolverSistema(ecs: E[], vars: string[]): SolucionSistema {
  // cada ecuación como fila [a₁ … aₙ | −término independiente]
  const cero = Object.fromEntries(vars.map((v) => [v, CERO]))
  const filas = ecs.map((F) => {
    const fila = vars.map((v) => {
      const a = simplificar(derivar(F, v))
      if (vars.some((w) => contiene(a, w))) throw new Error('solo sé resolver sistemas lineales')
      return a
    })
    let independiente = F
    for (const v of vars) independiente = sustituir(independiente, s(v), cero[v])
    return [...fila, simplificar(prod(MENOS, independiente))]
  })
  const n = vars.length
  const pivotes: number[] = []
  let f = 0
  for (let c = 0; c < n && f < filas.length; c++) {
    const p = filas.findIndex((fila, i) => i >= f && !esCero(simplificar(fila[c])))
    if (p < 0) continue
    ;[filas[f], filas[p]] = [filas[p], filas[f]]
    const inv = pot(filas[f][c], MENOS)
    filas[f] = filas[f].map((y) => simplificar(prod(y, inv)))
    for (let i = 0; i < filas.length; i++) {
      if (i === f || esCero(filas[i][c])) continue
      const k = filas[i][c]
      filas[i] = filas[i].map((y, j) => simplificar(suma(y, prod(MENOS, k, filas[f][j]))))
    }
    pivotes.push(c)
    f++
  }
  for (let i = f; i < filas.length; i++) if (!esCero(simplificar(filas[i][n]))) return { tipo: 'incompatible' }
  const libres = vars.filter((_, c) => !pivotes.includes(c))
  const valores = vars.map((v, c) => {
    const i = pivotes.indexOf(c)
    if (i < 0) return s(v)
    return simplificar(suma(filas[i][n], ...libres.map((l) => prod(MENOS, filas[i][vars.indexOf(l)], s(l)))))
  })
  return libres.length ? { tipo: 'infinitas', valores, libres } : { tipo: 'unica', valores }
}

