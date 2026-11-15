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

// 作品名と説明(確定稿 docs/copy/strings.md の meta.*)。<title> と <meta name="description"> は app.title / app.description から作る。
const META = {
  ja: {
    title: '都道府県をまたぐ人の流れ',
    subtitle: '住民基本台帳人口移動報告 2012–2025年',
    intro: '2012年から2025年まで、都道府県をまたいで住まいを移した人の流れを、弧と粒子で描く。1粒は100人。総務省「住民基本台帳人口移動報告」(日本人移動者)より。',
    ogDescription: '都道府県間の人口移動 2012–2025年を、arc diagram から日本列島の地図へ。総務省「住民基本台帳人口移動報告」より。',
  },
  en: {
    title: 'Moves Between Japan\u2019s Prefectures',
    subtitle: 'Internal migration data, 2012–2025',
    intro: 'How people moved between Japan\u2019s 47 prefectures from 2012 to 2025, drawn as arcs and grains. One grain is 100 people. Data: Statistics Bureau of Japan (Japanese nationals).',
    ogDescription: 'Migration between Japan\u2019s prefectures, 2012–2025, from an arc diagram to a map. Data: Statistics Bureau of Japan.',
  },
};

export default {
  ja: {
    'meta.title': META.ja.title,
    'meta.subtitle': META.ja.subtitle,
    'meta.intro': META.ja.intro,
    'meta.ogDescription': META.ja.ogDescription,
    'app.title': `${META.ja.title} — ${META.ja.subtitle}`,
    'app.stage': '都道府県間の人口移動を弧で表した図。1粒が100人です。',
    'app.loadError': 'データを読み込めませんでした。',
    'source.label': '出典',
    'source.body': '総務省統計局「住民基本台帳人口移動報告」(日本人移動者)',
    'app.description': META.ja.intro,
    'footer.mapSource': '地図:地球地図日本(© 国土地理院)を加工して作成',
    'footer.note': '「住民基本台帳人口移動報告」(総務省統計局)を加工して作成。対象は日本人移動者で、都道府県間の移動だけを数えています(同じ都道府県の中での移動は含みません)。1粒は100人を表します。三大都市圏は、東京圏が埼玉県・千葉県・東京都・神奈川県、名古屋圏が岐阜県・愛知県・三重県、大阪圏が京都府・大阪府・兵庫県・奈良県です。圏の転入・転出は圏外との移動だけを数え、圏内の都府県どうしの移動は含みません。弧の高さは、都道府県庁所在地のあいだの距離に比例します。',
  },
  en: {
    'meta.title': META.en.title,
    'meta.subtitle': META.en.subtitle,
    'meta.intro': META.en.intro,
    'meta.ogDescription': META.en.ogDescription,
    'app.title': `${META.en.title} — ${META.en.subtitle}`,
    'app.stage': 'Arc diagram of migration between prefectures. One grain is 100 people.',
    'app.loadError': 'Failed to load the data.',
    'source.label': 'Source',
    'source.body': 'Statistics Bureau of Japan, Report on Internal Migration in Japan (Japanese nationals)',
    'app.description': META.en.intro,
    'footer.mapSource': 'Map: Created by processing Global Map Japan (© Geospatial Information Authority of Japan)',
    'footer.note': 'Created by processing data from the Report on Internal Migration in Japan Derived from the Basic Resident Registration (Statistics Bureau, Ministry of Internal Affairs and Communications). Japanese nationals only. Only moves between prefectures are counted; moves within a prefecture are not. Each grain represents 100 people. Tokyo area: Saitama, Chiba, Tokyo and Kanagawa. Nagoya area: Gifu, Aichi and Mie. Osaka area: Kyoto, Osaka, Hyogo and Nara. Area totals count only moves to and from outside the area. Arc height is proportional to the distance between prefectural capitals.',
  },
};
