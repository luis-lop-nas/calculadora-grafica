import {chromium,_electron as electron} from 'playwright'
import assert from 'node:assert/strict'
import {mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import path from 'node:path'
const nativo=process.env.NATIVO==='1',tmp=mkdtempSync(path.join(tmpdir(),'calc-lab-')),env={...process.env};delete env.ELECTRON_RUN_AS_NODE;delete env.CALC_URL
const app=nativo?await electron.launch({args:['.',`--user-data-dir=${tmp}`],env}):null
const browser=app?null:await chromium.launch(),p=app?await app.firstWindow():await browser.newPage({viewport:{width:1500,height:1000}}),errores=[]
p.on('pageerror',e=>errores.push(e.message))
try{
 if(!app)await p.goto(process.env.URL??'http://127.0.0.1:5173');else{await p.waitForLoadState('domcontentloaded');await app.evaluate(({BrowserWindow})=>{BrowserWindow.getFocusedWindow=()=>BrowserWindow.getAllWindows().at(-1);BrowserWindow.prototype.isFocused=function(){return this===BrowserWindow.getFocusedWindow()}})}
 if(app){await p.locator('.app').waitFor();await p.waitForTimeout(600);await p.keyboard.press(process.platform==='darwin'?'Meta+k':'Control+k')}else await p.getByRole('button',{name:'Buscar módulo',exact:true}).click();await p.locator('#modulo-laboratorio-fisica').click()
 const estado=()=>p.evaluate(()=>JSON.parse(localStorage.getItem('calculadora:estado')).estados['laboratorio-fisica'])
 await p.getByLabel('Ejemplo de física',{exact:true}).selectOption('Vacío')
 await p.getByRole('button',{name:'Cuerpo',exact:true}).click()
 const canvas=p.locator('canvas').first();await canvas.click({position:{x:330,y:270}})
 await p.waitForTimeout(550)
 let s=await estado();assert.equal(s.elementos.length,1);assert.equal(s.elementos[0].tipo,'cuerpo')
 await p.getByLabel('Masa (kg)',{exact:true}).fill('2');await p.getByLabel('Velocidad x (m/s)',{exact:true}).fill('3')
 await p.getByRole('button',{name:'↖ Seleccionar',exact:true}).click()
 await canvas.click({position:{x:330,y:270},button:'right'})
 const radial=p.getByRole('dialog',{name:'Edición rápida',exact:true});await radial.waitFor()
 await p.screenshot({path:`/tmp/calculadora-radial-${nativo?'mac':'web'}.png`})
 await radial.getByRole('button',{name:/Duplicar/}).click();await p.waitForTimeout(550)
 s=await estado();assert.equal(s.elementos.length,2);assert.equal(s.elementos[1].masa,2)
 // La selección del panel también gobierna las operaciones comunes.
 const primero=s.elementos[0].id
 await p.getByLabel('Objeto físico',{exact:true}).selectOption(primero)
 await p.evaluate(()=>document.activeElement?.blur());await p.keyboard.press('q');await radial.getByRole('button',{name:/Ocultar/}).click();await p.waitForTimeout(550)
 s=await estado();assert.equal(s.elementos.find(o=>o.id===primero).visible,false);assert.equal(s.elementos[1].visible,true)
 // Crear por el mismo árbol de órdenes que la barra nativa.
 await p.evaluate(()=>document.activeElement?.blur());await p.keyboard.press('q');await radial.getByRole('button',{name:/Añadir/}).click();await radial.getByRole('button',{name:/Muelle$/}).click();await p.waitForTimeout(550)
 s=await estado();assert.equal(s.elementos.at(-1).tipo,'muelle');assert.ok(s.elementos.at(-1).a);assert.ok(s.elementos.at(-1).b)
 // Escribir q en un campo no abre el radial.
 await p.getByLabel('Nombre físico',{exact:true}).fill('q');assert.equal(await radial.count(),0)
 await p.getByLabel('Ejemplo de física',{exact:true}).selectOption('Tiro parabólico')
 await p.getByRole('button',{name:'Reproducir simulación',exact:true}).click();await p.waitForTimeout(550);await p.getByRole('button',{name:'Pausar simulación',exact:true}).click();await p.waitForTimeout(550)
 assert.ok((await estado()).instante>0)
 await p.getByRole('button',{name:'Volver al inicio',exact:true}).click()
 await p.getByRole('button',{name:'Generar Lagrangiano de la escena',exact:true}).click();await p.waitForTimeout(600)
 assert.equal((await estado()).modo,'lagrange');assert.equal(await p.locator('.laboratorio-panel [role=alert]').count(),0)
 await p.getByLabel('Ejemplo de física',{exact:true}).selectOption('Lente convergente');await p.waitForTimeout(200)
 await p.screenshot({path:`/tmp/calculadora-laboratorio-${nativo?'mac':'web'}.png`})
 await p.reload();await p.getByLabel('Modelo físico',{exact:true}).waitFor();assert.equal(await p.getByLabel('Modelo físico',{exact:true}).inputValue(),'optica')
 await p.evaluate(()=>document.activeElement?.blur());await p.keyboard.press(process.platform==='darwin'?'Meta+Shift+p':'Control+Shift+p')
 const paleta=p.getByRole('dialog',{name:'Buscar orden',exact:true});await paleta.waitFor();await paleta.getByRole('combobox').fill('Lente delgada')
 await paleta.getByRole('option').filter({hasText:'Objeto ▸ Añadir'}).getByRole('button',{name:'Añadir a favoritos: Lente delgada',exact:true}).click();await p.keyboard.press('Escape')
 await p.evaluate(()=>document.activeElement?.blur());await p.keyboard.press('q');await radial.getByRole('button',{name:/Favoritos/}).click();await radial.getByRole('button',{name:/Lente delgada$/}).click();await p.waitForTimeout(550)
 assert.equal((await estado()).elementos.filter(o=>o.tipo==='lente').length,2)
 assert.deepEqual(errores,[])
 console.log(`${nativo?'App':'Web'}: laboratorio, edición radial, selección, duplicar, enlaces, simulación, Lagrange, óptica, guardado y favoritos correctos`)
}catch(e){await p.screenshot({path:'/tmp/calculadora-laboratorio-fallo.png'});throw e}finally{await app?.close();await browser?.close();rmSync(tmp,{recursive:true,force:true})}
