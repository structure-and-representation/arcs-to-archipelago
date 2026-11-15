// Checks that the GLSL hash/u01 (as in particles-final-glsl.js) equal reference.js on a real WebGL2 context.
// Run: node hashcheck.cjs   (needs playwright + chromium)
const { chromium } = require('playwright');
(async () => {
  const ref = await import('./reference.js');
  const b = await chromium.launch(); const p = await b.newPage();
  const res = await p.evaluate(() => {
    const c = document.createElement('canvas'); const gl = c.getContext('webgl2');
    gl.getExtension('EXT_color_buffer_float');
    const vs = `#version 300 es
      uint hash(uint x){ x ^= x >> 16; x *= 0x7feb352du; x ^= x >> 15; x *= 0x846ca68bu; x ^= x >> 16; return x; }
      float u01(uint x){ return float(hash(x) >> 8) * (1.0 / 16777216.0); }
      out vec4 v; void main(){ uint id = uint(gl_VertexID); uint h = hash(id);
        v = vec4(float(h >> 16), float(h & 0xffffu), u01(id), 0.0);
        gl_Position = vec4((float(gl_VertexID % 64) + 0.5) / 32.0 - 1.0, (float(gl_VertexID / 64) + 0.5) / 32.0 - 1.0, 0.0, 1.0); gl_PointSize = 1.0; }`;
    const fs = `#version 300 es
      precision highp float; in vec4 v; out vec4 o; void main(){ o = v; }`;
    const sh = (t, s) => { const x = gl.createShader(t); gl.shaderSource(x, s); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw gl.getShaderInfoLog(x); return x; };
    const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(pr);
    const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex); gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA32F, 64, 64);
    const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.viewport(0, 0, 64, 64); gl.useProgram(pr); gl.bindVertexArray(gl.createVertexArray()); gl.drawArrays(gl.POINTS, 0, 4096);
    const out = new Float32Array(4096 * 4); gl.readPixels(0, 0, 64, 64, gl.RGBA, gl.FLOAT, out); return Array.from(out);
  });
  let bad = 0;
  for (let id = 0; id < 4096; id++) {
    const h = res[id * 4] * 65536 + res[id * 4 + 1];
    if (h !== ref.hash(id) || res[id * 4 + 2] !== Math.fround(ref.u01(id))) bad++;
  }
  console.log(bad ? `FAIL ${bad}/4096 ids differ` : 'ok   GLSL hash/u01 == reference.js for ids 0..4095');
  await b.close();
})();
