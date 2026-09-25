import * as X from '../../lib/matrizExacta'
import { mul as mulNum } from '../../lib/matrices'

/** Determinante en coma flotante con pivote parcial: el camino independiente. */
function detNum(A0: number[][]): number {
  const A = A0.map((f) => f.slice())
  const n = A.length
  let d = 1
  for (let c = 0; c < n; c++) {
    let p = c
    for (let i = c + 1; i < n; i++) if (Math.abs(A[i][c]) > Math.abs(A[p][c])) p = i
    if (A[p][c] === 0) return 0
    if (p !== c) {
      ;[A[p], A[c]] = [A[c], A[p]]
      d = -d
    }
    d *= A[c][c]
    for (let i = c + 1; i < n; i++) {
      const k = A[i][c] / A[c][c]
      for (let j = c; j < n; j++) A[i][j] -= k * A[c][j]
    }
  }
  return d
}
import { generador } from '../../lib/azar'
import { cerca, cierto, seccion } from './comun'
import { sumaEInterseccion } from '../../modulos/algebra/subespacios'

export function pruebasAlgebra() {
  seccion('Álgebra · matrices exactas paso a paso')
  const M = (a: Array<Array<string | number>>) => a.map((f) => f.map((v) => X.leerR(String(v))!))
  const I = (n: number) => X.identidadR(n)

  cierto('leer: 0,25 = 1/4, −3/6 = −1/2, 2e−3 = 1/500', [['0,25', 1n, 4n], ['-3/6', -1n, 2n], ['2e-3', 1n, 500n]].every(([t, n, d]) => { const v = X.leerR(t as string)!; return v.n === n && v.d === d }))
  cierto('leer: lo que no es número da null', X.leerR('abc') === null && X.leerR('1/0') === null)

  // matrices al azar con enteros pequeños: lo exacto contra lo decimal
  const g = generador(7)
  const azar = () => g.uniforme()
  for (let prueba = 0; prueba < 25; prueba++) {
    const n = 2 + (prueba % 4)
    const A = Array.from({ length: n }, () => Array.from({ length: n }, () => Math.round(azar() * 10 - 5)))
    const R = M(A)
    const d = X.determinante(R)
    cerca(`det exacto = det decimal (${n}×${n}, #${prueba})`, X.rNum(d.valor), detNum(A), 1e-8 * Math.max(1, Math.abs(detNum(A))))
    const inv = X.inversa(R)
    cierto(`inversa existe ⇔ det ≠ 0 (#${prueba})`, (inv.inv !== null) === (d.valor.n !== 0n))
    if (inv.inv) cierto(`A·A⁻¹ = I exacto (#${prueba})`, X.igualM(X.mulR(R, inv.inv), I(n)) && X.igualM(X.mulR(inv.inv, R), I(n)))
    const e = X.gaussJordan(R)
    cierto(`rref: cada pivote es 1 y el resto de su columna 0 (#${prueba})`, e.pivotes.every((c, i) => X.rIgual(e.R[i][c], X.R1) && e.R.every((f, k) => k === i || f[c].n === 0n)))
    for (const v of X.nucleo(R)) cierto(`núcleo: A·v = 0 (#${prueba})`, X.esCeroM(X.mulR(R, v.map((x) => [x]))))
    cierto(`rango + dim núcleo = n (#${prueba})`, X.rango(R) + X.nucleo(R).length === n)
    // autovalores: suma = traza, producto = det
    const { valores } = X.autovalores(R)
    let suma = 0
    let prodRe = 1
    let prodIm = 0
    for (const v of valores) for (let k = 0; k < v.algebraica; k++) {
      suma += v.re
      ;[prodRe, prodIm] = [prodRe * v.re - prodIm * v.im, prodRe * v.im + prodIm * v.re]
    }
    cerca(`Σλ = traza (#${prueba})`, suma, X.rNum(X.trazaR(R)), 1e-7)
    cerca(`Πλ = det (#${prueba})`, prodRe, X.rNum(d.valor), 1e-6 * Math.max(1, Math.abs(X.rNum(d.valor))))
    for (const v of valores) {
      if (v.vectores) for (const w of v.vectores) cierto(`A v = λ v exacto (#${prueba}, λ = ${v.tex})`, X.igualM(X.mulR(R, w.map((x) => [x])), w.map((x) => [X.r(x.n * v.exacto!.n, x.d * v.exacto!.d)])))
      if (v.vectoresNum) for (const w of v.vectoresNum) {
        const Aw = A.map((f) => f.reduce((s, a, j) => s + a * w[j], 0))
        cerca(`A v = λ v decimal (#${prueba})`, Math.max(...Aw.map((x, i) => Math.abs(x - v.re * w[i]))), 0, 1e-7)
      }
    }
    const dg = X.diagonalizar(R, valores)
    if (dg.P && dg.D) cierto(`A·P = P·D (#${prueba})`, X.igualM(X.mulR(R, dg.P), X.mulR(dg.P, dg.D)))
    const f = X.lu(R)!
    cierto(`P·A = L·U exacto (#${prueba})`, X.igualM(X.mulR(f.P, R), X.mulR(f.L, f.U)))
    // sistema con solución conocida
    const x0 = Array.from({ length: n }, () => Math.round(azar() * 6 - 3))
    const b = A.map((fila) => fila.reduce((s, a, j) => s + a * x0[j], 0))
    const sis = X.sistema(R, b.map((v) => X.r(v)))
    cierto(`sistema con solución: compatible (#${prueba})`, sis.tipo !== 'incompatible')
    if (sis.particular) {
      const Ax = X.mulR(R, sis.particular.map((v) => [v]))
      cierto(`la particular cumple A·x = b (#${prueba})`, Ax.every((f, i) => X.rNum(f[0]) === b[i]))
      for (const dir of sis.direcciones) cierto(`las direcciones están en el núcleo (#${prueba})`, X.esCeroM(X.mulR(R, dir.map((v) => [v]))))
    }
  }

  // casos de libro
  const Ai = M([[1, 1, 1], [1, -1, 2], [2, 0, 3]])
  cierto('Rouché: rg A = rg(A|b) = 2 < 3 → indeterminado', X.sistema(Ai, [6, 5, 11].map((v) => X.r(v))).tipo === 'compatible indeterminado')
  cierto('Rouché: rg A = 2 < rg(A|b) = 3 → incompatible', X.sistema(Ai, [6, 5, 10].map((v) => X.r(v))).tipo === 'incompatible')
  const J = X.diagonalizar(M([[2, 1, 0], [0, 2, 0], [0, 0, 3]]), X.autovalores(M([[2, 1, 0], [0, 2, 0], [0, 0, 3]])).valores)
  cierto('Jordan: λ = 2 con un bloque de tamaño 2, λ = 3 con uno de 1', !J.sobreR && JSON.stringify(J.jordan?.map((b) => [X.textoR(b.l), b.tamanos])) === '[["2",[2]],["3",[1]]]', JSON.stringify(J.jordan?.map((b) => [X.textoR(b.l), b.tamanos])))
  const nil = X.diagonalizar(M([[0, 1, 0], [0, 0, 1], [0, 0, 0]]), X.autovalores(M([[0, 1, 0], [0, 0, 1], [0, 0, 0]])).valores)
  cierto('Jordan: nilpotente 3×3 es un único bloque de tamaño 3', JSON.stringify(nil.jordan?.[0].tamanos) === '[3]')
  const giro = X.autovalores(M([[0, -1], [1, 0]])).valores
  cierto('giro de 90°: λ = ±i', giro.length === 2 && giro.every((v) => v.re === 0 && Math.abs(Math.abs(v.im) - 1) < 1e-15))
  const irr = X.autovalores(M([[1, 2], [3, 4]])).valores
  cierto('(1 2; 3 4): λ = 5/2 ± √33/2 con radicales', irr.map((v) => v.tex).join(' | ') === '\\frac{5}{2} - \\frac{\\sqrt{33}}{2} | \\frac{5}{2} + \\frac{\\sqrt{33}}{2}', irr.map((v) => v.tex).join(' | '))
  cierto('polinomio característico de (2 0 0; 0 3 4; 0 4 9): λ³ − 14λ² + 35λ − 22', X.texPolinomio(X.polinomioCaracteristico(M([[2, 0, 0], [0, 3, 4], [0, 4, 9]]))) === '\\lambda^{3} - 14\\lambda^{2} + 35\\lambda - 22')
  // subespacios: Grassmann y la intersección
  {
    const r1 = sumaEInterseccion([[1, 0, 0], [0, 1, 0]], [[1, 0, 1], [0, 0, 1]])
    cierto('plano xy y plano xz: dim suma 3, intersección 1', r1.dSuma === 3 && r1.dInter === 1 && r1.d1 + r1.d2 - r1.dInter === r1.dSuma)
    cierto('plano xy ∩ plano xz = eje x', r1.inter.length === 1 && Math.abs(Math.abs(r1.inter[0][0]) - 1) < 1e-12)
    const r2 = sumaEInterseccion([[1, 2, 0], [0, 1, 1]], [[1, 3, 1], [2, 5, 1]])
    cierto('el mismo plano con otros generadores: intersección = el plano', r2.dInter === 2 && r2.dSuma === 2)
    const r3 = sumaEInterseccion([[1, 0, 0], [2, 0, 0]], [[0, 1, 0], [0, 0, 1]])
    cierto('una recta (generadores repetidos) y el plano yz: suma directa ℝ³', r3.d1 === 1 && r3.dInter === 0 && r3.dSuma === 3)
    for (const u of r1.inter) cerca('el vector de W₁ ∩ W₂ tiene y = 0 (está en xz) y z = 0 (está en xy)', Math.abs(u[1]) + Math.abs(u[2]), 0, 1e-12)
  }
  // SVD: los σ² son los autovalores de AᵀA; QR: Q ortonormal y QR = A
  const An = [[3, 0], [4, 5], [1, 2]]
  const sv = X.svd(An)
  cerca('SVD: σ₁² + σ₂² = ‖A‖²_F', sv.sigma[0] ** 2 + sv.sigma[1] ** 2, An.flat().reduce((s, v) => s + v * v, 0), 1e-10)
  const qrA = X.qr(An)!
  cerca('QR: Q·R = A', Math.max(...mulNum(qrA.Q, qrA.R).flatMap((f, i) => f.map((v, j) => Math.abs(v - An[i][j])))), 0, 1e-12)
  cerca('QR: QᵀQ = I', Math.abs(qrA.Q.reduce((s, f) => s + f[0] * f[1], 0)), 0, 1e-12)
  // Gram–Schmidt exacto, proyección sobre col(A) y mínimos cuadrados
  {
    const R = (n: number, d = 1) => X.r(n, d)
    const g = X.gramSchmidtR([[R(1), R(1), R(0)], [R(1), R(0), R(1)], [R(0), R(1), R(1)]])
    cierto('Gram–Schmidt exacto: w₂ = (1/2, −1/2, 1)', g[1].w.map(X.textoR).join(' ') === '1/2 −1/2 1', g[1].w.map(X.textoR).join(' '))
    cierto('Gram–Schmidt exacto: los wₖ son ortogonales', g.every((a, i) => g.every((b, j) => i === j || X.productoR(a.w, b.w).n === 0n)))
    cierto('Gram–Schmidt: una columna dependiente da w = 0', X.gramSchmidtR([[R(1), R(2)], [R(2), R(4)]])[1].nulo)
    cierto('√(9/4) exacta = 3/2', X.texRaizR(R(9, 4)) === '\\frac{3}{2}')
    // recta de mínimos cuadrados por (0,1), (1,2), (2,2), (3,4): y = 0.9 + 0.9 x
    const A = [[1, 0], [1, 1], [1, 2], [1, 3]].map((f) => f.map((v) => R(v)))
    const pr = X.proyeccionR(A, [1, 2, 2, 4].map((v) => R(v)))!
    cierto('mínimos cuadrados: x̂ = (9/10, 9/10)', pr.x.map(X.textoR).join(' ') === '9/10 9/10', pr.x.map(X.textoR).join(' '))
    cierto('mínimos cuadrados: el residuo es ⟂ a las columnas', X.transpuestaR(A).every((c) => X.productoR(c, pr.residuo).n === 0n))
    cierto('la matriz de proyección es idempotente', X.igualM(X.mulR(pr.P, pr.P), pr.P))
  }
}
