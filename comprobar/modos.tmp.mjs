import { chromium } from 'playwright'
const [id, ...botones] = process.argv.slice(2)
const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' })).newPage()
const errs=[]; p.on('pageerror', e=>errs.push(e.message)); p.on('console', m=>{ if(m.type()==='error' || m.text().startsWith('Warning:')) errs.push(m.text())})
await p.goto('http://localhost:5173/'); await p.evaluate(() => localStorage.clear()); await p.reload({ waitUntil: 'networkidle' }); await p.waitForTimeout(900)
await p.keyboard.press('Meta+k'); await p.waitForTimeout(250); await p.click(`#modulo-${id}`); await p.waitForTimeout(1500)
await p.screenshot({ path: `comprobar/tiros/${id}-0.png` })
let i = 1
for (const m of botones) { await p.getByRole('button', { name: m, exact: true }).first().click(); await p.waitForTimeout(1500); await p.screenshot({ path: `comprobar/tiros/${id}-${i++}.png` }) }
console.log(errs.length? errs : 'ok'); await b.close()
