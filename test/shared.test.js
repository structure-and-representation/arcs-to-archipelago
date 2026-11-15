import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { STYLE_DEFAULTS, createShared, readStyle, setSrgbColor } from '../src/scene/shared.js';
import { prefectures } from './helpers.js';

describe('scene/shared.js の色と描画の値', () => {
  it('setSrgbColor はトークンの sRGB の値を線形へ変換せずに持つ', () => {
    const c = setSrgbColor(new THREE.Color(), '#C23B22');
    expect(c.r).toBeCloseTo(0xc2 / 255, 10);
    expect(c.g).toBeCloseTo(0x3b / 255, 10);
    expect(c.b).toBeCloseTo(0x22 / 255, 10);
  });

  it('共有の uniform(uInk、uPaper、uAccent)はテーマのトークンの値', () => {
    const shared = createShared({ prefectures: prefectures() });
    const hex = (c) => `#${[c.r, c.g, c.b].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('')}`;
    shared.setTheme('paper');
    expect(hex(shared.uniforms.uInk.value)).toBe('#1c1b18');
    expect(hex(shared.uniforms.uPaper.value)).toBe('#f3f0e8');
    expect(hex(shared.uniforms.uAccent.value)).toBe('#c23b22');
    shared.setTheme('ink');
    expect(hex(shared.uniforms.uInk.value)).toBe('#f3f0e8');
    expect(hex(shared.uniforms.uAccent.value)).toBe('#e5603f');
    expect(shared.style.arcAll).toBe(0.085);
  });

  it('readStyle は tokens.css の値を読み、縦画面では粒子の径を縦画面の値にする', () => {
    const vars = { '--gl-fg': ' #111111', '--gl-arc-all': '.2', '--gl-particle-size': '2', '--gl-particle-size-portrait': '1.8' };
    const read = (name) => vars[name] ?? '';
    const s = readStyle('paper', { read });
    expect(s.fg).toBe('#111111');
    expect(s.arcAll).toBe(0.2);
    expect(s.arcSel).toBe(STYLE_DEFAULTS.paper.arcSel);
    expect(s.particleSize).toBe(2);
    expect(readStyle('paper', { read, portrait: true }).particleSize).toBe(1.8);
  });

  it('描画バッファの CSS 幅が 1024px 未満になると縦画面の値に切り替わる', () => {
    const shared = createShared({ prefectures: prefectures() });
    shared.setSize(2880, 1800, 2);
    expect(shared.portrait).toBe(false);
    expect(shared.style.particleSize).toBe(2);
    shared.setSize(780, 1688, 2);
    expect(shared.portrait).toBe(true);
    expect(shared.style.particleSize).toBe(1.8);
  });
});
