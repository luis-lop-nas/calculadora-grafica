/**
 * Instala la app empaquetada en /Applications (o en ~/Applications si no hay permiso):
 *   npm run app:instalar
 * Antes, `electron-builder --mac dir` la deja en release/mac…/Calculadora.app.
 * El paquete va sin tilde: con «gráfica» en el nombre, los procesos auxiliares de Electron no
 * arrancan y la app se cierra al abrirla. El nombre visible lo pone CFBundleDisplayName.
 * Se firma «ad hoc» (sin cuenta de desarrollador): en un Mac con Apple Silicon una app sin
 * ninguna firma no arranca, y como no viene de internet, Gatekeeper no la bloquea.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const NOMBRE = 'Calculadora.app'
const ANTIGUA = 'Calculadora gráfica.app'
if (process.platform !== 'darwin') {
  console.error('La instalación solo tiene sentido en un Mac.')
  process.exit(1)
}
// el nombre puede venir en NFD (á = a + ´): se compara normalizado
const app = (dir) => readdirSync(dir).find((f) => f.normalize('NFC') === NOMBRE.normalize('NFC'))
const carpetas = existsSync('release') ? readdirSync('release').filter((d) => d.startsWith('mac') && app(path.join('release', d))) : []
if (!carpetas.length) {
  console.error(`No encuentro release/mac…/${NOMBRE}: ¿falló electron-builder?`)
  process.exit(1)
}
// la de la arquitectura de este Mac, si hay varias
const preferida = carpetas.find((d) => d.includes(process.arch)) ?? carpetas[0]
const origen = path.join('release', preferida, app(path.join('release', preferida)))

// si la app está abierta, se cierra para poder sustituirla
try {
  execFileSync('osascript', ['-e', 'if application id "es.luichi.calculadora" is running then tell application id "es.luichi.calculadora" to quit'], { stdio: 'ignore' })
} catch {}

let destinoDir = '/Applications'
try {
  execFileSync('test', ['-w', destinoDir])
} catch {
  destinoDir = path.join(os.homedir(), 'Applications')
  execFileSync('mkdir', ['-p', destinoDir])
}
const destino = path.join(destinoDir, NOMBRE)
const antigua = readdirSync(destinoDir).find((f) => f.normalize('NFC') === ANTIGUA.normalize('NFC'))
if (antigua) rmSync(path.join(destinoDir, antigua), { recursive: true, force: true })
if (existsSync(destino)) rmSync(destino, { recursive: true, force: true })
execFileSync('ditto', [origen, destino], { stdio: 'inherit' })
execFileSync('codesign', ['--force', '--deep', '--sign', '-', destino], { stdio: 'inherit' })
execFileSync('xattr', ['-dr', 'com.apple.quarantine', destino], { stdio: 'ignore' })
console.log(`\nInstalada en ${destino}\nÁbrela desde el Launchpad o con: open "${destino}"`)
// VS Code exporta ELECTRON_RUN_AS_NODE y `open` la hereda: la app arrancaría como Node y se cerraría
const { ELECTRON_RUN_AS_NODE, ...env } = process.env
execFileSync('open', [destino], { env })
