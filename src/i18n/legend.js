// 凡例と注記(ui/legend.js)の文言。確定稿 docs/copy/strings.md の `legend.*` に、地図の上での向きの文と注記の文を足したもの。
// 辞書は { ja, en }。キーは `legend.<名前>`。`{region}` は選択中の地域の名前に差し替える。
// 和文は、半角のコロンや等号で区切らず、「〜は、〜」の文にする(字間が詰まらない)。英語は「Above the line: …」「1 grain = …」のまま。src/i18n.js がまとめて t(key) を提供する。
export default {
  ja: {
    'legend.label': '凡例と注記',
    // 地域を選んでいないとき: 真横の横長用 / 真横の縦画面用 / 斜め俯瞰と真上(地図の上)
    'legend.none.landscape.up': '線より上は、北へ向かう移動',
    'legend.none.landscape.down': '線より下は、南へ向かう移動',
    'legend.none.portrait.up': '線より右は、北へ向かう移動',
    'legend.none.portrait.down': '線より左は、南へ向かう移動',
    // 地図は北が画面の上なので、「北へ」は地図の上の向き(画面の上の弧)と取り違えやすい。移動の向きを「北上・南下」で言う
    'legend.none.map.up': '地上の弧は、北上する移動',
    'legend.none.map.down': '地下の弧は、南下する移動',
    // 地域を選んでいるとき
    'legend.selected.in': '地上の弧は、{region}への転入',
    'legend.selected.out': '地下の弧は、{region}からの転出',
    'legend.selected.hint': '上下の厚みの差が、転入超過・転出超過',
    // どの場合にも出す
    'legend.particle': '1粒は100人',
    // 弧の高さの意味は、カメラで変わる。真横は並びの上での隔たり、地図の上(斜め俯瞰と真上)は県庁所在地のあいだの距離
    'legend.height.side': '弧の高さは、並び順の隔たり',
    'legend.height.map': '弧の高さは、県庁所在地間の距離',
    // 注記(出典の名前は common.js の source.body、リンクにする)
    'legend.encoding': '弧の線の濃さは量を表しません。量は粒の数で読みます。',
  },
  en: {
    'legend.label': 'Legend and notes',
    'legend.none.landscape.up': 'Above the line: moves heading north',
    'legend.none.landscape.down': 'Below the line: moves heading south',
    'legend.none.portrait.up': 'Right of the line: moves heading north',
    'legend.none.portrait.down': 'Left of the line: moves heading south',
    'legend.none.map.up': 'Arcs above ground: northbound moves',
    'legend.none.map.down': 'Arcs below ground: southbound moves',
    'legend.selected.in': 'Arcs above ground: moves into {region}',
    'legend.selected.out': 'Arcs below ground: moves out of {region}',
    'legend.selected.hint': 'The difference in thickness is the net gain or loss',
    'legend.particle': '1 grain = 100 people',
    'legend.height.side': 'Arc height = gap in the order',
    'legend.height.map': 'Arc height = distance between capitals',
    'legend.encoding': 'Line darkness does not encode volume; count the grains.',
  },
};
