// 操作の手がかり(ui/hints.js)の文言。確定稿は docs/copy/strings.md の hint.*。
// 辞書は { ja, en }。キーは `hint.<名前>`。src/i18n.js がまとめて t(key) を提供する。
// 手がかりは装飾にせず、12px の一行を --fg-3 で出す。ポインタが指のとき(touch)は「タップ」「なぞる」の言い方にする。
export default {
  ja: {
    'hint.scroll': 'スクロールで章が進む',
    'hint.drag': 'ドラッグで回す',
    'hint.dragTouch': '横になぞって回す',
    'hint.select': '点を押して選ぶ',
    'hint.selectTouch': '点をタップして選ぶ',
    'hint.hover': '弧に触れると人数',
    'hint.sep': ' · ',
  },
  en: {
    'hint.scroll': 'Scroll to move through the chapters',
    'hint.drag': 'Drag to turn',
    'hint.dragTouch': 'Swipe sideways to turn',
    'hint.select': 'Click a dot to select',
    'hint.selectTouch': 'Tap a dot to select',
    'hint.hover': 'Hover an arc for counts',
    'hint.sep': ' · ',
  },
};
