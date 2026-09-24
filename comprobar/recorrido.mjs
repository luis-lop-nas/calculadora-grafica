/**
 * Recorre los módulos en un navegador de verdad: los abre uno a uno desde la
 * paleta (⌘K), captura el lienzo y recoge los errores de consola.
 * Requiere el servidor en marcha (`npm run dev`).
 *   npm run comprobar
 *   URL=http://localhost:5179 TIROS=/ruta npm run comprobar
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const DIR = process.env.TIROS ?? 'comprobar/tiros'
const URL = process.env.URL ?? 'http://localhost:5173/'

const MODULOS = [
  ['grafica', 'Gráficas: funciones, curvas, regiones y deslizadores'],
  ['complejos', 'Variable compleja: coloreado del dominio'],
  ['cas', 'Cálculo simbólico: derivar, integrar, resolver, límites y Taylor'],
  ['geometria', 'Geometría con regla y compás'],
  ['espacio', 'Geometría en el espacio: superficies, sólidos y cortes'],
  ['orbitales', 'Orbitales y estados ligados 3D'],
  ['paquete', 'Paquete de ondas y dispersión'],
  ['pozo', 'Pozos, barrera y efecto túnel'],
  ['edp-propia', 'Escribe tu EDP'],
  ['onda', 'Ecuación de onda en 1D, 2D y 3D'],
  ['calor', 'Ecuación del calor en 1D, 2D y 3D'],
  ['laplace', 'Laplace: problema de Dirichlet'],
  ['resolver', 'Resolver una EDO escrita tal cual'],
  ['campo', 'Campo de direcciones y′ = f(x, y)'],
  ['segundoorden', 'Segundo orden: valor inicial y de contorno'],
  ['fases', 'Retrato de fase de sistemas 2×2'],
  ['superficies', 'Superficies z = f(x, y) y plano tangente'],
  ['parametricas', 'Superficies paramétricas r(u, v)'],
  ['vectorial', 'Campos vectoriales, divergencia y rotacional'],
  ['aplicaciones', 'Aplicaciones lineales en R³'],
  ['subespacios', 'Subespacios y proyección ortogonal'],
  ['hilbert', 'Bases de Hilbert y aproximación'],
  ['estructuras', 'Grupos, anillos y cuerpos'],
  ['espacios', 'Espacios métricos euclídeos y no euclídeos'],
  ['unidades', 'Unidades físicas y análisis dimensional'],
]

mkdirSync(DIR, { recursive: true })

const navegador = await chromium.launch()
const ctx = await navegador.newContext({
  viewport: { width: 1440, height: 900 },
  colorScheme: 'dark',
  deviceScaleFactor: 2,
})
const p = await ctx.newPage()
const errores = []
p.on('console', (m) => {
  if (m.type() === 'error' || m.text().startsWith('Warning:')) errores.push(`[consola] ${m.text()}`)
})
p.on('pageerror', (e) => errores.push(`[página] ${e.message}`))

await p.goto(URL, { waitUntil: 'networkidle' })
await p.evaluate(() => {
  try {
    localStorage.clear()
  } catch {}
})
await p.reload({ waitUntil: 'networkidle' })
await p.waitForTimeout(900)

for (const [id, nombre] of MODULOS) {
  const antes = errores.length
  await p.keyboard.press('Meta+k')
  await p.waitForTimeout(150)
  await p.fill('.paleta input', nombre)
  await p.waitForTimeout(250)
  const primero = await p.$('.paleta li')
  if (!primero) {
    errores.push(`[paleta] sin resultados para ${id}`)
    await p.keyboard.press('Escape')
    continue
  }
  await primero.click()
  await p.waitForTimeout(1600)
  await p.screenshot({ path: `${DIR}/${id}.png` })
  const nuevos = errores.slice(antes)
  console.log(`${id.padEnd(14)} ${nuevos.length ? 'ERRORES: ' + nuevos.join(' | ') : 'ok'}`)
}

await navegador.close()
console.log(errores.length ? `\n${errores.length} incidencias` : `\nsin incidencias · capturas en ${DIR}`)
process.exit(errores.length ? 1 : 0)
