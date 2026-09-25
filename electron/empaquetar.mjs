import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { readdirSync, existsSync } from 'node:fs'
const require = createRequire(import.meta.url)
const plataforma = process.argv.slice(2).find(a => !a.startsWith('--')) ?? (process.platform === 'darwin' ? 'mac' : 'linux')
if (!['mac', 'linux'].includes(plataforma)) throw new Error('Plataforma admitida: mac o linux')
const targets = process.argv.includes('--distribuir') ? (plataforma === 'linux' ? ['AppImage', 'deb'] : ['dmg']) : ['dir']
const arquitecturas = process.argv.filter(a => ['--x64', '--arm64'].includes(a))
const r = spawnSync(process.execPath, [require.resolve('electron-builder/cli.js'), `--${plataforma}`, ...targets, ...arquitecturas], { stdio: 'inherit' })
if(r.status===0 && plataforma==='mac' && process.platform==='darwin') {
  for(const carpeta of readdirSync('release').filter(d=>d==='mac'||d.startsWith('mac-'))) {
    const app=`release/${carpeta}/Calculadora.app`
    if(!existsSync(app))continue
    const firma=spawnSync('codesign',['--force','--deep','--sign','-',app],{stdio:'inherit'})
    if(firma.status!==0)process.exit(firma.status??1)
  }
}
process.exit(r.status ?? 1)
