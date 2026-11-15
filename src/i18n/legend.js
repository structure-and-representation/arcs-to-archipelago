// 凡例と注記(ui/legend.js)の文言。確定稿 docs/copy/strings.md の `legend.*` に、地図の上での向きの文と注記の文を足したもの。
// 辞書は { ja, en }。キーは `legend.<名前>`。`{region}` は選択中の地域の名前に差し替える。src/i18n.js がまとめて t(key) を提供する。
export default {
  ja: {
    'legend.label': '凡例と注記',
    // 地域を選んでいないとき: 真横の横長用 / 真横の縦画面用 / 斜め俯瞰と真上(地図の上)
    'legend.none.landscape.up': '線より上:北へ向かう移動',
    'legend.none.landscape.down': '線より下:南へ向かう移動',
    'legend.none.portrait.up': '線より右:北へ向かう移動',
    'legend.none.portrait.down': '線より左:南へ向かう移動',
    'legend.none.map.up': '地上の弧:北へ向かう移動',
    'legend.none.map.down': '地下の弧:南へ向かう移動',
    // 地域を選んでいるとき
    'legend.selected.in': '地上の弧:{region}への転入',
    'legend.selected.out': '地下の弧:{region}からの転出',
    'legend.selected.hint': '上下の厚みの差が、転入超過・転出超過',
    // どの場合にも出す
    'legend.particle': '1粒=100人',
    'legend.height': '弧の高さ=距離',
    // 注記(出典の名前は common.js の source.body、リンクにする)
    'legend.encoding': '弧の線の濃さは量を表しません。量は粒の数で読みます。',
  },
  en: {
    'legend.label': 'Legend and notes',
    'legend.none.landscape.up': 'Above the line: moves heading north',
    'legend.none.landscape.down': 'Below the line: moves heading south',
    'legend.none.portrait.up': 'Right of the line: moves heading north',
    'legend.none.portrait.down': 'Left of the line: moves heading south',
    'legend.none.map.up': 'Arcs above ground: moves heading north',
    'legend.none.map.down': 'Arcs below ground: moves heading south',
    'legend.selected.in': 'Arcs above ground: moves into {region}',
    'legend.selected.out': 'Arcs below ground: moves out of {region}',
    'legend.selected.hint': 'The difference in thickness is the net gain or loss',
    'legend.particle': '1 grain = 100 people',
    'legend.height': 'Arc height = distance',
    'legend.encoding': 'Line darkness does not encode volume; count the grains.',
  },
};
