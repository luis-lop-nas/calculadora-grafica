/** Contadores y comprobaciones compartidas por todas las baterías de `npm run mate`. */

export const cuenta = { total: 0, fallos: 0, problemas: [] as string[] }

/** Compara en relativo: para lo que se calcula con diferencias finitas. */
export function parecido(nombre: string, v: number, esperado: number, rel = 1e-4) {
  cuenta.total++
  const escala = Math.max(Math.abs(esperado), 1e-12)
  if (!Number.isFinite(v) || Math.abs(v - esperado) / escala > rel) {
    cuenta.fallos++
    cuenta.problemas.push(`${nombre}: ${v} ≠ ${esperado} (error relativo ${(Math.abs(v - esperado) / escala).toExponential(2)})`)
  }
}

export function cerca(nombre: string, v: number, esperado: number, tol = 1e-6) {
  cuenta.total++
  if (!Number.isFinite(v) || Math.abs(v - esperado) > tol) {
    cuenta.fallos++
    cuenta.problemas.push(`${nombre}: ${v} ≠ ${esperado} (tolerancia ${tol})`)
  }
}

export function cierto(nombre: string, cond: boolean, detalle = '') {
  cuenta.total++
  if (!cond) {
    cuenta.fallos++
    cuenta.problemas.push(`${nombre}${detalle ? ': ' + detalle : ''}`)
  }
}

export function seccion(t: string) {
  console.log(`\n── ${t}`)
}

/** Saca el número de una fila de lecturas del módulo. */
export function lectura(filas: Array<[string, string]>, etiqueta: string): number {
  const f = filas.find((x) => x[0] === etiqueta)
  if (!f) {
    cuenta.problemas.push(`no existe la lectura «${etiqueta}»`)
    cuenta.fallos++
    cuenta.total++
    return NaN
  }
  return parseFloat(f[1].replace('−', '-').replace(',', '.'))
}
