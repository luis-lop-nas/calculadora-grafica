import { _electron as electron } from 'playwright'
import assert from 'node:assert/strict'
import { mkdtempSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const mac=process.platform==='darwin'
const defecto=mac?`release/mac${process.arch==='arm64'?'-arm64':''}/Calculadora.app/Contents/MacOS/Calculadora`:`release/linux${process.arch==='x64'?'':`-${process.arch}`}-unpacked/calculadora`
const executablePath=path.resolve(process.env.APP_PATH??defecto)
assert.ok(existsSync(executablePath),`Falta el paquete: ${executablePath}`)
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;delete env.CALC_URL
const perfil=mkdtempSync(path.join(tmpdir(),'calculadora-paquete-'))
const app=await electron.launch({executablePath,args:[`--user-data-dir=${perfil}`],env})
try {
  const p=await app.firstWindow(),errores=[]
  p.on('pageerror',e=>errores.push(e.message))
  await p.waitForLoadState('domcontentloaded')
  await p.locator('.navegacion, .app').first().waitFor()
  await p.waitForTimeout(700)
  assert.equal(await app.evaluate(({app})=>app.isPackaged),true)
  assert.match(p.url(),/^app:/)
  assert.equal(await p.evaluate(()=>window.escritorio.plataforma),process.platform)
  const menus=await app.evaluate(({Menu})=>Menu.getApplicationMenu().items.map(i=>i.label))
  for(const m of ['Archivo','Edición','Objeto','Herramientas','Escena','Vista','Animación','Módulo','Ventana','Ayuda'])assert.ok(menus.includes(m),m)
  assert.deepEqual(errores,[])
  console.log(`Paquete ${process.platform}/${process.arch}: arranque, protocolo app, puente y menús correctos`)
} finally {await app.evaluate(({app})=>app.exit(0)).catch(()=>{});await app.close().catch(()=>{});rmSync(perfil,{recursive:true,force:true})}
