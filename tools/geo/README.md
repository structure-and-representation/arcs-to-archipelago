# tools/geo — 都道府県の境界・代表点データ

アプリが読み込む地図データ `public/data/japan.topojson` と `public/data/prefectures.json` を生成・検証するツールです。

## 出典

地球地図日本(© 国土地理院)を dataofjapan/land 経由で取得し、簡略化・投影して作成

## 元データ

`raw/` に保存してあります(保存済みならそれを使い、なければ取得して保存します)。

| ファイル | 取得元 |
| --- | --- |
| `raw/japan.topojson` | https://raw.githubusercontent.com/dataofjapan/land/master/japan.topojson |
| `raw/prefecturalCapital.csv` | https://raw.githubusercontent.com/dataofjapan/land/master/prefecturalCapital.csv |

`japan.topojson` は、国土地理院の地球地図日本を dataofjapan/land が変換したものです。object 名は `japan`、47都道府県の MultiPolygon で、properties は `nam`(英語名)、`nam_ja`(日本語名)、`id`(JISコード 1〜47)、座標は経度緯度です。`prefecturalCapital.csv` は県庁所在地の緯度経度(`id,nam_ja,lat,lon`)です。

元データを更新するときは `raw/` のファイルを削除してから build を実行します。

## 加工の内容

`build_geo.mjs` が行います。

1. **5km² 未満の島の除去**: mapshaper の `-filter-islands min-area=5e6 remove-empty`(単位は m²)。47都道府県はすべて残ります。
2. **簡略化**: `-simplify 15% keep-shapes`。`keep-shapes` により、小さなポリゴンが消えません。
3. **投影**: `-proj` で下記の座標系に変換します。
4. **出力**: `format=topojson quantization=4000 id-field=id`。座標は整数に量子化され、`transform`(scale・translate)で km に戻ります。後処理で geometry の `properties` を取り除き、`id` を JISコード(数値)だけにして、`id` 順に並べます。

県庁所在地は `prefecturalCapital.csv` の緯度経度を同じ座標系へ投影して `x`・`y` にします(`proj4` を使用)。市名・英語名・三大都市圏の所属は `build_geo.mjs` に表で持ち、元データの名称と一致するか実行時に確認します。

## 座標系

- 投影法: Lambert Conformal Conic
- PROJ 文字列: `+proj=lcc +lat_1=30 +lat_2=40 +lat_0=36 +lon_0=138 +ellps=GRS80 +units=km`(`projection.mjs`)
- 単位は km、原点は東経138度・北緯36度、x は東が正、y は北が正です。
- 沖縄や小笠原は実位置のままです。x は約 -1540〜862 km、y は約 -1243〜1110 km の範囲に収まります。
- 境界と代表点で同じ座標系です。

## 生成物

- `public/data/japan.topojson`: 境界(約 68 KiB、gzip で約 16 KB)。object 名は `japan`、各 geometry の `id` が JISコード(1〜47)で、properties はありません。
- `public/data/prefectures.json`: JISコード順の47件。`{ code, ja, en, metro, capital: { ja, lon, lat }, x, y }`。`metro` は `"tokyo"`・`"nagoya"`・`"osaka"`・`null`、`x`・`y` は県庁所在地の平面座標(km)です。

## 実行手順

Node.js 22 が必要です。リポジトリのルートから実行します。

```sh
npm ci --prefix tools/geo
node tools/geo/build_geo.mjs      # 生成
node tools/geo/verify_geo.mjs     # 検証(失敗すると終了コード 1)
node tools/geo/render_preview.mjs # 確認用画像 tools/geo/preview.png を更新
```

`raw/` が空のときの取得は Node の `fetch` で行います。プロキシ越しの環境では `NODE_USE_ENV_PROXY=1` を付けて実行してください。`render_preview.mjs` は Playwright(Chromium)を使います。依存には含めておらず、実行環境にあるものを使います。

`verify_geo.mjs` は、id 1〜47 の存在、47点がそれぞれ同じ code のポリゴンの内側にあること、`japan.topojson` が 100KB 以下であること、東京と大阪・札幌・那覇の平面距離を確認します。東京と大阪の期待値は 395 km ±5 km としています(代表点間の大圏距離が約 395 km のため)。あわせて、平面距離が大圏距離と 1% 以内で一致することも確認します。

## 依存

`package.json` に版を固定しています: `mapshaper@0.7.101`、`proj4@2.19.10`、`topojson-client@3.1.0`。`node_modules/` はコミットしません。
