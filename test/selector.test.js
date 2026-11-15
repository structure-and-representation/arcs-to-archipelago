import { describe, expect, it } from 'vitest';
import { buildModel, normalizeQuery, regionLabel, selectionKey, shortPrefName } from '../src/ui/selector.js';
import { setLang } from '../src/i18n.js';

describe('地域の選択肢', () => {
  it('全国、三大都市圏、7地方の順で、47 都道府県がちょうど1回ずつ現れる', () => {
    const model = buildModel();
    expect(model.map((g) => g.id)).toEqual(['all', 'metro', 'hokkaido', 'tohoku', 'kanto', 'chubu', 'kinki', 'chugokuShikoku', 'kyushuOkinawa']);
    const codes = model.flatMap((g) => g.options).filter((o) => o.value?.type === 'pref').map((o) => o.value.code);
    expect(codes).toEqual(Array.from({ length: 47 }, (_, i) => i + 1));
    expect(model[1].options.map((o) => o.value.id)).toEqual(['tokyo', 'nagoya', 'osaka']);
    expect(model[3].options).toHaveLength(6); // 東北 02〜07
    expect(model[8].options).toHaveLength(8); // 九州・沖縄 40〜47
  });

  it('名前は「都府県」を省いた短い名前(北海道はそのまま)', () => {
    expect(shortPrefName(12, 'ja')).toBe('東京');
    expect(shortPrefName(25, 'ja')).toBe('京都');
    expect(shortPrefName(26, 'ja')).toBe('大阪');
    expect(shortPrefName(0, 'ja')).toBe('北海道');
    expect(shortPrefName(12, 'en')).toBe('Tokyo');
  });

  it('絞り込み: 日本語・読み・英語名の前方一致(「とう」「tok」で東京と東京圏)', () => {
    const options = buildModel().flatMap((g) => g.options);
    const hits = (q) => options.filter((o) => o.search.some((s) => s.startsWith(normalizeQuery(q)))).map((o) => o.key);
    expect(hits('とう')).toEqual(['metro:tokyo', 'pref:13']);
    expect(hits('トウ')).toEqual(['metro:tokyo', 'pref:13']); // カタカナもひらがなとして比べる
    expect(hits('tok')).toEqual(['metro:tokyo', 'pref:13', 'pref:36']); // Tokushima も前方一致
    expect(hits('TOKY')).toEqual(['metro:tokyo', 'pref:13']);
    expect(hits('東京')).toEqual(['metro:tokyo', 'pref:13']);
    expect(hits('nago')).toEqual(['metro:nagoya']);
    expect(hits('naga')).toEqual(['pref:20', 'pref:42']); // Nagano、Nagasaki
    expect(hits('')).toHaveLength(options.length);
    expect(hits('zzz')).toEqual([]);
  });

  it('選択のキーと名前', () => {
    expect(selectionKey(null)).toBe('all');
    expect(selectionKey({ type: 'metro', id: 'osaka' })).toBe('metro:osaka');
    expect(selectionKey({ type: 'pref', code: 13 })).toBe('pref:13');
    expect(regionLabel(null, 'ja')).toBe('全国');
    expect(regionLabel({ type: 'metro', id: 'tokyo' }, 'ja')).toBe('東京圏');
    expect(regionLabel({ type: 'pref', code: 13 }, 'ja')).toBe('東京都');
    expect(regionLabel({ type: 'pref', code: 13 }, 'en')).toBe('Tokyo');
    expect(regionLabel(null, 'en')).toBe('All of Japan');
    setLang('ja');
  });
});
