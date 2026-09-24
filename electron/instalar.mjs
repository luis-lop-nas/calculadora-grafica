/**
 * Instala la app empaquetada en /Applications (o en ~/Applications si no hay permiso):
 *   npm run app:instalar
 * Antes, `electron-builder --mac dir` la deja en release/mac…/Calculadora gráfica.app.
 * Se firma «ad hoc» (sin cuenta de desarrollador): en un Mac con Apple Silicon una app sin
 * ninguna firma no arranca, y como no viene de internet, Gatekeeper no la bloquea.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const NOMBRE = 'Calculadora gráfica.app'
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
  execFileSync('osascript', ['-e', 'tell application "Calculadora gráfica" to quit'], { stdio: 'ignore' })
} catch {}

let destinoDir = '/Applications'
try {
  execFileSync('test', ['-w', destinoDir])
} catch {
  destinoDir = path.join(os.homedir(), 'Applications')
  execFileSync('mkdir', ['-p', destinoDir])
}
const destino = path.join(destinoDir, NOMBRE)
if (existsSync(destino)) rmSync(destino, { recursive: true, force: true })
execFileSync('ditto', [origen, destino], { stdio: 'inherit' })
execFileSync('codesign', ['--force', '--deep', '--sign', '-', destino], { stdio: 'inherit' })
execFileSync('xattr', ['-dr', 'com.apple.quarantine', destino], { stdio: 'ignore' })
console.log(`\nInstalada en ${destino}\nÁbrela desde el Launchpad o con: open "${destino}"`)
execFileSync('open', [destino])
