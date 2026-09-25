const path = require('node:path')
const { fileURLToPath } = require('node:url')

/** Solo documentos explícitos: no confundir opciones de Chromium con rutas. */
function documentosEnArgumentos(args, cwd = process.cwd()) {
  return [...new Set(args.filter((s) => typeof s === 'string' && !s.startsWith('-')).flatMap((s) => {
    try {
      const ruta = s.startsWith('file://') ? fileURLToPath(s) : path.resolve(cwd, s)
      return /\.calc$/i.test(ruta) ? [ruta] : []
    } catch { return [] }
  }))]
}

function menuPlataforma(plantilla, plataforma, recientes, abrir, limpiar) {
  if (plataforma === 'darwin') return plantilla
  const menu = plantilla.filter((m) => m.label !== 'Calculadora gráfica')
  const archivo = menu.find((m) => m.label === 'Archivo')
  archivo.submenu = archivo.submenu.map((i) => i.role !== 'recentDocuments' ? i : {
    label: 'Abrir recientes',
    submenu: recientes.length ? [
      ...recientes.map((ruta) => ({ label: ruta, click: () => abrir(ruta) })),
      { type: 'separator' }, { label: 'Borrar menú', click: limpiar },
    ] : [{ label: 'No hay documentos recientes', enabled: false }],
  })
  archivo.submenu.push({ type: 'separator' }, { label: 'Salir', role: 'quit', accelerator: 'Ctrl+Q' })
  const editar = menu.find((m) => m.label === 'Edición')
  const ajustes = plantilla.find(m => m.label === 'Calculadora gráfica')?.submenu.find(i => i.label === 'Ajustes…')
  if (ajustes) editar.submenu.push({ type: 'separator' }, ajustes)
  editar.submenu = editar.submenu.filter((i) => !['startSpeaking', 'stopSpeaking'].includes(i.role))
  const ventana = menu.find((m) => m.label === 'Ventana')
  delete ventana.role
  ventana.submenu = ventana.submenu.filter((i) => !['front', 'zoom'].includes(i.role))
  menu.find((m) => m.label === 'Ayuda').submenu.push({ type: 'separator' }, { role: 'about', label: 'Acerca de Calculadora gráfica' })
  return menu
}

/** Descriptor y resolución comparten el mismo recorrido del menú instalado. */
function ordenesDelMenu(menu, camino = [], habilitado = true) {
  return (menu?.items ?? []).flatMap(item => {
    if (item.type === 'separator' || item.visible === false) return []
    const ruta = [...camino, item.label]
    const activo = habilitado && item.enabled !== false
    if (item.submenu) return ordenesDelMenu(item.submenu, ruta, activo)
    return [{ id: ruta.map(encodeURIComponent).join('/'), camino: ruta, desactivado: !activo, activo: ['checkbox','radio'].includes(item.type) ? item.checked : undefined, item }]
  })
}

module.exports = { documentosEnArgumentos, menuPlataforma, ordenesDelMenu }
