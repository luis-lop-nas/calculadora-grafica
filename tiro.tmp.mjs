import { chromium } from 'playwright'
const D = '/tmp/claude-501/-Users-luichi/b6832be1-d131-441d-a140-d265cfd85553/scratchpad/tiros'
const b = await chromium.launch()
const p = await (await b.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'dark', deviceScaleFactor: 2 })).newPage()
p.on('pageerror', e => console.log('ERROR', e.message))
p.on('console', m => { if (m.type()==='error'||m.text().startsWith('Warning:')) console.log('CONSOLA', m.text()) })
await p.goto('http://localhost:5173/', { waitUntil: 'networkidle' })
await p.evaluate(() => { try { localStorage.clear() } catch {} })
await p.reload({ waitUntil: 'networkidle' })
await p.waitForTimeout(800)
const abrir = async (n) => { await p.keyboard.press('Meta+k'); await p.waitForTimeout(150); await p.fill('.paleta input', n); await p.waitForTimeout(250); await p.click('.paleta li'); await p.waitForTimeout(1300) }
for (const [nombre, tiro] of [
  ['Ecuación del calor en 1D, 2D y 3D', 'panel-calor'],
  ['Orbitales y estados ligados 3D', 'panel-orbitales'],
  ['Resolver una EDO escrita tal cual', 'panel-resolver'],
]) {
  await abrir(nombre)
  await p.screenshot({ path: `${D}/${tiro}.png`, clip: { x: 0, y: 0, width: 400, height: 1000 } })
}
await b.close()
