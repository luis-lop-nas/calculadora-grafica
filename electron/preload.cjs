// Puente entre el proceso principal y React. Solo expone estas funciones: la página no ve Node.
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('escritorio', {
  /** Avisa de que React está montado; devuelve el documento que haya que abrir en esta ventana. */
  listo: (modulos) => ipcRenderer.invoke('listo', modulos),
  estado: (estado) => ipcRenderer.send('estado', estado),
  guardar: (contenido, como, nombre) => ipcRenderer.invoke('guardar', { contenido, como, nombre }),
  contextual: () => ipcRenderer.send('contextual'),
  alOrden: (fn) => {
    const oyente = (_ev, orden, dato) => fn(orden, dato)
    ipcRenderer.on('orden', oyente)
    return () => ipcRenderer.removeListener('orden', oyente)
  },
})
