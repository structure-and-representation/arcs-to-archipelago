// 都道府県の境界データ(public/data/japan.topojson)と
// 代表点データ(public/data/prefectures.json)を生成する。
//
//   node tools/geo/build_geo.mjs
//
// 元データは tools/geo/raw/ に保存済みならそれを使い、なければ取得して保存する。
import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import proj4 from 'proj4'
import { PROJ } from './projection.mjs'

const require = createRequire(import.meta.url)
const mapshaper = require('mapshaper')

const here = path.dirname(fileURLToPath(import.meta.url))
const rawDir = path.join(here, 'raw')
const outDir = path.join(here, '..', '..', 'public', 'data')

const SOURCES = {
  'japan.topojson': 'https://raw.githubusercontent.com/dataofjapan/land/master/japan.topojson',
  'prefecturalCapital.csv': 'https://raw.githubusercontent.com/dataofjapan/land/master/prefecturalCapital.csv',
}

// 5km² 未満の島を除く(mapshaper の min-area は m²)。
const MIN_ISLAND_AREA = '5e6'
const SIMPLIFY = '15%'
const QUANTIZATION = 4000

// JISコード順。ja / en は接尾辞なし、capital は県庁所在地の市名(東京都は新宿区)、
// metro は三大都市圏の所属。
const PREFECTURES = [
  [1, '北海道', 'Hokkaido', '札幌市', null],
  [2, '青森県', 'Aomori', '青森市', null],
  [3, '岩手県', 'Iwate', '盛岡市', null],
  [4, '宮城県', 'Miyagi', '仙台市', null],
  [5, '秋田県', 'Akita', '秋田市', null],
  [6, '山形県', 'Yamagata', '山形市', null],
  [7, '福島県', 'Fukushima', '福島市', null],
  [8, '茨城県', 'Ibaraki', '水戸市', null],
  [9, '栃木県', 'Tochigi', '宇都宮市', null],
  [10, '群馬県', 'Gunma', '前橋市', null],
  [11, '埼玉県', 'Saitama', 'さいたま市', 'tokyo'],
  [12, '千葉県', 'Chiba', '千葉市', 'tokyo'],
  [13, '東京都', 'Tokyo', '新宿区', 'tokyo'],
  [14, '神奈川県', 'Kanagawa', '横浜市', 'tokyo'],
  [15, '新潟県', 'Niigata', '新潟市', null],
  [16, '富山県', 'Toyama', '富山市', null],
  [17, '石川県', 'Ishikawa', '金沢市', null],
  [18, '福井県', 'Fukui', '福井市', null],
  [19, '山梨県', 'Yamanashi', '甲府市', null],
  [20, '長野県', 'Nagano', '長野市', null],
  [21, '岐阜県', 'Gifu', '岐阜市', 'nagoya'],
  [22, '静岡県', 'Shizuoka', '静岡市', null],
  [23, '愛知県', 'Aichi', '名古屋市', 'nagoya'],
  [24, '三重県', 'Mie', '津市', 'nagoya'],
  [25, '滋賀県', 'Shiga', '大津市', null],
  [26, '京都府', 'Kyoto', '京都市', 'osaka'],
  [27, '大阪府', 'Osaka', '大阪市', 'osaka'],
  [28, '兵庫県', 'Hyogo', '神戸市', 'osaka'],
  [29, '奈良県', 'Nara', '奈良市', 'osaka'],
  [30, '和歌山県', 'Wakayama', '和歌山市', null],
  [31, '鳥取県', 'Tottori', '鳥取市', null],
  [32, '島根県', 'Shimane', '松江市', null],
  [33, '岡山県', 'Okayama', '岡山市', null],
  [34, '広島県', 'Hiroshima', '広島市', null],
  [35, '山口県', 'Yamaguchi', '山口市', null],
  [36, '徳島県', 'Tokushima', '徳島市', null],
  [37, '香川県', 'Kagawa', '高松市', null],
  [38, '愛媛県', 'Ehime', '松山市', null],
  [39, '高知県', 'Kochi', '高知市', null],
  [40, '福岡県', 'Fukuoka', '福岡市', null],
  [41, '佐賀県', 'Saga', '佐賀市', null],
  [42, '長崎県', 'Nagasaki', '長崎市', null],
  [43, '熊本県', 'Kumamoto', '熊本市', null],
  [44, '大分県', 'Oita', '大分市', null],
  [45, '宮崎県', 'Miyazaki', '宮崎市', null],
  [46, '鹿児島県', 'Kagoshima', '鹿児島市', null],
  [47, '沖縄県', 'Okinawa', '那覇市', null],
]

async function ensureRaw(name) {
  const file = path.join(rawDir, name)
  if (existsSync(file)) return file
  console.log(`取得: ${SOURCES[name]}`)
  const res = await fetch(SOURCES[name])
  if (!res.ok) throw new Error(`${SOURCES[name]} の取得に失敗しました: HTTP ${res.status}`)
  await mkdir(rawDir, { recursive: true })
  await writeFile(file, Buffer.from(await res.arrayBuffer()))
  return file
}

function parseCsv(text) {
  const [header, ...rows] = text.trim().split(/\r?\n/)
  const keys = header.split(',')
  return rows.map((row) => Object.fromEntries(row.split(',').map((v, i) => [keys[i], v])))
}

const round = (v, digits) => Number(v.toFixed(digits))

async function buildBoundaries(rawFile) {
  const input = await readFile(rawFile)
  const commands = [
    '-i japan.topojson',
    `-filter-islands min-area=${MIN_ISLAND_AREA} remove-empty`,
    `-simplify ${SIMPLIFY} keep-shapes`,
    `-proj "${PROJ}"`,
    `-o format=topojson quantization=${QUANTIZATION} id-field=id out.topojson`,
  ].join(' ')
  const out = await mapshaper.applyCommands(commands, { 'japan.topojson': input })
  const topo = JSON.parse(out['out.topojson'].toString())

  // properties は持たせず、id(JISコード)だけを残す。
  const geometries = topo.objects.japan.geometries
  for (const g of geometries) {
    g.id = Number(g.id)
    delete g.properties
  }
  geometries.sort((a, b) => a.id - b.id)
  return topo
}

async function main() {
  const [topoFile, csvFile] = await Promise.all(Object.keys(SOURCES).map(ensureRaw))

  const topo = await buildBoundaries(topoFile)
  await mkdir(outDir, { recursive: true })
  const topoJson = JSON.stringify(topo)
  await writeFile(path.join(outDir, 'japan.topojson'), topoJson)
  console.log(`public/data/japan.topojson: ${Buffer.byteLength(topoJson)} bytes, ${topo.objects.japan.geometries.length} 都道府県`)

  // 元データの名称と表の内容が一致することを確認する。
  const rawTopo = JSON.parse(await readFile(topoFile, 'utf8'))
  const rawProps = new Map(rawTopo.objects.japan.geometries.map((g) => [g.properties.id, g.properties]))
  const csv = new Map(parseCsv(await readFile(csvFile, 'utf8')).map((r) => [Number(r.id), r]))

  const project = proj4('EPSG:4326', PROJ)
  const prefectures = PREFECTURES.map(([code, ja, en, capitalJa, metro]) => {
    const props = rawProps.get(code)
    const row = csv.get(code)
    if (!props || !row) throw new Error(`元データに code=${code} がありません`)
    if (props.nam_ja !== ja || row.nam_ja !== ja) throw new Error(`code=${code}: 名称が元データと一致しません (${ja} / ${props.nam_ja} / ${row.nam_ja})`)
    if (props.nam.replace(' ', '').replace(/(Ken|Fu|To)$/, '').toLowerCase() !== en.toLowerCase()) {
      throw new Error(`code=${code}: 英語名が元データと一致しません (${en} / ${props.nam})`)
    }
    const lon = round(Number(row.lon), 6)
    const lat = round(Number(row.lat), 6)
    const [x, y] = project.forward([lon, lat])
    return {
      code,
      ja,
      en,
      metro,
      capital: { ja: capitalJa, lon, lat },
      x: round(x, 3),
      y: round(y, 3),
    }
  })
  const prefJson = '[\n' + prefectures.map((p) => '  ' + JSON.stringify(p)).join(',\n') + '\n]\n'
  await writeFile(path.join(outDir, 'prefectures.json'), prefJson)
  console.log(`public/data/prefectures.json: ${Buffer.byteLength(prefJson)} bytes, ${prefectures.length} 件`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
