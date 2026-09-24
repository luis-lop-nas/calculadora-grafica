/** Marching squares: segmentos de la curva de nivel f(x,y) = nivel. */
export function contorno(
  f: (x: number, y: number) => number,
  ventana: { x: [number, number]; y: [number, number] },
  nivel = 0,
  nx = 120,
  ny = 120,
): Array<[[number, number], [number, number]]> {
  const [xa, xb] = ventana.x
  const [ya, yb] = ventana.y
  const hx = (xb - xa) / nx
  const hy = (yb - ya) / ny
  const v = new Float64Array((nx + 1) * (ny + 1))
  for (let j = 0; j <= ny; j++)
    for (let i = 0; i <= nx; i++) {
      const w = f(xa + i * hx, ya + j * hy) - nivel
      v[j * (nx + 1) + i] = Number.isFinite(w) ? w : NaN
    }
  const seg: Array<[[number, number], [number, number]]> = []
  const interp = (
    x1: number, y1: number, v1: number,
    x2: number, y2: number, v2: number,
  ): [number, number] => {
    const t = v1 / (v1 - v2)
    return [x1 + t * (x2 - x1), y1 + t * (y2 - y1)]
  }
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const x0 = xa + i * hx
      const y0 = ya + j * hy
      const x1 = x0 + hx
      const y1 = y0 + hy
      const a = v[j * (nx + 1) + i]
      const b = v[j * (nx + 1) + i + 1]
      const c = v[(j + 1) * (nx + 1) + i + 1]
      const d = v[(j + 1) * (nx + 1) + i]
      if (![a, b, c, d].every(Number.isFinite)) continue
      const cortes: Array<[number, number]> = []
      if (a * b < 0) cortes.push(interp(x0, y0, a, x1, y0, b))
      if (b * c < 0) cortes.push(interp(x1, y0, b, x1, y1, c))
      if (c * d < 0) cortes.push(interp(x1, y1, c, x0, y1, d))
      if (d * a < 0) cortes.push(interp(x0, y1, d, x0, y0, a))
      if (cortes.length === 2) seg.push([cortes[0], cortes[1]])
      else if (cortes.length === 4) {
        seg.push([cortes[0], cortes[1]])
        seg.push([cortes[2], cortes[3]])
      }
    }
  return seg
}

/**
 * Une los segmentos sueltos de marching squares en polilíneas; sin esto el
 * trazo discontinuo no se ve, porque el patrón vuelve a empezar en cada
 * segmento de 4 px. Dos celdas vecinas interpolan el borde común en sentidos
 * opuestos y no dan el mismo número bit a bit: la clave se cuantiza.
 */
export function encadenar(segs: Array<[[number, number], [number, number]]>, q: number): Array<Array<[number, number]>> {
  const clave = (p: [number, number]) => `${Math.round(p[0] / q)},${Math.round(p[1] / q)}`
  const junto = new Map<string, number[]>()
  segs.forEach(([p, q], i) => {
    for (const k of [clave(p), clave(q)]) junto.set(k, [...(junto.get(k) ?? []), i])
  })
  const usado = new Uint8Array(segs.length)
  const lineas: Array<Array<[number, number]>> = []
  const sigue = (linea: Array<[number, number]>) => {
    for (;;) {
      const fin = linea[linea.length - 1]
      const j = (junto.get(clave(fin)) ?? []).find((k) => !usado[k])
      if (j === undefined) return
      usado[j] = 1
      const [p, q] = segs[j]
      linea.push(clave(p) === clave(fin) ? q : p)
    }
  }
  segs.forEach(([p, q], i) => {
    if (usado[i]) return
    usado[i] = 1
    const ida: Array<[number, number]> = [p, q]
    sigue(ida)
    const vuelta: Array<[number, number]> = [p]
    sigue(vuelta)
    lineas.push([...vuelta.reverse(), ...ida.slice(1)])
  })
  return lineas
}

/** Ceros comunes de dos campos: celdas con cambio de signo en ambos, afinadas con Newton. */
export function equilibrios(
  f: (x: number, y: number) => number,
  gq: (x: number, y: number) => number,
  ventana: { x: [number, number]; y: [number, number] },
  n = 60,
): Array<[number, number]> {
  const [xa, xb] = ventana.x
  const [ya, yb] = ventana.y
  const hx = (xb - xa) / n
  const hy = (yb - ya) / n
  const out: Array<[number, number]> = []
  const cerca = (p: [number, number]) =>
    out.some((q) => Math.abs(q[0] - p[0]) < hx * 0.8 && Math.abs(q[1] - p[1]) < hy * 0.8)
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const x0 = xa + i * hx
      const y0 = ya + j * hy
      const vs = [
        [f(x0, y0), gq(x0, y0)],
        [f(x0 + hx, y0), gq(x0 + hx, y0)],
        [f(x0, y0 + hy), gq(x0, y0 + hy)],
        [f(x0 + hx, y0 + hy), gq(x0 + hx, y0 + hy)],
      ]
      if (!vs.every((p) => p.every(Number.isFinite))) continue
      const cambia = (k: number) =>
        Math.min(...vs.map((p) => p[k])) <= 0 && Math.max(...vs.map((p) => p[k])) >= 0
      if (!cambia(0) || !cambia(1)) continue
      let p: [number, number] = [x0 + hx / 2, y0 + hy / 2]
      for (let it = 0; it < 40; it++) {
        const e = 1e-6
        const F = f(p[0], p[1])
        const G = gq(p[0], p[1])
        const a11 = (f(p[0] + e, p[1]) - F) / e
        const a12 = (f(p[0], p[1] + e) - F) / e
        const a21 = (gq(p[0] + e, p[1]) - G) / e
        const a22 = (gq(p[0], p[1] + e) - G) / e
        const det = a11 * a22 - a12 * a21
        if (Math.abs(det) < 1e-12) break
        p = [p[0] - (a22 * F - a12 * G) / det, p[1] - (-a21 * F + a11 * G) / det]
        if (!p.every(Number.isFinite)) break
      }
      if (
        p.every(Number.isFinite) &&
        p[0] >= xa && p[0] <= xb && p[1] >= ya && p[1] <= yb &&
        Math.abs(f(p[0], p[1])) < 1e-6 && Math.abs(gq(p[0], p[1])) < 1e-6 &&
        !cerca(p)
      )
        out.push(p)
    }
  return out
}

/** Jacobiano numérico en un punto. */
export function jacobiano(
  f: (x: number, y: number) => number,
  gq: (x: number, y: number) => number,
  x: number,
  y: number,
  e = 1e-5,
): number[][] {
  return [
    [(f(x + e, y) - f(x - e, y)) / (2 * e), (f(x, y + e) - f(x, y - e)) / (2 * e)],
    [(gq(x + e, y) - gq(x - e, y)) / (2 * e), (gq(x, y + e) - gq(x, y - e)) / (2 * e)],
  ]
}
