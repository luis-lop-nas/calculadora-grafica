const { app, BrowserWindow, Menu, dialog, ipcMain, net, protocol, shell } = require('electron')
const fs = require('node:fs/promises')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

const DIST = path.join(__dirname, '..', 'dist')
// en desarrollo, electron/dev.mjs pasa la URL del servidor de Vite
const URL_DEV = process.env.CALC_URL

// Un esquema propio en vez de file://: origen estable (el autoguardado de localStorage
// no cambia de sitio) y los módulos ES de Vite cargan sin quejas de CORS.
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
])

/** Por ventana: documento abierto, lo que hay que cargar al arrancar y lo que el menú necesita saber. */
const ventanas = new Map()
let modulos = []
let pendientesAlArrancar = []

function crearVentana(documento = null) {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'Calculadora',
    backgroundColor: '#0e0f12',
    titleBarStyle: 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  ventanas.set(win.id, { ruta: documento?.ruta ?? null, pendiente: documento, estado: {} })

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  win.on('page-title-updated', (ev) => {
    if (ventanas.get(win.id)?.ruta) ev.preventDefault()
  })
  win.on('close', (ev) => avisarSinGuardar(win, ev))
  win.on('closed', () => {
    ventanas.delete(win.id)
    construirMenu()
  })
  win.on('focus', construirMenu)

  if (URL_DEV) win.loadURL(URL_DEV)
  else win.loadURL('app://calculadora/index.html')
  if (documento) marcarDocumento(win, documento.ruta)
  return win
}

function marcarDocumento(win, ruta) {
  const v = ventanas.get(win.id)
  v.ruta = ruta
  win.setRepresentedFilename(ruta)
  win.setTitle(path.basename(ruta))
  win.setDocumentEdited(false)
  app.addRecentDocument(ruta)
}

/** Solo pregunta si hay un documento con nombre: lo demás ya lo cubre el autoguardado. */
function avisarSinGuardar(win, ev) {
  const v = ventanas.get(win.id)
  if (!v?.ruta || !v.estado.modificado || v.cerrarSinPreguntar) return
  ev.preventDefault()
  const r = dialog.showMessageBoxSync(win, {
    type: 'warning',
    message: `¿Guardar los cambios de «${path.basename(v.ruta)}»?`,
    detail: 'Si no los guardas, el documento se queda como estaba.',
    buttons: ['Guardar', 'Cancelar', 'No guardar'],
    defaultId: 0,
    cancelId: 1,
  })
  if (r === 1) return
  v.cerrarSinPreguntar = true
  if (r === 2) return win.close()
  v.cerrarTrasGuardar = true
  enviar(win, 'guardar')
}

async function leerDocumento(ruta) {
  try {
    const datos = JSON.parse(await fs.readFile(ruta, 'utf8'))
    if (!datos || typeof datos !== 'object' || typeof datos.estados !== 'object') throw new Error('no es una sesión')
    return { ruta, datos }
  } catch (e) {
    dialog.showErrorBox('No se puede abrir el documento', `${path.basename(ruta)}: ${e.message}`)
    return null
  }
}

/** Reutiliza la ventana enfocada si está en blanco y sin tocar; si no, abre otra. */
async function abrirRuta(ruta) {
  const documento = await leerDocumento(ruta)
  if (!documento) return
  const win = BrowserWindow.getFocusedWindow()
  const v = win && ventanas.get(win.id)
  if (win && v && !v.ruta && !v.estado.modificado) {
    marcarDocumento(win, ruta)
    enviar(win, 'abrir', documento.datos)
  } else {
    crearVentana(documento)
  }
}

async function abrirConDialogo() {
  const r = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Sesión de Calculadora', extensions: ['calc', 'json'] }],
  })
  for (const ruta of r.filePaths) await abrirRuta(ruta)
}

function enviar(win, orden, dato) {
  win?.webContents.send('orden', orden, dato)
}

const alFoco = (orden, dato) => () => enviar(BrowserWindow.getFocusedWindow(), orden, dato)

function menuModulos() {
  const items = []
  let area = null
  let n = 0
  for (const m of modulos) {
    if (m.area !== area) {
      if (area) items.push({ type: 'separator' })
      area = m.area
      n++
      // ⌘1…⌘7 = las pestañas de área, en el mismo orden
      items.push({ label: m.nombreArea, enabled: false })
    }
    const actual = ventanas.get(BrowserWindow.getFocusedWindow()?.id)?.estado.id
    items.push({ label: m.nombre, type: 'radio', checked: m.id === actual, click: alFoco('modulo', m.id) })
  }
  const areas = [...new Map(modulos.map((m) => [m.area, m])).values()]
  return [
    // la página ya escucha ⌘K por su cuenta (también en la web): el menú solo lo muestra
    { label: 'Buscar módulo…', accelerator: 'CmdOrCtrl+K', registerAccelerator: false, click: alFoco('buscar') },
    { label: 'Módulo anterior', accelerator: 'CmdOrCtrl+[', click: alFoco('paso', -1) },
    { label: 'Módulo siguiente', accelerator: 'CmdOrCtrl+]', click: alFoco('paso', 1) },
    { type: 'separator' },
    {
      label: 'Ir al área',
      submenu: areas.map((m, i) => ({ label: m.nombreArea, accelerator: i < 9 ? `CmdOrCtrl+${i + 1}` : undefined, click: alFoco('modulo', m.id) })),
    },
    { type: 'separator' },
    ...(n ? items : [{ label: 'Cargando…', enabled: false }]),
  ]
}

function construirMenu() {
  const win = BrowserWindow.getFocusedWindow()
  const e = (win && ventanas.get(win.id)?.estado) || {}
  const hayVentana = !!win
  const plantilla = [
    { role: 'appMenu', label: 'Calculadora' },
    {
      label: 'Archivo',
      submenu: [
        { label: 'Nueva ventana', accelerator: 'CmdOrCtrl+N', click: () => crearVentana() },
        { label: 'Abrir…', accelerator: 'CmdOrCtrl+O', click: abrirConDialogo },
        { role: 'recentDocuments', label: 'Abrir recientes', submenu: [{ role: 'clearRecentDocuments', label: 'Borrar menú' }] },
        { type: 'separator' },
        { label: 'Cerrar ventana', accelerator: 'CmdOrCtrl+W', role: 'close' },
        { label: 'Guardar', accelerator: 'CmdOrCtrl+S', enabled: hayVentana, click: alFoco('guardar') },
        { label: 'Guardar como…', accelerator: 'CmdOrCtrl+Shift+S', enabled: hayVentana, click: alFoco('guardarComo') },
        { type: 'separator' },
        { label: 'Exportar imagen PNG…', accelerator: 'CmdOrCtrl+E', enabled: hayVentana && e.hayLienzo, click: alFoco('png') },
        { label: 'Exportar lecturas CSV…', enabled: hayVentana && e.hayLecturas, click: alFoco('csv') },
      ],
    },
    { role: 'editMenu', label: 'Edición' },
    { label: 'Módulo', submenu: menuModulos() },
    {
      label: 'Vista',
      submenu: [
        { label: 'Comparar A y B', type: 'checkbox', accelerator: 'CmdOrCtrl+D', checked: !!e.comparar, enabled: hayVentana, click: alFoco('comparar') },
        // sin atajo en el menú: la barra espaciadora ya lo hace y robarla rompería los campos de texto
        { label: 'Autogiro (espacio)', type: 'checkbox', checked: !!e.giro, enabled: hayVentana && e.es3D, click: alFoco('giro') },
        { type: 'separator' },
        { role: 'resetZoom', label: 'Tamaño real' },
        { role: 'zoomIn', label: 'Ampliar' },
        { role: 'zoomOut', label: 'Reducir' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Pantalla completa' },
        { type: 'separator' },
        { role: 'reload', label: 'Recargar' },
        { role: 'toggleDevTools', label: 'Herramientas de desarrollo' },
      ],
    },
    { role: 'windowMenu', label: 'Ventana' },
    {
      role: 'help',
      label: 'Ayuda',
      submenu: [{ label: 'Guía de la calculadora (README)', click: () => shell.openPath(path.join(__dirname, '..', 'README.md').replace('app.asar', 'app.asar.unpacked')) }],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(plantilla))
}

ipcMain.handle('listo', (ev, lista) => {
  if (Array.isArray(lista) && lista.length) modulos = lista
  const win = BrowserWindow.fromWebContents(ev.sender)
  const v = win && ventanas.get(win.id)
  const doc = v?.pendiente?.datos ?? null
  if (v) v.pendiente = null
  construirMenu()
  return doc
})

ipcMain.on('estado', (ev, estado) => {
  const win = BrowserWindow.fromWebContents(ev.sender)
  const v = win && ventanas.get(win.id)
  if (!v) return
  v.estado = estado
  win.setDocumentEdited(!!v.ruta && !!estado.modificado)
  if (win.isFocused()) construirMenu()
})

ipcMain.handle('guardar', async (ev, { contenido, como, nombre }) => {
  const win = BrowserWindow.fromWebContents(ev.sender)
  const v = ventanas.get(win.id)
  let ruta = v.ruta
  if (como || !ruta) {
    const r = await dialog.showSaveDialog(win, {
      defaultPath: ruta ?? `${nombre}.calc`,
      filters: [{ name: 'Sesión de Calculadora', extensions: ['calc'] }],
    })
    if (r.canceled || !r.filePath) {
      v.cerrarSinPreguntar = false
      v.cerrarTrasGuardar = false
      return null
    }
    ruta = r.filePath
  }
  await fs.writeFile(ruta, contenido, 'utf8')
  marcarDocumento(win, ruta)
  if (v.cerrarTrasGuardar) setImmediate(() => win.close())
  return ruta
})

// Finder puede pedir abrir un .calc antes de que la app esté lista
app.on('open-file', (ev, ruta) => {
  ev.preventDefault()
  if (app.isReady()) abrirRuta(ruta)
  else pendientesAlArrancar.push(ruta)
})

app.whenReady().then(async () => {
  protocol.handle('app', (req) => {
    const pedido = decodeURIComponent(new URL(req.url).pathname)
    const fichero = path.normalize(path.join(DIST, pedido === '/' ? 'index.html' : pedido))
    if (!fichero.startsWith(DIST + path.sep)) return new Response('', { status: 403 })
    return net.fetch(pathToFileURL(fichero).toString())
  })
  construirMenu()
  if (pendientesAlArrancar.length) {
    for (const ruta of pendientesAlArrancar) {
      const doc = await leerDocumento(ruta)
      if (doc) crearVentana(doc)
    }
    pendientesAlArrancar = []
  }
  if (BrowserWindow.getAllWindows().length === 0) crearVentana()
})

// Mac: cerrar la última ventana no cierra la app; pinchar en el Dock abre otra
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) crearVentana()
})
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
