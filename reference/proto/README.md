# 試作(参照用)

技術設計の段階で作った試作です。製品コードではなく、`src/` の実装が参照するための資料です。アプリのビルドには含めません。

- `geometry.js`: 配置と弧の計算(JS版とGLSL版)。`src/geometry/` の土台です。
- `index.html`: three.js での描画の試作。CDN の three.js を import map で読みます。
- `svg.html` / `svg1.html`、`t1.js` / `t2.js`: 2015年の原作(D3 v3)の描画と画素単位で比べる検証です。
- `pick.mjs`: 当たり判定の計測です。
- `data.json`、`d3.layout.arcDiagram.js`、`original-app.js`: 2015年の原作のデータとコードです。
- `side.png`(真横)、`oblique.png`(斜め俯瞰)、`top.png`(真上)、`tokyo-selected.png`(東京圏を選択)、`mobile-side.png`(縦画面)は試作の画面です。濃度や飽和は未調整です。
