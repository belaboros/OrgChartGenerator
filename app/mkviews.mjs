// Produces a worked view per organization, using the app's own writer — not a
// hand-authored file that could drift from what the app actually emits.
import puppeteer from 'puppeteer-core'
import { writeFileSync } from 'node:fs'
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'] })
const p = await p0(b)
async function p0(br) {
  const pg = await br.newPage()
  await pg.setViewport({ width: 1600, height: 1000 })
  return pg
}
const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0,160)))

const plan = [
  { org: 'acme-tiny',   name: 'overview',   detail: { counts: false }, filter: [] },
  { org: 'acme-small',  name: 'overview',   detail: { counts: false }, filter: [] },
  { org: 'acme-medium', name: 'overview',   detail: { counts: false }, filter: [] },
  { org: 'acme-large',  name: 'overview',   detail: { positions: false, counts: true }, filter: [] },
  { org: 'acme-large',  name: 'architects', detail: { counts: false }, filter: ['Developer'] },
]

for (const step of plan) {
  await p.goto('http://localhost:5180/?files=http', { waitUntil: 'networkidle0' })
  await new Promise(r => setTimeout(r, 2000))
  await p.$$eval('tbody tr[data-org]', (trs, o) => trs.find(t => t.dataset.org === o).querySelector('button').click(), step.org)
  await new Promise(r => setTimeout(r, 1800))
  // open the view tab
  await p.evaluate(() => [...document.querySelectorAll('aside button')].find(b => b.textContent === 'view').click())
  await new Promise(r => setTimeout(r, 400))
  for (const [k, want] of Object.entries(step.detail)) {
    await p.evaluate(([key, w]) => {
      const l = [...document.querySelectorAll('aside label')].find(x => x.textContent.trim() === key)
      const cb = l.querySelector('input')
      if (cb.checked !== w) cb.click()
    }, [k, want])
    await new Promise(r => setTimeout(r, 400))
  }
  for (const role of step.filter) {
    await p.evaluate((r) => {
      const l = [...document.querySelectorAll('aside label')].find(x => x.textContent.trim() === r)
      if (l) l.querySelector('input').click()
    }, role)
    await new Promise(r => setTimeout(r, 400))
  }
  await new Promise(r => setTimeout(r, 900))
  const text = await p.evaluate(() => window.__serialiseView())
  const file = `../${step.org}.${step.name}.view.yaml`
  writeFileSync(file, text)
  const info = await p.evaluate(() => ({ shapes: window.__placement.nodes.length,
    labels: window.__placement.nodes.reduce((a,n)=>a+n.positions.length,0),
    size: Math.round(window.__placement.width)+'x'+Math.round(window.__placement.height) }))
  console.log(`${step.org}.${step.name}.view.yaml  ${info.shapes} shapes  ${info.labels} labels  ${info.size}  ${text.length}B`)
}
console.log('errors', JSON.stringify(errs))
await b.close(); process.exit(0)
