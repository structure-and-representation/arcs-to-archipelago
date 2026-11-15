// 弧の幾何。同じ式を JavaScript(当たり判定・テスト・代替表示)と GLSL(描画)に持つ。
// 制御点 [A, A, A, M, B, B, B] の一様3次Bスプライン(4区間)。
//   M = (A + B) / 2 + n * K * |AB|
//   n = side * cos(lean) * Y + sin(lean) * R
// これは d3 v3 の d3.svg.line().interpolate("basis") に [A, M, B] を与えた曲線と同じ。
import { K } from './constants.js';

const EPS_T = 1e-4;

// 4つの制御点のうち、弧の形を決める点を ctrl[7][3] に書く。
function controlPoints(A2, B2, side, lean, ctrl) {
  const ax = A2[0], az = A2[1], bx = B2[0], bz = B2[1];
  const dx = bx - ax, dz = bz - az;
  const d = Math.hypot(dx, dz) || 1e-6;
  const rx = -dz / d, rz = dx / d; // 弦に垂直な水平の単位ベクトル
  const h = K * d;
  const sl = Math.sin(lean), cl = Math.cos(lean) * side;
  const mx = (ax + bx) / 2 + sl * rx * h;
  const my = cl * h;
  const mz = (az + bz) / 2 + sl * rz * h;
  const P = ctrl;
  P[0][0] = ax; P[0][1] = 0; P[0][2] = az;
  P[1][0] = ax; P[1][1] = 0; P[1][2] = az;
  P[2][0] = ax; P[2][1] = 0; P[2][2] = az;
  P[3][0] = mx; P[3][1] = my; P[3][2] = mz;
  P[4][0] = bx; P[4][1] = 0; P[4][2] = bz;
  P[5][0] = bx; P[5][1] = 0; P[5][2] = bz;
  P[6][0] = bx; P[6][1] = 0; P[6][2] = bz;
  return P;
}

const scratch = Array.from({ length: 7 }, () => [0, 0, 0]);

/**
 * 弧上の点。A, B は補間後の位置 [x, z]。t は 0〜1。out([x, y, z]) に書いて返す。
 * side: +1 が地上、-1 が地下。lean: 弧を水平方向へ倒す角度(ラジアン)。
 */
export function arcPoint(A, B, side, lean, t, out = [0, 0, 0]) {
  const P = controlPoints(A, B, side, lean, scratch);
  const u = Math.min(Math.max(t, 0), 0.99999) * 4;
  const j = Math.floor(u);
  const f = u - j;
  const f2 = f * f, f3 = f2 * f;
  const b0 = (1 - f) ** 3 / 6;
  const b1 = (3 * f3 - 6 * f2 + 4) / 6;
  const b2 = (-3 * f3 + 3 * f2 + 3 * f + 1) / 6;
  const b3 = f3 / 6;
  const p0 = P[j], p1 = P[j + 1], p2 = P[j + 2], p3 = P[j + 3];
  out[0] = b0 * p0[0] + b1 * p1[0] + b2 * p2[0] + b3 * p3[0];
  out[1] = b0 * p0[1] + b1 * p1[1] + b2 * p2[1] + b3 * p3[1];
  out[2] = b0 * p0[2] + b1 * p1[2] + b2 * p2[2] + b3 * p3[2];
  return out;
}

/**
 * 弧上の点での単位接線(進行方向)。端点では導関数が 0 になるため、
 * t を [1e-4, 1 - 1e-4] に丸めて評価する。out([x, y, z]) に書いて返す。
 */
export function arcTangent(A, B, side, lean, t, out = [0, 0, 0]) {
  const P = controlPoints(A, B, side, lean, scratch);
  const tc = Math.min(Math.max(t, EPS_T), 1 - EPS_T);
  const u = Math.min(tc, 0.99999) * 4;
  const j = Math.floor(u);
  const f = u - j;
  const f2 = f * f;
  // 3次Bスプライン基底の導関数
  const d0 = -(1 - f) * (1 - f) / 2;
  const d1 = (3 * f2 - 4 * f) / 2;
  const d2 = (-3 * f2 + 2 * f + 1) / 2;
  const d3 = f2 / 2;
  const p0 = P[j], p1 = P[j + 1], p2 = P[j + 2], p3 = P[j + 3];
  let x = d0 * p0[0] + d1 * p1[0] + d2 * p2[0] + d3 * p3[0];
  let y = d0 * p0[1] + d1 * p1[1] + d2 * p2[1] + d3 * p3[1];
  let z = d0 * p0[2] + d1 * p1[2] + d2 * p2[2] + d3 * p3[2];
  const len = Math.hypot(x, y, z) || 1;
  x /= len; y /= len; z /= len;
  out[0] = x; out[1] = y; out[2] = z;
  return out;
}

/**
 * 同じ式の GLSL 断片(GLSL ES 3.00)。弧の式だけで、都道府県の位置を読む断片
 * (`scene/shared.js` の GLSL_NODES: uNodes、uMorph、nodePos(i))と一緒に使う。
 * uniform: uLean、uK。
 * 関数: arcPoint(srcIndex, dstIndex, side, t, out R)
 *   R は弦に垂直な水平の単位ベクトル(リボンやチューブの押し出しに使う)。
 */
export const GLSL_ARC = /* glsl */ `
uniform float uLean, uK;
vec3 bsp(vec3 p0, vec3 p1, vec3 p2, vec3 p3, float f){
  float f2 = f * f, f3 = f2 * f; float a = 1.0 - f;
  return (a * a * a * p0 + (3.0 * f3 - 6.0 * f2 + 4.0) * p1 + (-3.0 * f3 + 3.0 * f2 + 3.0 * f + 1.0) * p2 + f3 * p3) / 6.0;
}
vec3 arcPoint(float si, float ti, float side, float t, out vec3 R){
  vec2 a2 = nodePos(si), b2 = nodePos(ti);
  vec3 A = vec3(a2.x, 0.0, a2.y), B = vec3(b2.x, 0.0, b2.y);
  vec2 dd = b2 - a2; float d = max(length(dd), 1e-4);
  R = vec3(-dd.y / d, 0.0, dd.x / d);
  vec3 n = vec3(sin(uLean) * R.x, side * cos(uLean), sin(uLean) * R.z);
  vec3 M = (A + B) * 0.5 + n * uK * d;
  float u = clamp(t, 0.0, 0.99999) * 4.0; float j = floor(u); float f = u - j;
  if (j < 0.5) return bsp(A, A, A, M, f);
  if (j < 1.5) return bsp(A, A, M, B, f);
  if (j < 2.5) return bsp(A, M, B, B, f);
  return bsp(M, B, B, B, f);
}`;
