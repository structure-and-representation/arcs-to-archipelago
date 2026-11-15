import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseData } from '../src/data/loader.js';
import { STEP } from '../src/geometry/constants.js';
import { selectionMask, sideOf } from '../src/geometry/flows.js';
import { createFallback } from '../src/scene/fallback2d.js';
import { figureRegion } from '../src/scene/camera.js';
import { arcT, endFade, hash, sideOfMask, slotS, slotWeight } from '../src/geometry/particles.js';

const stillS = (o, d, k) => slotS(o, d, k, 0, true);

const read = (name) => JSON.parse(readFileSync(new URL(`../public/data/${name}`, import.meta.url), 'utf8'));
const data = parseData({ od: read('od.json'), prefectures: read('prefectures.json'), topology: read('japan.topojson') });

/** 呼び出しを記録するだけの 2D コンテキスト。 */
function fakeCanvas(w, h) {
  const calls = [];
  const ctx = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
    calls,
  };
  for (const name of ['setTransform', 'clearRect', 'beginPath', 'moveTo', 'lineTo', 'arc']) {
    ctx[name] = (...a) => calls.push([name, ...a]);
  }
  ctx.stroke = () => calls.push(['stroke', ctx.strokeStyle, ctx.lineWidth]);
  ctx.fill = () => calls.push(['fill', ctx.fillStyle, ctx.globalAlpha]);
  return { clientWidth: w, clientHeight: h, width: 0, height: 0, getContext: () => ctx, ctx };
}

function make(w, h, year = 2014) {
  const canvas = fakeCanvas(w, h);
  const fb = createFallback(canvas, data);
  fb.resize();
  fb.setYear(year, year, 0);
  return { fb, canvas, calls: canvas.ctx.calls };
}
const count = (calls, name) => calls.filter((c) => c[0] === name).length;

describe('粒子の計算(docs/particles/reference.js の JS 版)', () => {
  it('ハッシュの固定値', () => {
    expect(hash(1)).toBe(1753845952);
    expect(hash(2)).toBe(3507691905);
    expect(hash(3)).toBe(1408362973);
  });

  it('arcT は 0, 0.5, 1 を保ち、単調に増える', () => {
    expect(arcT(0)).toBe(0);
    expect(arcT(0.5)).toBeCloseTo(0.5, 12);
    expect(arcT(1)).toBeCloseTo(1, 12);
    let prev = -1;
    for (let i = 0; i <= 1000; i++) {
      const t = arcT(i / 1000);
      expect(t).toBeGreaterThanOrEqual(prev);
      prev = t;
    }
  });

  it('静止の配置はすべて [0.04, 0.96] に入り、端の薄めは 1 のまま', () => {
    for (const [o, d] of [[0, 1], [12, 13], [45, 46], [26, 12]]) {
      for (let k = 0; k < 900; k++) {
        const s = stillS(o, d, k);
        expect(s).toBeGreaterThanOrEqual(0.04);
        expect(s).toBeLessThanOrEqual(0.96);
        expect(endFade(s)).toBeCloseTo(1, 12);
      }
    }
  });

  it('粒子の濃さの重みの合計が、人数 / 100 に等しい', () => {
    for (const v of [0, 1, 99, 100, 101, 250, 77802]) {
      let total = 0;
      for (let k = 0; k < Math.ceil(v / 100); k++) total += slotWeight(v, k);
      expect(total).toBeCloseTo(v / 100, 9);
    }
  });

  it('弧の側は geometry/flows.js の sideOf と同じ', () => {
    for (const selection of [null, { type: 'pref', code: 13 }, { type: 'metro', id: 'osaka' }]) {
      const mask = selectionMask(selection);
      for (let o = 0; o < 47; o++) for (let d = 0; d < 47; d++) expect(sideOfMask(o, d, mask)).toBe(sideOf(o, d, selection));
    }
  });
});

describe('createFallback の射影', () => {
  it('横長: 一直線が横に並び、北海道が左、沖縄県が右。隣の間隔は STEP × 拡大率', () => {
    const { fb } = make(1440, 900);
    const p0 = fb.project(0);
    const p1 = fb.project(1);
    const p46 = fb.project(46);
    expect(p0[1]).toBeCloseTo(p46[1], 9);
    expect(p0[0]).toBeLessThan(p46[0]);
    // 図は WebGL と同じ図の領域(figureRegion: x 424〜1400、y 96〜800)の中央に収まる
    const r = figureRegion(1440, 900);
    expect(p0[1]).toBeCloseTo((r.y0 + r.y1) / 2, 6);
    const { zoom } = fb.getState().view;
    expect(p1[0] - p0[0]).toBeCloseTo(STEP * zoom * 900, 9);
    expect((p0[0] + p46[0]) / 2).toBeCloseTo((r.x0 + r.x1) / 2, 6); // 中心は 47 点の中央(添字 23 = 三重県が領域の中央)
    expect(p0[0]).toBeGreaterThan(r.x0); // 左の柱(本文と凡例)の下には描かない
    expect(p46[0]).toBeLessThan(r.x1);
  });

  it('縦長でも回さない: 北海道が左、沖縄県が右の横長の並び', () => {
    const { fb } = make(390, 844);
    const p0 = fb.project(0);
    const p46 = fb.project(46);
    expect(p0[1]).toBeCloseTo(p46[1], 9);
    expect(p0[0]).toBeLessThan(p46[0]);
    expect(p0[0]).toBeGreaterThan(0);
    expect(p46[0]).toBeLessThan(390);
  });

  it('screenMatrix が project と同じ位置を与える', () => {
    for (const [w, h] of [[1440, 900], [390, 844]]) {
      const { fb } = make(w, h);
      const m = fb.screenMatrix();
      for (const i of [0, 12, 23, 46]) {
        const x = fb.layout.line[i][0];
        const [px, py] = fb.project(i);
        expect(m[0] * x + m[3]).toBeCloseTo(px, 9);
        expect(m[4] * x + m[7]).toBeCloseTo(py, 9);
      }
    }
  });

  it('setMorph、setView、setLean を受け取っても、真横の位置のまま', () => {
    const { fb } = make(1440, 900);
    const before = fb.project(12);
    fb.setMorph(1);
    fb.setLean(0.7);
    fb.setView({ azimuth: -0.35, elevation: 0.6, zoom: 0.01, center: [10, 0, 10], roll: 1 });
    expect(fb.project(12)).toEqual(before);
    expect(fb.getState().morph).toBe(0);
  });

  it('renderer と同じメソッドを持つ', () => {
    const { fb } = make(1440, 900);
    for (const name of ['setView', 'setMorph', 'setLean', 'setSelection', 'setYear', 'setTheme', 'setReducedMotion', 'setHover', 'resize', 'render', 'project', 'dispose', 'screenMatrix', 'getState']) {
      expect(typeof fb[name], name).toBe('function');
    }
    expect(fb.layout.line).toHaveLength(47);
    expect(fb.layout.bounds).toBeTruthy();
  });
});

describe('createFallback の描画', () => {
  it('全国: 人数のある弧をすべて線で描き、粒子は人数 / 100 の枠(切り上げ)ぶん、点は 47 個', () => {
    const { fb, calls } = make(1440, 900);
    fb.render(0);
    const m = data.matrix(2014);
    let arcs = 0;
    let particles = 0;
    for (let o = 0; o < 47; o++) {
      for (let d = 0; d < 47; d++) {
        const v = m[o * 47 + d];
        if (o === d || v <= 0) continue;
        arcs++;
        particles += Math.ceil(v / 100);
      }
    }
    expect(count(calls, 'stroke')).toBe(arcs);
    expect(count(calls, 'fill')).toBe(particles + 47);
    // 全国の線の幅は 0.7
    expect(calls.filter((c) => c[0] === 'stroke').every((c) => c[2] === 0.7)).toBe(true);
  });

  it('状態が変わらなければ描き直さない。年を変えると描き直す', () => {
    const { fb, calls } = make(1440, 900);
    fb.render(0);
    const n = calls.length;
    fb.render(1);
    fb.render(2);
    expect(calls.length).toBe(n);
    fb.setYear(2012, 2012, 0);
    fb.render(3);
    expect(calls.length).toBeGreaterThan(n);
  });

  it('年ごとに粒子の数が変わる(2012年と 2014年で違う)', () => {
    const a = make(1440, 900, 2012);
    a.fb.render(0);
    const b = make(1440, 900, 2014);
    b.fb.render(0);
    expect(count(a.calls, 'fill')).not.toBe(count(b.calls, 'fill'));
  });

  it('東京都を選ぶと、東京都に関わる弧(転入 46 + 転出 46)だけを描き、線は 0.8、選択中の点は朱', () => {
    const { fb, calls } = make(1440, 900);
    fb.setSelection(selectionMask({ type: 'pref', code: 13 }));
    fb.render(0);
    const strokes = calls.filter((c) => c[0] === 'stroke');
    expect(strokes).toHaveLength(92);
    expect(strokes.every((c) => c[2] === 0.8)).toBe(true);
    // 点: 墨の 46 + 選択中の輪と朱の点
    const accentFills = calls.filter((c) => c[0] === 'fill' && c[1] === 'rgba(194, 59, 34, 1)');
    expect(accentFills).toHaveLength(1);
  });

  it('ダークテーマでは墨と紙が入れ替わる', () => {
    const { fb, calls } = make(1440, 900);
    fb.setTheme('ink');
    fb.render(0);
    const stroke = calls.find((c) => c[0] === 'stroke');
    expect(stroke[1]).toBe('rgba(243, 240, 232, 0.085)');
  });

  it('ホバー中の弧は朱の線で重ねて描く', () => {
    const { fb, calls } = make(1440, 900);
    fb.setHover({ o: 13, d: 12 });
    fb.render(0);
    const strokes = calls.filter((c) => c[0] === 'stroke');
    const accent = strokes.filter((c) => c[1].startsWith('rgba(194, 59, 34'));
    expect(accent).toHaveLength(1);
    expect(accent[0][2]).toBe(1.0);
  });

  it('画面の大きさが変わると、キャンバスの大きさと射影を作り直す', () => {
    const { fb, canvas } = make(1440, 900);
    canvas.clientWidth = 390;
    canvas.clientHeight = 844;
    fb.resize();
    expect(canvas.width).toBe(390);
    expect(canvas.height).toBe(844);
    expect(fb.project(0)[1]).toBeCloseTo(fb.project(46)[1], 9);
    expect(fb.project(46)[0]).toBeLessThan(390);
  });
});
