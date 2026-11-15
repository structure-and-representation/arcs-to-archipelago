// カメラの定位置・テーマ・言語・数値の表を開くボタン(ui/controls.js)の文言。
// 文案の確定稿は docs/copy/strings.md の camera.*、settings.*。
// 辞書は { ja, en }。キーは `<部品>.<名前>`。src/i18n.js がまとめて t(key) を提供する。
export default {
  ja: {
    'camera.heading': '視点',
    'camera.side': '真横',
    'camera.oblique': '斜め',
    'camera.top': '真上',
    'settings.theme': '表示',
    'settings.theme.auto': '自動',
    'settings.theme.light': '明るい',
    'settings.theme.dark': '暗い',
    'settings.lang': '言語',
    'settings.lang.ja': '日本語',
    'settings.lang.en': 'English',
    // 確定稿にない文言(デザイン仕様 5.1、5.7 節)
    'settings.theme.paper': '紙',
    'settings.theme.ink': '墨',
    'settings.lang.enShort': 'EN',
    'settings.table': '数値の表',
    'settings.tableShort': '表',
  },
  en: {
    'camera.heading': 'View',
    'camera.side': 'Side',
    'camera.oblique': 'Angled',
    'camera.top': 'Top',
    'settings.theme': 'Theme',
    'settings.theme.auto': 'Auto',
    'settings.theme.light': 'Light',
    'settings.theme.dark': 'Dark',
    'settings.lang': 'Language',
    'settings.lang.ja': '日本語',
    'settings.lang.en': 'English',
    'settings.theme.paper': 'Paper',
    'settings.theme.ink': 'Ink',
    'settings.lang.enShort': 'EN',
    'settings.table': 'Data table',
    'settings.tableShort': 'Table',
  },
};
