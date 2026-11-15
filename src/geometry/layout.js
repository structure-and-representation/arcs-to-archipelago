// 都道府県の2つの配置(一直線 / 地理)と、その補間。
import { STEP, CX } from './constants.js';

const HOKKAIDO = 0;
const KAGOSHIMA = 45;
const LINE_LENGTH = 46 * STEP; // 一直線の配置の長さ(北海道〜沖縄県)

/** 一直線の配置。都道府県 i を (i * STEP - CX, 0) に置く。原作と同じ並び。 */
export function lineLayout() {
  return Array.from({ length: 47 }, (_, i) => [i * STEP - CX, 0]);
}

/**
 * 地理配置。
 * 地図座標(km、x 東、y 北)を、回転と拡大縮小でワールド座標 [x, z] へ移す。
 *  - 北海道 → 鹿児島の向きを +x 軸に重ねる(回転のみ。鏡像にしない)。
 *  - 47 点全体の x 方向の広がりを 46 * STEP(一直線の長さ)に合わせ、x の最小値が -CX、最大値が CX になるようにする。
 *    変形の前後でカメラの拡大率を変えずに済む。沖縄は同じ変換で実位置に置く。
 *  - z は 47 点の範囲の中央が 0 になるようにする。
 *
 * 戻り値:
 *  pos          [x, z][47]
 *  toWorld(mx, my) → [x, z]  地図座標(km)からワールド座標へ。境界線の頂点にも使う
 *  northAngle   ワールドの xz 平面で、北の向きの単位ベクトルは [cos(northAngle), sin(northAngle)]。
 *               東の向きは [-sin(northAngle), cos(northAngle)]。
 *  kmPerUnit    ワールド 1 単位あたりの km
 *  bounds       { minX, maxX, minZ, maxZ } 47 点の範囲
 */
export function geoLayout(prefectures) {
  if (!Array.isArray(prefectures) || prefectures.length !== 47) {
    throw new Error('geoLayout: prefectures は 47 件の配列で渡してください');
  }
  // 地図座標 (x 東, y 北) → 中間座標 (x 東, z 南)。three.js は +z が手前(南)。
  const mid = prefectures.map((p) => [p.x, -p.y]);
  const a = mid[HOKKAIDO];
  const b = mid[KAGOSHIMA];
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const c = Math.cos(-ang);
  const s = Math.sin(-ang);
  const rotate = (x, z) => [x * c - z * s, x * s + z * c];
  const rot = mid.map(([x, z]) => rotate(x, z));
  const xsRot = rot.map((p) => p[0]);
  const x0 = Math.min(...xsRot);
  const scale = LINE_LENGTH / (Math.max(...xsRot) - x0);
  const zs = rot.map((p) => p[1]);
  const zc = (Math.min(...zs) + Math.max(...zs)) / 2;

  const toWorld = (mx, my) => {
    const [x, z] = rotate(mx, -my);
    return [(x - x0) * scale - CX, (z - zc) * scale];
  };
  const pos = prefectures.map((p) => toWorld(p.x, p.y));
  const xsW = pos.map((p) => p[0]);
  const zsW = pos.map((p) => p[1]);
  // 北 = 地図の (0, +1)。toWorld は線形なので、原点との差から向きを取る。
  const o = toWorld(0, 0);
  const n = toWorld(0, 1);
  const northAngle = Math.atan2(n[1] - o[1], n[0] - o[0]);
  return {
    pos,
    toWorld,
    northAngle,
    kmPerUnit: 1 / scale,
    bounds: {
      minX: Math.min(...xsW),
      maxX: Math.max(...xsW),
      minZ: Math.min(...zsW),
      maxZ: Math.max(...zsW),
    },
  };
}

/** 補間後の位置 [x, z]。morph = 0 で一直線、1 で地理配置。 */
export function nodePos(line, geo, i, morph) {
  return [
    line[i][0] + (geo[i][0] - line[i][0]) * morph,
    line[i][1] + (geo[i][1] - line[i][1]) * morph,
  ];
}
