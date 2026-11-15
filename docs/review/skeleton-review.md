# 骨格レビュー

このレビューは、骨格(`docs/technical-design.md`、`src/` の幾何・状態・データ・描画器・配線、`tools/`、`test/`、`public/data/`)を、8本の実装が並行して積まれる前の時点(main 59147f0)で読んだものです。

- 行番号は、いまの main(08e3662)に合わせ直してあります。
- 再現の手順は、`npm ci` を済ませたリポジトリの直下から実行する前提です。ブラウザを使うものは `tools/shot.mjs` と同じ起動引数(`--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`)で Playwright の Chromium を開きます。
- 重要度は「統合の前に直す」「統合のときに直す」「後でよい」の3段階です。
- 状態は、いまの main での確認結果です。「解消済み」「未解消」「一部解消」のいずれかを付けています。

## 0. いまの状態の要約

| 区分 | 件数 | 内訳 |
|---|---|---|
| 解消済み | 4 | P3(図の領域・縦画面の判定)、P4(morph の巻き戻し)、I7 の一部(`.gitignore` の `shots/`)、P8 の一部(辞書のキー体系) |
| 未解消(統合の前に直す) | 6 | P1(色空間、粒子と都道府県の点が残る)、P2(トークンの二重定義)、P5、P6、P7、P9 |
| 未解消(統合のときに直す) | 8 | I1〜I6、I7 の残り、I8 |

骨格の幾何(`layout.js`、`arc.js`、`flows.js`)とデータの生成・検証は、設計どおりで正しいことを確認しました(§9)。

---

## 1. 統合の前に直す指摘

### P1. 色が仕様と違う(一部解消。粒子と都道府県の点が残っている)

- 状態: 弧(`src/scene/arcs.js:129`)と地面(`src/scene/ground.js:208`、`:236`)は `linearToOutputTexel` で出力色空間へ戻すようになり、直っています。**粒子と都道府県の点が残っています。**
- 根拠:
  - `src/scene/shared.js:100-105` の `setTheme` が `THREE.Color.set('#rrggbb')` で色を作ります。three.js は sRGB を線形値へ変換して持ちます。
  - しかし `src/scene/particles.js:93`(`outColor = vec4(uInk, a);`)と `src/scene/renderer.js:39`(`outColor = vec4(col, a * mix(0.85, 1.0, vSel));`)は、`ShaderMaterial` の出力に色空間の変換を入れていません。
  - 粒子の仕様(`docs/particles/spec.md` §9)も「`THREE.Color` の内部値を渡すと色が暗くなる」と書いています。
- 影響:
  - 都道府県の点の朱が、仕様の `#c9331f`(201,51,31)ではなく、暗い赤 (149,8,3) になります。
  - 墨の点が (38,38,37)(期待は墨と紙の混合の約 (59,…))、ダークテーマの紙色の点が 235 前後(期待は 246)になります。
  - 弧(正しい色)と、粒子・都道府県の点(暗い色)が、同じ画面で色が食い違います。
  - ホバー中の弧の朱は正しく、選択した都道府県の点の朱は暗いので、同じ「朱」が2色になります。
- 再現:
  1. `node tools/shot.mjs --query "cam=top&sel=tokyo" --size 1440x900 --dpr 1 --out shots/c.png`
  2. 選択した4県の点の中心の画素値を読む。(149,8,3) になる。
- 直し方:
  - 粒子と都道府県の点のフラグメントシェーダでも `linearToOutputTexel(vec4(color, a))` を通す。
  - または `shared.js` の色の設定で `THREE.LinearSRGBColorSpace` を指定して(`setHex(hex, THREE.LinearSRGBColorSpace)` など)、全層が同じ「sRGB の値のまま」の uniform を使う形に統一する。どちらにするかは、全層の担当に告知して1つに決める。

### P2. トークンの二重定義と、描画の定数の置き場がない(未解消)

- 根拠:
  - `docs/design/tokens.css` は `--paper:#F3F0E8`、`--ink:#1C1B18`、`--vermilion:#C23B22`(ダークは `#E5603F`)で、`--fg-1/2/3`、`--line-*`、`--veil`、`--font-sans`、`--fs-*`、`--dur-*`、`--focus`、`--halo`、`--gl-*`(弧・粒子・地面の不透明度、線幅、粒子径)を持ちます。
  - `src/styles/tokens.css`(main で未変更)は別の値(`#f6f3ec`、`#1b1a17`、`#c9331f`、ダークの朱 `#e5533b`)で、`--fg-70`、`--font`、`--gutter` という別名の体系です。仕様の `--gl-*` もありません。
  - 一方、UI 部品の CSS(`src/styles/ui-*.css`)は、仕様のトークン名(`--fg-1`、`--font-sans`、`--veil-solid`、`--dur-1`、`--focus` など)で書かれています。`src/styles/tokens.css` に無いので、未定義の `var()` になります。
  - `src/scene/shared.js:43-57` の `readColors` は `--bg`、`--fg`、`--accent` だけを `^#[0-9a-f]{6}$` で読みます。仕様の tokens に差し替えると、`--bg` は `rgb(...)` 形式、`--fg` は未定義なので、すべて失敗し、`FALLBACK_COLORS`(`shared.js:43-46`)の固定値に黙って戻ります。
  - 弧(`src/scene/arcs.js:33-51`)、地面(`src/scene/ground.js:15-19`)、Canvas 2D 代替(`src/scene/fallback2d.js`)は、それぞれ `--gl-*` を各自で読み、読めなければ仕様の値を使います。粒子は読みません(`ALPHA`、`SIZE_CSS_PX` の定数。`src/geometry/particles.js:13-14`)。
- 影響:
  - UI の見た目が、トークン未導入の状態では崩れます(下線の色、下敷き、focus の輪などが出ない)。
  - キャンバスの地面の色(`uPaper`)と CSS の背景がずれます。
  - `--gl-*` の読み方が層ごとにばらばらで、ダークテーマの粒子の不透明度(仕様は `--gl-particle` が `.50`)に対応できません。
- 再現:
  1. `src/styles/tokens.css` を `docs/design/tokens.css` に差し替えてビルドする。
  2. `getComputedStyle(document.documentElement).getPropertyValue('--bg')` が `rgb(...)` になり、`shared.js` の `readColors` は固定値に戻る。
- 直し方:
  - `docs/design/tokens.css` を `src/styles/tokens.css` に移して、単一の正とする。
  - `shared.js` が `--gl-*` をまとめて読み、uniform または `shared.gl` として公開する。各層はそれを使い、層ごとの `readOpacity` を廃止する。
  - `readColors` は `rgb()` 形式も解釈できるようにする(`fallback2d.js` の `parseColor` が先例)。

### P5. フレーム内の例外で描画ループが止まり、`dispose` が不完全(未解消)

- 根拠:
  - `src/main.js:170-184`。`requestAnimationFrame(frame)` が `frame` の最後(:182)にあり、`rig.update`、`renderer.render`、`frameFns`(UI 部品の毎フレーム処理)に try/catch がありません。
  - `src/main.js:187-193` の `dispose()` は rAF を止めず、`store.subscribe(sync)`(:105)の解除、canvas のイベント(`pointermove`:151、`pointerleave`:158、`click`:159)の解除、`motionQuery` のリスナ(:48)の解除、`frameFns` の消去もありません。
- 影響:
  - 層や UI 部品のどれか1つが1回 throw すると、画面全体が凍ります。しかも `data-error` は付きません(`tools/shot.mjs` は「描画の準備が整いませんでした」の60秒タイムアウトで気づくだけです)。
  - 8本が並行して積まれるので、このリスクは上がっています。
- 再現:
  1. `node tools/shot.mjs` と同じ起動で `?still=1` を開き、`data-ready` を待つ。
  2. `window.__app.renderer.render` を一度だけ throw する関数に差し替える。以後 render は呼ばれず、ループが止まったままになる(`pageerror: boom` のみ)。
  3. `window.__app.dispose()` を呼んでも、800ms に47フレームが回り続ける。
- 直し方:
  - `requestAnimationFrame` を `frame` の冒頭で予約するか、try/finally にする。UI 部品の `frameFns` は個別に try/catch する。
  - `dispose` で rAF の ID、購読、イベント、`motionQuery` を解除する。

### P6. URL の `sel`・`cam` がプロトタイプのキーを通してしまう(未解消)

- 根拠: `src/params.js:12`(`v in METRO_CODES`)、`src/params.js:46`(`q.get('cam') in CAMERA_PRESETS`)。`in` は `Object.prototype` のキー(`constructor`、`toString`、`__proto__`、`hasOwnProperty`)に真を返します。`src/geometry/flows.js:12` の `METRO_CODES[selection.id] || []` は、関数を返された場合に iterable でないため throw します。
- 影響:
  - `?sel=constructor`: `selection = {type:'metro', id:'constructor'}` になり、`selectionMask` が「function is not iterable」で throw して、`main()` が `data-error="fatal"` で止まります。全面が白紙になります。
  - `?cam=toString`: `camera = 'toString'`、`morph = undefined`(NaN)。`ready=1` のまま、カメラの `zoom` が NaN になり、画面が壊れます。エラーは出ません。
  - 共有された URL の末尾を書き換えるだけで壊れます。
- 再現: `npm run build && npm run preview` を起動し、`?sel=constructor` と `?cam=toString` を開く。
- 直し方: `Object.hasOwn(METRO_CODES, v)`、`Object.hasOwn(CAMERA_PRESETS, v)` を使う。`selectionMask` も不明な id を空にする。`test/params.test.js` に `constructor`、`toString`、`__proto__` のケースを足す。

### P7. 年の補間の持ち主が決まっていない(未解消)

- 根拠:
  - `src/main.js:99` が `state.year` の変化のたびに `renderer.setYear(s.year, s.year, 0)` を呼びます(補間なし)。
  - 粒子の層(`src/scene/particles.js` の `setYear(a, b, mix)`)は2つの年の補間を実装済みですが、呼ぶ側がありません。`src/ui/timeline.js` は `store.set({ year })` を呼ぶだけで、`renderer` は呼びません(`grep -n "setYear\|renderer\." src/ui/timeline.js` で確認)。
  - 仕様の補間時間は、デザイン仕様 §7 が `--dur-year` 600ms、粒子の仕様 §6 が目安 0.8 秒で、食い違っています(弧の層の側の切り替えは 0.6 秒: `src/scene/arcs.js:31`)。
- 影響:
  - 年を切り替えると、粒子は補間されず、一度に切り替わります(仕様の「既にある粒子は動かず、番号の大きい粒子から薄れる」が出ません)。
  - 当たり判定と読み出し、ツールチップ、表は整数の年(目標の年)を使うので、補間中は図の見え方と数値がずれます。
- 再現: `?year=2012` を開き、`window.__app.store.set({year: 2025})` を呼ぶ。次のフレームで `uYearMix` が 0 のまま、2025年の人数に切り替わる。
- 直し方: 補間を cameraRig と同様の配線(年の補間の rig)として main に1つ持たせる。`state.year` を目標とし、`renderer.setYear(a, b, mix)` を毎フレーム呼ぶ。補間時間は 600ms か 800ms のどちらかに統一する(動きを減らす設定では即座に切り替える)。

### P9. 設計文書と docs の仕様の食い違い(未解消)

- 根拠:
  - `docs/technical-design.md:107` の「動きを減らす設定は位相 `(k + 0.5) / n` に並べる」は、粒子の仕様(`docs/particles/spec.md` §8)の `0.04 + 0.92 * fract(k*0.618034 + r_arc)` に置き換わっています(仕様は「この文書が優先」と書いている)。
  - `docs/technical-design.md:102-107` の「粒子の位置は t」は、仕様が「弧の長さ」(`arcT`)に変えています。設計文書の本文は更新されていません。
  - 粒子の仕様の GLSL(`docs/particles/particles-final-glsl.js:3`)は「`GLSL_ARC` が `uNodes`、`uMorph`、`nodePos()` を提供する」と書いています。骨格の `GLSL_ARC`(`src/geometry/arc.js:88-`)は弧の式だけで、`nodePos` は `GLSL_NODES`(`src/scene/shared.js`)にあります。仕様どおり `GLSL_ARC` だけを連結すると、シェーダがコンパイルできません(`GLSL_COMMON` を使う必要がある。粒子の実装は `GLSL_COMMON` を使っています)。
  - 粒子の不透明度と大きさが、デザイン仕様 §6(`--gl-particle` .60、直径 2.0 / 縦画面 1.8)と粒子の仕様 §9(.5、2.5 px)で食い違っています。実装は粒子の仕様に従い、Canvas 2D 代替(`src/scene/fallback2d.js` の `--gl-particle` の読み方)は .60 / .50 を使っています。
- 影響: 後から読む人が、どれが正か判断できません。WebGL と Canvas 2D の粒子の濃さがずれます。
- 直し方: `technical-design.md` を粒子の仕様に合わせて更新し、`GLSL_ARC` の連結の手順を明記する。粒子の不透明度と大きさは、どちらかの仕様に決めて、もう一方を直す。

---

## 2. 統合のときに直す指摘

### I1. 末尾スラッシュ無しの URL で、404 とコンソールエラーが出る(未解消)

- 根拠: `index.html:9-19` が `<base>` を動的に補います。しかしブラウザの先読み(プリロードスキャナ)が `<base>` より先に、ビルド後の `./assets/index-*.js` と CSS を `/works/assets/...` として取りにいきます。
- 再現: `dist/` を `/works/arcs` というパスに置き、スラッシュ無しで配信して開く。404 が2件とコンソールエラーが出る(アプリ自体は後から読み込み直して動き、`ready=1` になる)。スラッシュ有りでは出ない。`tools/shot.mjs` はスラッシュ付きでしか撮らないので気づかない。
- 影響: 旧作品の URL `/works/prefecturalMigrants`(スラッシュ無し)で来る利用者に、404 がログに出る。Vercel では空白にはならない。
- 直し方: `vite.config.js` の `base` を `/works/prefecturalMigrants/` にして絶対パスにする(公開先は固定)。`<base>` の動的な補完は、データの取得(`document.baseURI`)のために残してもよい。

### I2. ストアの再入で通知の順序が逆転する(未解消)

- 根拠: `src/state.js:35-40`。購読関数の中で `set()` すると、入れ子の通知が先に全員に届き、外側の通知はそのあと届きます。
- 再現(Node で): 購読者 A が `chapter` の変更時に `year` を `set` し、購読者 B もいる状態で `store.set({chapter: 2})`。B には `year`、`chapter` の順で届き、`chapter` 通知のときの `state` はすでに最新になっている。
- 影響: 章の担当が chapter 変更の購読の中で selection、camera、year を書く設計と相性が悪い。
- 直し方: 通知をキューにして順序を保つか、「購読関数の中で set してよい、順序は保証しない」と契約に書く。

### I3. WebGL2 が使えない環境の見え方(一部解消)

- 状態: Canvas 2D の代替表示(`src/scene/fallback2d.js`)と案内(`fallback.*`)が実装され、表(`src/ui/table.js`)から数値を読めるようになっています。
- 残る点:
  - `src/main.js:73-80`。three が `console.error` を3件と `console.warn` を出してから、`createFallback` に切り替わります。`tools/shot.mjs` はコンソールのエラーを問題として終了コード1にするので、CI で失敗します。
  - `createRenderer` が WebGLRenderer の生成後に(層の生成などで)throw すると、canvas の文脈が WebGL に固定されて `getContext('2d')` が null を返します。失敗した renderer の dispose もありません。
  - `app.noWebgl`(`src/i18n/common.js:22`、`:35`)はどこでも使われていません。
- 再現: Chromium を `--disable-gpu --disable-3d-apis --disable-webgl --disable-webgl2` で起動して開く。
- 直し方: 失敗を一度だけ握って静かに切り替える(`WebGLRenderer` の生成前に `canvas.getContext('webgl2')` で試す)。

### I4. `main.js` が「配線だけ」ではなく、複数の担当が同じファイルを触る(未解消)

- 根拠: `src/main.js` にスタイルの import(:2-10)、i18n、ピッキング(:129-164)、hover と click の選択、描画ループ、年の同期が全部入っています。`src/ui/tooltip.js` は、同じ canvas の `pointermove`・`click`・`pointerleave` を、window の capture で別に受けます(`tooltip.js:234-266`)。`src/scene/cameraRig.js` も canvas に `pointerdown`・`pointermove`・`click`・`wheel`・`keydown` を付けます。
- 影響:
  - 同じイベントを3か所で処理しています。`main.js:151-157` の `pointermove` は `pointerType` を見ないので、タッチの指のドラッグでも hover が入り、ツールチップが出ます(`tooltip.js` はタッチの move を無視する設計)。
  - ツールチップは `click` と `pointerleave` を capture で止めて、`main.js` と競合しないようにしています(`tooltip.js:266-290`)。壊れやすい結び付きです。
- 直し方: ピッキングの配線を `ui/tooltip.js` に一本化し、`main.js` の該当部分(:129-164)を削除する。

### I5. `params.js` の `ch` と章の selection・camera の関係が曖昧(未解消)

- 根拠: URL に `ch=2` だけがあるとき、chapter は 2 になりますが、章が持つ selection と camera は誰が適用するのか決まっていません(`applyParams`(`src/params.js`)は patch を渡すだけです)。
- 直し方: 「URL の `ch` を読んだ章の担当が初期の selection と camera を決める。ただし URL に `sel` と `cam` があればそちらを優先する」と契約に書く。章の step(copy は1章に3つの step)を表す state がまだありません(`src/state.js`)。

### I6. 出典表記が足りない(未解消)

- 根拠: `src/i18n/common.js:29` の `source.body` は統計局の名称のみです。`tools/data/README.md` は「出典:「住民基本台帳人口移動報告」(総務省統計局)を加工して作成(取得日: YYYY-MM-DD)」と書くよう定め、`tools/geo/README.md` は地球地図日本(© 国土地理院)の表記を求めています。`docs/copy/strings.md` の `footer.note` は加工の旨を含みますが、辞書に入っていません(`grep -n "footer\." src/i18n/*.js` は 0 件)。
- 直し方: 辞書の `source.body` を差し替えるか、`footer.*` を入れる。ページの土台の担当(凡例・注記)と一緒に決める。

### I7. `tools/shot.mjs` と配布の細部(一部解消)

- 解消済み: `.gitignore` の `shots/` をリポジトリ直下(`/shots/`)に限定し、`docs/design/shots/` と `docs/particles/shots/` が main に入りました。
- 未解消:
  - `tools/shot.mjs:50`: `dist/index.html` があると再ビルドしません(`--build` を付けないと古い dist を撮影する)。8人が同じ作業ツリーで撮影すると、古い画面を見る罠になります。
  - `tools/shot.mjs:21-22`: `playwright` をグローバルの `NODE_PATH` から読みます。`package.json` の devDependencies にありません。設計文書 §2 は Playwright を前提としています。クリーンな clone で再現できません。
  - `package.json` に `engines` 指定がありません(`tools/geo` は Node 22 前提)。

### I8. ピッキングの配線(一部解消)

- 状態: `pickArc` は実装されました(`src/scene/picking.js`)。
- 残る点: `main.js:135` のキーは、毎フレーム `JSON.stringify` と `join` で作られます。弧の多角線は、カメラが止まってから作り直す設計(`SETTLE_MS = 100`)になっているので、補間中は hover の弧が出ません。意図した動作ですが、仕様に書かれていません。

---

## 3. 解消済みの指摘

### P3. 図の領域のずれを渡す手段がなく、縦画面の定義が割れている(解消済み)

- 当初の指摘: 図の領域(左の柱と右の読み出しを避けた領域)を `viewFor` へ渡す口がなく、縦画面の判定が `aspect < 1`(カメラ)と幅 1024px 未満(デザイン仕様)で割れていた。
- 解消: `src/scene/camera.js:31` の `DESKTOP_BREAKPOINT = 1024`、`:47` の `isPortrait(width)`(幅で判定)、`:56` の `figureRegion(width, height)`、`:67` の `viewOptions(width, height, selection)`、`:189` の `viewFor(preset, aspect, layout, opts)`。縦画面は side だけでなく oblique も90度回します(`:200`、`roll = name !== 'top' && portrait ? Math.PI / 2 : 0`)。

### P4. cameraRig が外から書かれた `morph` を巻き戻す(解消済み)

- 当初の指摘: `resize()` と補間が、外から書かれた `state.morph` を内部の古い値で上書きした。
- 解消: `src/scene/cameraRig.js:48-53` の `writing` フラグで、自分が書いた変更と外から書かれた変更を区別し(:72)、外からの morph を現在値と補間の両端に取り込みます。偽の store と renderer で、(1)外から 0.5 を書く、(2)`resize()` を呼ぶ、で 0.5 が保たれること、(3)補間中に 0 を書くと 0 になることを確認しました。

### P8. 辞書のキー体系と章の形(一部解消)

- 解消した点: 辞書は `docs/copy/strings.md` のキー体系(`settings.*`、`camera.*`、`region.*`、`readout.*`、`year.*`、`table.*`、`tooltip.*`)に揃いました(`src/i18n/*.js`)。テーマの選択肢は紙/墨のままです(`settings.theme.light/dark` は aria-label の補足)。
- 未解消の点: 章の形(`docs/copy/chapters.js` は `steps[{year, selection, camera}]`、`bodyPortrait`、`note`、`selection.code` が2桁の文字列)と、`src/content/chapters.js`(1章に1つの selection と camera)・`src/state.js`(step のキーなし)が食い違っています。ページの土台と章の担当が決めます。

---

## 4. テストの抜け

1. **GLSL と JS の一致を確認するテストがない。** 実際に描画されるのは GLSL 側です(`GLSL_ARC`、弧のシェーダ、粒子のシェーダ)。JS の `arcPoint` が正しくても、GLSL を直したときの回帰に気づけません。`tools/verify/arcs-parity.mjs` が画像で比べていますが、`npm test` の対象外です。`docs/particles/hashcheck.cjs` が先例です。
2. 実データ(`public/data/*`)を `parseData` に通す Vitest がない。ツールの検証は Python と Node のスクリプトにあり、`npm test` の対象外です。
3. `test/params.test.js` に、`constructor`、`toString`、`__proto__` などの URL のテストがない(P6)。
4. `test/state.test.js` に再入のテストがない(I2)。`syncUrl` の debounce と `hover` の除外のテストもない。
5. `test/camera.test.js` は、定位置の収まりを調べますが、`oblique` と `top` で弧の高さまで含めて47点が画面に収まるかは調べていません。
6. `test/flows.test.js` に、不明な圏の id、同じ selection オブジェクトの書き換え(`maskCache` の WeakMap、`src/geometry/flows.js`)、`particleCount` の負の値などがない。
7. 弧の向きの規則(`sideOf`)の写しが、弧の層(`src/scene/arcs.js:231-243`)、粒子の層(`src/scene/particles.js:61` の GLSL)、`src/geometry/particles.js:86-91`、`src/scene/fallback2d.js:64-70` にあります。`sideOf` と一致することを確かめるテストは、粒子の `orderSlots` と弧の層の `setSelection` にそれぞれあるだけで、4か所が揃っていることを1か所で確かめるものはありません。

---

## 5. 後でよい指摘

- カメラ補間の緩急は smoothstep(`cameraRig.js` の旧実装)で、デザイン仕様の `cubic-bezier(.65,0,.35,1)` と少し違います(現行の `easeCamera` は `src/scene/camera.js` を確認してください)。
- `src/geometry/arc.js:14` の退化時の下限は `1e-6`、GLSL(`:97`)は `1e-4` です(端点が同じ位置の場合のみ)。
- `index.html:11-13` の「拡張子らしき末尾なら `<base>` を補わない」判定は、`/works/v1.2` のようなパスで誤判定します。
- `webglcontextlost` の処理がありません。`devicePixelRatio` だけが変わった場合は `ResizeObserver` が発火しません。
- `tools/data/verify_od.py` の `PUBLISHED`(公表値)は手入力の定数で、出典の記載がありません。2015〜2025年は、この合計値だけが xlsx 原本とは独立した根拠です。

---

## 6. 8本の統合で衝突しやすいファイルの見立て

| ファイル | 触る担当 |
|---|---|
| `src/main.js` | 当たり判定、タイムライン(年の補間)、章、カメラ、ページの土台、代替表示 |
| `src/i18n.js`、`src/i18n/*`、`test/i18n.test.js` | ほぼ全員 |
| `src/state.js`、`src/params.js`、`test/params.test.js`、`test/state.test.js` | 章(step)、コントロール、年 |
| `src/scene/shared.js` | 弧、粒子、地面(色、`--gl-*`、年のテクスチャの共有) |
| `src/styles/tokens.css`、`base.css`、`index.html` | ページの土台、すべての UI 担当(DOM 要素、`z-index`、固定要素の配置) |
| `src/scene/renderer.js` | カメラ、粒子と弧(層の API の追加) |

---

## 7. 骨格が正しいことを確認できた点(参考)

- 幾何: `lineLayout` と `geoLayout` は設計どおりです(x の最小・最大が ±CX、北海道が最小で沖縄が最大。真上で北が上・東が右)。`arcPoint` は d3 v3 の実出力と一致します(`test/arc.test.js:39-86`)。`GLSL_ARC` の式は JS の `arcPoint` と、制御点の並べ方、基底、法線の式まで一致します(式の照合のみ。数値実行は §4 の1に記載のとおり未整備)。
- データ: `python3 tools/data/verify_od.py` は全件通ります(14年×2209セルが xlsx 原本と、2012・2013年は年報第2表と、2014年は旧作品 `data.json` と一致)。`node tools/geo/verify_geo.mjs` も全件通ります(47点が各ポリゴン内にある、距離の検証も通る)。
- `loader.js`: 形式の検証は、対角、非負整数、要素数、都道府県のコード・metro・座標、Topology を確認します。`matrix(year)` は年ごとの `Int32Array` を返します。
- `renderer.js` の `screenMatrix` は、式を手で検算して、`project(i)` と一致します。
