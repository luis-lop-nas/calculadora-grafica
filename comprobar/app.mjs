/**
 * Recorre la app de Mac de verdad (Electron sobre `dist/`), no la web:
 *  1. el menú Módulo tiene un submenú por área y, entre todos, una entrada por módulo de la paleta;
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
  // el menú se reconstruye al cambiar el estado solo si la ventana tiene el foco
  BrowserWindow.prototype.isFocused = function () {
    return this === BrowserWindow.getFocusedWindow()
  }
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
  const out = { modulos: [], rutas: [], areas: [] }
  const areas = new Set(m.submenu.items.find((i) => i.label === 'Ir al área').submenu.items.map((i) => i.label))
  for (const i of m.submenu.items) {
    // tras las áreas vienen los submenús propios del módulo abierto (Ejemplos, Operación…)
    if (i.type !== 'submenu' || !areas.has(i.label)) continue
    out.areas.push(i.label)
    i.submenu.items.filter((j) => j.type === 'radio').forEach((j, k) => {
      out.modulos.push(j.label)
      out.rutas.push(['Módulo', i.label, k])
    })
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
  const fallo = await pulsar(menu.rutas[i])
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
await pulsar(menu.rutas[paleta.indexOf('grafica')])
await win.waitForTimeout(1000)
await pulsar(['Archivo', 'Exportar', 'Imagen PNG…'])
await pulsar(['Archivo', 'Exportar', 'Lecturas (CSV)…'])
await win.waitForTimeout(1500)
const bajados = readdirSync(tmp)
if (!bajados.some((f) => f.endsWith('.png'))) errores.push('[exportar] no se escribió el PNG')
if (!bajados.some((f) => f.endsWith('.csv'))) errores.push('[exportar] no se escribió el CSV')

// 5. Vista y Edición: una casilla de superposición y deshacer/rehacer
const prefs = () => win.evaluate(() => JSON.parse(localStorage.getItem('calculadora:vista') ?? '{}'))
await pulsar(['Escena', 'Ejes', 'Mostrar ejes'])
await win.waitForTimeout(400)
if ((await prefs()).ejes !== false) errores.push('[vista] «Escena ▸ Ejes ▸ Mostrar ejes» no quita los ejes')
await pulsar(['Escena', 'Ejes', 'Mostrar ejes'])
await win.waitForTimeout(400)
if ((await prefs()).ejes !== true) errores.push('[vista] «Escena ▸ Ejes ▸ Mostrar ejes» no los vuelve a poner')
await pulsar(menu.rutas[paleta.indexOf('aplicaciones')])
await win.waitForTimeout(1200)
const estadoDe = (id) => win.evaluate((id) => JSON.parse(localStorage.getItem('calculadora:estado') ?? '{}').estados?.[id], id)
const antesT = (await estadoDe('aplicaciones'))?.t
await pulsar(['Módulo', 'Restablecer el módulo'])
await win.evaluate(() => {
  const r = document.querySelector('input[type="range"]')
  if (r) {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    set.call(r, '0.3')
    r.dispatchEvent(new Event('input', { bubbles: true }))
  }
  document.activeElement?.blur?.()
})
await win.waitForTimeout(700)
const cambiado = (await estadoDe('aplicaciones'))?.t
await pulsar(['Edición', 'Deshacer'])
await win.waitForTimeout(500)
const deshecho = (await estadoDe('aplicaciones'))?.t
await pulsar(['Edición', 'Rehacer'])
await win.waitForTimeout(500)
const rehecho = (await estadoDe('aplicaciones'))?.t
if (!(cambiado !== deshecho && rehecho === cambiado)) errores.push(`[edición] deshacer/rehacer: ${antesT} → ${cambiado} → ${deshecho} → ${rehecho}`)
else console.log(`edición: deshacer ${cambiado} → ${deshecho}, rehacer → ${rehecho}`)

// 6. Objeto y Capas: añadir un punto en Gráficas, esconder su capa, eliminarla
await pulsar(menu.rutas[paleta.indexOf('grafica')])
await win.waitForTimeout(1200)
const filas = async () => (await estadoDe('grafica'))?.filas ?? []
const n0 = (await filas()).length
const fallo6 = await pulsar(['Objeto', 'Añadir', 'Punto'])
await win.waitForTimeout(800)
const tras = await filas()
if (fallo6 || tras.length < n0 || !/=\s*\(1, 1\)/.test(tras.at(-1)?.src ?? '')) errores.push(`[objeto] «Añadir ▸ Punto» no añadió la fila (${fallo6 ?? ''} ${JSON.stringify(tras.at(-1))})`)
const capas = await app.evaluate(({ Menu }) => Menu.getApplicationMenu().items.find((i) => i.label === 'Ventana').submenu.items.find((i) => i.label === 'Capas').submenu.items.filter((i) => i.type === 'submenu').map((i) => i.label))
const ultima = capas.find((c) => /= \(1, 1\)/.test(c))
if (!ultima) errores.push(`[capas] el punto nuevo no sale en Capas: ${capas.join(' | ')}`)
else {
  await pulsar(['Ventana', 'Capas', ultima, 'Mostrar'])
  await win.waitForTimeout(600)
  if ((await filas()).at(-1)?.visible !== false) errores.push('[capas] «Mostrar» no esconde la capa')
  const oculta = await app.evaluate(({ Menu }) => Menu.getApplicationMenu().items.find((i) => i.label === 'Ventana').submenu.items.find((i) => i.label === 'Capas').submenu.items.filter((i) => i.type === 'submenu').map((i) => i.label).find((l) => l.includes('(oculta)')))
  await pulsar(['Ventana', 'Capas', oculta ?? ultima, 'Eliminar'])
  await win.waitForTimeout(600)
  if ((await filas()).some((f) => /= \(1, 1\)/.test(f.src))) errores.push('[capas] «Eliminar» no quita la capa')
  else console.log(`capas: ${capas.length} en Gráficas; añadir, esconder y eliminar funcionan`)
}
// cada módulo declara capas o entradas propias
const sinMenu = []
for (const id of paleta) {
  const i = paleta.indexOf(id)
  if (i < 0) continue
  await pulsar(menu.rutas[i])
  await win.waitForTimeout(700)
  const propio = await app.evaluate(({ Menu }) => {
    const items = Menu.getApplicationMenu().items
    const capas = items.find((i) => i.label === 'Ventana').submenu.items.find((i) => i.label === 'Capas').submenu.items.some((i) => i.enabled !== false)
    const modulo = items.find((i) => i.label === 'Módulo').submenu.items.some((i) => i.label === 'Ejemplos' || (i.type !== 'separator' && !i.enabled && i.label !== 'Cargando…'))
    return capas || modulo
  })
  if (!propio) sinMenu.push(id)
}
if (sinMenu.length) errores.push(`[menú] sin capas ni entradas propias: ${sinMenu.join(', ')}`)

// 7. la barra nueva: orden fijo y esqueleto de Herramientas igual en todos los módulos
const BARRA = ['Archivo', 'Edición', 'Objeto', 'Herramientas', 'Escena', 'Vista', 'Animación', 'Módulo', 'Ventana', 'Ayuda']
const barra = await app.evaluate(({ Menu }) => Menu.getApplicationMenu().items.map((i) => i.label).slice(1))
if (barra.join('|') !== BARRA.join('|')) errores.push(`[barra] orden inesperado: ${barra.join(' · ')}`)
const esqueleto = () =>
  app.evaluate(({ Menu }) => {
    const h = Menu.getApplicationMenu().items.find((i) => i.label === 'Herramientas').submenu.items
    return {
      forma: h.map((i) => `${i.label}(${i.submenu.items.map((j) => j.label).join(',')})`).join('|'),
      activas: h.flatMap((i) => i.submenu.items.filter((j) => j.enabled).map((j) => j.label)),
    }
  })
let formaEsqueleto = null
for (const id of ['grafica', 'superficies', 'orbitales']) {
  const i = paleta.indexOf(id)
  if (i < 0) continue
  await pulsar(menu.rutas[i])
  await win.waitForTimeout(800)
  const e = await esqueleto()
  if (formaEsqueleto && formaEsqueleto !== e.forma) errores.push(`[herramientas] el esqueleto cambia en ${id}: ${e.forma}`)
  formaEsqueleto = e.forma
  const esperadas = { grafica: 'Recta tangente en x₀', superficies: 'Plano tangente', orbitales: null }[id]
  if (esperadas && !e.activas.includes(esperadas)) errores.push(`[herramientas] «${esperadas}» no está activa en ${id}`)
  if (!esperadas && e.activas.length) errores.push(`[herramientas] ${id} no declara herramientas pero hay activas: ${e.activas.join(', ')}`)
}
await pulsar(menu.rutas[paleta.indexOf('grafica')])
await win.waitForTimeout(900)
const tangenteAntes = (await estadoDe('grafica'))?.verTangente
await pulsar(['Herramientas', 'Derivación', 'Recta tangente en x₀'])
await win.waitForTimeout(500)
const tangenteDespues = (await estadoDe('grafica'))?.verTangente
if (tangenteAntes === tangenteDespues) errores.push('[herramientas] «Derivación ▸ Recta tangente» no cambia la tangente')
else console.log(`herramientas: tangente ${tangenteAntes} → ${tangenteDespues} desde el menú`)
await pulsar(['Herramientas', 'Derivación', 'Recta tangente en x₀'])
await win.waitForTimeout(300)

// 8. Buscar orden (⇧⌘P): escribir «tangente» y pulsar Intro hace lo mismo que el menú
await win.evaluate(() => document.activeElement?.blur?.())
await win.keyboard.press('Meta+Shift+p')
await win.waitForTimeout(300)
const hayPaleta = await win.evaluate(() => !!document.querySelector('[aria-label="Buscar orden"]'))
if (!hayPaleta) errores.push('[paleta] ⇧⌘P no abre «Buscar orden»')
else {
  await win.keyboard.type('recta tangente')
  await win.waitForTimeout(200)
  const primera = await win.evaluate(() => document.querySelector('#lista-ordenes li b')?.textContent)
  await win.keyboard.press('Enter')
  await win.waitForTimeout(500)
  const t2 = (await estadoDe('grafica'))?.verTangente
  if (t2 === tangenteAntes) errores.push(`[paleta] «recta tangente» + Intro no la cambia (primera: ${primera})`)
  else console.log(`paleta: «recta tangente» → ${primera}`)
  await win.keyboard.press('Meta+Shift+p')
  await win.keyboard.type('recta tangente')
  await win.keyboard.press('Enter')
  await win.waitForTimeout(300)
}

// app.close() se quedaría esperando el «¿guardar cambios?» del documento abierto: se sale sin preguntar
await app.evaluate(({ app }) => setTimeout(() => app.exit(0), 50)).catch(() => {})
console.log(errores.length ? `\n${errores.length} incidencias:\n  ${errores.join('\n  ')}` : `\nsin incidencias · capturas en ${DIR}`)
process.exit(errores.length ? 1 : 0)
