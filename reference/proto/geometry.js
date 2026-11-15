// Shared geometry: identical math in JS (for picking / fallback / tests) and GLSL (for drawing).
// World units = current SVG px (W = 1160 wide baseline, H = 230 half height).
export const W = 1160, H = 230, N = 47;
export const STEP = W / N;            // d3.layout.arcDiagram: nodeStep = width / nodes.length
export const K = H / W;               // control-point height per unit chord length (midPercent*size[1])
export const CX = 23 * STEP;          // center of the line (node 23 = 三重県)

// prefectural capitals [lat, lon] (prototype only; production: 人口重心 from 統計局)
export const LATLON = [
[43.064,141.347],[40.824,140.740],[39.704,141.153],[38.269,140.872],[39.719,140.102],[38.240,140.364],[37.750,140.468],
[36.342,140.447],[36.566,139.884],[36.391,139.061],[35.857,139.649],[35.605,140.123],[35.690,139.692],[35.448,139.643],
[37.902,139.023],[36.695,137.211],[36.594,136.626],[36.065,136.222],[35.664,138.568],[36.651,138.181],[35.391,136.722],
[34.977,138.383],[35.180,136.907],[34.730,136.509],[35.004,135.869],[35.021,135.756],[34.686,135.520],[34.691,135.183],
[34.685,135.833],[34.226,135.168],[35.504,134.238],[35.472,133.051],[34.662,133.935],[34.396,132.459],[34.186,131.471],
[34.066,134.559],[34.340,134.043],[33.842,132.766],[33.560,133.531],[33.607,130.418],[33.249,130.299],[32.745,129.874],
[32.790,130.742],[33.238,131.613],[31.911,131.424],[31.560,130.558],[26.212,127.681]];

export function lineLayout() {        // [x, z] per node, x centered
  return LATLON.map((_, i) => [i * STEP - CX, 0]);
}

// Geo layout: local equirectangular (km), rotated so 北海道→鹿児島 runs along +x (= the line's axis),
// scaled so the along-axis extent of all 47 equals the line's extent (46*STEP), centered on the same x.
export function geoLayout() {
  const lat0 = 36 * Math.PI / 180;
  const km = LATLON.map(([la, lo]) => [lo * 111.32 * Math.cos(lat0), -la * 110.57]); // x east, z south (three: +z toward viewer)
  const a = km[0], b = km[45];
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const c = Math.cos(-ang), s = Math.sin(-ang);
  const rot = km.map(([x, z]) => [x * c - z * s, x * s + z * c]);
  const xs = rot.map(p => p[0]); const minx = Math.min(...xs), maxx = Math.max(...xs);
  const sc = (46 * STEP) / (maxx - minx);
  const zs = rot.map(p => p[1]); const zc = (Math.min(...zs) + Math.max(...zs)) / 2;
  return { pos: rot.map(([x, z]) => [(x - minx) * sc - CX, (z - zc) * sc]), northAngle: ang, kmPerUnit: 1 / sc };
}

// Arc: control polygon of the d3 v3 "basis" line through [A, M, B] equals a uniform cubic B-spline
// over [A,A,A,M,B,B,B] (4 segments). M = mid(A,B) + n * K * |AB|, n = side*cos(lean)*Y + sin(lean)*R.
function bs(p0, p1, p2, p3, f) {
  const f2 = f * f, f3 = f2 * f;
  const b0 = (1 - f) ** 3 / 6, b1 = (3 * f3 - 6 * f2 + 4) / 6, b2 = (-3 * f3 + 3 * f2 + 3 * f + 1) / 6, b3 = f3 / 6;
  return p0.map((_, k) => b0 * p0[k] + b1 * p1[k] + b2 * p2[k] + b3 * p3[k]);
}
export function nodePos(line, geo, i, morph) {
  return [line[i][0] + (geo[i][0] - line[i][0]) * morph, line[i][1] + (geo[i][1] - line[i][1]) * morph];
}
export function arcPoint(A2, B2, side, lean, t) {
  const A = [A2[0], 0, A2[1]], B = [B2[0], 0, B2[1]];
  const dx = B[0] - A[0], dz = B[2] - A[2], d = Math.hypot(dx, dz) || 1e-6;
  const R = [-dz / d, 0, dx / d];                           // horizontal, perpendicular to chord
  const h = K * d;
  const n = [Math.sin(lean) * R[0], side * Math.cos(lean), Math.sin(lean) * R[2]];
  const M = [(A[0] + B[0]) / 2 + n[0] * h, n[1] * h, (A[2] + B[2]) / 2 + n[2] * h];
  const P = [A, A, A, M, B, B, B];
  const u = Math.min(t, 0.99999) * 4, j = Math.floor(u), f = u - j;
  return bs(P[j], P[j + 1], P[j + 2], P[j + 3], f);
}

export const GLSL_ARC = /* glsl */`
uniform sampler2D uNodes;   // 47x1 RGBA32F: lineX, lineZ, geoX, geoZ
uniform float uMorph, uLean, uK;
vec2 nodePos(float i){ vec4 v = texelFetch(uNodes, ivec2(int(i),0), 0); return mix(v.xy, v.zw, uMorph); }
vec3 bsp(vec3 p0, vec3 p1, vec3 p2, vec3 p3, float f){
  float f2=f*f, f3=f2*f; float a=1.0-f;
  return (a*a*a*p0 + (3.0*f3-6.0*f2+4.0)*p1 + (-3.0*f3+3.0*f2+3.0*f+1.0)*p2 + f3*p3)/6.0;
}
// returns arc point; frame out-params for tube offsets
vec3 arcPoint(float si, float ti, float side, float t, out vec3 R){
  vec2 a2=nodePos(si), b2=nodePos(ti);
  vec3 A=vec3(a2.x,0.0,a2.y), B=vec3(b2.x,0.0,b2.y);
  vec2 dd=b2-a2; float d=max(length(dd),1e-4);
  R=vec3(-dd.y/d,0.0,dd.x/d);
  vec3 n=vec3(sin(uLean)*R.x, side*cos(uLean), sin(uLean)*R.z);
  vec3 M=(A+B)*0.5 + n*uK*d;
  float u=min(t,0.99999)*4.0; float j=floor(u); float f=u-j;
  if(j<0.5) return bsp(A,A,A,M,f);
  if(j<1.5) return bsp(A,A,M,B,f);
  if(j<2.5) return bsp(A,M,B,B,f);
  return bsp(M,B,B,B,f);
}`;
