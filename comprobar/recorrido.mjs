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

// Solo estos módulos (separados por comas); sin SOLO se recorren todos.
const SOLO = process.env.SOLO ? new Set(process.env.SOLO.split(',')) : null

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

// La lista sale de la propia paleta (⌘K vacía), así un módulo nuevo nunca se queda sin recorrer.
await p.keyboard.press((process.platform === 'darwin' ? 'Meta+k' : 'Control+k'))
await p.waitForTimeout(200)
const TODOS = await p.$$eval('.paleta li[id^="modulo-"]', (lis) => lis.map((li) => li.id.slice('modulo-'.length)))
await p.keyboard.press('Escape')
const MODULOS = TODOS.filter((id) => !SOLO || SOLO.has(id))
console.log(`${MODULOS.length} de ${TODOS.length} módulos`)

for (const id of MODULOS) {
  const antes = errores.length
  await p.keyboard.press((process.platform === 'darwin' ? 'Meta+k' : 'Control+k'))
  await p.waitForTimeout(150)
  const primero = await p.$(`.paleta li#modulo-${id}`)
  if (!primero) {
    errores.push(`[paleta] no aparece ${id}`)
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
