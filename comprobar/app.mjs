/**
 * Recorre la app de Mac de verdad (Electron sobre `dist/`), no la web:
 *  1. el menú Módulo tiene una entrada por cada módulo de la paleta, con su área;
 *  2. cada entrada del menú abre su módulo sin errores de consola ni avisos de React;
 *  3. un documento .calc guardado desde el menú y reabierto devuelve los mismos estados;
 *  4. las órdenes de exportar PNG y CSV del menú escriben un fichero.
 * Requiere `npm run build` antes (el script `comprobar:app` ya lo hace).
 *   npm run comprobar:app
 *   SOLO=fourier,bode npm run comprobar:app
 */
import { _electron as electron } from 'playwright'
import { mkdirSync, mkdtempSync, readFileSync, existsSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const DIR = process.env.TIROS ?? 'comprobar/tiros-app'
const SOLO = process.env.SOLO ? new Set(process.env.SOLO.split(',')) : null
mkdirSync(DIR, { recursive: true })
const tmp = mkdtempSync(path.join(tmpdir(), 'calc-app-'))

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE // VS Code la exporta y Electron arrancaría como Node, sin ventana
delete env.CALC_URL

const app = await electron.launch({ args: ['.', `--user-data-dir=${path.join(tmp, 'datos')}`], env })
const errores = []
app.process().on('exit', (c, sig) => console.log(`[la app terminó: código ${c}, señal ${sig}]`))
app.process().stderr.on('data', (d) => process.env.DEPURAR && console.log('[stderr]', String(d).trim().slice(0, 400)))
const vigilar = (p) => {
  p.on('console', (m) => {
    if (m.type() === 'error' || m.text().startsWith('Warning:')) errores.push(`[consola] ${m.text()}`)
  })
  p.on('pageerror', (e) => errores.push(`[página] ${e.message}`))
}
app.on('window', vigilar)
const win = await app.firstWindow()
vigilar(win)
await win.waitForLoadState('domcontentloaded')
await win.waitForTimeout(1500)

// Las órdenes del menú van a la ventana enfocada (BrowserWindow.getFocusedWindow), igual que en uso
// normal. Pero una prueba no puede robarle el foco del sistema a quien está usando el Mac, así que
// la ventana de la app se da por enfocada: lo que se prueba es que cada entrada mande su orden.
await app.evaluate(({ BrowserWindow }) => {
  BrowserWindow.getFocusedWindow = () => BrowserWindow.getAllWindows().at(-1) ?? null
})

// descargas (PNG, CSV) a la carpeta temporal, sin diálogo
await app.evaluate(({ session }, dir) => {
  session.defaultSession.on('will-download', (_e, item) => item.setSavePath(`${dir}/${item.getFilename()}`))
}, tmp)

/** Pulsa una entrada del menú de la aplicación como lo haría el ratón (con la ventana enfocada). */
const pulsarUnaVez = (ruta) =>
  app.evaluate(({ BrowserWindow, Menu }, ruta) => {
    if (!BrowserWindow.getFocusedWindow()) return 'la ventana no recupera el foco'
    let items = Menu.getApplicationMenu().items
    let item = null
    for (const paso of ruta) {
      item = typeof paso === 'number' ? items.filter((i) => i.type === 'radio')[paso] : items.find((i) => i.label === paso)
      if (!item) return `no existe «${paso}»`
      items = item.submenu?.items ?? []
    }
    item.click()
    return null
  }, ruta)

async function pulsar(ruta) {
  let r = null
  for (let i = 0; i < 10; i++) {
    r = await pulsarUnaVez(ruta)
    if (r !== 'la ventana no recupera el foco') return r
    await new Promise((ok) => setTimeout(ok, 300))
  }
  return r
}

// 1. menú frente a paleta
const menu = await app.evaluate(({ Menu }) => {
  const m = Menu.getApplicationMenu().items.find((i) => i.label === 'Módulo')
  const out = { modulos: [], areas: [] }
  for (const i of m.submenu.items) {
    if (i.type === 'radio') out.modulos.push(i.label)
    else if (i.type === 'normal' && !i.enabled) out.areas.push(i.label)
  }
  const ir = m.submenu.items.find((i) => i.label === 'Ir al área')
  out.irAlArea = ir.submenu.items.map((i) => i.label)
  return out
})
await win.keyboard.press('Meta+k')
await win.waitForTimeout(200)
const paleta = await win.$$eval('.paleta li[id^="modulo-"]', (lis) => lis.map((li) => li.id.slice('modulo-'.length)))
await win.keyboard.press('Escape')
if (menu.modulos.length !== paleta.length) errores.push(`[menú] ${menu.modulos.length} módulos en el menú y ${paleta.length} en la paleta`)
if (new Set(menu.areas).size !== menu.areas.length) errores.push(`[menú] un área aparece partida en dos bloques: ${menu.areas.join(', ')}`)
if (menu.irAlArea.length !== menu.areas.length) errores.push('[menú] «Ir al área» no lista todas las áreas')
console.log(`menú: ${menu.modulos.length} módulos en ${menu.areas.length} áreas (${menu.areas.join(' · ')})`)

// 2. cada módulo desde su entrada del menú
const idActual = () => win.evaluate(() => JSON.parse(localStorage.getItem('calculadora:estado') ?? '{}').id)
const visitados = []
for (let i = 0; i < menu.modulos.length; i++) {
  if (SOLO && !SOLO.has(paleta[i])) continue
  const antes = errores.length
  const fallo = await pulsar(['Módulo', i])
  if (fallo) errores.push(`[menú] ${fallo}`)
  await win.waitForTimeout(1400)
  const id = await idActual()
  if (id !== paleta[i]) errores.push(`[menú] la entrada ${i} («${menu.modulos[i]}») abrió ${id}, se esperaba ${paleta[i]}`)
  visitados.push(id)
  // capturePage desde el proceso principal: funciona aunque otra ventana tape la app
  const png = await app.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'))
  writeFileSync(`${DIR}/${id}.png`, Buffer.from(png, 'base64'))
  const nuevos = errores.slice(antes)
  console.log(`${String(id).padEnd(16)} ${nuevos.length ? 'ERRORES: ' + nuevos.join(' | ') : 'ok'}`)
}

// 3. .calc: guardar como → borrar el autoguardado → abrir → mismos estados
const doc = path.join(tmp, 'prueba.calc')
await app.evaluate(({ dialog }, doc) => {
  dialog.showSaveDialog = async () => ({ canceled: false, filePath: doc })
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [doc] })
}, doc)
await pulsar(['Archivo', 'Guardar como…'])
await win.waitForTimeout(800)
if (!existsSync(doc)) errores.push('[.calc] «Guardar como…» no escribió el documento')
else {
  const guardado = JSON.parse(readFileSync(doc, 'utf8'))
  const faltan = visitados.filter((id) => !(id in guardado.estados))
  if (faltan.length) errores.push(`[.calc] el documento no lleva el estado de: ${faltan.join(', ')}`)
  const ventanasAntes = (await app.windows()).length
  await pulsar(['Archivo', 'Abrir…'])
  await win.waitForTimeout(1500)
  const ventanas = await app.windows()
  const destino = ventanas.length > ventanasAntes ? ventanas[ventanas.length - 1] : win
  await destino.waitForTimeout(800)
  const reabierto = await destino.evaluate(() => JSON.parse(localStorage.getItem('calculadora:estado') ?? '{}'))
  for (const id of visitados) {
    if (JSON.stringify(reabierto.estados?.[id]) !== JSON.stringify(guardado.estados[id])) errores.push(`[.calc] el estado de ${id} no vuelve igual`)
  }
  console.log(`.calc: ${visitados.length} estados guardados y reabiertos (${ventanas.length > ventanasAntes ? 'en ventana nueva' : 'en la misma ventana'})`)
}

// 4. exportar desde el menú
await pulsar(['Módulo', paleta.indexOf('grafica')])
await win.waitForTimeout(1000)
await pulsar(['Archivo', 'Exportar imagen PNG…'])
await pulsar(['Archivo', 'Exportar lecturas CSV…'])
await win.waitForTimeout(1500)
const bajados = readdirSync(tmp)
if (!bajados.some((f) => f.endsWith('.png'))) errores.push('[exportar] no se escribió el PNG')
if (!bajados.some((f) => f.endsWith('.csv'))) errores.push('[exportar] no se escribió el CSV')

// app.close() se quedaría esperando el «¿guardar cambios?» del documento abierto: se sale sin preguntar
await app.evaluate(({ app }) => setTimeout(() => app.exit(0), 50)).catch(() => {})
console.log(errores.length ? `\n${errores.length} incidencias:\n  ${errores.join('\n  ')}` : `\nsin incidencias · capturas en ${DIR}`)
process.exit(errores.length ? 1 : 0)
