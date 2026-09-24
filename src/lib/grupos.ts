/** Grupo finito dado por sus elementos y la tabla de la operación (índices). */
export interface Grupo {
  nombre: string
  etiquetas: string[]
  op: number[][]
  neutro: number
}

export function zn(n: number): Grupo {
  return {
    nombre: `Z${n}`,
    etiquetas: [...Array(n).keys()].map(String),
    op: [...Array(n).keys()].map((a) => [...Array(n).keys()].map((b) => (a + b) % n)),
    neutro: 0,
  }
}

/** Grupo simétrico S_n con las permutaciones en notación de una línea. */
export function simetrico(n: number): Grupo {
  const perms: number[][] = []
  const rec = (act: number[], resto: number[]) => {
    if (!resto.length) return void perms.push(act)
    resto.forEach((v, i) => rec([...act, v], resto.filter((_, j) => j !== i)))
  }
  rec([], [...Array(n).keys()])
  const idx = new Map(perms.map((p, i) => [p.join(''), i]))
  const comp = (a: number[], b: number[]) => a.map((_, i) => a[b[i]])
  return {
    nombre: `S${n}`,
    etiquetas: perms.map((p) => `(${p.map((v) => v + 1).join('')})`),
    op: perms.map((a) => perms.map((b) => idx.get(comp(a, b).join(''))!)),
    neutro: idx.get([...Array(n).keys()].join(''))!,
  }
}

/** Grupo diédrico D_n: n giros y n simetrías. */
export function diedral(n: number): Grupo {
  const N = 2 * n
  const etiquetas = [
    ...[...Array(n).keys()].map((i) => (i === 0 ? 'e' : i === 1 ? 'r' : `r${i}`)),
    ...[...Array(n).keys()].map((i) => (i === 0 ? 's' : `r${i}s`)),
  ]
  // elemento k: giro k si k < n, simetría r^(k−n) s si k ≥ n
  const comp = (a: number, b: number) => {
    const [ra, sa] = a < n ? [a, 0] : [a - n, 1]
    const [rb, sb] = b < n ? [b, 0] : [b - n, 1]
    // (r^ra s^sa)(r^rb s^sb) = r^(ra + (−1)^sa rb) s^(sa+sb)
    const r = (((ra + (sa ? -rb : rb)) % n) + n) % n
    const s = (sa + sb) % 2
    return s ? n + r : r
  }
  return {
    nombre: `D${n}`,
    etiquetas,
    op: [...Array(N).keys()].map((a) => [...Array(N).keys()].map((b) => comp(a, b))),
    neutro: 0,
  }
}

export const abeliano = (G: Grupo) =>
  G.op.every((f, i) => f.every((v, j) => v === G.op[j][i]))

export function orden(G: Grupo, a: number): number {
  let x = a
  let k = 1
  while (x !== G.neutro && k <= G.etiquetas.length) {
    x = G.op[x][a]
    k++
  }
  return k
}

export function inverso(G: Grupo, a: number): number {
  return G.op[a].indexOf(G.neutro)
}

export function centro(G: Grupo): number[] {
  return G.etiquetas.map((_, i) => i).filter((i) => G.op[i].every((v, j) => v === G.op[j][i]))
}

/** Cierre de un conjunto de generadores bajo la operación. */
export function generado(G: Grupo, gens: number[]): number[] {
  const S = new Set<number>([G.neutro, ...gens])
  let creciendo = true
  while (creciendo) {
    creciendo = false
    for (const a of [...S])
      for (const b of [...S]) {
        const c = G.op[a][b]
        if (!S.has(c)) {
          S.add(c)
          creciendo = true
        }
      }
  }
  return [...S].sort((x, y) => x - y)
}

/** Subgrupos generados por uno o dos elementos (todos, para los grupos pequeños). */
export function subgrupos(G: Grupo): number[][] {
  const vistos = new Map<string, number[]>()
  const n = G.etiquetas.length
  for (let a = 0; a < n; a++) {
    const H = generado(G, [a])
    vistos.set(H.join(','), H)
    for (let b = a + 1; b < n; b++) {
      const K = generado(G, [a, b])
      vistos.set(K.join(','), K)
    }
  }
  return [...vistos.values()].sort((x, y) => x.length - y.length)
}

export const divisores = (n: number) => [...Array(n).keys()].map((i) => i + 1).filter((d) => n % d === 0)

export const mcd = (a: number, b: number): number => (b === 0 ? a : mcd(b, a % b))
