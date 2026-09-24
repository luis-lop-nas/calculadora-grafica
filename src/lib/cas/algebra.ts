import { clave, esEntero, fn, MENOS, mcd, negativo, partirTermino, pot, prod, q, reconstruir, simbolos, suma, UNO, type E } from './expr'
import {
  aExpr, comoPolinomio, divP, escalar, factorizacionAExpr, factorizarP, grado, mcdP, principalP, prodP, r, rDiv, sumaP, type P,
} from './polinomios'

const LIMITE_TERMINOS = 20000

/** Reparte productos y potencias enteras sobre las sumas; los denominadores se quedan como están. */
export function desarrollar(x: E): E {
  switch (x.t) {
    case '+':
      return suma(...x.a.map(desarrollar))
    case '*': {
      const partes = x.a.map(desarrollar)
      const arriba = partes.filter((f) => !(f.t === '^' && negativo(f.e)))
      const abajo = partes.filter((f) => f.t === '^' && negativo(f.e))
      return prod(repartir(arriba), ...abajo)
    }
    case '^': {
      const b = desarrollar(x.b)
      if (b.t === '+' && esEntero(x.e) && x.e.n > 1n) {
        if (x.e.n > 60n) throw new Error('la potencia es demasiado grande para desarrollarla')
        return repartir(Array.from({ length: Number(x.e.n) }, () => b))
      }
      if (b.t === '+' && esEntero(x.e) && x.e.n < -1n) return pot(repartir(Array.from({ length: Number(-x.e.n) }, () => b)), MENOS)
      return pot(b, desarrollar(x.e))
    }
    case 'fn':
      return fn(x.v, x.a.map(desarrollar))
    default:
      return x
  }
}

function repartir(factores: E[]): E {
  let terminos: E[] = [UNO]
  for (const f of factores) {
    const ts = f.t === '+' ? f.a : [f]
    if (terminos.length * ts.length > LIMITE_TERMINOS) throw new Error('el desarrollo tiene demasiados términos')
    const nuevo = suma(...terminos.flatMap((a) => ts.map((b) => prod(a, b))))
    terminos = nuevo.t === '+' ? nuevo.a : [nuevo]
  }
  return suma(...terminos)
}

/** Polinomio en x con coeficientes racionales, o null. */
export function polinomio(e: E, x: string): P | null {
  const vs = simbolos(e)
  if ([...vs].some((v) => v !== x)) return null
  try {
    return comoPolinomio(desarrollar(e), x)
  } catch {
    return null
  }
}

/** La expresión como cociente de polinomios en x, ya simplificado, o null. */
export function racional(e: E, x: string): [P, P] | null {
  const rec = (y: E): [P, P] | null => {
    switch (y.t) {
      case 'q':
        return [[r(y.n, y.d)], [r(1)]]
      case 's':
        return y.v === x ? [[r(0), r(1)], [r(1)]] : null
      case '+': {
        let acc: [P, P] = [[], [r(1)]]
        for (const t of y.a) {
          const z = rec(t)
          if (!z) return null
          acc = reducir([sumaP(prodP(acc[0], z[1]), prodP(z[0], acc[1])), prodP(acc[1], z[1])])
        }
        return acc
      }
      case '*': {
        let acc: [P, P] = [[r(1)], [r(1)]]
        for (const t of y.a) {
          const z = rec(t)
          if (!z) return null
          acc = reducir([prodP(acc[0], z[0]), prodP(acc[1], z[1])])
        }
        return acc
      }
      case '^': {
        if (!esEntero(y.e) || y.e.n > 60n || y.e.n < -60n) return null
        const z = rec(y.b)
        if (!z) return null
        const k = Number(y.e.n < 0n ? -y.e.n : y.e.n)
        let a: P = [r(1)]
        let b: P = [r(1)]
        for (let i = 0; i < k; i++) {
          a = prodP(a, z[0])
          b = prodP(b, z[1])
        }
        return y.e.n < 0n ? reducir([b, a]) : [a, b]
      }
      default:
        return null
    }
  }
  return rec(e)
}

/** Cancela el mcd y deja el denominador mónico. */
function reducir([n, d]: [P, P]): [P, P] {
  if (!d.length) throw new Error('división por cero')
  const g = mcdP(n, d)
  let a = n.length ? divP(n, g).c : n
  let b = divP(d, g).c
  const lc = principalP(b)
  a = escalar(a, rDiv(r(1), lc))
  b = escalar(b, rDiv(r(1), lc))
  return [a, b]
}

const tamano = (x: E) => clave(x).length

/**
 * Simplifica probando formas equivalentes y quedándose con la más corta: la
 * canónica, la desarrollada y, si es un cociente de polinomios en una
 * variable, la fracción ya cancelada.
 */
export function simplificar(x: E): E {
  const base = reconstruir(x)
  const candidatos: E[] = [base]
  try {
    candidatos.push(desarrollar(base))
  } catch {
    /* demasiado grande: se queda la canónica */
  }
  const vs = [...simbolos(base)]
  if (vs.length <= 1) {
    const v = vs[0] ?? 'x'
    const rac = racional(base, v)
    if (rac) {
      const [n, d] = rac
      candidatos.push(grado(d) <= 0 ? aExpr(n, v) : prod(aExpr(n, v), pot(factorizar(aExpr(d, v)), MENOS)))
    }
  }
  return candidatos.reduce((a, b) => (tamano(b) < tamano(a) ? b : a))
}

/* ---------- factorizar ---------- */

/** Saca lo común a todos los términos: el mcd numérico y las potencias de base compartida. */
export function factorComun(x: E): E {
  if (x.t !== '+') return x
  const partidos = x.a.map(partirTermino)
  let num = 0n
  let den = 1n
  for (const [c] of partidos) {
    if (c.t !== 'q') return x
    num = mcd(num, c.n)
    den = (den * c.d) / mcd(den, c.d)
  }
  // potencias: base → menor exponente numérico común a todos
  const potencias = (t: E | null) => {
    const m = new Map<string, { b: E; e: Extract<E, { t: 'q' }> }>()
    const fs = !t ? [] : t.t === '*' ? t.a : [t]
    for (const f of fs) {
      const [b, e] = f.t === '^' ? [f.b, f.e] : [f, UNO]
      if (e.t === 'q') m.set(clave(b), { b, e })
    }
    return m
  }
  const mapas = partidos.map(([, resto]) => potencias(resto))
  const comunes: E[] = []
  const v = (e: Extract<E, { t: 'q' }>) => Number(e.n) / Number(e.d)
  for (const [k, { b, e }] of mapas[0]) {
    if (!mapas.every((m) => m.has(k))) continue
    let minimo = e
    for (const m of mapas) if (v(m.get(k)!.e) < v(minimo)) minimo = m.get(k)!.e
    if (v(minimo) > 0) comunes.push(pot(b, minimo))
  }
  // si el primer término va con signo menos, el signo también sale
  const signo = negativo(x.a[0]) && x.a.every(negativo) ? -1n : 1n
  const F = prod(q(signo * (num || 1n), den), ...comunes)
  if (clave(F) === clave(UNO)) return x
  const dentro = suma(...x.a.map((t) => prod(t, pot(F, MENOS))))
  return prod(F, factorizar(dentro))
}

export function factorizar(x: E): E {
  const base = reconstruir(x)
  const vs = [...simbolos(base)]
  if (vs.length === 1) {
    const v = vs[0]
    const p = polinomio(base, v)
    if (p && p.length > 1) return factorizacionAExpr(factorizarP(p), v)
    const rac = racional(base, v)
    if (rac && rac[1].length > 1) {
      const [n, d] = rac
      return prod(n.length ? factorizacionAExpr(factorizarP(n), v) : q(0), pot(factorizacionAExpr(factorizarP(d), v), MENOS))
    }
  }
  const des = (() => {
    try {
      return desarrollar(base)
    } catch {
      return base
    }
  })()
  if (des.t === '+') {
    const f = factorComun(des)
    if (clave(f) !== clave(des)) return f
  }
  // un polinomio en una variable con coeficientes en otras: factor común y poco más
  if (base.t === '+') return factorComun(base)
  return base
}

