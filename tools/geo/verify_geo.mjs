// 生成物(public/data/ 以下)を検証する。すべて通れば終了コード 0、失敗があれば 1。
//
//   node tools/geo/verify_geo.mjs
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import proj4 from 'proj4'
import { feature } from 'topojson-client'
import { PROJ } from './projection.mjs'

const dataDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'public', 'data')
const topoBuf = await readFile(path.join(dataDir, 'japan.topojson'))
const topo = JSON.parse(topoBuf.toString('utf8'))
const prefectures = JSON.parse(await readFile(path.join(dataDir, 'prefectures.json'), 'utf8'))

let failures = 0
function check(ok, label, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  ' + detail : ''}`)
  if (!ok) failures++
}

// --- japan.topojson ---
const obj = topo.objects?.japan
check(topo.type === 'Topology' && obj?.type === 'GeometryCollection', 'japan.topojson に object "japan" がある')
const geoms = obj?.geometries ?? []
const ids = geoms.map((g) => g.id).sort((a, b) => a - b)
check(
  ids.length === 47 && ids.every((id, i) => id === i + 1),
  'id 1〜47 がそろっている',
  `(${ids.length} 件)`,
)
check(geoms.every((g) => g.properties === undefined), 'geometry が properties を持たない')

const size = topoBuf.length
const gz = gzipSync(topoBuf, { level: 9 }).length
check(size <= 100 * 1024, 'japan.topojson が gzip 前で 100KB 以下', `(${size} bytes = ${(size / 1024).toFixed(1)} KiB, gzip ${gz} bytes)`)

// --- 点とポリゴンの内外判定(平面座標) ---
function inRing(x, y, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}
// polygon = [外周, 穴, ...]
const inPolygon = (x, y, polygon) => inRing(x, y, polygon[0]) && !polygon.slice(1).some((hole) => inRing(x, y, hole))
function inGeometry(x, y, geometry) {
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
  return polys.some((p) => inPolygon(x, y, p))
}

const features = new Map(feature(topo, obj).features.map((f) => [f.id, f.geometry]))

// --- prefectures.json ---
check(
  prefectures.length === 47 && prefectures.every((p, i) => p.code === i + 1),
  'prefectures.json が JISコード順の47件',
)

const metroOf = (code) => ([11, 12, 13, 14].includes(code) ? 'tokyo' : [21, 23, 24].includes(code) ? 'nagoya' : [26, 27, 28, 29].includes(code) ? 'osaka' : null)
const wellFormed = prefectures.every(
  (p) =>
    typeof p.ja === 'string' &&
    /^[A-Z][a-z]+$/.test(p.en) &&
    p.metro === metroOf(p.code) &&
    typeof p.capital?.ja === 'string' &&
    Number.isFinite(p.capital.lon) &&
    Number.isFinite(p.capital.lat) &&
    Number.isFinite(p.x) &&
    Number.isFinite(p.y),
)
check(wellFormed, '各要素の形式(ja, en, metro, capital, x, y)が仕様どおり')

const project = proj4('EPSG:4326', PROJ)
const maxErr = Math.max(
  ...prefectures.map((p) => {
    const [x, y] = project.forward([p.capital.lon, p.capital.lat])
    return Math.hypot(x - p.x, y - p.y)
  }),
)
check(maxErr < 0.002, 'x, y が capital の経度緯度の投影結果と一致する', `(最大差 ${(maxErr * 1000).toFixed(2)} m)`)

const outside = prefectures.filter((p) => {
  const g = features.get(p.code)
  return !g || !inGeometry(p.x, p.y, g)
})
check(
  outside.length === 0,
  '47点それぞれが同じ code の都道府県ポリゴンの内側にある',
  outside.length ? `(外側: ${outside.map((p) => `${p.code}:${p.ja}`).join(', ')})` : '',
)

// --- 距離 ---
const byCode = new Map(prefectures.map((p) => [p.code, p]))
const dist = (a, b) => Math.hypot(byCode.get(a).x - byCode.get(b).x, byCode.get(a).y - byCode.get(b).y)
// 大圏距離(球近似)。投影の歪みが小さいことの確認に使う。
function greatCircle(a, b) {
  const rad = Math.PI / 180
  const A = byCode.get(a).capital
  const B = byCode.get(b).capital
  const s = Math.sin(((B.lat - A.lat) * rad) / 2) ** 2 + Math.cos(A.lat * rad) * Math.cos(B.lat * rad) * Math.sin(((B.lon - A.lon) * rad) / 2) ** 2
  return 2 * 6371.0088 * Math.asin(Math.sqrt(s))
}
// 期待値と許容差(km)。東京-大阪の大圏距離は約395kmなので、期待値は395とする。
const pairs = [
  { a: 13, b: 27, name: '東京-大阪', expected: 395, tol: 5 },
  { a: 13, b: 1, name: '東京-札幌', expected: 830, tol: 10 },
  { a: 13, b: 47, name: '東京-那覇', expected: 1550, tol: 20 },
]
for (const { a, b, name, expected, tol } of pairs) {
  const d = dist(a, b)
  check(Math.abs(d - expected) <= tol, `${name} の平面距離が ${expected}km ±${tol}km`, `(${d.toFixed(1)} km)`)
  const gc = greatCircle(a, b)
  check(Math.abs(d / gc - 1) < 0.01, `${name} の平面距離が大圏距離と1%以内で一致する`, `(平面 ${d.toFixed(1)} km / 大圏 ${gc.toFixed(1)} km)`)
}

console.log(failures === 0 ? '\nすべての検証に成功しました' : `\n${failures} 件の検証に失敗しました`)
process.exit(failures === 0 ? 0 : 1)
