// 文言の辞書(ja / en)。t(key) は現在の言語で引く。見つからなければ ja、それもなければ key を返す。
// 静的な HTML は data-i18n="key"(本文)、data-i18n-attr="aria-label:key,title:key"(属性)で指定する。

export const PREF_JA = [
  '北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県', '茨城県', '栃木県', '群馬県',
  '埼玉県', '千葉県', '東京都', '神奈川県', '新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県',
  '岐阜県', '静岡県', '愛知県', '三重県', '滋賀県', '京都府', '大阪府', '兵庫県', '奈良県', '和歌山県',
  '鳥取県', '島根県', '岡山県', '広島県', '山口県', '徳島県', '香川県', '愛媛県', '高知県', '福岡県',
  '佐賀県', '長崎県', '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県',
];
export const PREF_EN = [
  'Hokkaido', 'Aomori', 'Iwate', 'Miyagi', 'Akita', 'Yamagata', 'Fukushima', 'Ibaraki', 'Tochigi', 'Gunma',
  'Saitama', 'Chiba', 'Tokyo', 'Kanagawa', 'Niigata', 'Toyama', 'Ishikawa', 'Fukui', 'Yamanashi', 'Nagano',
  'Gifu', 'Shizuoka', 'Aichi', 'Mie', 'Shiga', 'Kyoto', 'Osaka', 'Hyogo', 'Nara', 'Wakayama',
  'Tottori', 'Shimane', 'Okayama', 'Hiroshima', 'Yamaguchi', 'Tokushima', 'Kagawa', 'Ehime', 'Kochi', 'Fukuoka',
  'Saga', 'Nagasaki', 'Kumamoto', 'Oita', 'Miyazaki', 'Kagoshima', 'Okinawa',
];

export const DICT = {
  ja: {
    'app.title': '弧が列島になる — 都道府県間の人口移動',
    'app.description':
      '総務省統計局「住民基本台帳人口移動報告」(日本人移動者、2012〜2025年)をもとに、都道府県間の人口移動を、日本列島の上に立ち上がる弧として見せる作品です。',
    'app.stage': '都道府県間の人口移動を弧で表した図。1粒が100人です。',
    'app.noWebgl': 'この環境では WebGL2 が使えないため、図を表示できません。',
    'app.loadError': 'データを読み込めませんでした。',
    'unit.person': '人',
    'unit.particle': '1粒 = 100人',
    'flow.in': '転入',
    'flow.out': '転出',
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
    'cam.label': 'カメラ',
    'cam.side': '真横',
    'cam.oblique': '斜め俯瞰',
    'cam.top': '真上',
    'theme.label': 'テーマ',
    'theme.paper': '紙',
    'theme.ink': '墨',
    'lang.label': '言語',
    'lang.ja': '日本語',
    'lang.en': 'English',
    'motion.label': '動きを減らす',
    'year.label': '年',
    'selector.label': '地域',
    'selector.none': '選択なし',
    'metro.tokyo': '東京圏',
    'metro.nagoya': '名古屋圏',
    'metro.osaka': '大阪圏',
    'table.title': '数値の表',
    'table.origin': '転出元',
    'table.dest': '転入先',
    'table.count': '人数',
    'source.label': '出典',
    'source.body': '総務省統計局「住民基本台帳人口移動報告」(日本人移動者)',
  },
  en: {
    'app.title': 'Arcs to Archipelago — Migration between Japanese prefectures',
    'app.description':
      'Migration between Japan’s 47 prefectures (Japanese nationals, 2012–2025, Statistics Bureau of Japan) drawn as arcs that rise over the archipelago.',
    'app.stage': 'Arc diagram of migration between prefectures. One particle is 100 people.',
    'app.noWebgl': 'WebGL2 is not available in this environment, so the figure cannot be shown.',
    'app.loadError': 'Failed to load the data.',
    'unit.person': 'people',
    'unit.particle': '1 particle = 100 people',
    'flow.in': 'In-migration',
    'flow.out': 'Out-migration',
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
    'cam.label': 'Camera',
    'cam.side': 'Side',
    'cam.oblique': 'Oblique',
    'cam.top': 'Top',
    'theme.label': 'Theme',
    'theme.paper': 'Paper',
    'theme.ink': 'Ink',
    'lang.label': 'Language',
    'lang.ja': '日本語',
    'lang.en': 'English',
    'motion.label': 'Reduce motion',
    'year.label': 'Year',
    'selector.label': 'Region',
    'selector.none': 'None',
    'metro.tokyo': 'Tokyo area',
    'metro.nagoya': 'Nagoya area',
    'metro.osaka': 'Osaka area',
    'table.title': 'Data table',
    'table.origin': 'From',
    'table.dest': 'To',
    'table.count': 'People',
    'source.label': 'Source',
    'source.body': 'Statistics Bureau of Japan, Report on Internal Migration in Japan (Japanese nationals)',
  },
};

let lang = 'ja';
const listeners = new Set();

export function getLang() {
  return lang;
}

export function setLang(next) {
  if (next !== 'ja' && next !== 'en') return;
  if (next === lang) return;
  lang = next;
  for (const fn of [...listeners]) fn(lang);
}

/** 言語が変わったときに呼ばれる。戻り値は購読解除の関数。 */
export function onLangChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function t(key, forLang = lang) {
  return DICT[forLang]?.[key] ?? DICT.ja[key] ?? key;
}

/** 都道府県名。i は添字(0〜46)。 */
export function prefName(i, forLang = lang) {
  return (forLang === 'en' ? PREF_EN : PREF_JA)[i] ?? '';
}

/** 圏の名前。 */
export function metroName(id, forLang = lang) {
  return t(`metro.${id}`, forLang);
}

/** root 以下の data-i18n / data-i18n-attr を現在の言語で書き換え、<html lang> と <title> も更新する。 */
export function applyStatic(root = document) {
  const doc = root.ownerDocument || root;
  doc.documentElement.lang = lang;
  doc.title = t('app.title');
  const meta = doc.querySelector('meta[name="description"]');
  if (meta) meta.setAttribute('content', t('app.description'));
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of root.querySelectorAll('[data-i18n-attr]')) {
    for (const pair of el.dataset.i18nAttr.split(',')) {
      const [attr, key] = pair.split(':').map((s) => s.trim());
      if (attr && key) el.setAttribute(attr, t(key));
    }
  }
}
