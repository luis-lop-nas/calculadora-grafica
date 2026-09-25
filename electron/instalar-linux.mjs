import { cp, mkdir, writeFile, chmod, access, rename, rm } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'

if (process.platform !== 'linux') throw new Error('Este instalador se ejecuta en Linux.')
if(!['x64','arm64'].includes(process.arch))throw new Error('Arquitectura admitida: x64 o ARM64')
const fuente = process.arch==='x64'?'linux-unpacked':'linux-arm64-unpacked'
const datos = process.env.XDG_DATA_HOME && path.isAbsolute(process.env.XDG_DATA_HOME) ? process.env.XDG_DATA_HOME : path.join(os.homedir(), '.local/share')
const destino = path.join(datos, 'calculadora')
await access(path.join('release', fuente, 'calculadora')).catch(()=>{throw new Error(`Falta release/${fuente}; ejecuta npm run app:empaquetar en este equipo.`)})
await mkdir(datos, { recursive: true })
const preparado=`${destino}.nuevo-${process.pid}`,anterior=`${destino}.anterior-${process.pid}`
await cp(path.join('release', fuente), preparado, { recursive: true, errorOnExist: true, force: false })
let teniaAnterior=false
try {
  await rename(destino,anterior).then(()=>{teniaAnterior=true}).catch(e=>{if(e.code!=='ENOENT')throw e})
  await rename(preparado,destino)
} catch(e) {
  if(teniaAnterior)await rename(anterior,destino)
  await rm(preparado,{recursive:true,force:true})
  throw e
}
if(teniaAnterior)await rm(anterior,{recursive:true,force:true})
const icono = path.join(datos, 'icons/hicolor/512x512/apps/es.luichi.calculadora.png')
await mkdir(path.dirname(icono), { recursive: true })
await cp('build/icon.png', icono)
const apps = path.join(datos, 'applications')
await mkdir(apps, { recursive: true })
// Desktop Entry escaping, not shell quoting; % is a field code in Exec.
const exec = '"' + path.join(destino, 'calculadora').replace(/[\\"`$]/g, '\\$&').replaceAll('%', '%%') + '" %F'
await writeFile(path.join(apps, 'es.luichi.calculadora.desktop'), `[Desktop Entry]\nType=Application\nName=Calculadora gráfica\nExec=${exec}\nIcon=es.luichi.calculadora\nTerminal=false\nCategories=Education;Math;Science;\nMimeType=application/x-calculadora;\nStartupWMClass=es.luichi.calculadora\n`)
const mime = path.join(datos, 'mime/packages')
await mkdir(mime, { recursive: true })
await writeFile(path.join(mime, 'calculadora.xml'), '<?xml version="1.0" encoding="UTF-8"?><mime-info xmlns="http://www.freedesktop.org/standards/shared-mime-info"><mime-type type="application/x-calculadora"><comment>Sesión de Calculadora</comment><glob pattern="*.calc"/></mime-type></mime-info>')
await chmod(path.join(destino, 'calculadora'), 0o755)
for (const [cmd, args] of [['update-desktop-database', [apps]], ['update-mime-database', [path.join(datos, 'mime')]]]) {
  try { execFileSync(cmd, args, { stdio: 'inherit' }) } catch { console.warn(`No se pudo ejecutar ${cmd}; puede actualizarse al volver a iniciar sesión.`) }
}
console.log(`Instalada en ${destino}. Abre Calculadora gráfica desde el menú de aplicaciones.`)
