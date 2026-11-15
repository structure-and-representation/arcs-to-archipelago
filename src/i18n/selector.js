// 地域の選択(ui/selector.js)の文言と、圏の名前。
// 辞書は { ja, en }。キーは `<部品>.<名前>`。src/i18n.js がまとめて t(key) を提供する。
export default {
  ja: {
    'selector.label': '地域',
    'selector.none': '選択なし',
    'metro.tokyo': '東京圏',
    'metro.nagoya': '名古屋圏',
    'metro.osaka': '大阪圏',
  },
  en: {
    'selector.label': 'Region',
    'selector.none': 'None',
    'metro.tokyo': 'Tokyo area',
    'metro.nagoya': 'Nagoya area',
    'metro.osaka': 'Osaka area',
  },
};
