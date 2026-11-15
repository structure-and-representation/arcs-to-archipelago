# arcs-to-archipelago

都道府県間の人口移動(総務省統計局「住民基本台帳人口移動報告」、日本人移動者、2012〜2025年)を、日本列島の上に立ち上がる弧として見せるデータ可視化作品です。

2015年の作品「[三大都市圏の人の流れ](https://structure-and-representation.com/works/prefecturalMigrants/)」の作り直しです。真横から見ると元の arc diagram になり、カメラが回り込むと弧が列島の上に立ち上がります。

制作中です。

## 開発

```
npm install
npm run dev      # 開発サーバ
npm run build    # dist/ にビルド
npm run preview  # ビルドの確認
npm run test     # 単体テスト(Vitest)
node tools/shot.mjs --query "morph=1&cam=top" --size 1440x900 --out shots/top.png   # 撮影(Playwright)
```

設計は [docs/technical-design.md](docs/technical-design.md) を参照してください。
