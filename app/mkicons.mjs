import puppeteer from 'puppeteer-core'
import { readFileSync, writeFileSync } from 'node:fs'
const svg = readFileSync('public/favicon.svg', 'utf8')
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'] })
for (const size of [192, 512]) {
  const p = await b.newPage()
  await p.setViewport({ width: size, height: size, deviceScaleFactor: 1 })
  await p.setContent(`<style>html,body{margin:0;width:${size}px;height:${size}px}svg{width:100%;height:100%;display:block}</style>${svg}`)
  const buf = await p.screenshot({ omitBackground: false })
  writeFileSync(`public/icon-${size}.png`, buf)
  console.log(`icon-${size}.png`, buf.length, 'bytes')
  await p.close()
}
await b.close(); process.exit(0)
