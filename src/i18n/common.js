// 共通の文言(アプリ全体、単位、流れの向き、出典)と、都道府県名。
// 辞書は { ja, en }。キーは `<部品>.<名前>`。src/i18n.js がまとめて t(key) を提供する。
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

export default {
  ja: {
    'app.title': '弧が列島になる — 都道府県間の人口移動',
    'app.stage': '都道府県間の人口移動を弧で表した図。1粒が100人です。',
    'app.noWebgl': 'この環境では WebGL2 が使えないため、図を表示できません。',
    'app.loadError': 'データを読み込めませんでした。',
    'unit.person': '人',
    'unit.particle': '1粒 = 100人',
    'flow.in': '転入',
    'flow.out': '転出',
    'source.label': '出典',
    'source.body': '総務省統計局「住民基本台帳人口移動報告」(日本人移動者)',
    'app.description': '総務省統計局「住民基本台帳人口移動報告」(日本人移動者、2012〜2025年)をもとに、都道府県間の人口移動を、日本列島の上に立ち上がる弧として見せる作品です。',
  },
  en: {
    'app.title': 'Arcs to Archipelago — Migration between Japanese prefectures',
    'app.stage': 'Arc diagram of migration between prefectures. One particle is 100 people.',
    'app.noWebgl': 'WebGL2 is not available in this environment, so the figure cannot be shown.',
    'app.loadError': 'Failed to load the data.',
    'unit.person': 'people',
    'unit.particle': '1 particle = 100 people',
    'flow.in': 'In-migration',
    'flow.out': 'Out-migration',
    'source.label': 'Source',
    'source.body': 'Statistics Bureau of Japan, Report on Internal Migration in Japan (Japanese nationals)',
    'app.description': 'Migration between Japan’s 47 prefectures (Japanese nationals, 2012–2025, Statistics Bureau of Japan) drawn as arcs that rise over the archipelago.',
  },
};
