# 技術設計

実装担当が共有する設計です。ここに書いた座標系、データ形式、モジュールの関数の約束は、複数の担当が並行して作業するための共通の前提です。変更が必要になったときは、この文書の変更をPRに含めます。

## 1. 作品の概要

都道府県間の人口移動(総務省統計局「住民基本台帳人口移動報告」、日本人移動者、2012〜2025年)を見せるWeb作品です。2015年の作品「三大都市圏の人の流れ」(D3 v3 の arc diagram)の作り直しで、コンセプトは「弧が列島になる」です。

- 開幕は原作と同じ姿です。真横からの正投影で、47都道府県が北から南へ一直線に並んだ arc diagram が見えます。
- カメラが回り込むと、都道府県が地理上の位置へ移り、弧は日本列島の上に立ち上がる3D曲線になります。
- 地域を選ぶと、その地域への転入は地面の上の弧、転出は地面の下の鏡像の弧になります。
- 人数は粒子で表します。1粒が100人で、弧に沿って流れます。弧の線の濃さや太さは量を表しません。
- 弧の高さは端点間の距離に比例します。
- 色は紙、墨、朱の3つです。朱は選択中の地域とホバー中の弧にだけ使います。ライトテーマは紙の地に墨、ダークテーマは墨の地に紙の色です。
- カメラの定位置は「真横」「斜め俯瞰」「真上」の3つで、正投影です。
- スクロールで進む5章(全国、東京一極、大阪圏、名古屋圏、自由探索)があります。
- 年(2012〜2025)を切り替えられます。
- 文言は日本語と英語を持ちます。

## 2. 技術の構成

- Vite と素の JavaScript(ES modules)で作ります。three.js は npm の `three@0.186.1` です。WebGL2 を前提にします。
- 単体テストは Vitest、画面の撮影と確認は Playwright です。
- `public/` 以下は Vite がそのまま配信します。データは `public/data/` にあります。
- `reference/proto/` は設計段階の試作です。実装の土台として参照します。ビルドには含めません。
- `tools/` はデータを生成するスクリプトです。アプリのビルドには含めません。

## 3. データ

### `public/data/od.json`

```
{
  "series": "日本人移動者", "unit": "人",
  "source": { "name": "...", "url": "...", "retrieved": "YYYY-MM-DD" },
  "years": [2012, ..., 2025],
  "totals": { "2012": 合計, ... },
  "matrices": { "2012": [2209個の整数], ... }
}
```

`matrices` の各配列は 47×47 を行優先で並べたものです。添字 `o*47+d` が、添字 `o` の都道府県から添字 `d` の都道府県へ移った人数です。都道府県の添字は JISコードから1を引いた値(0が北海道、46が沖縄県)です。同じ都道府県どうしは0です。

### `public/data/prefectures.json`

JISコード順の47件の配列です。

```
{ "code": 13, "ja": "東京都", "en": "Tokyo", "metro": "tokyo",
  "capital": { "ja": "新宿区", "lon": 139.691648, "lat": 35.689185 },
  "x": km, "y": km }
```

`metro` は `"tokyo"`(埼玉、千葉、東京、神奈川)、`"nagoya"`(岐阜、愛知、三重)、`"osaka"`(京都、大阪、兵庫、奈良)、`null` のいずれかです。`x`・`y` は県庁所在地の平面座標です。

### `public/data/japan.topojson`

都道府県の境界です。object 名は `japan`、各 geometry の `id` は JISコードです。座標は `prefectures.json` と同じ平面座標です。

### 平面座標(地図座標)

Lambert Conformal Conic(`+proj=lcc +lat_1=30 +lat_2=40 +lat_0=36 +lon_0=138 +ellps=GRS80`)で投影した座標です。単位は km、原点は東経138度・北緯36度、x は東が正、y は北が正です。沖縄や小笠原は実位置にあります。

## 4. 幾何

`reference/proto/geometry.js` が土台です。同じ式を JavaScript(当たり判定、テスト、代替表示)と GLSL(描画)の両方に持ちます。

### ワールド座標

three.js の座標系で、y が上です。単位は原作の SVG のピクセルです。定数は `W = 1160`、`H = 230`、`N = 47`、`STEP = W / N`、`K = H / W`、`CX = 23 * STEP` です。地面は y = 0 の xz 平面です。

### 2つの配置と補間

- 一直線の配置: 都道府県 i を `(x, z) = (i * STEP - CX, 0)` に置きます。原作と同じ並びです。
- 地理配置: 地図座標を回転と拡大縮小でワールド座標へ移します。北海道から鹿児島へ向かう向きを +x 軸に重ね、北海道〜鹿児島の x 方向の広がりを一直線の配置の長さ `46 * STEP` に合わせます。沖縄は同じ変換で実位置に置きます。地図の東西南北の向きが鏡像にならないようにします。境界線の頂点にも同じ変換を使います。
  - 実装で確定した点: 北海道は一直線の先頭と同じ x(`-CX`)に置き、z は 47 点の範囲の中央が 0 になるようにします。あてはめに使うのは北海道と鹿児島だけなので、沖縄は鹿児島の先(+x 側)に出て、地理配置の範囲は一直線より約4割広くなります(実データで x は −568〜1033)。カメラは `layout.bounds` を見て収めます。
  - 地図座標 (東, 北) → ワールド (x, z) は、まず (東, −北) にして(three.js は +z が南)、北海道→鹿児島が +x になるよう回転し、拡大して平行移動します。回転だけなので鏡像になりません。真上から見て北を画面の上にしたとき、右が東です(カメラの「右 = (−上.z, 上.x)」の関係)。
  - 北の向きは、ワールドの xz 平面で単位ベクトル `[cos(northAngle), sin(northAngle)]`、東は `[−sin(northAngle), cos(northAngle)]` です。
- 都道府県の位置は `mix(一直線, 地理, morph)` です。`morph` は 0 から 1 です。

### 弧

端点 A、B(補間後の位置)に対して、制御点 `[A, A, A, M, B, B, B]` の一様3次Bスプライン(4区間)です。これは原作の `d3.svg.line().interpolate("basis")` に `[A, M, B]` を与えた曲線と同じです。

```
M = (A + B) / 2 + n * K * |AB|
n = side * cos(lean) * Y + sin(lean) * R
```

Y は上向きの単位ベクトル、R は弦に垂直な水平の単位ベクトルです。`side` は +1 が地上、−1 が地下です。`lean` は弧を水平方向へ倒す角度で、真横の定位置では 0 です。

- 地域を選んでいないときの `side` は原作と同じで、移動前の添字が移動後の添字より大きい流れ(南から北)が +1、その逆が −1 です。
- 地域を選んでいるときは、選択地域への転入が +1、選択地域からの転出が −1 です。選択地域の内部どうしの移動と、選択地域に関わらない移動は描きません。

`morph = 0`、`lean = 0` で真横から正投影すると、原作の arc diagram と一致します。試作では画素単位の比較で、線の画素がすべて ±1px 以内に収まりました。

## 5. 描画

- 都道府県の2つの配置は 47×1 の浮動小数テクスチャ(RGBA32F、`NearestFilter`)に入れ、頂点シェーダで補間します。変形はシェーダの中で完結し、CPU 側は uniform を更新します。
- 弧は、1本ぶんのリボン(48区間)を `InstancedBufferGeometry` で全弧ぶんインスタンス描画します。頂点シェーダで画面上の法線方向へ指定ピクセル幅だけ押し出します。線幅は 0.6〜1.0 CSS px で、解像度の uniform には描画バッファの実ピクセル数を渡します。素材は `DoubleSide` です。
- 粒子は `THREE.Points` で、1粒が1頂点です。大きさは画面上で一定(2〜2.5 CSS px)です。
  - すべての弧で、粒子が端から端まで流れる時間を一定(約14秒)にします。弧の上にある粒子の数が常に「人数 ÷ 100」になります。
  - 人数 v の弧の k 番目(0始まり)の粒子の不透明度は `clamp(v / 100 - k, 0, 1)` です。インクの総量が人数に比例し、100人に満たない流れも薄い1粒として残ります。
  - 弧ごとに、全年の最大粒数ぶんの枠を確保します。年ごとの人数は「弧 × 年」のテクスチャに持ち、2つの年を補間します。
  - 粒子ごとの流れの位相は `fract(k * 0.618034 + 弧ごとの乱数)` です。
  - 端点の近く(t が 0〜0.04 と 0.96〜1)では粒子を薄くします。
  - 動きを減らす設定では時間を 0 に固定し、位相を `(k + 0.5) / n` に並べた静止した点描にします。
- 描く順序は、地下の弧と粒子、地面(紙の色の半透明、不透明度 0.35 以下)と境界線、地上の弧と粒子です。
- 重なりは通常のアルファ合成です。弧の線の不透明度の目安は、全国表示で 0.08〜0.12、地域を選んだときで 0.3 前後です。
- 紙の質感は CSS の背景で作り、キャンバスは透明にします。
- 都道府県名のラベルは HTML の要素で、毎フレーム射影した位置へ動かします。
- 負荷が高いときは、DPR(上限2)と弧の区間数を段階的に下げます。粒子の数は量そのものなので変えません。

## 6. カメラ

正投影です。3つの定位置があります。

| 名前 | 方位 | 仰角 | morph | lean |
|---|---|---|---|---|
| `side`(真横) | 0 | 0 | 0 | 0 |
| `oblique`(斜め俯瞰) | −0.35 | 0.6 | 1 | 0.5〜0.9 |
| `top`(真上) | — | π/2 | 1 | 0.5〜0.9 |

真上では北が画面の上になるようにカメラを回します。縦長の画面では、真横の定位置でカメラを90度回し、一直線の並びを縦(北が上)にします。定位置の間は滑らかに補間し、動きを減らす設定では即座に切り替えます。

## 7. モジュールの約束

```
src/
  main.js                 配線だけを行う
  state.js                createStore(initial) → { get(), set(patch), subscribe(fn) }
  params.js               URL の引数と state の相互変換
  i18n.js                 t(key) と文言の辞書(ja / en)。辞書は i18n/ に部品ごとに分かれる
  i18n/                   common.js、timeline.js、selector.js、tooltip.js、table.js、controls.js、chapters.js
  content/chapters.js     章の中身(各章の見出し・本文のキー、選択、カメラ)
  data/loader.js          loadData() → { years, totals, matrix(year) → Int32Array(2209), prefectures, topology }
  geometry/constants.js   W, H, N, STEP, K, CX
  geometry/layout.js      lineLayout() → [x, z][47]
                          geoLayout(prefectures) → { pos: [x, z][47], toWorld(mapX, mapY) → [x, z], northAngle, kmPerUnit }
                          nodePos(line, geo, i, morph) → [x, z]
  geometry/arc.js         arcPoint(A, B, side, lean, t, out) → out([x, y, z])
                          arcTangent(A, B, side, lean, t, out) → out
                          GLSL_ARC(同じ式の GLSL 断片)
  geometry/flows.js       sideOf(o, d, selection) → +1 | −1 | 0(0 は描かない)
                          particleCount(v) → 枠の数
                          arcList() → 弧の固定の順序(2,162 組)
  scene/shared.js         全層が共有する uniform と GLSL 断片、描く順序(RENDER_ORDER)
  scene/renderer.js       createRenderer(canvas, data) → {
                            setView({ azimuth, elevation, zoom, center, roll }), setMorph(m), setLean(l),
                            setSelection(Uint8Array(47)), setYear(a, b, mix), setTheme('paper' | 'ink'),
                            setReducedMotion(bool), setHover(arc | null), resize(), render(timeSec),
                            project(i) → [x, y](CSS px), dispose() }
  scene/arcs.js           createArcsLayer(ctx) 弧の層
  scene/particles.js      createParticlesLayer(ctx) 粒子の層
  scene/ground.js         createGroundLayer(ctx) 地面と境界線の層
  scene/camera.js         viewFor(preset, aspect, layout)、tween(a, b, s)(純関数)
  scene/cameraRig.js      state.camera の変化を renderer へつなぐ配線
  scene/fallback2d.js     createFallback(canvas, data) WebGL2 が使えない環境の Canvas 2D 代替(renderer と同じメソッド)
  scene/picking.js        createPicker(data) → { rebuild(state), pickNode(x, y) → i | null, pickArc(x, y) → { o, d } | null }
  ui/labels.js、ui/timeline.js、ui/selector.js、ui/tooltip.js、ui/table.js、ui/chapters.js、ui/controls.js
                          それぞれ mount(el, store, ctx) → { dispose() }
  styles/tokens.css       --paper、--ink、--vermilion とダークテーマ
  styles/base.css         全体の土台
  styles/ui-<部品名>.css  UI 部品ごとの見た目(labels、chapters、timeline、selector、controls、tooltip、table)
```

### state

| キー | 値 |
|---|---|
| `year` | 2012〜2025 |
| `chapter` | 0〜4 |
| `selection` | `null`、`{ type: 'pref', code }`、`{ type: 'metro', id }` |
| `camera` | `'side'`、`'oblique'`、`'top'` |
| `morph` | 0〜1 |
| `theme` | `'paper'`、`'ink'` |
| `lang` | `'ja'`、`'en'` |
| `reducedMotion` | 真偽 |
| `hover` | `null`、`{ type: 'pref', code }`、`{ type: 'arc', o, d }` |

### URL の引数

`?year=2014&ch=0&sel=13`(都道府県コード)または `sel=tokyo`(圏)、`cam=side`、`morph=0`、`theme=ink`、`lang=en`、`still=1`。`still=1` は時間と乱数を固定し、撮影の結果を再現できるようにします。

## 8. 品質の基準

- 真横の定位置では、原作の arc diagram と ±1px で一致します。
- どの視覚効果も、量(粒子の数)の見え方を変えません。
- 色は3つのトークンとその不透明度違いです。
- キーボードで操作でき、数値を表でも読めます。WebGL2 が使えない環境では、Canvas 2D で真横の図と静止した点描を描きます。
- 外部への参照はすべて https です。資産への参照は、末尾スラッシュの有無に関わらず解決できる書き方にします。

## 9. 骨格で確定した取り決め

骨格の実装(`app/skeleton`)で、この文書のあいまいだった点を次のように決めました。各担当はこれに従います。

### 構成と道具

- `npm run dev / build / preview / test`。Vite の `base` は `./`。`index.html` の先頭で、末尾スラッシュなしのディレクトリ URL でも相対参照が解決できるよう `<base>` を補います。データは `document.baseURI` を基準に `data/…` を取得します。
- `tools/shot.mjs`: プレビューサーバを立てて Playwright で撮影します。`node tools/shot.mjs --query "morph=0&cam=side" --size 1440x900 --out shots/a.png`(`--query` と `--size` は次に変えるまで引き継がれ、`--out` で1枚撮る。`still=1` を自動で足す)。コンソールのエラー・警告や読み込み失敗があると終了コード 1 になります。撮影の準備ができると `<html data-ready="1">`、失敗すると `data-error` が付きます。
- テストは `test/`(Vitest)。小さなデータは `test/fixtures/`(`make-fixtures.mjs` で再生成)。原作との照合に `d3@3.5.17` を devDependency に持ちます。

### 幾何

- `geometry/constants.js` は `W, H, N, STEP, K, CX` に加えて、`METRO_CODES`(圏の構成、JIS コード)、`CAMERA_PRESETS`(§6 の表)、`YEAR_MIN/MAX` を持ちます。
- `arcPoint(A, B, side, lean, t, out)` の A、B は補間後の位置 `[x, z]`。`arcTangent` は単位ベクトルで、端点では t を `[1e-4, 1 − 1e-4]` に丸めます。GLSL 側の `GLSL_ARC` は弧の式だけで(`uLean`、`uK`、`arcPoint(si, ti, side, t, out R)`。R は弦に垂直な水平の単位ベクトル)、`nodePos(i)` は `scene/shared.js` の `GLSL_NODES` にあります。
- `geoLayout(prefectures)` は `{ pos, toWorld, northAngle, kmPerUnit, bounds }` を返します。`bounds = { minX, maxX, minZ, maxZ }`。
- `geometry/flows.js` は `sideOf(o, d, selection)`(o、d は添字 0〜46)、`particleCount(v)`(`ceil(v / 100)`)に加えて、`selectionMask(selection) → Uint8Array(47)` と `arcList()` を持ちます。`arcList()` は 47 × 46 = 2,162 組の (o, d) を o の昇順、その中で d の昇順に固定した順序で持ち(同じ都道府県どうしは含まない)、`length`、`o` / `d`(Uint8Array)、`pair(k) → [o, d]`、`indexOf(o, d) → k`(不正は −1)、`cell(k) → o * 47 + d` を引けます。弧・粒子・当たり判定・表がこの順序を共有します。圏のメンバーは `METRO_CODES` で決め、`prefectures.json` の `metro` とは独立に同じ分け方です。

### state と URL

- `store.subscribe(fn)` は `fn(state, changedKeys)` を、変化があったときだけ同期で呼び、購読解除の関数を返します。`get()` は set のたびに新しいオブジェクトです。
- `parseParams(search) → { patch, still }`、`toSearch(state, { still })`、`applyParams(store, search) → still`、`syncUrl(store, { still })`。既定値は URL に出しません。`cam` だけが指定されたときの `morph` は定位置の値です。`still` は state に入れず、`main.js` が時間とカメラの補間を固定するのに使います。
- `state.year` は整数の西暦で、既定は 2025。

### 描画

- `renderer.setView({ azimuth, elevation, zoom, center, roll })`: `azimuth` は Y 軸まわり(0 でカメラは +z 側、x が右)、`zoom` は **ワールド 1 単位が画面の高さの何分の一か**(CSS px = zoom × 画面の高さ。画面の大きさに依らないので、カメラの視点を縦横比だけから作れる)、`center` は `[x, y, z]`、`roll` は画面の像を時計まわりに回す角度。仰角 90° でも上向きが定まるよう、上向きは `(−sin(el)·sin(az), cos(el), −sin(el)·cos(az))` です。
- `renderer.setYear(a, b, mix)` の a、b は西暦です。`renderer.render(timeSec)` は呼ぶたびに各層の `update(frame)` を呼びます。
- `createRenderer` が返すオブジェクトは、設計のメソッドに加えて `layout`(`{ line, geo, toWorld, northAngle, kmPerUnit, bounds }`)、`getState()`、`screenMatrix()`(ワールド → CSS px のアフィン 2×4)を持ちます。`scene/fallback2d.js` の `createFallback` も同じメソッドを持ちます(WebGL2 を作れなかったときに `main.js` が切り替え、`<html data-fallback="2d">` が付きます)。
- **層**: renderer が自分で描くのは 47 都道府県の点だけです。弧・粒子・地面は層で、`createArcsLayer(ctx)`、`createParticlesLayer(ctx)`、`createGroundLayer(ctx)` が `{ object3D, update(frame), setYear(a, b, mix), setSelection(mask), setTheme(theme), setHover(arc | null), dispose() }` を返します(関係のないメソッドは何もしない)。`ctx = { shared, data, arcList }`、`frame = { time, dt, reducedMotion }`。後続の担当は自分の層のファイルだけを書き換えます。
- **`scene/shared.js`**: 全層が共有する uniform(`uNodes`、`uMorph`、`uLean`、`uK`、`uRes`(描画バッファの実ピクセル)、`uPixelRatio`、`uTime`、`uInk`、`uPaper`、`uAccent`。各 `{ value }`)を `createShared(data)` が作ります。GLSL 断片は `GLSL_NODES`(`uNodes`、`uMorph`、`nodePos(i)`)と `geometry/arc.js` の `GLSL_ARC`(弧の式。`nodePos` が必要)で、`GLSL_COMMON` が両方をつなげたものです。
- **描く順序**: `RENDER_ORDER`(地下の弧 0、地下の粒子 1、地面 2、地上の弧 3、地上の粒子 4、都道府県の点 5)を、各層が自分の Mesh / Points(葉のオブジェクト)の `renderOrder` に付けます。Group に付けると three.js が層をまたいだ並べ替えをしなくなるので付けません。
- 色は `styles/tokens.css` の `--bg`、`--fg`、`--accent`(ダークテーマで入れ替わる別名)を `shared.setTheme` が読みます。
- **`scene/camera.js`** は純関数です。`viewFor(preset, aspect, layout) → { azimuth, elevation, zoom, center, roll, morph, lean }`(`aspect` は幅 / 高さ、`layout` は `renderer.layout`。真上の azimuth と収める範囲に使う)と、`tween(a, b, s)`(角度は短い側へ、zoom は対数で補間)。縦長の真横は `roll = π/2` で北海道が上、真上は北が画面の上になる azimuth を使います。store と renderer をつなぐ `scene/cameraRig.js` が、`state.camera` の変化で視点と `state.morph` を補間します(動きを減らす設定では即時)。
- `scene/picking.js`: `createPicker(data)` は `rebuild({ matrix, mask, selection, morph, lean, screen })`、`pickNode(x, y)`、`pickArc(x, y)` を持ちます。`pickNode` は実装済み(半径 14 CSS px)、`pickArc` は未実装です。弧は `arcList()` の添字で扱います。
- UI 部品は `mount(el, store, ctx)`、`ctx = { data, renderer, picker, onFrame(fn(timeSec)) → off }`。要素の id は `labels`、`timeline`、`selector`、`tooltip`、`table`、`chapters`、`controls`(キャンバスは `stage`)。

### 文言・CSS・章

- 文言の辞書は `src/i18n/<部品>.js` に `{ ja, en }` で置き、`src/i18n.js` がまとめて `t(key)` を提供します。キーは `<部品>.<名前>`(`common.js` は `app.`、`unit.`、`flow.`、`source.`)で、部品どうしで重ならないことをテストで確かめています。担当は自分の辞書だけを編集します。
- CSS は `main.js` が `tokens.css`、`base.css`、`ui-<部品名>.css` を読み込みます。UI 部品の配置と見た目は、その部品のファイルに書きます。
- 章は、仕組み(`ui/chapters.js`)と中身(`content/chapters.js` の `CHAPTERS`: 見出し・本文のキー、選択、カメラ)に分かれます。いまの選択とカメラは仮の値です。

### 未実装(後続)

弧・粒子・地面の層、`pickArc`、各 UI 部品、章のスクロール連動、Canvas 2D の代替表示(`scene/fallback2d.js` は位置の射影だけ)の中身。
