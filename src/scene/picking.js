// 当たり判定。担当: 弧の当たり判定の実装者が pickArc を書く(pickNode はいまの実装のままでよい)。
//
// 約束:
//   createPicker(data) → {
//     rebuild(s),      // 見た目が変わったら呼ぶ。s = { matrix, mask, selection, morph, lean, screen }
//                      //   matrix: Int32Array(2209)(表示中の年の人数)、mask: Uint8Array(47)、
//                      //   selection: state.selection、morph / lean: 現在値、
//                      //   screen: renderer.screenMatrix()(world → CSS px のアフィン 2x4)
//     pickNode(x, y),  // CSS px(キャンバス左上基準)→ 都道府県の添字 | null
//     pickArc(x, y)    // → { o, d } | null。描いている弧だけが対象(sideOf(o, d, selection) !== 0 で人数 > 0)
//   }
// 弧は geometry/flows.js の arcList()(固定の順序。弧・粒子・表と共有)の添字 k で扱う。
// 弧の多角線はキャッシュして rebuild のときだけ作り直す(試作 reference/proto/pick.mjs の計測を参照)。
import { lineLayout, geoLayout, nodePos } from '../geometry/layout.js';

const NODE_RADIUS = 14; // CSS px

export function createPicker(data) {
  const line = lineLayout();
  const geo = geoLayout(data.prefectures).pos;
  let s = null;
  // 画面上の都道府県の位置
  const sx = new Float64Array(47);
  const sy = new Float64Array(47);

  return {
    rebuild(next) {
      s = next;
      const m = s.screen;
      for (let i = 0; i < 47; i++) {
        const [x, z] = nodePos(line, geo, i, s.morph);
        sx[i] = m[0] * x + m[2] * z + m[3];
        sy[i] = m[4] * x + m[6] * z + m[7];
      }
    },
    pickNode(x, y) {
      if (!s) return null;
      let best = null;
      let bd = NODE_RADIUS * NODE_RADIUS;
      for (let i = 0; i < 47; i++) {
        const d = (sx[i] - x) ** 2 + (sy[i] - y) ** 2;
        if (d <= bd) {
          bd = d;
          best = i;
        }
      }
      return best;
    },
    pickArc() {
      return null; // 未実装
    },
  };
}
