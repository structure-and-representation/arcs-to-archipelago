# 文言一覧(章以外) / UI strings

キーはドット区切りで書いています。`{…}` は差し込む値です。
数値の書式は次のとおりです。日本語は `12,345人`、英語は `12,345` です。差引には符号を付けます(`+7,503` / `−9,561`)。マイナスには U+2212 を使います。

## meta

| key | ja | en |
|---|---|---|
| `meta.title` | 弧が列島になる | Arcs Become an Archipelago |
| `meta.subtitle` | 都道府県間の人口移動 2012–2025 | Migration between Japan's prefectures, 2012–2025 |
| `meta.intro` | 一本の線に並べた47都道府県のあいだに、14年分の引っ越しを弧で描く。弧を地図の上に立てると、日本列島が現れる。 | Forty-seven prefectures on a single line, linked by arcs for 14 years of moves. Stand the arcs on a map, and Japan appears. |
| `meta.ogDescription` | 都道府県間の人口移動 2012–2025年を、arc diagram から日本列島の地図へ。総務省「住民基本台帳人口移動報告」より。 | Migration between Japan's prefectures, 2012–2025, from an arc diagram to a map. Data: Statistics Bureau of Japan. |

## legend(凡例)

地域を選んでいないときは、画面の向きで文言を切り替えます。横長用は `legend.none.landscape.*`、縦画面用は `legend.none.portrait.*` です。地域を選んでいるときは `legend.selected.*` を使います。`legend.particle` と `legend.height` はどの場合にも出します。

| key | ja | en |
|---|---|---|
| `legend.none.landscape.up` | 線より上:北へ向かう移動 | Above the line: moves heading north |
| `legend.none.landscape.down` | 線より下:南へ向かう移動 | Below the line: moves heading south |
| `legend.none.portrait.up` | 線より右:北へ向かう移動 | Right of the line: moves heading north |
| `legend.none.portrait.down` | 線より左:南へ向かう移動 | Left of the line: moves heading south |
| `legend.selected.in` | 地上の弧:{region}への転入 | Arcs above ground: moves into {region} |
| `legend.selected.out` | 地下の弧:{region}からの転出 | Arcs below ground: moves out of {region} |
| `legend.selected.hint` | 上下の厚みの差が、転入超過・転出超過 | The difference in thickness is the net gain or loss |
| `legend.particle` | 1粒=100人 | 1 grain = 100 people |
| `legend.height` | 弧の高さ=距離 | Arc height = distance |

## readout(読み出し)

| key | ja | en |
|---|---|---|
| `readout.heading` | {region}、{year}年 | {region}, {year} |
| `readout.headingMetro` | {region}、{year}年(圏外との移動) | {region}, {year} (moves to and from outside the area) |
| `readout.in` | 転入 | Moved in |
| `readout.out` | 転出 | Moved out |
| `readout.net` | 差引 | Net |
| `readout.netGain` | 転入超過 | Net gain |
| `readout.netLoss` | 転出超過 | Net loss |
| `readout.unit` | 人 | people |
| `readout.total` | 移動者総数 | Total movers |

`readout.net` の値が正のときは `readout.netGain` を、負のときは `readout.netLoss` を添えます。

## year(年の切り替えと折れ線)

| key | ja | en |
|---|---|---|
| `year.label` | 年 | Year |
| `year.sparkTotal` | 移動者総数の推移 | Total movers, 2012–2025 |
| `year.sparkNet` | {region}の転入超過の推移 | Net gain, {region}, 2012–2025 |
| `year.sparkNetMetro` | {region}の転入超過の推移(圏外との移動) | Net gain, {region}, 2012–2025 (outside the area) |
| `year.play` | 再生 | Play |
| `year.pause` | 停止 | Pause |
| `year.prev` | 前の年 | Previous year |
| `year.next` | 次の年 | Next year |

## region(地域の選択肢)

| key | ja | en |
|---|---|---|
| `region.heading` | 地域 | Region |
| `region.all` | 全国 | All of Japan |
| `region.metroHeading` | 三大都市圏 | Three metro areas |
| `region.metro.tokyo` | 東京圏 | Tokyo area |
| `region.metro.nagoya` | 名古屋圏 | Nagoya area |
| `region.metro.osaka` | 大阪圏 | Osaka area |
| `region.blockHeading` | 地方 | Regions |
| `region.block.hokkaido` | 北海道 | Hokkaido |
| `region.block.tohoku` | 東北 | Tohoku |
| `region.block.kanto` | 関東 | Kanto |
| `region.block.chubu` | 中部 | Chubu |
| `region.block.kinki` | 近畿 | Kinki |
| `region.block.chugokuShikoku` | 中国・四国 | Chugoku and Shikoku |
| `region.block.kyushuOkinawa` | 九州・沖縄 | Kyushu and Okinawa |
| `region.clear` | 選択を解除 | Clear selection |

7地方は、都道府県の選択肢をまとめる見出しとして使います。それぞれの地方に入る都道府県(JISコード)は次のとおりです。
- 北海道:01
- 東北:02〜07
- 関東:08〜14
- 中部:15〜23
- 近畿:24〜30
- 中国・四国:31〜39
- 九州・沖縄:40〜47

都道府県名の英語表記は、県・府・都を付けずに書きます(例:Aomori、Kyoto、Tokyo)。

## camera(カメラ)

| key | ja | en |
|---|---|---|
| `camera.heading` | 視点 | View |
| `camera.side` | 真横 | Side |
| `camera.oblique` | 斜め | Angled |
| `camera.top` | 真上 | Top |

## settings(テーマと言語)

| key | ja | en |
|---|---|---|
| `settings.theme` | 表示 | Theme |
| `settings.theme.auto` | 自動 | Auto |
| `settings.theme.light` | 明るい | Light |
| `settings.theme.dark` | 暗い | Dark |
| `settings.lang` | 言語 | Language |
| `settings.lang.ja` | 日本語 | 日本語 |
| `settings.lang.en` | English | English |

## table(数値の表)

| key | ja | en |
|---|---|---|
| `table.caption` | {year}年の都道府県別の移動 | Moves by prefecture, {year} |
| `table.captionSelected` | {region}との移動、{year}年 | Moves to and from {region}, {year} |
| `table.col.pref` | 都道府県 | Prefecture |
| `table.col.in` | 転入 | In |
| `table.col.out` | 転出 | Out |
| `table.col.net` | 差引 | Net |
| `table.col.year` | 年 | Year |
| `table.toggle` | 数値の表を見る | Show the numbers |

## tooltip(ツールチップ)

| key | ja | en |
|---|---|---|
| `tooltip.flow` | {from} → {to}:{n}人({year}年) | {from} → {to}: {n} people ({year}) |
| `tooltip.pair` | {a} ⇄ {b}:{ab}人 / {ba}人({year}年) | {a} ⇄ {b}: {ab} / {ba} people ({year}) |
| `tooltip.pref` | {pref}:転入 {in}人、転出 {out}人、差引 {net}人 | {pref}: {in} in, {out} out, net {net} |
| `tooltip.small` | 100人未満の流れ | Fewer than 100 people |

## footer(画面下部の注記)

| key | ja | en |
|---|---|---|
| `footer.note` | 「住民基本台帳人口移動報告」(総務省統計局)を加工して作成。対象は日本人移動者で、都道府県間の移動だけを数えています(同じ都道府県の中での移動は含みません)。1粒は100人を表します。三大都市圏は、東京圏が埼玉県・千葉県・東京都・神奈川県、名古屋圏が岐阜県・愛知県・三重県、大阪圏が京都府・大阪府・兵庫県・奈良県です。圏の転入・転出は圏外との移動だけを数え、圏内の都府県どうしの移動は含みません。弧の高さは、都道府県庁所在地のあいだの距離に比例します。 | Created by processing data from the Report on Internal Migration in Japan Derived from the Basic Resident Registration (Statistics Bureau, Ministry of Internal Affairs and Communications). Japanese nationals only. Only moves between prefectures are counted; moves within a prefecture are not. Each grain represents 100 people. Tokyo area: Saitama, Chiba, Tokyo and Kanagawa. Nagoya area: Gifu, Aichi and Mie. Osaka area: Kyoto, Osaka, Hyogo and Nara. Area totals count only moves to and from outside the area. Arc height is proportional to the distance between prefectural capitals. |

## fallback(WebGL2 が使えないとき)

| key | ja | en |
|---|---|---|
| `fallback.heading` | この作品は表示できません | This piece can't be shown here |
| `fallback.body` | この作品には WebGL2 が必要ですが、お使いのブラウザでは利用できないようです。最新のブラウザで開くか、ハードウェアアクセラレーションを有効にしてください。数値は下の表で見られます。 | This piece needs WebGL2, which your browser doesn't seem to support. Try a recent browser, or turn on hardware acceleration. The numbers are still available in the table below. |
