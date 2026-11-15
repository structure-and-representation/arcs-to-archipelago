// Recommended particle shaders for src/scene/particles.js.
// uColor: pass the theme token's sRGB components directly (hex / 255); ShaderMaterial does no colour-space conversion.
// Prepend GLSL_ARC from geometry/arc.js (provides uNodes, uMorph, uLean, uK, nodePos(), bsp()).
// Draw as THREE.Points, two objects (below-ground pass, above-ground pass) sharing one slot buffer;
// each pass has its own geometry.drawRange (CPU orders slots [below | above] per selection state).
export const PARTICLE_VERT = /* glsl */`
uniform sampler2D uCounts;   // R32F, 47 x (47*NY), NearestFilter; texel (d, year*47 + o) = people (exact ints)
uniform int   uYearA, uYearB;
uniform float uYearMix;      // 0..1
uniform float uPhase;        // fract(timeSec / 14.0), computed on the CPU (double); 0 when still=1
uniform float uStill;        // 1 = reduced motion (static stipple)
uniform float uSize;         // point diameter, device px (CSS px * DPR)
uniform float uAlpha;        // global particle opacity
uniform float uSel[47];      // 1 = in selection
uniform float uHasSel;       // 1 = a region is selected
uniform float uPass;         // +1 above ground, -1 below ground
in vec3 aSlot;               // o, d, k (k = 0-based slot index on the arc)
out float vA;

uint hash(uint x){ x ^= x >> 16; x *= 0x7feb352du; x ^= x >> 15; x *= 0x846ca68bu; x ^= x >> 16; return x; }
float u01(uint x){ return float(hash(x) >> 8) * (1.0 / 16777216.0); }

// arc-length fraction s -> B-spline parameter t (same for every arc: all arcs are similar curves)
float arcT(float s){
  const float C = 5.510779, S0 = 0.0861059;          // segment 0 [A,A,A,M] is straight: s = C t^3
  if (s < S0)       return pow(max(s, 0.0) / C, 1.0 / 3.0);
  if (s > 1.0 - S0) return 1.0 - pow(max(1.0 - s, 0.0) / C, 1.0 / 3.0);
  float x = s - 0.5, x2 = x * x;
  return 0.5 + x * (0.52318546 + x2 * (0.0844248 + x2 * 2.19156312));
}

void main(){
  int o = int(aSlot.x), d = int(aSlot.y); float k = aSlot.z;
  float side = uHasSel > 0.5 ? (uSel[d] > 0.5 ? 1.0 : -1.0) : (o > d ? 1.0 : -1.0);
  bool vis = (uHasSel < 0.5 || uSel[o] != uSel[d]) && side == uPass;   // redundant if drawRange is used
  float n = mix(texelFetch(uCounts, ivec2(d, uYearA * 47 + o), 0).r,
                texelFetch(uCounts, ivec2(d, uYearB * 47 + o), 0).r, uYearMix) * 0.01;
  float w = clamp(n - k, 0.0, 1.0);                  // sum over k of w == people / 100
  if (!vis || w <= 0.0) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); gl_PointSize = 0.0; vA = 0.0; return; }

  float g = fract(k * 0.618034 + u01(uint(o * 47 + d)));   // golden-ratio slot + per-arc random
  float s = uStill > 0.5 ? 0.04 + 0.92 * g : fract(g + uPhase);
  float t = arcT(s);

  vec2 a2 = nodePos(aSlot.x), b2 = nodePos(aSlot.y);       // one arc evaluation per particle
  vec2 dd = b2 - a2; float ch = max(length(dd), 1e-4);
  vec3 R = vec3(-dd.y, 0.0, dd.x) / ch;
  vec3 A = vec3(a2.x, 0.0, a2.y), B = vec3(b2.x, 0.0, b2.y);
  vec3 M = (A + B) * 0.5 + vec3(sin(uLean) * R.x, side * cos(uLean), sin(uLean) * R.z) * (uK * ch);
  float u = min(t, 0.99999) * 4.0; float j = floor(u); float f = u - j;
  vec3 p = j < 0.5 ? bsp(A, A, A, M, f) : j < 1.5 ? bsp(A, A, M, B, f) : j < 2.5 ? bsp(A, M, B, B, f) : bsp(M, B, B, B, f);

  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  gl_PointSize = uSize + 1.0;                               // +1 px for the AA ramp
  vA = uAlpha * w * smoothstep(0.0, 0.04, s) * smoothstep(1.0, 0.96, s);
}`;

export const PARTICLE_FRAG = /* glsl */`
uniform vec3 uColor; uniform float uSize;
in float vA; out vec4 outColor;
void main(){
  float r = length(gl_PointCoord * 2.0 - 1.0) * (uSize + 1.0) * 0.5;
  float a = clamp(uSize * 0.5 - r + 0.5, 0.0, 1.0) * vA;
  if (a <= 0.0) discard;
  outColor = vec4(uColor, a);
}`;
