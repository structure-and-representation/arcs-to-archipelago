// 章の見出しと本文(content/chapters.js が参照する)。
// 辞書は { ja, en }。キーは `<部品>.<名前>`。src/i18n.js がまとめて t(key) を提供する。
export default {
  ja: {
    'ch.0.title': '全国',
    'ch.0.body': '北から南へ並んだ47都道府県のあいだを、人が移っていきます。',
    'ch.1.title': '東京一極',
    'ch.1.body': '東京圏への転入が、他の地域を大きく上回ります。',
    'ch.2.title': '大阪圏',
    'ch.2.body': '大阪圏の動きを見ます。',
    'ch.3.title': '名古屋圏',
    'ch.3.body': '名古屋圏の動きを見ます。',
    'ch.4.title': '自由探索',
    'ch.4.body': '地域と年を選んで、自由に見られます。',
  },
  en: {
    'ch.0.title': 'Nationwide',
    'ch.0.body': 'People move between 47 prefectures lined up from north to south.',
    'ch.1.title': 'Tokyo’s pull',
    'ch.1.body': 'In-migration to the Tokyo area far exceeds that of any other region.',
    'ch.2.title': 'Osaka area',
    'ch.2.body': 'A look at movements around Osaka.',
    'ch.3.title': 'Nagoya area',
    'ch.3.body': 'A look at movements around Nagoya.',
    'ch.4.title': 'Explore',
    'ch.4.body': 'Choose a region and a year to explore freely.',
  },
};
