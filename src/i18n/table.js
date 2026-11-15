// 数値の表(ui/table.js)と、WebGL2 が使えないときの案内(scene/fallback2d.js)の文言。
// 辞書は { ja, en }。キーは `<部品>.<名前>`。src/i18n.js がまとめて t(key) を提供する。
// 文言の確定稿は docs/copy/strings.md の table.* と fallback.*。
export default {
  ja: {
    'table.caption': '{year}年の都道府県別の移動',
    'table.captionSelected': '{region}との移動、{year}年',
    'table.heading': '{year}年 · 都道府県別',
    'table.headingSelected': '{year}年 · {region}との移動',
    'table.col.pref': '都道府県',
    'table.col.in': '転入',
    'table.col.out': '転出',
    'table.col.net': '差引',
    'table.col.year': '年',
    // 地域を選んでいるとき。行は相手先の都道府県、列の主語は選択地域
    'table.col.in.region': '{region}への転入',
    'table.col.out.region': '{region}からの転出',
    'table.col.net.region': '{region}の差引',
    'table.toggle': '数値の表を見る',
    'table.close': '閉じる',
    'table.unit': '単位:人',
    'fallback.heading': 'WebGL2 が使えないため、真横の静止図です',
    'fallback.body': 'この作品には WebGL2 が必要ですが、お使いのブラウザでは利用できないようです。最新のブラウザで開くか、ハードウェアアクセラレーションを有効にすると、斜めと真上の視点でも見られます。数値は表でも見られます。',
  },
  en: {
    'table.caption': 'Moves by prefecture, {year}',
    'table.captionSelected': 'Moves to and from {region}, {year}',
    'table.heading': '{year} · By prefecture',
    'table.headingSelected': '{year} · Moves to and from {region}',
    'table.col.pref': 'Prefecture',
    'table.col.in': 'In',
    'table.col.out': 'Out',
    'table.col.net': 'Net',
    'table.col.year': 'Year',
    'table.col.in.region': 'Into {region}',
    'table.col.out.region': 'Out of {region}',
    'table.col.net.region': 'Net for {region}',
    'table.toggle': 'Show the numbers',
    'table.close': 'Close',
    'table.unit': 'Unit: people',
    'fallback.heading': 'No WebGL2, so this is a still side view',
    'fallback.body': "This piece needs WebGL2, which your browser doesn't seem to support. Try a recent browser, or turn on hardware acceleration, to see the angled and top views. The numbers are also in the table.",
  },
};
