import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(root, p), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** :root と :root[data-theme="ink"] の宣言(--名前: 値)を、ライトとダークの 2 つの表にする。 */
function parseThemes(css) {
  const light = {};
  const ink = {};
  for (const [, sel, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const s = sel.trim();
    const target = s === ':root' ? light : s === ':root[data-theme="ink"]' ? ink : null;
    if (!target) continue;
    for (const [, k, v] of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) target[k] = v.trim();
  }
  return { light, ink: { ...light, ...ink } };
}

function resolveVar(value, table, depth = 0) {
  if (depth > 10) throw new Error(`var の循環: ${value}`);
  return value.replace(/var\((--[\w-]+)\)/g, (_, name) => {
    if (!(name in table)) throw new Error(`未定義のトークン: ${name}`);
    return resolveVar(table[name], table, depth + 1);
  });
}

const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const rgbList = (s) => s.trim().split(/\s+/).map(Number);

/** `rgb(r g b / a)` または `#RRGGBB` を [r, g, b, a] にする。 */
function parseColor(v) {
  if (v.startsWith('#')) return [...hexToRgb(v), 1];
  const m = v.match(/^rgb\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+))?\s*\)$/);
  if (!m) throw new Error(`色を読めません: ${v}`);
  return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] == null ? 1 : Number(m[4])];
}
const over = ([r, g, b, a], bg) => [0, 1, 2].map((i) => [r, g, b][i] * a + bg[i] * (1 - a));
const lin = (c) => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
export const contrast = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const mine = parseThemes(read('src/styles/tokens.css'));
const spec = parseThemes(read('docs/design/tokens.css'));
const val = (theme, name) => resolveVar(theme[name], theme);

describe('tokens.css は、デザイン仕様の確定版(docs/design/tokens.css)に合っている', () => {
  // 骨格の scene/shared.js が #RRGGBB で読むために、--bg / --accent の書き方だけ変えて --fg を足している
  const alias = new Set(['--bg', '--fg', '--accent']);

  for (const name of ['light', 'ink']) {
    it(`${name}: 仕様のトークンがすべて同じ値で定義されている`, () => {
      for (const [k, v] of Object.entries(spec[name])) {
        if (alias.has(k)) continue;
        expect(mine[name][k], k).toBe(v);
      }
    });

    it(`${name}: --bg / --fg / --accent は、#RRGGBB で、仕様の --bg-rgb / --fg-rgb / --accent-rgb と同じ色`, () => {
      for (const [hexName, rgbName] of [['--bg', '--bg-rgb'], ['--fg', '--fg-rgb'], ['--accent', '--accent-rgb']]) {
        const hex = mine[name][hexName];
        expect(hex, hexName).toMatch(/^#[0-9A-Fa-f]{6}$/);
        expect(hexToRgb(hex), hexName).toEqual(rgbList(mine[name][rgbName]));
      }
    });
  }

  it('紙・墨・朱の原色(ライトの地は紙、ダークの地は墨)', () => {
    expect(mine.light['--paper']).toBe('#F3F0E8');
    expect(mine.light['--ink']).toBe('#1C1B18');
    expect(mine.light['--bg'].toLowerCase()).toBe('#f3f0e8');
    expect(mine.ink['--bg'].toLowerCase()).toBe('#1c1b18');
    expect(mine.light['--accent'].toLowerCase()).toBe('#c23b22');
    expect(mine.ink['--accent'].toLowerCase()).toBe('#e5603f');
    expect(mine.ink['--gl-fg'].toLowerCase()).toBe(mine.ink['--fg'].toLowerCase());
    expect(mine.light['--gl-fg'].toLowerCase()).toBe(mine.light['--fg'].toLowerCase());
    expect(mine.ink['--gl-accent'].toLowerCase()).toBe(mine.ink['--accent'].toLowerCase());
  });
});

describe('文字と背景のコントラスト比(仕様の表の値)', () => {
  // 仕様 2 節: 地の上に不透明度で重ねた色で計算した値
  const want = {
    light: { '--fg-1': 15.1, '--fg-2': 6.8, '--fg-3': 4.9 },
    ink: { '--fg-1': 12.9, '--fg-2': 8.0, '--fg-3': 5.9 },
  };
  for (const name of ['light', 'ink']) {
    it(`${name}: --fg-1〜--fg-3 は仕様の値で、AA(4.5:1)を満たす`, () => {
      const theme = mine[name];
      const bg = parseColor(val(theme, '--bg')).slice(0, 3);
      for (const [k, expected] of Object.entries(want[name])) {
        const ratio = contrast(over(parseColor(val(theme, k)), bg), bg);
        expect(ratio, k).toBeGreaterThanOrEqual(4.5);
        expect(ratio, k).toBeGreaterThanOrEqual(expected - 0.1);
      }
    });

    it(`${name}: 朱の文字は AA を満たす`, () => {
      const theme = mine[name];
      const bg = parseColor(val(theme, '--bg')).slice(0, 3);
      expect(contrast(parseColor(val(theme, '--accent')).slice(0, 3), bg)).toBeGreaterThanOrEqual(4.5);
    });

    it(`${name}: 紙色の下敷き(--veil)の上でも --fg-3 は AA を満たす`, () => {
      const theme = mine[name];
      const bg = parseColor(val(theme, '--bg')).slice(0, 3);
      const veil = over(parseColor(val(theme, '--veil')), bg); // 同じ色なので変わらない
      // 弧の網(fg の 15%)の上に下敷きを敷いた地
      const net = over([...parseColor(val(theme, '--fg')).slice(0, 3), 0.15], bg);
      const under = over(parseColor(val(theme, '--veil')), net);
      const fg3 = parseColor(val(theme, '--fg-3'));
      expect(contrast(over(fg3, veil), veil)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(over(fg3, under), under)).toBeGreaterThanOrEqual(4.5);
    });
  }
});
