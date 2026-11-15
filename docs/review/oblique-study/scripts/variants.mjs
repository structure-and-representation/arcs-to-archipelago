// 斜めの定位置の候補。値は camera.js の viewFor に渡す上書き(__studyPresets.oblique)。
const D = Math.PI / 180;
const flat = (el, extra = {}) => ({ elevation: el * D, lean: 0, sel: { elevation: el * D, lean: 0 }, portraitRoll: 0, ...extra });
export const VARIANTS = {
  cur: { label: '現状', sub: '方位 -0.35(北から 148°)/ 仰角 34°・選択 41° / lean 0.7・選択 0.25', oblique: {} },
  A45: { label: '案A 寝かせた地図 45°', sub: '北が上 / 仰角 45° / lean 0', oblique: flat(45, { azFromNorth: 0 }) },
  A52: { label: '案A 寝かせた地図 52°', sub: '北が上 / 仰角 52° / lean 0', oblique: flat(52, { azFromNorth: 0 }) },
  A60: { label: '案A 寝かせた地図 60°', sub: '北が上 / 仰角 60° / lean 0', oblique: flat(60, { azFromNorth: 0 }) },
  B20s: { label: '案B 低い視点・現方位 20°', sub: '方位 -0.35 / 仰角 20° / lean 0', oblique: flat(20, { azimuth: -0.35, portraitRoll: undefined }) },
  B20n: { label: '案B 低い視点・北が上 20°', sub: '北が上 / 仰角 20° / lean 0', oblique: flat(20, { azFromNorth: 0 }) },
  C1: { label: '案C1 太平洋側から 45°', sub: '北から +26° 回す(列島が横長)/ 仰角 45° / lean 0', oblique: flat(45, { azFromNorth: 0.45 }) },
  C2: { label: '案C2 選択で仰角を変える', sub: '北が上 / 選択なし 52°、選択時 30° / lean 0', oblique: { ...flat(52, { azFromNorth: 0 }), sel: { elevation: 30 * D, lean: 0 } } },
  A52f: { label: '案A 52°・全相手先を収める', sub: '北が上 / 仰角 52° / lean 0 / 選択時は 46 の相手先すべてを枠に', oblique: flat(52, { azFromNorth: 0, fitAll: true }) },
  C1f: { label: '案C1 45°・全相手先を収める', sub: '北から 26° 回す / 仰角 45° / lean 0 / 選択時は全相手先を枠に', oblique: flat(45, { azFromNorth: 0.45, fitAll: true }) },
  C3: { label: '案C3 太平洋側から 38°', sub: '北から 26° 回す / 仰角 38° / lean 0 / 選択時は全相手先を枠に', oblique: flat(38, { azFromNorth: 0.45, fitAll: true }) },
  C4: { label: '推奨 案C4 北が上・選択で低く', sub: '北が上 / 仰角 52°・選択 38° / lean 0 / 選択時は全相手先を枠に', oblique: { ...flat(52, { azFromNorth: 0, fitAll: true }), sel: { elevation: 38 * D, lean: 0 } } },
  side: { label: '参考 真横(定位置)', sub: '方位 0 / 仰角 0 / morph 0', cam: 'side' },
  top: { label: '参考 真上(定位置)', sub: '北が上 / 仰角 90° / lean 0.7', cam: 'top' },
};
for (const v of Object.values(VARIANTS)) if (v.oblique) for (const k of Object.keys(v.oblique)) if (v.oblique[k] === undefined) delete v.oblique[k];
export const STATES = {
  nation: { label: '全国(選択なし)', q: 'year=2025&lang=ja' },
  tokyo: { label: '東京圏を選択', q: 'year=2025&lang=ja&sel=tokyo' },
  osaka: { label: '大阪圏を選択', q: 'year=2025&lang=ja&sel=osaka' },
  hokkaido: { label: '北海道を選択', q: 'year=2025&lang=ja&sel=1' },
};
