// 生成した境界線と47の代表点を描いた確認用の画像(preview.png)を作る。
//
//   node tools/geo/render_preview.mjs
//
// playwright は package.json に含めない。Chromium と一緒に入っているものを使う。
import { createRequire } from 'node:module'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { mesh, feature } from 'topojson-client'

const here = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.join(here, '..', '..', 'public', 'data')
const topo = JSON.parse(await readFile(path.join(dataDir, 'japan.topojson'), 'utf8'))
const prefectures = JSON.parse(await readFile(path.join(dataDir, 'prefectures.json'), 'utf8'))

const SIZE = 1000
const PAD = 30
const features = feature(topo, topo.objects.japan).features

// 全ポリゴンの範囲から変換を決める(y は北が上になるよう反転)。
let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity]
const walk = (a) => {
  if (typeof a[0] === 'number') {
    minX = Math.min(minX, a[0]); maxX = Math.max(maxX, a[0])
    minY = Math.min(minY, a[1]); maxY = Math.max(maxY, a[1])
  } else a.forEach(walk)
}
features.forEach((f) => walk(f.geometry.coordinates))
const scale = (SIZE - PAD * 2) / Math.max(maxX - minX, maxY - minY)
const sx = (x) => PAD + (x - minX) * scale
const sy = (y) => SIZE - PAD - (y - minY) * scale

const pathOf = (geometry) => {
  const lines = geometry.type === 'MultiLineString' ? geometry.coordinates : [geometry.coordinates]
  return lines.map((l) => 'M' + l.map(([x, y]) => `${sx(x).toFixed(2)},${sy(y).toFixed(2)}`).join('L')).join('')
}
const fills = features
  .map((f) => {
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates
    return polys.map((p) => p.map((r) => 'M' + r.map(([x, y]) => `${sx(x).toFixed(2)},${sy(y).toFixed(2)}`).join('L') + 'Z').join('')).join('')
  })
  .join('')
const borders = pathOf(mesh(topo, topo.objects.japan, (a, b) => a !== b))
const coast = pathOf(mesh(topo, topo.objects.japan, (a, b) => a === b))
const dots = prefectures
  .map((p) => `<circle cx="${sx(p.x).toFixed(1)}" cy="${sy(p.y).toFixed(1)}" r="3.5" fill="#d6336c" stroke="#fff" stroke-width="1"/>`)
  .join('')
const labels = prefectures
  .map((p) => `<text x="${(sx(p.x) + 6).toFixed(1)}" y="${(sy(p.y) + 3).toFixed(1)}" font-size="9" fill="#444">${p.code}</text>`)
  .join('')
const grid = [-1000, -500, 0, 500, 1000]
  .flatMap((v) => [
    `<line x1="${sx(v)}" y1="0" x2="${sx(v)}" y2="${SIZE}" stroke="#ddd"/><text x="${sx(v) + 3}" y="12" font-size="10" fill="#999">x=${v}km</text>`,
    `<line x1="0" y1="${sy(v)}" x2="${SIZE}" y2="${sy(v)}" stroke="#ddd"/><text x="3" y="${sy(v) - 3}" font-size="10" fill="#999">y=${v}km</text>`,
  ])
  .join('')

const html = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#fff">
<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" font-family="sans-serif">
<rect width="${SIZE}" height="${SIZE}" fill="#fff"/>${grid}
<path d="${fills}" fill="#f2efe6" stroke="none"/>
<path d="${coast}" fill="none" stroke="#333" stroke-width="0.6"/>
<path d="${borders}" fill="none" stroke="#888" stroke-width="0.4"/>
${dots}${labels}
</svg></body>`

// Chromium 同梱の playwright を探す(プロジェクトの依存には含めない)。
const require = createRequire(import.meta.url)
let chromium
try {
  ;({ chromium } = require('playwright'))
} catch {
  ;({ chromium } = createRequire(path.join(process.cwd(), 'noop.js'))('playwright'))
}
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE }, deviceScaleFactor: 2 })
await page.setContent(html)
await writeFile(path.join(here, 'preview.png'), await page.screenshot())
await browser.close()
console.log('tools/geo/preview.png を出力しました')
