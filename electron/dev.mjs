// Vite en caliente + Electron apuntando a él. Al cerrar Electron se para también Vite.
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { createServer } from 'vite'

const servidor = await createServer({ server: { open: false } })
await servidor.listen()
const url = servidor.resolvedUrls.local[0]

const electron = createRequire(import.meta.url)('electron')
// VS Code exporta ELECTRON_RUN_AS_NODE a sus procesos: con ella Electron arranca como Node y no abre ventana
const { ELECTRON_RUN_AS_NODE, ...entorno } = process.env
const hijo = spawn(electron, ['.'], { stdio: 'inherit', env: { ...entorno, CALC_URL: url } })
hijo.on('exit', async (codigo) => {
  await servidor.close()
  process.exit(codigo ?? 0)
})
