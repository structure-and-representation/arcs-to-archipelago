// 年の切り替え(ui/timeline.js)の文言。文案の確定稿は docs/copy/strings.md の year.*。
// 辞書は { ja, en }。キーは `<部品>.<名前>`。src/i18n.js がまとめて t(key) を提供する。
// {…} は差し込む値(ui/timeline.js が fill() で置き換える)。
export default {
  ja: {
    'year.label': '年',
    'year.sparkTotal': '移動者総数の推移',
    'year.sparkNet': '{region}の差引の推移',
    'year.sparkNetMetro': '{region}の差引の推移(圏外との移動)',
    'year.play': '再生',
    'year.pause': '停止',
    'year.prev': '前の年',
    'year.next': '次の年',
    // 確定稿にない文言(aria-valuetext)。{n} は人数(差引は符号付き)
    'year.valueTotal': '{year}年 移動者 {n}人',
    'year.valueNet': '{year}年 {region}の差引 {n}人',
    'year.valueNetMetro': '{year}年 {region}の差引(圏外との移動) {n}人',
  },
  en: {
    'year.label': 'Year',
    'year.sparkTotal': 'Total movers, 2012–2025',
    'year.sparkNet': 'Net change, {region}, 2012–2025',
    'year.sparkNetMetro': 'Net change, {region}, 2012–2025 (outside the area)',
    'year.play': 'Play',
    'year.pause': 'Pause',
    'year.prev': 'Previous year',
    'year.next': 'Next year',
    'year.valueTotal': '{year}: {n} movers',
    'year.valueNet': '{year}: net change, {region}: {n}',
    'year.valueNetMetro': '{year}: net change, {region} (outside the area): {n}',
  },
};
