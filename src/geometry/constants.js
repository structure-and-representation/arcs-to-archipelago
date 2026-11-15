// 幾何の定数。単位は原作の SVG のピクセル(ワールド座標)。
export const W = 1160;
export const H = 230;
export const N = 47;
export const STEP = W / N; // d3.layout.arcDiagram の nodeStep
export const K = H / W; // 端点間の距離 1 あたりの制御点の高さ
export const CX = 23 * STEP; // 一直線の中心(添字 23 = 三重県)

// 圏の構成(JIS コード)。prefectures.json の `metro` と同じ分け方。
export const METRO_CODES = {
  tokyo: [11, 12, 13, 14],
  nagoya: [21, 23, 24],
  osaka: [26, 27, 28, 29],
};

// カメラの定位置(設計 §6)。azimuth / elevation はラジアン。
// azimuth が null の定位置は、北が画面の上になる方位を camera.js が決める(真上と斜め俯瞰)。
// oblique は案C4「北が上・選択時は低め」(docs/review/oblique-study/): 真上と同じ方位から仰角 52° で見下ろし、
// 弧は倒さずに立てる(lean 0。地上の弧は画面の上へ、地下の弧は画面の下へふくらむ)。
// 地域を選んでいるときの仰角(38°)は scene/camera.js の SELECTION_OBLIQUE。
// top の lean 0.7 は設計の範囲(0.5〜0.9)の中央寄りで、真上から弧の形が見えつつ、弧どうしの重なりが過度にならない値。
const DEG = Math.PI / 180;
export const CAMERA_PRESETS = {
  side: { azimuth: 0, elevation: 0, morph: 0, lean: 0 },
  oblique: { azimuth: null, elevation: 52 * DEG, morph: 1, lean: 0 },
  top: { azimuth: null, elevation: Math.PI / 2, morph: 1, lean: 0.7 },
};

export const CAMERA_NAMES = Object.keys(CAMERA_PRESETS);
export const YEAR_MIN = 2012;
export const YEAR_MAX = 2025;

// 名前の判定は自身のキーだけを認める(`in` だと 'constructor' や 'toString' のような継承したキーも通ってしまう)
const own = (obj, key) => typeof key === 'string' && Object.prototype.hasOwnProperty.call(obj, key);
/** 圏の id('tokyo' | 'nagoya' | 'osaka')か。 */
export const isMetroId = (id) => own(METRO_CODES, id);
/** カメラの定位置の名前('side' | 'oblique' | 'top')か。 */
export const isCameraName = (name) => own(CAMERA_PRESETS, name);
