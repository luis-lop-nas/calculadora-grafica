const { app, BrowserWindow, Menu, dialog, ipcMain, net, protocol, shell } = require('electron')
const fs = require('node:fs/promises')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

// en la app empaquetada el nombre sale del bundle; en desarrollo (Electron.app) esto cubre el resto
app.setName('Calculadora gráfica')
// el nombre entra en el User-Agent, y una cabecera con «á» rompe el protocolo app://
app.userAgentFallback = app.userAgentFallback.replace(/[^\x20-\x7e]/g, (c) => c.normalize('NFD')[0].replace(/[^\x20-\x7e]/, '-'))
app.setAboutPanelOptions({
  applicationName: 'Calculadora gráfica',
  applicationVersion: app.getVersion(),
  credits: 'Álgebra, geometría, funciones, EDO, EDP y física, con lienzos 2D y 3D.',
})

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
    title: 'Calculadora gráfica',
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

function menuModulos(e) {
  // áreas como submenús, al estilo de los menús de Adobe: Álgebra ▸ Matrices…
  const grupos = []
  for (const m of modulos) {
    let g = grupos.find((x) => x.area === m.area)
    if (!g) grupos.push((g = { area: m.area, nombre: m.nombreArea, modulos: [] }))
    g.modulos.push(m)
  }
  const porArea = grupos.map((g) => ({
    label: g.nombre,
    submenu: g.modulos.map((m) => ({ label: m.nombre, type: 'radio', checked: m.id === e.id, click: alFoco('modulo', m.id) })),
  }))
  return [
    // la página ya escucha ⌘K por su cuenta (también en la web): el menú solo lo muestra
    { label: 'Buscar módulo…', accelerator: 'CmdOrCtrl+K', registerAccelerator: false, click: alFoco('buscar') },
    { label: 'Módulo anterior', accelerator: 'CmdOrCtrl+[', click: alFoco('paso', -1) },
    { label: 'Módulo siguiente', accelerator: 'CmdOrCtrl+]', click: alFoco('paso', 1) },
    { type: 'separator' },
    {
      label: 'Ir al área',
      submenu: grupos.map((g, i) => ({ label: g.nombre, accelerator: i < 9 ? `CmdOrCtrl+${i + 1}` : undefined, click: alFoco('modulo', g.modulos[0].id) })),
    },
    { type: 'separator' },
    ...(grupos.length ? porArea : [{ label: 'Cargando…', enabled: false }]),
  ]
}

function construirMenu() {
  const win = BrowserWindow.getFocusedWindow()
  const e = (win && ventanas.get(win.id)?.estado) || {}
  const hay = !!win
  const p = e.prefs || {}
  const lienzo = hay && e.hayLienzo
  const es3D = lienzo && e.tipo === '3d'
  const prefs = (dato) => alFoco('prefs', dato)
  const vista = (dato) => alFoco('vista', dato)
  /** Casilla ligada a una preferencia de vista. */
  // la casilla ya cambió al pulsarla: se manda su valor nuevo, no el que había al construir el menú
  const casilla = (label, clave, extra = {}) => ({
    label,
    type: 'checkbox',
    checked: !!p[clave],
    enabled: hay,
    click: (item) => enviar(BrowserWindow.getFocusedWindow(), 'prefs', { [clave]: item.checked }),
    ...extra,
  })
  const plantilla = [
    {
      label: 'Calculadora gráfica',
      submenu: [
        { role: 'about', label: 'Acerca de Calculadora gráfica' },
        { type: 'separator' },
        { role: 'services', label: 'Servicios' },
        { type: 'separator' },
        { role: 'hide', label: 'Ocultar Calculadora gráfica' },
        { role: 'hideOthers', label: 'Ocultar otros' },
        { role: 'unhide', label: 'Mostrar todo' },
        { type: 'separator' },
        { role: 'quit', label: 'Salir de Calculadora gráfica' },
      ],
    },
    {
      label: 'Archivo',
      submenu: [
        { label: 'Nueva ventana', accelerator: 'CmdOrCtrl+N', click: () => crearVentana() },
        { label: 'Abrir…', accelerator: 'CmdOrCtrl+O', click: abrirConDialogo },
        { role: 'recentDocuments', label: 'Abrir recientes', submenu: [{ role: 'clearRecentDocuments', label: 'Borrar menú' }] },
        { type: 'separator' },
        { label: 'Cerrar ventana', accelerator: 'CmdOrCtrl+W', role: 'close' },
        { label: 'Guardar', accelerator: 'CmdOrCtrl+S', enabled: hay, click: alFoco('guardar') },
        { label: 'Guardar como…', accelerator: 'CmdOrCtrl+Shift+S', enabled: hay, click: alFoco('guardarComo') },
        { label: 'Volver a lo guardado', enabled: hay && !!ventanas.get(win.id)?.ruta && !!e.modificado, click: () => volverALoGuardado(win) },
        { type: 'separator' },
        {
          label: 'Exportar',
          submenu: [
            { label: 'Imagen PNG…', accelerator: 'CmdOrCtrl+E', enabled: lienzo, click: alFoco('png') },
            { label: 'PDF…', accelerator: 'CmdOrCtrl+Shift+E', enabled: hay, click: () => exportarPDF(win) },
            { type: 'separator' },
            { label: 'Lecturas (CSV)…', enabled: hay && e.hayLecturas, click: alFoco('csv') },
            { label: 'Estado del módulo (JSON)…', enabled: hay, click: alFoco('json') },
          ],
        },
        { type: 'separator' },
        { label: 'Imprimir…', accelerator: 'CmdOrCtrl+P', enabled: hay, click: () => win?.webContents.print() },
      ],
    },
    {
      label: 'Edición',
      submenu: [
        // en un campo de texto la página hace el deshacer del campo; fuera, el del módulo
        { label: 'Deshacer', accelerator: 'CmdOrCtrl+Z', enabled: hay, click: alFoco('deshacer') },
        { label: 'Rehacer', accelerator: 'Shift+CmdOrCtrl+Z', enabled: hay, click: alFoco('rehacer') },
        { type: 'separator' },
        { role: 'cut', label: 'Cortar' },
        { role: 'copy', label: 'Copiar' },
        { role: 'paste', label: 'Pegar' },
        { role: 'selectAll', label: 'Seleccionar todo' },
        {
          label: 'Copiar como',
          submenu: [
            { label: 'Imagen del lienzo', accelerator: 'Shift+CmdOrCtrl+C', enabled: lienzo, click: alFoco('copiar', 'imagen') },
            { label: 'Fórmula en LaTeX', enabled: hay && e.hayFormula, click: alFoco('copiar', 'latex') },
            { label: 'Lecturas (texto con tabuladores)', enabled: hay && e.hayLecturas, click: alFoco('copiar', 'lecturas') },
          ],
        },
        { type: 'separator' },
        { label: 'Restablecer el módulo', enabled: hay, click: alFoco('restablecer') },
        { type: 'separator' },
        { role: 'startSpeaking', label: 'Empezar a leer' },
        { role: 'stopSpeaking', label: 'Dejar de leer' },
      ],
    },
    { label: 'Módulo', submenu: menuModulos(e) },
    {
      label: 'Vista',
      submenu: [
        {
          label: 'Punto de vista',
          enabled: es3D,
          submenu: [
            // X, Y, Z y 0 ya los atiende el lienzo: aquí solo se muestran (robarlos rompería los campos)
            { label: 'Vista de partida', accelerator: '0', registerAccelerator: false, click: vista({ orden: 'punto', modo: '3d' }) },
            { label: 'Desde el eje X', accelerator: 'X', registerAccelerator: false, click: vista({ orden: 'punto', modo: 'x' }) },
            { label: 'Desde el eje Y', accelerator: 'Y', registerAccelerator: false, click: vista({ orden: 'punto', modo: 'y' }) },
            { label: 'Desde el eje Z (planta)', accelerator: 'Z', registerAccelerator: false, click: vista({ orden: 'punto', modo: 'z' }) },
            { label: 'Isométrica', click: vista({ orden: 'punto', modo: 'iso' }) },
            { type: 'separator' },
            casilla('Proyección ortográfica', 'ortografica', { accelerator: 'Shift+CmdOrCtrl+O', enabled: es3D }),
          ],
        },
        { label: 'Encuadrar todo', accelerator: 'CmdOrCtrl+0', enabled: lienzo, click: vista({ orden: 'encuadrar' }) },
        { label: 'Acercar', accelerator: 'CmdOrCtrl+Plus', enabled: lienzo, click: vista({ orden: 'acercar', factor: 0.8 }) },
        { label: 'Alejar', accelerator: 'CmdOrCtrl+-', enabled: lienzo, click: vista({ orden: 'acercar', factor: 1.25 }) },
        { type: 'separator' },
        {
          label: 'Superposiciones',
          submenu: [
            casilla('Ejes', 'ejes'),
            casilla('Nombres de los ejes', 'nombres'),
            casilla('Rejilla', 'rejilla'),
            casilla('Rejilla en los tres planos (XY, XZ, YZ)', 'planos', { enabled: es3D }),
            { type: 'separator' },
            casilla('Leyenda', 'leyenda'),
            casilla('Fórmula', 'formula'),
            casilla('Lecturas', 'lecturas'),
          ],
        },
        casilla('Ajustar a la rejilla', 'ajustar', { accelerator: "Shift+CmdOrCtrl+'" }),
        {
          label: 'Paso de la rejilla',
          submenu: [0.1, 0.25, 0.5, 1].map((v) => ({
            label: String(v).replace('.', ','),
            type: 'radio',
            checked: p.paso === v,
            enabled: hay,
            click: prefs({ paso: v }),
          })),
        },
        { type: 'separator' },
        {
          label: 'Comparar A y B',
          submenu: [
            { label: 'Activar', type: 'checkbox', accelerator: 'Alt+CmdOrCtrl+D', checked: !!e.comparar, enabled: hay, click: alFoco('comparar') },
            { type: 'separator' },
            { label: 'Lado a lado', type: 'radio', checked: e.disposicion !== 'encima', enabled: hay, click: alFoco('cmp', { disposicion: 'lado' }) },
            { label: 'Superpuestos', type: 'radio', checked: e.disposicion === 'encima', enabled: hay, click: alFoco('cmp', { disposicion: 'encima' }) },
            { label: 'Cámaras enlazadas', type: 'checkbox', checked: !!e.enlazar, enabled: hay, click: (item) => enviar(BrowserWindow.getFocusedWindow(), 'cmp', { enlazar: item.checked }) },
            { type: 'separator' },
            { label: 'Copiar A en B', enabled: hay && e.comparar && e.mismoModulo, click: alFoco('cmp', 'copiarAenB') },
          ],
        },
        // sin atajo en el menú: la barra espaciadora ya lo hace y robarla rompería los campos de texto
        { label: 'Autogiro (espacio)', type: 'checkbox', checked: !!e.giro, enabled: hay && e.es3D, click: alFoco('giro') },
        { type: 'separator' },
        casilla('Modo presentación', 'presentacion', { accelerator: 'CmdOrCtrl+\\' }),
        {
          label: 'Tema',
          submenu: [
            ['sistema', 'Como el sistema'],
            ['claro', 'Claro'],
            ['oscuro', 'Oscuro'],
          ].map(([v, t]) => ({ label: t, type: 'radio', checked: (p.tema ?? 'sistema') === v, enabled: hay, click: prefs({ tema: v }) })),
        },
        { role: 'togglefullscreen', label: 'Pantalla completa' },
        { type: 'separator' },
        {
          label: 'Tamaño de la interfaz',
          submenu: [
            { role: 'resetZoom', label: 'Tamaño real', accelerator: 'Alt+CmdOrCtrl+0' },
            { role: 'zoomIn', label: 'Más grande', accelerator: 'Alt+CmdOrCtrl+Plus' },
            { role: 'zoomOut', label: 'Más pequeña', accelerator: 'Alt+CmdOrCtrl+-' },
          ],
        },
        {
          label: 'Desarrollo',
          submenu: [
            // ⌘R es girar la figura seleccionada en los lienzos 3D: recargar pasa a ⌥⌘R
            { role: 'reload', label: 'Recargar', accelerator: 'Alt+CmdOrCtrl+R' },
            { role: 'toggleDevTools', label: 'Herramientas de desarrollo' },
          ],
        },
      ],
    },
    {
      role: 'windowMenu',
      label: 'Ventana',
    },
    {
      role: 'help',
      label: 'Ayuda',
      submenu: [
        { label: 'Atajos de teclado', accelerator: 'CmdOrCtrl+/', enabled: hay, click: alFoco('atajos') },
        { label: 'Guía de la calculadora (README)', click: () => shell.openPath(path.join(__dirname, '..', 'README.md').replace('app.asar', 'app.asar.unpacked')) },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(plantilla))
}

async function volverALoGuardado(win) {
  const v = win && ventanas.get(win.id)
  if (!v?.ruta) return
  const r = dialog.showMessageBoxSync(win, {
    type: 'warning',
    message: `¿Volver a la versión guardada de «${path.basename(v.ruta)}»?`,
    detail: 'Se pierden los cambios desde la última vez que guardaste.',
    buttons: ['Volver', 'Cancelar'],
    defaultId: 0,
    cancelId: 1,
  })
  if (r !== 0) return
  const documento = await leerDocumento(v.ruta)
  if (documento) {
    enviar(win, 'abrir', documento.datos)
    win.setDocumentEdited(false)
  }
}

async function exportarPDF(win) {
  if (!win) return
  const v = ventanas.get(win.id)
  const r = await dialog.showSaveDialog(win, {
    defaultPath: `${v?.ruta ? path.basename(v.ruta, path.extname(v.ruta)) : `calculadora-${v?.estado?.id ?? 'modulo'}`}.pdf`,
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  })
  if (r.canceled || !r.filePath) return
  const pdf = await win.webContents.printToPDF({ landscape: true, printBackground: true, pageSize: 'A4' })
  await fs.writeFile(r.filePath, pdf)
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
