const { test } = require('node:test')
const assert = require('node:assert/strict')
const { documentosEnArgumentos, menuPlataforma, ordenesDelMenu } = require('../electron/plataforma.cjs')

test('abrir documentos desde argumentos conserva espacios y respeta el cwd del gestor de archivos', () => {
  assert.deepEqual(documentosEnArgumentos(['--user-data-dir=perfil.calc', 'Mi problema.calc', 'file:///tmp/otro%20problema.calc', 'Mi problema.calc', 'https://ejemplo.org', 'file://%'], '/tmp'), ['/tmp/Mi problema.calc', '/tmp/otro problema.calc'])
})

test('la paleta refleja disponibilidad heredada y conserva la identidad al reordenar el menú', () => {
  const hoja={label:'Función / tangente',enabled:true,type:'checkbox',checked:true}
  const padre={label:'Herramientas',enabled:false,submenu:{items:[hoja]}}
  const menu={items:[{label:'Oculto',visible:false},padre]}
  const [orden]=ordenesDelMenu(menu)
  assert.equal(orden.desactivado,true)
  assert.equal(orden.activo,true)
  assert.equal(ordenesDelMenu({items:[padre,{label:'Nuevo'}]})[0].id,orden.id)
  assert.equal(orden.camino.at(-1),'Función / tangente')
  assert.equal(orden.item,hoja)
})
test('Linux expone recientes, salir y acerca de, sin roles exclusivos de macOS', () => {
  let abierto, borrado = false
  const plantilla = [
    { label: 'Calculadora gráfica', submenu: [] },
    { label: 'Archivo', submenu: [{ role: 'recentDocuments' }] },
    { label: 'Edición', submenu: [{ role: 'copy' }, { role: 'startSpeaking' }] },
    { label: 'Ventana', role: 'windowMenu', submenu: [{ role: 'minimize' }, { role: 'front' }, { role: 'zoom' }] },
    { label: 'Ayuda', submenu: [] },
  ]
  assert.equal(menuPlataforma(plantilla, 'darwin'), plantilla)
  const menu = menuPlataforma(structuredClone(plantilla), 'linux', ['/tmp/a.calc'], (p) => abierto = p, () => borrado = true)
  assert.equal(menu.length, 4)
  menu[0].submenu[0].submenu[0].click()
  assert.equal(abierto, '/tmp/a.calc')
  menu[0].submenu[0].submenu.at(-1).click()
  assert.equal(borrado, true)
  assert.equal(menu[0].submenu.at(-1).role, 'quit')
  assert.deepEqual(menu[2].submenu, [{ role: 'minimize' }])
  assert.equal(menu.at(-1).submenu.at(-1).role, 'about')
})
