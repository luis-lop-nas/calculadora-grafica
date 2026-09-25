/**
 * Montajes mecánicos por piezas: soportes, cuerpos colgados de varillas, muelles o raíles,
 * ruedas que ruedan, poleas con cuerda y muelles entre cuerpos. De la pieza a su posición
 * en función de las coordenadas generalizadas, y de ahí T, V y L = T − V con el CAS, en el
 * mismo texto que se escribe a mano en el módulo del lagrangiano.
 */
import { clave, contiene, desdeNodo, simbolos, fn, partirTermino, prod, suma, pot, q as racional, s as sim, type E } from './cas/expr'
import { derivar } from './cas/derivar'
import { desarrollar, factorComun, simplificar } from './cas/algebra'
import { compilarE } from './cas/compilar'
import { analizar } from './expresion'
import { vel } from './mecanica'

export interface Soporte {
  id: string
  x: number
  y: number
}

export type Forma = 'caja' | 'bola' | 'disco' | 'aro'

export type Ligadura =
  /** Péndulo: varilla rígida de longitud l desde el padre; θ desde la vertical hacia abajo. */
  | { tipo: 'varilla'; l: number; q0: number; v0: number }
  /** Raíl recto por el padre con inclinación `ang` (grados); s a lo largo. Con `rueda`, rueda sin deslizar. */
  | { tipo: 'rail'; ang: number; q0: number; v0: number; rueda: boolean }
  /** Muelle desde el padre: con `eje` solo se estira en la dirección `ang`; si no, también oscila (r, θ). */
  | { tipo: 'muelle'; k: number; l0: number; eje: boolean; ang: number; r0: number; th0: number; vr0: number; vth0: number }
  /** Libre en el plano: x, y. */
  | { tipo: 'libre'; x0: number; y0: number; vx0: number; vy0: number }
  /** Cuelga de un lado de una polea (la coordenada es la de la polea). */
  | { tipo: 'polea'; polea: string; lado: 'izq' | 'der' }

export interface Cuerpo {
  id: string
  nombre: string
  forma: Forma
  m: number
  /** Radio para dibujar y, en las ruedas, para rodar. */
  R: number
  /** Soporte o cuerpo del que cuelga; null = el origen. */
  padre: string | null
  lig: Ligadura
}

export interface LadoPolea {
  /** Dirección de la cuerda al salir de la polea, en grados (−90 = cuelga hacia abajo). */
  ang: number
  /** Cuerda en ese lado con s = 0. */
  d0: number
}

export interface Polea {
  id: string
  x: number
  y: number
  R: number
  /** Masa de la polea (disco): aporta ¼ M ṡ². */
  M: number
  izq: LadoPolea
  der: LadoPolea
  s0: number
  v0: number
}

export interface Resorte {
  id: string
  a: string
  b: string
  k: number
  l0: number
}

export interface Montaje {
  g: number
  soportes: Soporte[]
  cuerpos: Cuerpo[]
  poleas: Polea[]
  resortes: Resorte[]
}

/** Lo que sale de un montaje: el texto para el módulo y lo necesario para dibujarlo. */
export interface Generado {
  coords: string[]
  L: string
  T: E
  V: E
  Lexpr: E
  params: Record<string, number>
  ci: Record<string, number>
  /** Posición de cada cuerpo (texto), en el orden de `cuerpos`. */
  pos: Array<{ id: string; x: E; y: E }>
  /** Energía cinética de cada cuerpo (con su rotación). */
  Tcuerpo: Array<{ id: string; T: E }>
  /** Coordenada que usa cada cuerpo o polea. */
  coordDe: Record<string, string[]>
  /** Topes físicos (una cuerda que se acaba, un muelle a longitud 0): ahí se para la simulación. */
  limites: Array<{ q: string; min?: number; max?: number; texto: string }>
}

const ANGULOS = ['theta', 'phi', 'psi', 'alpha', 'beta', 'gamma']
const LONGITUDES = ['x', 's', 'u', 'w', 'z', 'y', 'r', 'v']

/** Factor de inercia I = c·m·R² según la forma (lo que rueda). */
export const INERCIA: Record<Forma, number> = { caja: 0, bola: 2 / 5, disco: 1 / 2, aro: 1 }

const fmt = (v: number) => {
  const t = fmt0(v)
  return t.startsWith('-') ? `(${t})` : t
}
const fmt0 = (v: number) => {
  const r = Math.round(v * 1e6) / 1e6
  return Object.is(r, -0) ? '0' : String(r)
}

/** cos y sin de un ángulo en grados: exactos en los múltiplos de 90°, si no simbólicos con su parámetro. */
function trig(ang: number, nombre: string, params: Record<string, number>): [string, string] {
  const r = ((ang % 360) + 360) % 360
  if (r === 0) return ['1', '0']
  if (r === 90) return ['0', '1']
  if (r === 180) return ['(-1)', '0']
  if (r === 270) return ['0', '(-1)']
  params[nombre] = (ang * Math.PI) / 180
  return [`cos(${nombre})`, `sin(${nombre})`]
}

function leer(src: string, variables: string[]): E {
  return desdeNodo(analizar(src, { variables }), { funciones: {}, valores: {} })
}

/** Orden en que se pueden resolver: cada cuerpo después de su padre. */
function ordenar(mt: Montaje): Cuerpo[] {
  const hecho = new Set<string>(mt.soportes.map((s) => s.id))
  const out: Cuerpo[] = []
  let quedan = [...mt.cuerpos]
  while (quedan.length) {
    const listos = quedan.filter((c) => c.lig.tipo === 'polea' || c.lig.tipo === 'libre' || c.padre === null || hecho.has(c.padre))
    if (!listos.length) throw new Error('hay cuerpos que cuelgan unos de otros en círculo')
    for (const c of listos) {
      out.push(c)
      hecho.add(c.id)
    }
    quedan = quedan.filter((c) => !listos.includes(c))
  }
  return out
}

export function generar(mt: Montaje): Generado {
  const params: Record<string, number> = { g: mt.g }
  const ci: Record<string, number> = {}
  const coords: string[] = []
  const coordDe: Record<string, string[]> = {}
  const angulos = [...ANGULOS]
  const longitudes = [...LONGITUDES]
  /** Coordenada nueva: la primera libre de las preferidas para esa pieza, o la siguiente de su lista. */
  const nueva = (angulo: boolean, preferidas: string[] = []) => {
    const lista = angulo ? angulos : longitudes
    const n = preferidas.find((p) => lista.includes(p)) ?? lista[0]
    if (!n) throw new Error('demasiadas coordenadas')
    lista.splice(lista.indexOf(n), 1)
    coords.push(n)
    return n
  }
  const posTexto = new Map<string, [string, string]>()
  for (const s of mt.soportes) posTexto.set(s.id, [fmt(s.x), fmt(s.y)])
  const T: string[] = []
  const Vtxt: string[] = []
  /** Energía elástica: se deja escrita como ½k(r − l)², sin desarrollar. */
  const Vmuelles: string[] = []
  const Tcuerpo: Array<{ id: string; T: string }> = []
  const indice = new Map(mt.cuerpos.map((c, i) => [c.id, i + 1]))
  const limites: Generado['limites'] = []

  // las poleas primero: su coordenada la comparten los dos lados
  const poleaPos = new Map<string, { izq: [string, string] | null; der: [string, string] | null }>()
  mt.poleas.forEach((p, j) => {
    const lados = mt.cuerpos.filter((c) => c.lig.tipo === 'polea' && c.lig.polea === p.id)
    if (!lados.length) return
    const s = nueva(false)
    coordDe[p.id] = [s]
    ci[s] = p.s0
    ci[vel(s)] = p.v0
    const lado = (l: LadoPolea, izq: boolean): [string, string] => {
      const a = (l.ang * Math.PI) / 180
      const d = [Math.cos(a), Math.sin(a)]
      // punto de tangencia: la normal a la cuerda hacia fuera de su lado
      const n = izq ? [d[1], -d[0]] : [-d[1], d[0]]
      const tx = p.x + p.R * n[0]
      const ty = p.y + p.R * n[1]
      const sg = izq ? '+' : '-'
      // la dirección, simbólica si no es recta: así cos² + sin² = 1 sale exacto
      const [co, se] = trig(l.ang, `${izq ? 'ai' : 'ad'}${j + 1}`, params)
      const tramo = `(${fmt(l.d0)} ${sg} ${s})`
      limites.push(izq ? { q: s, min: -l.d0, texto: 'la cuerda de la izquierda se acaba' } : { q: s, max: l.d0, texto: 'la cuerda de la derecha se acaba' })
      return [`${fmt(tx)} + ${tramo}*${co}`, `${fmt(ty)} + ${tramo}*${se}`]
    }
    poleaPos.set(p.id, { izq: lado(p.izq, true), der: lado(p.der, false) })
    if (p.M > 0) {
      params[`mp${j + 1}`] = p.M
      T.push(`mp${j + 1}/4*${s}'^2`)
    }
  })

  for (const c of ordenar(mt)) {
    const i = indice.get(c.id)!
    const m = `m${i}`
    params[m] = c.m
    const padre = c.padre === null ? ['0', '0'] : posTexto.get(c.padre)
    if (!padre && c.lig.tipo !== 'polea' && c.lig.tipo !== 'libre') throw new Error(`${c.nombre}: no encuentro de qué cuelga`)
    const [px, py] = padre ?? ['0', '0']
    let x: string
    let y: string
    let rot = ''
    const lg = c.lig
    switch (lg.tipo) {
      case 'varilla': {
        const th = nueva(true)
        coordDe[c.id] = [th]
        params[`l${i}`] = lg.l
        x = `${px} + l${i}*sin(${th})`
        y = `${py} - l${i}*cos(${th})`
        ci[th] = (lg.q0 * Math.PI) / 180
        ci[vel(th)] = lg.v0
        break
      }
      case 'rail': {
        const s = nueva(false)
        coordDe[c.id] = [s]
        const [co, se] = trig(lg.ang, `a${i}`, params)
        // una rueda va con su centro a R por encima del raíl
        const nx = lg.rueda ? fmt(-c.R * Math.sin((lg.ang * Math.PI) / 180)) : '0'
        const ny = lg.rueda ? fmt(c.R * Math.cos((lg.ang * Math.PI) / 180)) : '0'
        x = `${px} + ${nx} + ${s}*${co}`
        y = `${py} + ${ny} + ${s}*${se}`
        ci[s] = lg.q0
        ci[vel(s)] = lg.v0
        if (lg.rueda && INERCIA[c.forma] > 0) rot = `${fmt(INERCIA[c.forma])}/2*${m}*${s}'^2`
        break
      }
      case 'muelle': {
        params[`k${i}`] = lg.k
        params[`l${i}`] = lg.l0
        if (lg.eje) {
          const r = nueva(false, ['r', 'u', 'w'])
          coordDe[c.id] = [r]
          const [co, se] = trig(lg.ang, `a${i}`, params)
          x = `${px} + ${r}*${co}`
          y = `${py} + ${r}*${se}`
          ci[r] = lg.r0
          ci[vel(r)] = lg.vr0
          Vmuelles.push(`k${i}/2*(${r} - l${i})^2`)
          limites.push({ q: r, min: 0, texto: `el muelle de ${c.nombre} se comprime del todo` })
        } else {
          const r = nueva(false, ['r', 'u', 'w'])
          const th = nueva(true)
          coordDe[c.id] = [r, th]
          x = `${px} + ${r}*sin(${th})`
          y = `${py} - ${r}*cos(${th})`
          ci[r] = lg.r0
          ci[th] = (lg.th0 * Math.PI) / 180
          ci[vel(r)] = lg.vr0
          ci[vel(th)] = lg.vth0
          Vmuelles.push(`k${i}/2*(${r} - l${i})^2`)
        }
        break
      }
      case 'libre': {
        const a = nueva(false, ['x', 'u'])
        const b = nueva(false, ['y', 'w'])
        coordDe[c.id] = [a, b]
        x = a
        y = b
        ci[a] = lg.x0
        ci[b] = lg.y0
        ci[vel(a)] = lg.vx0
        ci[vel(b)] = lg.vy0
        break
      }
      case 'polea': {
        const pp = poleaPos.get(lg.polea)
        const lado = pp?.[lg.lado]
        if (!lado) throw new Error(`${c.nombre}: la polea no existe`)
        ;[x, y] = lado
        coordDe[c.id] = coordDe[lg.polea]
        break
      }
    }
    posTexto.set(c.id, [`(${x})`, `(${y})`])
    Vtxt.push(`${m}*g*(${y})`)
    Tcuerpo.push({ id: c.id, T: rot })
  }

  mt.resortes.forEach((r, j) => {
    const a = posTexto.get(r.a)
    const b = posTexto.get(r.b)
    if (!a || !b) return
    params[`kr${j + 1}`] = r.k
    params[`lr${j + 1}`] = r.l0
    Vmuelles.push(`kr${j + 1}/2*(sqrt((${a[0]} - ${b[0]})^2 + (${a[1]} - ${b[1]})^2) - lr${j + 1})^2`)
  })

  if (!coords.length) throw new Error('añade algún cuerpo que se pueda mover')
  if (coords.length > 4) throw new Error('como mucho cuatro coordenadas: quita algún cuerpo')

  // T = Σ ½ m |ṙ|² con ṙ = Σ ∂r/∂q · q̇, más las rotaciones
  const variables = [...coords, ...coords.map(vel), ...Object.keys(params), 't']
  const punto = (e: E) => suma(...coords.map((q) => prod(derivar(e, q), sim(vel(q)))))
  const pos: Generado['pos'] = []
  const Tc: Generado['Tcuerpo'] = []
  const Tterms: E[] = T.map((t) => leer(t, variables))
  for (const c of mt.cuerpos) {
    const [xs, ys] = posTexto.get(c.id)!
    const x = simplificar(leer(xs, variables))
    const y = simplificar(leer(ys, variables))
    pos.push({ id: c.id, x, y })
    const i = indice.get(c.id)!
    const extra = Tcuerpo.find((t) => t.id === c.id)!.T
    const tc = simplificar(suma(prod(racional(1, 2), sim(`m${i}`), suma(pot(punto(x), racional(2)), pot(punto(y), racional(2)))), ...(extra ? [leer(extra, variables)] : [])))
    Tc.push({ id: c.id, T: tc })
    Tterms.push(tc)
  }
  const Te = ordenar2(suma(...Tterms), (f) => [...simbolos(f)].some((v) => v.endsWith("'")))
  // las constantes de la gravitatoria no cambian nada: fuera
  const Vd = trigonometria(desarrollar(suma(...Vtxt.map((v) => leer(v, variables)))))
  const Vterms = terminos(Vd).filter((t) => coords.some((q) => contiene(t, q)))
  const Vg = ordenar2(suma(...Vterms), (f) => coords.some((q) => contiene(f, q)))
  const menosVg = ordenar2(prod(racional(-1), suma(...Vterms)), (f) => coords.some((q) => contiene(f, q)))
  const Vm = Vmuelles.map((v) => simplificar(leer(v, variables)))
  const Ve = suma(Vg, ...Vm)
  const Le = simplificar(suma(Te, prod(racional(-1), Ve)))
  if (coords.some((q) => !contiene(Te, vel(q)))) throw new Error('alguna coordenada no tiene energía cinética: ¿un cuerpo con masa 0?')
  // T y −V por separado, sin que la forma canónica los mezcle
  const partes: E[] = [...terminos(Te), ...(Vterms.length ? terminos(menosVg) : []), ...Vm.map((v) => prod(racional(-1), v))]
  const L = aTexto({ t: '+', a: partes })
  const Vmostrar: E = { t: '+', a: [...(Vterms.length ? terminos(Vg) : []), ...Vm] }
  return { coords, L, T: Te, V: Vmostrar.a.length === 1 ? Vmostrar.a[0] : Vmostrar.a.length ? Vmostrar : racional(0), Lexpr: Le, params, ci, pos, Tcuerpo: Tc, coordDe, limites }
}

/* ---------------------------------------------------------------- simplificación para leerla */

const terminos = (x: E) => (x.t === '+' ? x.a : [x])
const factores = (x: E): E[] => (x.t === '*' ? x.a : [x])
const esFn = (f: E, v: string, exp: number) =>
  exp === 1 ? f.t === 'fn' && f.v === v : f.t === '^' && f.e.t === 'q' && f.e.n === BigInt(exp) && f.e.d === 1n && f.b.t === 'fn' && f.b.v === v

/**
 * Identidades que el CAS no aplica solo y que aparecen siempre al derivar posiciones:
 * A cos²u + A sin²u = A y A cos u cos v + A sin u sin v = A cos(u − v).
 */
export function trigonometria(x: E): E {
  let ts = terminos(x)
  for (let vuelta = 0; vuelta < 50; vuelta++) {
    const claves = ts.map((t) => clave(t))
    let cambio = false
    for (let i = 0; i < ts.length && !cambio; i++) {
      const fs = factores(ts[i])
      for (let k = 0; k < fs.length && !cambio; k++) {
        const f = fs[k]
        const resto = fs.filter((_, j) => j !== k)
        if (esFn(f, 'cos', 2)) {
          const u = (f as Extract<E, { t: '^' }>).b as Extract<E, { t: 'fn' }>
          const pareja = clave(prod(...resto, pot(fn('sin', u.a), racional(2))))
          const j = claves.indexOf(pareja)
          if (j >= 0 && j !== i) {
            ts = [...ts.filter((_, n) => n !== i && n !== j), prod(...resto)]
            cambio = true
          }
        }
        if (cambio) break
        if (esFn(f, 'cos', 1)) {
          for (let l = k + 1; l < fs.length && !cambio; l++) {
            if (!esFn(fs[l], 'cos', 1)) continue
            const u = (f as Extract<E, { t: 'fn' }>).a[0]
            const v = (fs[l] as Extract<E, { t: 'fn' }>).a[0]
            const otros = fs.filter((_, j) => j !== k && j !== l)
            const pareja = clave(prod(...otros, fn('sin', [u]), fn('sin', [v])))
            const j = claves.indexOf(pareja)
            if (j >= 0 && j !== i) {
              ts = [...ts.filter((_, n) => n !== i && n !== j), prod(...otros, fn('cos', [suma(u, prod(racional(-1), v))]))]
              cambio = true
            }
          }
        }
      }
    }
    if (!cambio) break
  }
  return suma(...ts)
}

/**
 * Desarrolla, aplica las identidades y agrupa por la parte que cumple `clave` (las velocidades
 * en T, lo que depende de las coordenadas en V): ½(m₁ + m₂) l₁² θ̇² en vez de dos sumandos.
 */
function ordenar2(x: E, esClave: (f: E) => boolean): E {
  const d = trigonometria(desarrollar(x))
  const grupos = new Map<string, { k: E; resto: E[] }>()
  for (const t of terminos(d)) {
    const [c, r] = partirTermino(t)
    const fs = r ? factores(r) : []
    const kf = fs.filter(esClave)
    const rf = fs.filter((f) => !esClave(f))
    const k = prod(...kf)
    const id = clave(k)
    const g = grupos.get(id) ?? { k, resto: [] }
    g.resto.push(prod(c, ...rf))
    grupos.set(id, g)
  }
  return suma(...[...grupos.values()].map((g) => prod(factorComun(simplificar(suma(...g.resto))), g.k)))
}

/* ---------------------------------------------------------------- de E a texto */

function numTexto(x: E): string {
  if (x.t === 'q') return x.d === 1n ? String(x.n) : `${x.n}/${x.d}`
  if (x.t === 'f') return fmt0(x.v)
  return ''
}

const esNeg = (x: E): boolean =>
  (x.t === 'q' && x.n < 0n) || (x.t === 'f' && x.v < 0) || (x.t === '*' && x.a.length > 0 && esNeg(x.a[0]))

function neg(x: E): E {
  if (x.t === 'q') return racional(-x.n, x.d)
  if (x.t === 'f') return { t: 'f', v: -x.v }
  if (x.t === '*') {
    const [c, ...r] = x.a
    const nc = neg(c)
    if ((nc.t === 'q' && nc.n === 1n && nc.d === 1n) || (nc.t === 'f' && nc.v === 1)) return r.length === 1 ? r[0] : { t: '*', a: r }
    return { t: '*', a: [nc, ...r] }
  }
  return x
}

/** Expresión del CAS a texto que el analizador vuelve a leer igual (`theta'^2`, `m1*l1*cos(theta)`…). */
export function aTexto(x: E, prec = 0): string {
  const par = (t: string, p: number) => (p > prec ? t : `(${t})`)
  switch (x.t) {
    case 'q':
    case 'f': {
      const t = numTexto(x)
      return (x.t === 'q' && x.d !== 1n) || t.startsWith('-') ? (prec > 0 ? `(${t})` : t) : t
    }
    case 's':
      return x.v
    case 'fn':
      return `${x.v}(${x.a.map((a) => aTexto(a)).join(', ')})`
    case '+': {
      let out = ''
      // mejor empezar por un sumando positivo
      const a0 = [...x.a.filter((a) => !esNeg(a)), ...x.a.filter(esNeg)]
      a0.forEach((a, i) => {
        if (i === 0) out = esNeg(a) ? `-${aTexto(neg(a), 2)}` : aTexto(a, 1)
        else if (esNeg(a)) out += ` - ${aTexto(neg(a), 1)}`
        else out += ` + ${aTexto(a, 1)}`
      })
      return par(out, 1)
    }
    case '*': {
      if (esNeg(x)) return par(`-${aTexto(neg(x), 2)}`, 1)
      const arriba: string[] = []
      const abajo: string[] = []
      for (const f of x.a) {
        if (f.t === '^' && esNeg(f.e)) {
          const e = neg(f.e)
          abajo.push(e.t === 'q' && e.n === 1n && e.d === 1n ? aTexto(f.b, 3) : `${aTexto(f.b, 3)}^${aTexto(e, 3)}`)
        } else if (f.t === 'q' && f.d !== 1n) {
          if (f.n !== 1n) arriba.push(String(f.n))
          abajo.push(String(f.d))
        } else arriba.push(aTexto(f, 2))
      }
      let t = arriba.length ? arriba.join('*') : '1'
      if (abajo.length) t += '/' + (abajo.length > 1 ? `(${abajo.join('*')})` : abajo[0])
      return par(t, 2)
    }
    case '^': {
      const b = aTexto(x.b, 3)
      if (x.e.t === 'q' && x.e.n === 1n && x.e.d === 2n) return `sqrt(${aTexto(x.b)})`
      if (esNeg(x.e)) return par(`1/${esUnoNeg(x.e) ? b : `${b}^${aTexto(neg(x.e), 3)}`}`, 2)
      return `${b}^${aTexto(x.e, 3)}`
    }
  }
}

const esUnoNeg = (e: E) => e.t === 'q' && e.n === -1n && e.d === 1n

/** Posiciones compiladas: y = (q, q̇) ↦ (x, y) de cada cuerpo. */
export function posicionesNumericas(gen: Generado, params: Record<string, number>): Array<(y: number[]) => [number, number]> {
  const vars = gen.coords
  const buf = new Float64Array(vars.length)
  return gen.pos.map((p) => {
    const fx = compilarE(p.x, vars, params)
    const fy = compilarE(p.y, vars, params)
    return (y: number[]) => {
      for (let i = 0; i < vars.length; i++) buf[i] = y[i]
      return [fx(buf), fy(buf)]
    }
  })
}

/** Energía cinética y potencial compiladas en (q, q̇). */
export function energiasNumericas(gen: Generado, params: Record<string, number>) {
  const vars = [...gen.coords, ...gen.coords.map(vel)]
  const buf = new Float64Array(vars.length)
  const T = compilarE(gen.T, vars, params)
  const V = compilarE(gen.V, vars, params)
  const Tc = gen.Tcuerpo.map((t) => compilarE(t.T, vars, params))
  const cargar = (y: number[]) => {
    for (let i = 0; i < vars.length; i++) buf[i] = y[i]
  }
  return {
    T: (y: number[]) => (cargar(y), T(buf)),
    V: (y: number[]) => (cargar(y), V(buf)),
    Tcuerpo: (y: number[]) => (cargar(y), Tc.map((f) => f(buf))),
  }
}

/** Texto `nombre = valor, …` en el formato de los campos del módulo. */
export const listaValores = (v: Record<string, number>) =>
  Object.entries(v)
    .map(([k, x]) => `${k} = ${fmt0(x)}`)
    .join(', ')
