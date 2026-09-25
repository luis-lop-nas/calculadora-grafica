const { app, BrowserWindow, Menu, dialog, ipcMain, nativeImage, net, protocol, shell } = require('electron')
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

/** Muestra de color para el menú Capas: un círculo de 12 pt (24 px a 2×), cacheado por color. */
const muestras = new Map()
function muestra(hex) {
  if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return undefined
  if (muestras.has(hex)) return muestras.get(hex)
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  const n = 24
  const px = Buffer.alloc(n * n * 4)
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      // borde suavizado: cobertura según la distancia al centro
      const d = Math.hypot(x + 0.5 - n / 2, y + 0.5 - n / 2)
      const a = Math.max(0, Math.min(1, 9.5 - d))
      const k = (y * n + x) * 4
      // BGRA premultiplicado
      px[k] = Math.round(b * a)
      px[k + 1] = Math.round(g * a)
      px[k + 2] = Math.round(r * a)
      px[k + 3] = Math.round(255 * a)
    }
  const img = nativeImage.createFromBitmap(px, { width: n, height: n, scaleFactor: 2 })
  muestras.set(hex, img)
  return img
}

/** Entradas que declara el módulo (Añadir, Ejemplos, acciones) → plantilla de Electron. */
function entradasModulo(lista, grupo, ruta = []) {
  return (lista ?? []).map((e, i) => {
    const aqui = [...ruta, i]
    if (e.hijos) return { label: e.t, enabled: !e.desactivado, submenu: entradasModulo(e.hijos, grupo, aqui) }
    return {
      label: e.t,
      type: e.tipo === 'casilla' ? 'checkbox' : e.tipo === 'radio' ? 'radio' : 'normal',
      checked: e.activo,
      enabled: !e.desactivado,
      click: alFoco('menuModulo', { grupo, ruta: aqui }),
    }
  })
}

/** Capas: cada cosa dibujada con su color; submenú para mostrarla, dejarla sola o quitarla. */
function menuCapas(e) {
  const capas = e.capas ?? []
  if (!capas.length) return [{ label: 'Este módulo no tiene capas', enabled: false }]
  const alguna = capas.some((c) => c.alternable)
  const items = capas.map((c) => {
    const icon = muestra(c.color)
    const nombre = `${c.nombre}${c.detalle ? `   ${c.detalle}` : ''}`
    if (!c.alternable && !c.quitable) return { label: nombre, icon }
    const sub = []
    if (c.alternable) {
      sub.push({ label: 'Mostrar', type: 'checkbox', checked: c.visible !== false, click: alFoco('capa', { id: c.id, op: 'alternar' }) })
      sub.push({ label: 'Solo esta', click: alFoco('capa', { id: c.id, op: 'solo' }) })
    }
    if (c.quitable) {
      if (sub.length) sub.push({ type: 'separator' })
      sub.push({ label: 'Eliminar', click: alFoco('capa', { id: c.id, op: 'quitar' }) })
    }
    return { label: c.visible === false ? `${nombre}   (oculta)` : nombre, icon, submenu: sub }
  })
  return [
    { label: 'Mostrar todas', accelerator: 'Alt+CmdOrCtrl+3', enabled: alguna, click: alFoco('capa', { op: 'todas' }) },
    { label: 'Ocultar todas', enabled: alguna, click: alFoco('capa', { op: 'ninguna' }) },
    { type: 'separator' },
    ...items,
  ]
}

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
    // lo propio del módulo abierto, como la barra de opciones de Illustrator
    ...(e.menu?.ejemplos?.length || e.menu?.acciones?.length ? [{ type: 'separator' }, { label: e.nombreModulo ?? 'Este módulo', enabled: false }] : []),
    ...(e.menu?.ejemplos?.length ? [{ label: 'Ejemplos', submenu: entradasModulo(e.menu.ejemplos, 'ejemplos') }] : []),
    ...entradasModulo(e.menu?.acciones, 'acciones'),
  ]
}

/** Piezas del menú que se usan en la barra y en el menú contextual del lienzo. */
function piezasMenu(win) {
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
  const puntoDeVista = {
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
  }
  const superposiciones = {
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
  }
  const reproducir = {
    label: 'Reproducir (espacio)',
    type: 'checkbox',
    checked: !e.pausado,
    accelerator: 'Alt+CmdOrCtrl+P',
    enabled: hay && !!e.animado,
    click: (item) => enviar(BrowserWindow.getFocusedWindow(), 'animacion', { pausado: !item.checked }),
  }
  const animacion = [
    reproducir,
    { label: 'Avanzar un fotograma', accelerator: 'Alt+CmdOrCtrl+Right', enabled: hay && !!e.animado, click: alFoco('animacion', 'paso') },
    { label: 'Volver al instante 0', accelerator: 'Alt+CmdOrCtrl+Left', enabled: hay && !!e.animado, click: alFoco('animacion', 'reiniciar') },
    {
      label: 'Velocidad',
      enabled: hay && !!e.animado,
      submenu: [0.25, 0.5, 1, 2, 4].map((v) => ({ label: `${String(v).replace('.', ',')}×`, type: 'radio', checked: (e.velocidad ?? 1) === v, click: alFoco('animacion', { velocidad: v }) })),
    },
    { type: 'separator' },
    { label: 'Grabar vídeo del lienzo (WebM)', type: 'checkbox', checked: !!e.grabando, accelerator: 'Alt+Shift+CmdOrCtrl+R', enabled: lienzo, click: alFoco('grabar') },
  ]
  const paso = p.paso ?? 0.5
  const numero = (v) => String(v).replace('.', ',')
  const transformar = {
    label: 'Transformar',
    enabled: hay && !!e.transformable,
    submenu: e.transformable
      ? [
          {
            label: 'Mover',
            submenu: [0, 1, 2].flatMap((k) => [
              ...(k ? [{ type: 'separator' }] : []),
              { label: `+${numero(paso)} en ${'XYZ'[k]}`, click: alFoco('transformar', { op: 'mover', eje: k, valor: paso }) },
              { label: `−${numero(paso)} en ${'XYZ'[k]}`, click: alFoco('transformar', { op: 'mover', eje: k, valor: -paso }) },
            ]),
          },
          {
            label: 'Girar',
            submenu: [0, 1, 2].flatMap((k) => [
              ...(k ? [{ type: 'separator' }] : []),
              ...[15, -15, 90, -90].map((a) => ({ label: `${a > 0 ? '+' : '−'}${Math.abs(a)}° en ${'XYZ'[k]}`, click: alFoco('transformar', { op: 'girar', eje: k, valor: a }) })),
            ]),
          },
        ]
      : [{ label: 'Este módulo no tiene figuras que mover', enabled: false }],
  }
  const anadir = {
    label: 'Añadir',
    enabled: hay && !!e.menu?.anadir?.length,
    submenu: e.menu?.anadir?.length ? entradasModulo(e.menu.anadir, 'anadir') : [{ label: 'Nada que añadir aquí', enabled: false }],
  }
  return { e, hay, p, lienzo, es3D, prefs, vista, casilla, puntoDeVista, superposiciones, reproducir, animacion, transformar, anadir }
}

function construirMenu() {
  const win = BrowserWindow.getFocusedWindow()
  const { e, hay, p, lienzo, es3D, prefs, vista, casilla, puntoDeVista, superposiciones, animacion, transformar, anadir } = piezasMenu(win)
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
      label: 'Objeto',
      submenu: [
        anadir,
        transformar,
        { type: 'separator' },
        {
          label: 'Eliminar',
          enabled: hay && (e.capas ?? []).some((c) => c.quitable),
          submenu: (e.capas ?? []).some((c) => c.quitable)
            ? e.capas.filter((c) => c.quitable).map((c) => ({ label: c.nombre, icon: muestra(c.color), click: alFoco('capa', { id: c.id, op: 'quitar' }) }))
            : [{ label: 'Nada que eliminar', enabled: false }],
        },
        { type: 'separator' },
        { label: 'Ocultar todo', enabled: hay && (e.capas ?? []).some((c) => c.alternable), click: alFoco('capa', { op: 'ninguna' }) },
        { label: 'Mostrar todo', enabled: hay && (e.capas ?? []).some((c) => c.alternable), click: alFoco('capa', { op: 'todas' }) },
      ],
    },
    { label: 'Capas', submenu: hay ? menuCapas(e) : [{ label: 'Sin ventana', enabled: false }] },
    {
      label: 'Vista',
      submenu: [
        puntoDeVista,
        { label: 'Encuadrar todo', accelerator: 'CmdOrCtrl+0', enabled: lienzo, click: vista({ orden: 'encuadrar' }) },
        { label: 'Acercar', accelerator: 'CmdOrCtrl+Plus', enabled: lienzo, click: vista({ orden: 'acercar', factor: 0.8 }) },
        { label: 'Alejar', accelerator: 'CmdOrCtrl+-', enabled: lienzo, click: vista({ orden: 'acercar', factor: 1.25 }) },
        { type: 'separator' },
        superposiciones,
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
        // sin atajo en el menú: ⇧Espacio lo hace la página y robarlo rompería los campos de texto
        { label: 'Autogiro (⇧ espacio)', type: 'checkbox', checked: !!e.giro, enabled: hay && e.es3D, click: alFoco('giro') },
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
    { label: 'Animación', submenu: animacion },
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

// clic derecho en un lienzo: lo más usado de la barra, a mano (como en Blender o Illustrator)
ipcMain.on('contextual', (ev) => {
  const win = BrowserWindow.fromWebContents(ev.sender)
  if (!win) return
  const { e, lienzo, es3D, puntoDeVista, superposiciones, reproducir, transformar, anadir } = piezasMenu(win)
  const plantilla = [
    ...(e.menu?.anadir?.length ? [anadir] : []),
    ...((e.capas ?? []).length ? [{ label: 'Capas', submenu: menuCapas(e) }] : []),
    ...(e.transformable ? [transformar] : []),
    { type: 'separator' },
    ...(es3D ? [puntoDeVista] : []),
    { label: 'Encuadrar todo', enabled: lienzo, click: alFoco('vista', { orden: 'encuadrar' }) },
    superposiciones,
    ...(e.animado ? [{ type: 'separator' }, reproducir] : []),
    { type: 'separator' },
    { label: 'Copiar imagen del lienzo', enabled: lienzo, click: alFoco('copiar', 'imagen') },
    { label: 'Exportar imagen PNG…', enabled: lienzo, click: alFoco('png') },
    { type: 'separator' },
    { label: 'Deshacer', enabled: true, click: alFoco('deshacer') },
    { label: 'Rehacer', enabled: true, click: alFoco('rehacer') },
  ]
  Menu.buildFromTemplate(plantilla).popup({ window: win })
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
