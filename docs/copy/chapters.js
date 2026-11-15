// 5 chapters of "弧が列島になる / Arcs Become an Archipelago".
// Every number in the text was checked against Table 11 of the long-term series of the
// Report on Internal Migration in Japan (Japanese nationals, moves between prefectures, 2012-2025).
// Metro-area figures count only moves to and from outside the area.
//
// selection: null | { type: 'metro', id: 'tokyo' | 'osaka' | 'nagoya' } | { type: 'pref', code: '01'..'47' } (two-digit JIS code string)
// camera:    'side' | 'oblique' | 'top'

export const chapters = [
  {
    id: 'nation',
    heading: { ja: '弧が列島になる', en: 'Arcs Become an Archipelago' },
    body: {
      ja: '2025年、都道府県の境を越えて住まいを移した日本人は214万8,329人。2012年より7%少ない。転入が転出を上回ったのは47都道府県のうち7都府県だけで、移動の57%は東京圏を出発点か到着点にしている。線より上の弧は北へ、下の弧は南へ向かう移動。',
      en: 'In 2025, 2,148,329 Japanese residents moved to another prefecture, 7% fewer than in 2012. Only 7 of the 47 prefectures gained more people than they lost. And 57% of all moves started or ended in the Tokyo area. Arcs above the line head north; arcs below head south.',
    },
    bodyPortrait: {
      ja: '2025年、都道府県の境を越えて住まいを移した日本人は214万8,329人。2012年より7%少ない。転入が転出を上回ったのは47都道府県のうち7都府県だけで、移動の57%は東京圏を出発点か到着点にしている。線より右の弧は北へ、左の弧は南へ向かう移動。',
      en: 'In 2025, 2,148,329 Japanese residents moved to another prefecture, 7% fewer than in 2012. Only 7 of the 47 prefectures gained more people than they lost. And 57% of all moves started or ended in the Tokyo area. Arcs right of the line head north; arcs to the left head south.',
    },
    steps: [
      { year: 2014, selection: null, camera: 'side' },    // opening: the 2015 original, seen side-on
      { year: 2014, selection: null, camera: 'oblique' }, // camera turns, prefectures move onto the map
      { year: 2025, selection: null, camera: 'oblique' }, // year advances to the latest data
    ],
  },
  {
    id: 'tokyo',
    heading: { ja: '揺れて、戻る', en: 'A Dip, Then a Return' },
    body: {
      ja: '2019年、東京圏は圏外から14万5,576人の転入超過だった。2021年には8万441人に減る。東京都だけでは8万6,575人から1万815人へ。その減少の約半分は、埼玉・千葉・神奈川との間で生じた。2025年、東京圏は11万2,738人まで戻った。',
      en: "In 2019, the Tokyo area gained 145,576 people from the rest of Japan. By 2021, the gain was down to 80,441. Tokyo itself fell from 86,575 to 10,815, and about half of that drop came from moves to and from its three neighbors. By 2025, the area's gain was back to 112,738.",
    },
    note: {
      ja: '東京圏以外の43道府県のうち42が、14年間毎年、東京圏へ人を送り出す側だった。',
      en: 'Of the 43 prefectures outside the Tokyo area, 42 lost people to it every single year.',
    },
    steps: [
      { year: 2019, selection: { type: 'metro', id: 'tokyo' }, camera: 'oblique' },
      { year: 2021, selection: { type: 'metro', id: 'tokyo' }, camera: 'oblique' },
      { year: 2025, selection: { type: 'metro', id: 'tokyo' }, camera: 'oblique' },
    ],
  },
  {
    id: 'osaka',
    heading: { ja: '大阪圏の反転', en: 'Osaka Turns Around' },
    body: {
      ja: '2014年、大阪圏は圏外へ1万1,722人の転出超過だった。2023年に転入超過へ転じ、2025年は7,503人の転入超過。東京圏への流出は今も約1万8千人の超過だが、三大都市圏の外からの転入超過は2万3,164人と、2014年の約2倍になった。',
      en: 'In 2014, the Osaka area lost 11,722 more people than it gained. In 2023 the balance turned, and by 2025 it showed a gain of 7,503. It still loses about 18,000 to the Tokyo area each year. But its net gain from the rest of Japan has doubled, to 23,164.',
    },
    steps: [
      { year: 2014, selection: { type: 'metro', id: 'osaka' }, camera: 'oblique' },
      { year: 2023, selection: { type: 'metro', id: 'osaka' }, camera: 'oblique' }, // the year the balance crosses zero (+235)
      { year: 2025, selection: { type: 'metro', id: 'osaka' }, camera: 'oblique' },
    ],
  },
  {
    id: 'nagoya',
    heading: { ja: '名古屋圏の静かな流出', en: "Nagoya's Quiet Outflow" },
    body: {
      ja: '名古屋圏は14年間、一度も転入超過にならなかった。2012年に276人だった転出超過は2022年に1万5,872人まで広がり、2025年は1万1,542人。東京圏への転出超過は8,453人から1万7,005人へ倍増し、2018年からは大阪圏に対しても転出超過が続く。',
      en: 'In 14 years, the Nagoya area never once gained more people than it lost. Its net loss grew from 276 in 2012 to 15,872 in 2022, then eased to 11,542 in 2025. Its loss to the Tokyo area doubled over the period, and since 2018 it has lost people to Osaka too.',
    },
    steps: [
      { year: 2012, selection: { type: 'metro', id: 'nagoya' }, camera: 'oblique' },
      { year: 2022, selection: { type: 'metro', id: 'nagoya' }, camera: 'oblique' },
      { year: 2025, selection: { type: 'metro', id: 'nagoya' }, camera: 'oblique' },
    ],
  },
  {
    id: 'explore',
    heading: { ja: '変わらない弧', en: 'The Arcs That Hold' },
    body: {
      ja: '14年間でほとんど変わらない流れもある。大阪府から兵庫県へは毎年2万6千〜2万7千人台。移動の平均距離は283〜290kmに収まり、約4割は100km未満だ。一方、千葉と東京の間では流れの向きが逆転した。地域と年を選んで確かめてほしい。',
      en: 'Some flows barely moved in 14 years. Every year, 26,000 to 27,000 people moved from Osaka to Hyogo. The average move stayed between 283 and 290 km, and about 4 in 10 were under 100 km. Between Chiba and Tokyo, though, the net flow reversed. Pick a region and a year, and see for yourself.',
    },
    steps: [
      { year: 2025, selection: null, camera: 'oblique' }, // free exploration starts here
    ],
  },
];

export default chapters;
