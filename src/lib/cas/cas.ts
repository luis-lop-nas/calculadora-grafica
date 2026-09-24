import { analizar, tex as texNodo, type Nodo } from '../expresion'
import { desdeNodo, esIndef, esNum, evaluar, flo, MENOS, prod, q, s, simbolos, suma, sustituir, type Definiciones, type E } from './expr'
import { tex, texConExponenciales } from './tex'
import { derivarN } from './derivar'
import { desarrollar, factorizar, simplificar } from './algebra'
import { resolver, resolverSistema, type Solucion } from './resolver'
import { limite, taylor, type Punto } from './limites'
import { laplace, laplaceInversa } from './laplace'
import { integrar } from './integrar'
import { definida } from './definida'

/**
 * La vista CAS: cada fila es una orden (derivar, integrar, resolver…), una
 * definición (f(x) := …, a := …), una ecuación suelta (se resuelve) o una
 * expresión (se simplifica). Las filas se ejecutan en orden y las definiciones
 * valen para las de debajo.
 */

export interface ResultadoFila {
  /** LaTeX de lo escrito, tal como se escribió. */
  entrada: string | null
  salida: string | null
  nota?: string
  error?: string
}

type Orden = (args: string[], ctx: Contexto) => ResultadoFila

interface Contexto {
  defs: Definiciones
  expr: (src: string) => E
  nodo: (src: string) => Nodo
}

const sinAcentos = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Parte por comas fuera de paréntesis y llaves. */
function argumentos(t: string): string[] {
  const out: string[] = []
  let prof = 0
  let ini = 0
  for (let i = 0; i < t.length; i++) {
    const c = t[i]
    if (c === '(' || c === '{') prof++
    else if (c === ')' || c === '}') prof--
    else if (c === ',' && prof === 0) {
      out.push(t.slice(ini, i).trim())
      ini = i + 1
    }
  }
  out.push(t.slice(ini).trim())
  return out.filter((a) => a !== '')
}

/** Posición del `=` de una ecuación (no el de <=, >=, ==, :=). */
function igual(t: string): number {
  let prof = 0
  for (let i = 0; i < t.length; i++) {
    const c = t[i]
    if (c === '(') prof++
    else if (c === ')') prof--
    else if (c === '=' && prof === 0 && !'<>=!:'.includes(t[i - 1] ?? '') && t[i + 1] !== '=') return i
  }
  return -1
}

const INFINITO = /^([+-]?)\s*(inf|infinito|infinity|∞|oo)$/i

function punto(t: string, ctx: Contexto): Punto {
  const m = t.trim().match(INFINITO)
  if (m) return m[1] === '-' ? '-inf' : 'inf'
  return ctx.expr(t)
}

const texPunto = (p: Punto) => (p === 'inf' ? '+\\infty' : p === '-inf' ? '-\\infty' : tex(p))

/** Variable por defecto: x si aparece, si no la única, si no la primera. */
function variable(e: E, dada?: string): string {
  if (dada) return dada.trim().toLowerCase()
  const vs = [...simbolos(e)]
  if (vs.includes('x')) return 'x'
  return vs.sort()[0] ?? 'x'
}

function ecuacion(t: string, ctx: Contexto): { F: E; texto: string } {
  const i = igual(t)
  if (i < 0) return { F: ctx.expr(t), texto: `${texNodo(ctx.nodo(t))} = 0` }
  const izq = t.slice(0, i)
  const der = t.slice(i + 1)
  return { F: suma(ctx.expr(izq), prod(MENOS, ctx.expr(der))), texto: `${texNodo(ctx.nodo(izq))} = ${texNodo(ctx.nodo(der))}` }
}

/** Un número exacto, y su decimal detrás si no es obvio. */
function conDecimal(e: E): string {
  const t = tex(e)
  if (simbolos(e).size || esIndef(e)) return t
  const v = evaluar(e)
  if (!Number.isFinite(v) || (e.t === 'q' && e.d === 1n) || e.t === 'f') return t
  return `${t} \\approx ${tex(flo(v))}`
}

function texSolucion(x: string, sol: Solucion): string {
  const v = tex(s(x))
  const partes = [
    ...sol.exactas.map((e) => `${v} = ${tex(e)}`),
    ...sol.aproximadas.map((n) => `${v} \\approx ${tex(flo(n))}`),
  ]
  if (!partes.length && !sol.complejas.length) return sol.nota === 'se cumple para todo x' ? '\\text{toda } ' + v : '\\text{sin soluciones reales}'
  const reales = partes.length ? partes.join(',\\quad ') : '\\text{sin soluciones reales}'
  const k = sol.periodica ? ',\\quad k \\in \\mathbb{Z}' : ''
  const complejas = sol.complejas.length ? `\\quad\\left(\\mathbb{C}: ${sol.complejas.map(tex).join(',\\ ')}\\right)` : ''
  return reales + k + complejas
}

const ORDENES: Record<string, Orden> = {
  derivar(a, ctx) {
    const f = ctx.expr(a[0])
    const x = variable(f, a[1])
    const n = a[2] ? Number(a[2]) : 1
    if (!Number.isInteger(n) || n < 1 || n > 12) throw new Error('el orden va de 1 a 12')
    const d = n === 1 ? `\\frac{d}{d${x}}` : `\\frac{d^{${n}}}{d${x}^{${n}}}`
    return { entrada: `${d}\\left[${texNodo(ctx.nodo(a[0]))}\\right]`, salida: tex(simplificar(derivarN(f, x, n))) }
  },
  integrar(a, ctx) {
    const f = ctx.expr(a[0])
    const x = variable(f, a[1])
    const integrando = texNodo(ctx.nodo(a[0]))
    const F = integrar(f, x)
    if (a.length < 4) {
      if (!F) throw new Error('no encuentro primitiva elemental (ni con partes, cambio de variable ni fracciones simples)')
      return { entrada: `\\int ${integrando}\\,d${x}`, salida: `${tex(F)} + C` }
    }
    const [lo, hi] = [punto(a[2], ctx), punto(a[3], ctx)]
    const entrada = `\\int_{${texPunto(lo)}}^{${texPunto(hi)}} ${integrando}\\,d${x}`
    const r = definida(f, x, lo, hi)
    if (r.tipo === 'diverge') return { entrada, salida: '\\text{diverge}', nota: r.nota }
    return { entrada, salida: conDecimal(r.v), nota: r.nota }
  },
  simplificar(a, ctx) {
    return { entrada: `\\operatorname{simplificar}\\left(${texNodo(ctx.nodo(a[0]))}\\right)`, salida: conDecimal(simplificar(ctx.expr(a[0]))) }
  },
  desarrollar(a, ctx) {
    return { entrada: `\\operatorname{desarrollar}\\left(${texNodo(ctx.nodo(a[0]))}\\right)`, salida: tex(desarrollar(ctx.expr(a[0]))) }
  },
  factorizar(a, ctx) {
    return { entrada: `\\operatorname{factorizar}\\left(${texNodo(ctx.nodo(a[0]))}\\right)`, salida: tex(factorizar(ctx.expr(a[0]))) }
  },
  resolver(a, ctx) {
    if (a[0].startsWith('{')) {
      const ecs = argumentos(a[0].slice(1, -1)).map((t) => ecuacion(t, ctx))
      const vars = a[1] ? argumentos(a[1].replace(/^\{|\}$/g, '')).map((v) => v.toLowerCase()) : [...new Set(ecs.flatMap((e) => [...simbolos(e.F)]))].sort()
      const r = resolverSistema(ecs.map((e) => e.F), vars)
      const entrada = `\\begin{cases} ${ecs.map((e) => e.texto).join(' \\\\ ')} \\end{cases}`
      if (r.tipo === 'incompatible') return { entrada, salida: '\\text{incompatible: sin solución}' }
      const libres = r.tipo === 'infinitas' ? r.libres : []
      const salida = vars.map((v, i) => (libres.includes(v) ? `${tex(s(v))} \\in \\mathbb{R}` : `${tex(s(v))} = ${tex(r.valores[i])}`)).join(',\\quad ')
      return { entrada, salida, nota: r.tipo === 'infinitas' ? `compatible indeterminado: ${r.libres.join(', ')} libre${r.libres.length > 1 ? 's' : ''}` : undefined }
    }
    const { F, texto } = ecuacion(a[0], ctx)
    const x = variable(F, a[1])
    const sol = resolver(F, x)
    return { entrada: texto, salida: texSolucion(x, sol), nota: sol.nota }
  },
  limite(a, ctx) {
    const f = ctx.expr(a[0])
    const x = variable(f, a[1])
    if (!a[2]) throw new Error('falta el punto: límite(f, x, a)')
    const p = punto(a[2], ctx)
    const entrada = `\\lim_{${tex(s(x))} \\to ${texPunto(p)}} ${texNodo(ctx.nodo(a[0]))}`
    const l = limite(f, x, p)
    if (l.tipo === 'infinito') return { entrada, salida: l.signo > 0 ? '+\\infty' : '-\\infty' }
    if (l.tipo === 'no existe')
      return { entrada, salida: '\\text{no existe}', nota: l.izquierda ? `por la izquierda ${l.izquierda}, por la derecha ${l.derecha}` : l.derecha }
    const origen = l.numerico ? (esNum(l.v) && l.v.t === 'f' ? 'estimación numérica' : 'reconocido a partir de la estimación numérica') : undefined
    return { entrada, salida: conDecimal(l.v), nota: [l.nota, origen].filter(Boolean).join(' · ') || undefined }
  },
  taylor(a, ctx) {
    const f = ctx.expr(a[0])
    const x = variable(f, a[1])
    const p = a[2] ? ctx.expr(a[2]) : q(0)
    const n = a[3] ? Number(a[3]) : 5
    if (!Number.isInteger(n) || n < 0) throw new Error('el grado tiene que ser un entero')
    return {
      entrada: `T_{${n}}\\!\\left[${texNodo(ctx.nodo(a[0]))}\\right]_{${tex(s(x))} = ${tex(p)}}`,
      salida: tex(taylor(f, x, p, n)),
    }
  },
  numerico(a, ctx) {
    const e = simplificar(ctx.expr(a[0]))
    const v = evaluar(e)
    if (!Number.isFinite(v)) throw new Error(simbolos(e).size ? 'tiene variables sin valor' : 'no es un número real')
    return { entrada: `\\operatorname{N}\\left(${texNodo(ctx.nodo(a[0]))}\\right)`, salida: String(+v.toPrecision(15)).replace('.', '{,}') }
  },
  laplace(a, ctx) {
    const r = laplace(ctx.expr(a[0]))
    return {
      entrada: String.raw`\mathcal{L}\left\{${texNodo(ctx.nodo(a[0]))}\right\}(s)`,
      salida: texConExponenciales(r.resultado),
      nota: r.verificada ? `comprobada con ∫₀^∞ f e^{−st} dt (error ${r.error.toExponential(0)})` : `¡no cuadra con la integral numérica! (error ${r.error.toExponential(1)})`,
    }
  },
  ilaplace(a, ctx) {
    const r = laplaceInversa(ctx.expr(a[0]))
    return {
      entrada: String.raw`\mathcal{L}^{-1}\left\{${texNodo(ctx.nodo(a[0]))}\right\}(t)`,
      salida: texConExponenciales(r.resultado),
      nota: [r.aproximada ? 'raíces sin forma cerrada: coeficientes decimales' : '', r.verificada ? `comprobada transformándola de vuelta (error ${r.error.toExponential(0)})` : '¡no cuadra al transformarla de vuelta!'].filter(Boolean).join(' · '),
    }
  },
  sustituir(a, ctx) {
    const e = ctx.expr(a[0])
    if (a.length < 3) throw new Error('sustituir(expresión, variable, valor)')
    const r = simplificar(sustituir(e, s(a[1].trim().toLowerCase()), ctx.expr(a[2])))
    return { entrada: `\\left.${texNodo(ctx.nodo(a[0]))}\\right|_{${a[1].trim()} = ${tex(ctx.expr(a[2]))}}`, salida: conDecimal(r) }
  },
}

const ALIAS: Record<string, string> = {
  derivada: 'derivar', derivative: 'derivar', d: 'derivar',
  integral: 'integrar', integrate: 'integrar',
  simplify: 'simplificar', expand: 'desarrollar', expandir: 'desarrollar', factor: 'factorizar',
  solve: 'resolver', limit: 'limite', lim: 'limite', series: 'taylor',
  n: 'numerico', numeric: 'numerico', decimal: 'numerico', substitute: 'sustituir', subs: 'sustituir',
  transformada: 'laplace', inversa: 'ilaplace', laplaceinversa: 'ilaplace', invlaplace: 'ilaplace',
}

export const ORDENES_DISPONIBLES = Object.keys(ORDENES)

export function ejecutar(filas: string[]): ResultadoFila[] {
  const defs: Definiciones = { funciones: {}, valores: {} }
  const nodo = (src: string) => analizar(src, { funciones: Object.keys(defs.funciones) })
  const ctx: Contexto = { defs, nodo, expr: (src) => desdeNodo(nodo(src), defs, (e, v) => derivarN(e, v, 1)) }

  return filas.map((src): ResultadoFila => {
    const t = src.trim()
    if (!t) return { entrada: null, salida: null }
    try {
      // f(x) := … o f(x) = …
      const fdef = t.match(/^([A-Za-z][A-Za-z0-9_]*)\s*\(\s*([A-Za-z])\s*\)\s*:?=\s*(.+)$/)
      if (fdef && !(sinAcentos(fdef[1]) in ORDENES) && !(sinAcentos(fdef[1]) in ALIAS)) {
        const nombre = fdef[1].toLowerCase()
        const v = fdef[2].toLowerCase()
        const cuerpo = simplificar(ctx.expr(fdef[3]))
        defs.funciones[nombre] = { v, cuerpo }
        return { entrada: `${nombre}(${v}) := ${texNodo(nodo(fdef[3]))}`, salida: `${nombre}(${v}) = ${tex(cuerpo)}`, nota: 'definida' }
      }
      const vdef = t.match(/^([A-Za-z][A-Za-z0-9_]*)\s*:=\s*(.+)$/)
      if (vdef) {
        const nombre = vdef[1].toLowerCase()
        const valorE = simplificar(ctx.expr(vdef[2]))
        defs.valores[nombre] = valorE
        return { entrada: `${nombre} := ${texNodo(nodo(vdef[2]))}`, salida: `${nombre} = ${conDecimal(valorE)}`, nota: 'definida' }
      }
      const orden = t.match(/^([A-Za-zÁÉÍÓÚáéíóúñÑ]+)\s*\((.*)\)\s*$/s)
      if (orden) {
        const nombre = sinAcentos(orden[1])
        const clave2 = ALIAS[nombre] ?? nombre
        if (clave2 in ORDENES) {
          const args = argumentos(orden[2])
          if (!args.length) throw new Error('faltan los argumentos')
          return ORDENES[clave2](args, ctx)
        }
      }
      if (igual(t) >= 0) return ORDENES.resolver([t], ctx)
      const e = ctx.expr(t)
      const r = simplificar(e)
      return { entrada: texNodo(nodo(t)), salida: conDecimal(r) }
    } catch (err) {
      return { entrada: null, salida: null, error: (err as Error).message }
    }
  })
}

