/** Comprobación rápida del evaluador; se ejecuta con `npx tsx` o desde la consola. */
import { compilar } from '../lib/expresion'

declare const process: { exitCode?: number }

const casos: Array<[string, string[], number[], number]> = [
  ['2+3*4', [], [], 14],
  ['(2+3)*4', [], [], 20],
  ['-x^2', ['x'], [3], -9],
  ['2^3^2', [], [], 512],
  ['sin(pi/2)', [], [], 1],
  ['x*y-y/x', ['x', 'y'], [2, 6], 9],
  ['exp(ln(5))', [], [], 5],
  ['abs(-3)+sqrt(16)', [], [], 7],
  ['1-2-3', [], [], -4],
  ['8/4/2', [], [], 1],
  ['-(x+1)*2', ['x'], [2], -6],
  ['y*(1-y)', ['y'], [0.25], 0.1875],
  ['2x+pi', ['x'], [3], 6 + Math.PI],
  ['2sin(pi/2)', [], [], 2],
  ['(x+1)(x-1)', ['x'], [3], 8],
  ['tau/(2*pi)', [], [], 1],
  ['sen(pi/2)+tg(0)', [], [], 1],
  ['+x^2', ['x'], [3], 9],
  ['2*+x', ['x'], [3], 6],
  ['2²+3³', [], [], 31],
  // nivel GeoGebra
  ['xy', ['x', 'y'], [2, 3], 6],
  ['a sin(bx)', ['x', 'a', 'b'], [Math.PI / 4, 3, 2], 3],
  ['2xsin(x)', ['x'], [Math.PI / 2], Math.PI],
  ['sin x', ['x'], [Math.PI / 2], 1],
  ['|x-3|', ['x'], [1], 2],
  ['2|x|', ['x'], [-4], 8],
  ['5!', [], [], 120],
  ['180°', [], [], Math.PI],
  ['log(2, 8)', [], [], 3],
  ['log(100)', [], [], 2],
  ['nroot(-8, 3)', [], [], -2],
  ['(-8)^(1/3)', [], [], -2],
  ['mod(-7, 3)', [], [], 2],
  ['max(1, x, 3)', ['x'], [7], 7],
  ['atan2(1, 1)', [], [], Math.PI / 4],
  ['nCr(5, 2)', [], [], 10],
  ['gamma(5)', [], [], 24],
  ['gamma(0.5)^2', [], [], Math.PI],
  ['erf(1)', [], [], 0.8427007929497149],
  ['erf(3)', [], [], 0.9999779095030014],
  ['sec(0)+cot(pi/4)', [], [], 2],
  ['asinh(sinh(0.7))', [], [], 0.7],
  ['ceil(2.1)', [], [], 3],
  ['if(x<0, -x, x^2)', ['x'], [-3], 3],
  ['if(x<0, -x, x^2)', ['x'], [3], 9],
  ['si(x<0, 1, x<2, 2, 3)', ['x'], [1], 2],
  ['0<x<2', ['x'], [1], 1],
  ['0<x<2', ['x'], [3], 0],
  ['x>=1 && x<=2', ['x'], [1], 1],
  ['θ+π', ['theta'], [1], 1 + Math.PI],
  ['2y\'+y', ['x', 'y', "y'"], [0, 1, 3], 7],
  ['x(x+1)', ['x'], [2], 6],
]

let fallos = 0
for (const [src, vars, vals, esperado] of casos) {
  const v = compilar(src, vars)(...vals)
  if (Math.abs(v - esperado) > 1e-9) {
    console.error(`FALLA  ${src} = ${v}, esperado ${esperado}`)
    fallos++
  }
}
for (const malo of ['2+', '(1+2', 'foo(3)', '1+@', 'x=2', 'sin()', 'log(1,2,3)', '(1,2)']) {
  try {
    compilar(malo, ['x'])(1)
    console.error(`FALLA  "${malo}" debería haber lanzado`)
    fallos++
  } catch {
    /* correcto */
  }
}
try {
  compilar('1.2.3', [])
  console.error('FALLA  "1.2.3" debería haber lanzado')
  fallos++
} catch {
  /* correcto */
}
console.log(fallos === 0 ? `${casos.length + 8} pruebas del evaluador en verde` : `${fallos} fallos`)

import { aLatex } from '../lib/expresion'

const latex: Array<[string, string]> = [
  ['x/y', '\\frac{x}{y}'],
  ['x^2+1', 'x^{2} + 1'],
  ['sqrt(1-x*x)', '\\sqrt{1 - x \\cdot x}'],
  ['-sin(x)-0.2*y', '-\\sin\\!\\left(x\\right) - 0{,}2 \\cdot y'],
  ['(x+1)*(x-1)', '\\left(x + 1\\right) \\cdot \\left(x - 1\\right)'],
  ['abs(x)', '\\left|x\\right|'],
  ['2x', '2 x'],
  ['x*2', 'x \\cdot 2'],
  ['2pi', '2 \\pi'],
  ['0<x<=2', '0 < x \\le 2'],
  ['5!', '5!'],
]

import { compilar as compilarU } from '../lib/expresion'
{
  const f = (x: number) => x ** 3
  const d1 = compilarU("f'(x)", ['x'], { f })(2)
  const d2 = compilarU("f''(x)+f(1)", ['x'], { f })(2)
  if (Math.abs(d1 - 12) > 1e-6 || Math.abs(d2 - 13) > 1e-3) {
    console.error(`USUARIO  f'(2)=${d1} (12), f''(2)+f(1)=${d2} (13)`)
    process.exitCode = 1
  }
}
let malos = 0
for (const [src, esperado] of latex) {
  const v = aLatex(src)
  if (v !== esperado) {
    console.error(`LATEX  ${src}\n  esperado: ${esperado}\n  obtenido: ${v}`)
    malos++
  }
}
if (aLatex('1+') !== null) {
  console.error('LATEX  "1+" debería dar null')
  malos++
}
console.log(malos === 0 ? `${latex.length + 1} pruebas de LaTeX en verde` : `${malos} fallos de LaTeX`)

import { compilarC } from '../lib/expresion'

const complejos: Array<[string, [number, number], [number, number]]> = [
  ['z*z', [0, 1], [-1, 0]],
  ['1/z', [2, 0], [0.5, 0]],
  ['z^2', [1, 1], [0, 2]],
  ['exp(z)', [0, Math.PI], [-1, 0]],
  ['sqrt(z)', [-1, 0], [0, 1]],
  ['(z-1)/(z+1)', [0, 0], [-1, 0]],
  ['z+2i', [1, 0], [1, 2]],
  ['exp(i*pi)', [0, 0], [-1, 0]],
]
let malosC = 0
for (const [src, z, esperado] of complejos) {
  const v = compilarC(src, ['z'])(z)
  if (Math.abs(v[0] - esperado[0]) > 1e-9 || Math.abs(v[1] - esperado[1]) > 1e-9) {
    console.error(`COMPLEJO  ${src} en (${z}) = (${v}), esperado (${esperado})`)
    malosC++
  }
}
console.log(malosC === 0 ? `${complejos.length} pruebas de complejos en verde` : `${malosC} fallos de complejos`)
if (fallos || malos || malosC) process.exitCode = 1
