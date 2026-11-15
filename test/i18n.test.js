import { describe, expect, it } from 'vitest';
import common from '../src/i18n/common.js';
import timeline from '../src/i18n/timeline.js';
import selector from '../src/i18n/selector.js';
import tooltip from '../src/i18n/tooltip.js';
import table from '../src/i18n/table.js';
import controls from '../src/i18n/controls.js';
import chapters from '../src/i18n/chapters.js';
import legend from '../src/i18n/legend.js';
import { CHAPTERS } from '../src/content/chapters.js';
import { DICT, PREF_EN, PREF_JA, metroName, prefName, setLang, t } from '../src/i18n.js';

const parts = { common, timeline, selector, tooltip, table, controls, chapters, legend };

describe('辞書', () => {
  it('ja と en のキーが各部品で同じ', () => {
    for (const [name, p] of Object.entries(parts)) {
      expect(Object.keys(p.ja).sort(), name).toEqual(Object.keys(p.en).sort());
    }
  });

  it('部品どうしでキーが重ならず、まとめた辞書がすべてを含む', () => {
    const all = Object.values(parts).flatMap((p) => Object.keys(p.ja));
    expect(new Set(all).size).toBe(all.length);
    expect(Object.keys(DICT.ja)).toHaveLength(all.length);
    expect(Object.keys(DICT.en)).toHaveLength(all.length);
  });

  it('各部品のキーは、その部品の接頭辞で始まる', () => {
    const prefixes = {
      timeline: ['year.'], selector: ['selector.', 'readout.', 'region.'], tooltip: ['tooltip.'], table: ['table.', 'fallback.'],
      controls: ['camera.', 'settings.'], chapters: ['ch.'], legend: ['legend.'],
      common: ['app.', 'source.', 'meta.', 'footer.'],
    };
    for (const [name, pre] of Object.entries(prefixes)) {
      for (const k of Object.keys(parts[name].ja)) expect(pre.some((p) => k.startsWith(p)), `${name}: ${k}`).toBe(true);
    }
  });

  it('章の見出しと本文のキーが辞書にある', () => {
    for (const ch of CHAPTERS) {
      for (const key of [ch.name, ch.heading, ch.body, ch.bodyPortrait, ch.note].filter(Boolean)) {
        expect(DICT.ja[key], key).toBeTruthy();
        expect(DICT.en[key], key).toBeTruthy();
      }
    }
    expect(CHAPTERS).toHaveLength(5);
  });
});

describe('t / prefName', () => {
  it('現在の言語で引き、ないキーは key を返す', () => {
    setLang('ja');
    expect(t('camera.side')).toBe('真横');
    setLang('en');
    expect(t('camera.side')).toBe('Side');
    expect(t('no.such.key')).toBe('no.such.key');
    expect(t('camera.side', 'ja')).toBe('真横');
    setLang('ja');
  });

  it('都道府県名は 47 件で、添字は JIS コード − 1', () => {
    expect(PREF_JA).toHaveLength(47);
    expect(PREF_EN).toHaveLength(47);
    expect(prefName(12, 'ja')).toBe('東京都');
    expect(prefName(12, 'en')).toBe('Tokyo');
    expect(metroName('osaka', 'ja')).toBe('大阪圏');
  });
});

describe('確定稿(docs/copy/strings.md)と辞書', () => {
  it('strings.md のキーがすべて辞書にあり、文言が同じ', async () => {
    const { readFileSync } = await import('node:fs');
    const md = readFileSync(new URL('../docs/copy/strings.md', import.meta.url), 'utf8');
    const rows = [...md.matchAll(/^\| `([^`]+)` \| (.*?) \| (.*?) \|$/gm)];
    expect(rows.length).toBeGreaterThan(60);
    const norm = (s) => s.replace(/’/g, "'");
    for (const [, key, ja, en] of rows) {
      expect(DICT.ja[key], key).toBe(ja);
      expect(norm(DICT.en[key]), key).toBe(norm(en));
    }
  });

  it('圏の名前は region.metro.* から引く', () => {
    expect(metroName('tokyo', 'ja')).toBe('東京圏');
    expect(metroName('osaka', 'en')).toBe('Osaka area');
  });
});
