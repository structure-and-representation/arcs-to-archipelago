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
- 地理配置: 地図座標を回転と拡大縮小でワールド座標へ移します。北海道から鹿児島へ向かう向きを +x 軸に重ね、47 点全体の x 方向の広がりを一直線の配置の長さ `46 * STEP` に合わせます(x の最小値が `-CX`、最大値が `CX`)。沖縄は同じ変換で実位置に置きます。地図の東西南北の向きが鏡像にならないようにします。境界線の頂点にも同じ変換を使います。
  - 実装で確定した点: 一直線の両端(北海道と沖縄県)が地理配置でも画面の同じ幅に収まり、変形の前後でカメラの拡大率を変えずに済みます。回転は北海道→鹿児島が +x になる向きのまま、拡大と平行移動を 47 点の x の最小値が `-CX`、最大値が `CX` になるように決めます。z は 47 点の範囲の中央が 0 です。
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
- 粒子は `THREE.Points` で、1粒が1頂点です。確定仕様は `docs/particles/spec.md` で、この文書と食い違うところはそちらが正です。要点:
  - 粒子は弧の曲線の上に置き、位置は**弧の長さの割合 s** で決めます。s を B スプラインの媒介変数 t へ変換する `arcT(s)`(すべての弧が相似なので 1 つの式)を、シェーダと `geometry/particles.js` の両方に持ちます。t を一様に進めると粒子が両端に溜まるためです。
  - すべての弧で、端から端まで流れる時間は 14 秒です。位相は `s = fract(fract(k * 0.618034 + r_arc) + uPhase)`、`uPhase = fract(timeSec / 14)` は CPU で倍精度で計算して渡します。`r_arc` は (o, d) の整数ハッシュ(lowbias32)から作る弧ごとの乱数です。
  - 人数 v の弧の k 番目(0始まり)の粒子の重みは `clamp(v / 100 - k, 0, 1)` で、Σk がちょうど v / 100 です。不透明度は「重み × 上限 × 端の薄め」で、端の薄めは s が 0〜0.04 と 0.96〜1 の smoothstep です。
  - 弧ごとに全年の `ceil(v / 100)` の最大を枠とします(計 26,206 枠)。属性は `aSlot = (o, d, k)` だけです。年ごとの人数は R32F のテクスチャ(幅 47、高さ 47 × 年数、texel `(d, 年の添字 * 47 + o)`)に持ち、`texelFetch` で 2 つの年を読んで補間します。
  - **静止の配置**(動きを減らす設定と `still=1`)は、黄金比の並び `s = 0.04 + 0.92 * fract(k * 0.618034 + r_arc)` です。年を切り替えても既にある点は動かず、新しい点は最大の隙間に入ります(`(k + 0.5) / n` の並べ方は使いません)。
  - 地上と地下を 2 つの `Points` で描き、選択が変わるたびに CPU で枠を [地下 | 地上] に並べ直して `drawRange` で分けます。
  - 粒子の径と不透明度の上限は `tokens.css` の値(後述)で、ホバー中の弧の粒子は朱にします。
- 描く順序は、地下の弧と粒子、地面(紙の色の半透明、不透明度 0.35 以下)と境界線、地上の弧と粒子です。
- 重なりは通常のアルファ合成です。不透明度・線幅・粒子径は `docs/design/spec.md` 6 節の値で、`styles/tokens.css` の `--gl-*` を `scene/shared.js` がまとめて読みます(§10)。
- 紙の質感は CSS の背景で作り、キャンバスは透明にします。
- 都道府県名のラベルは HTML の要素で、毎フレーム射影した位置へ動かします。
- 負荷が高いときは、DPR(上限2)と弧の区間数を段階的に下げます。粒子の数は量そのものなので変えません。

## 6. カメラ

正投影です。3つの定位置があります。

| 名前 | 方位 | 仰角 | morph | lean |
|---|---|---|---|---|
| `side`(真横) | 0 | 0 | 0 | 0 |
| `oblique`(斜め俯瞰) | 真上と同じ(北が上) | 52°(地域を選んでいるときは 38°) | 1 | 0 |
| `top`(真上) | — | π/2 | 1 | 0.5〜0.9 |

真上と斜め俯瞰では北が画面の上になるようにカメラを回します(北海道が右上、九州が左下の、見慣れた日本列島の形)。斜め俯瞰は弧を倒さずに立てるので(lean 0)、地上の弧は画面の上へ、地下の弧は画面の下へふくらみます。斜め俯瞰の値は、`docs/review/oblique-study/` の比較で選んだ案C4「北が上・選択時は低め」です。縦画面の構成(幅 1024px 未満)でもカメラは回しません。縦画面の図の領域は本文と画面を分け合う横長の領域なので、真横も横長の並び(北海道が左)のまま収めます(凡例と第1章の本文も横長用の「線より上は北へ」を使う)。定位置の間は滑らかに補間し、動きを減らす設定では即座に切り替えます。実装の値(真上の lean 0.7、図の領域、遷移の段取り)は §10 にあります。

## 7. モジュールの約束

```
src/
  main.js                 配線だけを行う
  state.js                createStore(initial) → { get(), set(patch), subscribe(fn) }
  params.js               URL の引数と state の相互変換
  i18n.js                 t(key) と文言の辞書(ja / en)。辞書は i18n/ に部品ごとに分かれる
  i18n/                   common.js、timeline.js、selector.js、tooltip.js、table.js、controls.js、chapters.js、legend.js
  data/stats.js           集計と書式(読み出し・ツールチップ・表・年の折れ線・ラベル・カメラの構図が共有する。§10)
  geometry/particles.js   粒子の計算の JS 版(ハッシュ、arcT、静止の配置、重み、枠の予算と並べ替え)
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
                            setReducedMotion(bool), setStill(bool), setHover(arc | null), resize(), render(timeSec),
                            project(i) → [x, y](CSS px), dispose() }
  scene/arcs.js           createArcsLayer(ctx) 弧の層
  scene/particles.js      createParticlesLayer(ctx) 粒子の層
  scene/ground.js         createGroundLayer(ctx) 地面と境界線の層
  scene/camera.js         viewFor(preset, aspect, layout, opts)、tween(a, b, s)、figureRegion(w, h)(純関数)
  scene/yearTween.js      年の補間の持ち主。renderer.setYear(a, b, mix) を呼ぶ(§10)
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
- 色と描画の値は `styles/tokens.css` から `shared.js` が読みます(統合で改めた取り決めは §10)。
- **`scene/camera.js`** は純関数です。`viewFor(preset, aspect, layout) → { azimuth, elevation, zoom, center, roll, morph, lean }`(`aspect` は幅 / 高さ、`layout` は `renderer.layout`。真上の azimuth と収める範囲に使う)と、`tween(a, b, s, layout)`(角度は短い側へ、zoom は対数で補間。遷移の段取りは §10)。縦長の真横は `roll = π/2` で北海道が上、真上と斜め俯瞰は北が画面の上になる azimuth を使います。store と renderer をつなぐ `scene/cameraRig.js` が、`state.camera` の変化で視点と `state.morph` を補間します(動きを減らす設定では即時)。
- `scene/picking.js`: `createPicker(data)` は `rebuild({ matrix, mask, selection, morph, lean, screen })`、`pickNode(x, y)`、`pickArc(x, y)` を持ちます。`pickNode` は半径 14 CSS px、`pickArc` は弧の当たり判定です。弧は `arcList()` の添字で扱います。
- UI 部品は `mount(el, store, ctx)`、`ctx = { data, renderer, picker, onFrame(fn(timeSec)) → off }`。要素の id は `labels`、`timeline`、`selector`、`tooltip`、`table`、`chapters`、`controls`(キャンバスは `stage`)。

### 文言・CSS・章

- 文言の辞書は `src/i18n/<部品>.js` に `{ ja, en }` で置き、`src/i18n.js` がまとめて `t(key)` を提供します。キーは `<部品>.<名前>`(`common.js` は `app.`、`unit.`、`flow.`、`source.`)で、部品どうしで重ならないことをテストで確かめています。担当は自分の辞書だけを編集します。
- CSS は `main.js` が `tokens.css`、`base.css`、`ui-<部品名>.css` を読み込みます。UI 部品の配置と見た目は、その部品のファイルに書きます。
- 章は、仕組み(`ui/chapters.js`)と中身(`content/chapters.js` の `CHAPTERS`: 見出し・本文のキー、選択、カメラ)に分かれます。いまの選択とカメラは仮の値です。
- 場面は、年・選択・カメラに加えて、場面の本文のキー(`body`。あるときは、その場面にいる間、章の本文の代わりにカードに出す)と、強調する弧(`hover: { type: 'arc', o, d }`。場面に入ったとき `renderer.setHover` でホバー中と同じ朱にする。state の hover は書かないので、読者が図に触れれば通常のホバーに戻る)を持てます。確定稿は `docs/copy/chapters.js` の各場面の `body` と `hover` です。

## 10. 統合で確定した取り決め

部品を統合したときに、部品をまたぐ取り決めを次のように揃えました。§9 と食い違うところは、こちらが正です。

### 色と描画の値

- **色空間**: `shared.js` は色の uniform(`uInk`、`uPaper`、`uAccent`)に、トークンの **sRGB の値をそのまま** 入れます(`setSrgbColor`: `#rrggbb` を 255 で割った値を、線形への変換をせずに `THREE.Color` に入れる)。各層の `ShaderMaterial` は出力時に色空間を変換しません(`linearToOutputTexel` を使わない)。そのため、画面の画素の値がトークンの値と一致します(朱の点の中心は紙で `#C23B22`、墨で `#E5603F`。`test/e2e/integration.check.mjs` で確かめる)。
- **描画の値の一元化**: `shared.style`(`readStyle(theme, { portrait })`)が、`tokens.css` の次の値をまとめて持ちます。各層と Canvas 2D の代替表示は、ここからだけ読みます。
  - 色: `--bg`、`--gl-fg`、`--gl-accent`
  - 不透明度: `--gl-arc-all`、`--gl-arc-sel`、`--gl-arc-hover`、`--gl-particle`、`--gl-particle-sel`、`--gl-ground`、`--gl-border`(テーマごと)
  - 寸法(CSS px): `--gl-line-width`(.7)、`--gl-line-width-sel`(.8)、`--gl-line-width-hover`(1)、`--gl-particle-size`(2)、`--gl-particle-size-sel`(2.2)、`--gl-particle-size-hover`(2.2)、縦画面の `--gl-particle-size-portrait*`(1.8 / 2 / 2)
  - `shared.setTheme(theme)` と、描画バッファの CSS 幅が 1024px をまたいだときの `shared.setSize` で読み直します。renderer は `shared.setTheme` の後に各層の `setTheme` を呼びます。
  - 粒子の径と不透明度は、`docs/particles/spec.md` の 2.5 px・0.5 ではなく、デザイン仕様 6 節(上の値)を使います。
- 都道府県の点は、墨の直径 3 CSS px、選択中は朱の直径 6 CSS px に紙色の 1.5 CSS px の輪です。

### 縦画面の判定

縦画面の構成は **幅 1024px 未満** で、CSS(`@media (max-width: 1023.98px)`)、`ui/portrait.js`、`scene/camera.js` の `isPortrait`、`shared.js`、ラベルが同じ条件を使います(縦横比では判定しない)。

### 描画ループと frame

- `frame = { time, dt, reducedMotion, still }`。`still` は `renderer.setStill(bool)` で渡し、層は URL を読みません。粒子は `still || reducedMotion` で静止の配置にし、弧の選択の切り替えも `still` では即時です。
- `main.js` の描画ループは、次のフレームを先に予約し、カメラ・年・当たり判定・描画・UI 部品の毎フレームの処理を個別に `try/catch` で受け止めます(同じ例外は 1 回だけ `console.error`)。1 つの部品の例外で画面全体が凍ることはありません。
- `window.__app.dispose()` は、描画ループ、store の購読、URL の同期、イベントの登録、UI 部品、カメラ、描画器(WebGL の文脈を含む)を解放します。`window.__app.pause()` は次のフレームを描いてからループを止めます(撮影用)。

### 年の補間

- 年の補間の持ち主は `scene/yearTween.js` の `createYearTween` です。`renderer.setYear(a, b, mix)` を呼ぶのはここだけで、`main.js` が `state.year` の変化を `set(year, { immediate })` へ渡し、毎フレーム `update(dt)` を呼びます。
- 時間は `--dur-year`(600ms。CSS の圧縮で `.6s` になるので単位ごと読む)、緩急は ease-in-out です。動きを減らす設定と `still=1` では即時です。補間の途中で次の年が来たら、見た目が近いほうの年から向かい直します。
- 読み出し・ツールチップ・表・年の折れ線は `state.year`(切り替え先の年)の値を出します。

### 集計

集計の関数は `data/stats.js` に一本化しました(`tableStats.js` は廃止)。読み出し(`regionFlows`)、ツールチップ(`prefFlow`)、表(`tableRows`、`partnerFlows`、`sortRows`)、年の折れ線(`timelineSeries`)、ラベルの相手先(`topPartners`)、カメラの構図の相手先(`mainPartners`)が同じ関数から同じ値を出します。圏を選んだときは、どこでも **圏外との移動だけ** を数えます。書式(`formatCount`、`formatSigned`、`formatShort`)もここにあります。

### store と URL

- `store.set` を購読関数の中で呼んだときは、通知を待ち行列に積み、いまの通知を全員に配ってから配ります。どの購読関数も、`set` された順に `(その時点の state, 変わったキー)` を受け取ります。
- URL の `sel`(圏の id)と `cam` は、自身のキーだけを認めます(`isMetroId`、`isCameraName`。`'constructor'` などは無視)。`selectionMask` は不明な選択を空のマスクにします。
- **はじめの章と場面**は `ui/chapters.js` の `initialScene(parseParams(search).patch)` が決め、`main.js` がカメラの配線を作る前に state へ書きます。
  - `ch` があるとき: その章の最初の場面の年・選択・カメラ。URL に `year` / `sel` / `cam` / `morph` があれば、そちらを優先します。
  - `ch` がなく `year` / `sel` / `cam` のどれかがあるとき: それらがすべて一致する最初の場面の章。なければ自由探索の章(URL にない値は自由探索の場面の値)。本文と画面の状態が矛盾しないようにするためです。
  - どれもないとき: 0 章の最初の場面(2014 年、真横)。
  - `ui/chapters.js` はその場面の位置へスクロールするだけで、読者がスクロールして場面を越えたときから state を書きます。

### 図の領域とカメラの契約

- `scene/camera.js` の `figureRegion(width, height)` が、固定の UI に覆われない図の領域(CSS px)を返し、`viewFor` は図をその領域に収めます(`renderer` 側では `setViewOffset` を使わず、注視点 `center` と `zoom` で領域の中心へずらす)。
  - デスクトップ: x 424〜(幅 − 40)、y 96〜(高さ − 136)。地域を選んでいないときの斜め俯瞰と真上は、上端を y 250 まで下げます(`presetRegion`。読み出しは y 185 で終わり、北海道の陸地の面が右上へ張り出す分を空ける)。
  - 縦画面: 上の帯の下(y 72)からドックの上(高さ − 180)までを、図(上 55%。`portraitSplit(height)` まで)と本文のカード(その下)で分け合います。図の領域は x 16〜(幅 − 16)、y 72〜`portraitSplit(height)`。真横は下に縦書きの索引の余白 44px、斜め俯瞰と真上は上端を図の向きの注記の下(y 118)まで下げます。本文のカードは `portraitSplit(height)` からドックの上までに固定し(`ui/chapters.js` が `--card-top` を書く)、収まらない本文は章の中のスクロールの進み(8%〜70%)に合わせてカードの中を流れます。章に入った最初の画面で、図の全体と本文の冒頭が同時に見えるようにするためです。
- 地域を選んだとき(真横以外)は、右の読み出しの列を図の領域から外し(上端は上の帯の下 y 96)、**47 都道府県すべてと、選択地域とすべての相手先の間の地上・地下の弧** が収まる拡大率にします(同じ領域に全体を収めた拡大率の 0.75〜2.5 倍)。相手先を画面の外へ出さないためです。そのうえで、図がはみ出さない範囲で選択地域を領域の内側(四辺から 18%)へ寄せます。`createCameraRig({ partners })` の相手先は、いまの構図では使いません(互換のため受け取る)。
- 地域を選んだときの斜め俯瞰は、`SELECTION_OBLIQUE = { elevation: 38°, lean: 0 }` にします。選択なしの 52° より低く見て、立てた弧の上下(転入と転出)の厚みの差を見せるためです。
- **遷移**: `tween(a, b, s, layout)` は、途中の向きと形(morph、lean)で図を領域に収め直します(端の視点に利用者の拡大・回転があれば、その比を補間する)。真横(morph 0)と地図(morph 1)の間の変形は 1.8 秒で、2 つの段に分けます。1 段目(進み 0〜0.44、約 0.8 秒)はカメラを真横のまま morph を 0 から 1 へ動かし、2 段目でカメラを起こします(仰角を 0.44〜0.8 で上げきり、方位を 0.52〜1 で回す。逆向きは時間で裏返す)。傾いた図が伸びる中間の状態を作らず、どの点がどこへ行ったかを真横のまま目で追えるようにするためです。仰角を先に上げるので、方位の回転は画面の中の回転に近くなり、北海道は左から上を通って右上へ回ります。変形の間、ラベルは点に付けて運びます(`ui/labels.js` の `carryPose`)。斜め俯瞰と真上の間は、方位を変えずに仰角と lean だけを動かします(起こし)。

### 文言のキー体系

- `docs/copy/strings.md` のキーと文言が正です。辞書は `src/i18n/<部品>.js` に分かれ、`test/i18n.test.js` が strings.md の全キーの一致を確かめます。
- 接頭辞: `meta.`、`app.`、`source.`、`footer.`(common)、`legend.`、`readout.`、`region.`(圏の名前は `region.metro.<id>`)、`selector.`、`year.`、`camera.`、`settings.`、`table.`、`fallback.`、`tooltip.`、`ch.`(章)。章の本文は `ch.<n>.body` と縦画面用の `ch.<n>.body.portrait`。
- テーマの選択肢は「紙 / 墨」(`settings.theme.paper` / `settings.theme.ink`)の 2 つです。
- 出典の注記はページの末尾と表のダイアログに出し、確定稿の `footer.note` と地図の出典 `footer.mapSource`(地球地図日本(© 国土地理院)を加工して作成)を使います。凡例には短い出典(`source.*`)と `legend.encoding` を出します。

### UI の配置

- `#controls` は画面全体を覆う透明な入れ物(押せない)で、中の部品を画面を基準に置きます。上の帯の右に「数値の表」「日本語 / EN」「紙 / 墨」、デスクトップの右下と縦画面のドックの 3 段目にカメラの 3 ボタンです。ドックの地と高さは `base.css` と `tokens.css`(`--dock-h`)が持ちます。
- 数値の表の入口は上の帯のボタンだけです。ボタンは `#table` へ `table:open` を送り、`ui/table.js` が `<dialog>` を `showModal()` で開きます(代替表示の案内のボタンは `[data-open-table]`)。

### 配信と撮影

- 末尾スラッシュなしの URL でも資産を解決できるよう、ビルドした `index.html` の資産のタグ(module script、stylesheet)は、`<base>` を補った後に `document.write` で書き出します(`vite.config.js`。ブラウザの先読みが補う前の URL で取りに行かないように)。`test/e2e/base-path.check.mjs` で確かめます。
- `tools/shot.mjs` は、ソースが `dist` より新しいときに作り直します。1 枚ごとに新しいブラウザの文脈で開き、撮る前に描画ループを止め、撮り終えたら `__app.dispose()` で WebGL の文脈を解放します。前のページの描画ループが走り続けると、ソフトウェア描画(SwiftShader)を奪い合って次のページの読み込みが時間切れになるためです。1 枚の失敗では止めず、1 回撮り直します。

### 確認の手段

- `npm run test`(Vitest)
- `npm run build` のあと: `node test/e2e/controls.mjs`、`node test/e2e/chapters.e2e.mjs desktop|mobile`、`node test/e2e/table-fallback.check.mjs`、`node test/e2e/base-path.check.mjs`、`node test/e2e/integration.check.mjs`
