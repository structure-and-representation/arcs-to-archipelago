// Self-check of reference.js against the data. Run: node check.mjs path/to/od.json
import fs from 'fs';
import * as R from './reference.js';
const od = JSON.parse(fs.readFileSync(process.argv[2] || 'od.json', 'utf8'));
const { years, matrices } = od;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };

const { per, total } = R.slotBudget(years, matrices);
ok(total === 26206, `slot budget = ${total}`);
let mx = 0; per.forEach(v => { mx = Math.max(mx, v); }); ok(mx === 887, `max slots per arc = ${mx}`);

const buf = new Float32Array(total * 3);
const nat = R.orderSlots(per, null, buf);
ok(nat.below.count + nat.above.count === total, `national: below ${nat.below.count} + above ${nat.above.count}`);
const sel = new Uint8Array(47); [10, 11, 12, 13].forEach(i => { sel[i] = 1; });
const tk = R.orderSlots(per, sel, buf);
ok(tk.below.count > 0 && tk.above.count > 0 && tk.below.count + tk.above.count < total,
   `tokyo selected: below ${tk.below.count} + above ${tk.above.count} (internal and unrelated arcs dropped)`);

// sum of weights equals people/100 for every arc, every year, and mid-interpolation
let worst = 0;
for (let yi = 0; yi + 1 < years.length; yi++) {
  const a = matrices[years[yi]], b = matrices[years[yi + 1]];
  for (let i = 0; i < 2209; i++) for (const m of [0, 0.37, 1]) {
    const v = a[i] * (1 - m) + b[i] * m; let sum = 0;
    for (let k = 0; k < per[i]; k++) sum += R.slotWeight(v, k);
    worst = Math.max(worst, Math.abs(sum - v / 100));
  }
}
ok(worst < 1e-9, `sum of slot weights == people/100 (max error ${worst})`);

// golden-ratio layout: gap ratio <= phi^2 and each new slot lands in a largest gap
let ratio = 0, inLargest = 0, tries = 0;
for (let n = 2; n < 900; n++) {
  const p = Array.from({ length: n }, (_, k) => (k * R.PHI) % 1).sort((x, y) => x - y);
  const gaps = p.map((x, i) => (i + 1 < n ? p[i + 1] - x : 1 - x + p[0]));
  const gmax = Math.max(...gaps); ratio = Math.max(ratio, gmax / Math.min(...gaps));
  const x = (n * R.PHI) % 1; let i = p.findIndex(v => v > x); if (i < 0) i = n;
  const g = i > 0 && i < n ? p[i] - p[i - 1] : 1 - p[n - 1] + p[0];
  tries++; if (Math.abs(g - gmax) < 1e-9) inLargest++;
}
ok(ratio <= 2.63, `max gap / min gap = ${ratio.toFixed(4)} (<= 2.63; phi^2 = 2.618 for exact phi)`);
ok(inLargest === tries, `new slot lands in a largest gap: ${inLargest}/${tries}`);

// arcT: monotonic, endpoints, small jump at the segment boundary
let prev = -1, mono = true;
for (let i = 0; i <= 10000; i++) { const t = R.arcT(i / 10000); if (t < prev - 1e-12) mono = false; prev = t; }
ok(mono && R.arcT(0) === 0 && Math.abs(R.arcT(1) - 1) < 1e-12 && Math.abs(R.arcT(0.5) - 0.5) < 1e-12, 'arcT monotonic, arcT(0)=0, arcT(0.5)=0.5, arcT(1)=1');

// still layout stays inside the unfaded range
let inside = true;
for (let i = 0; i < 2209; i++) for (let k = 0; k < per[i]; k++) {
  const s = R.slotS(Math.floor(i / 47), i % 47, k, 0, true); if (s < 0.04 || s > 0.96) inside = false;
}
ok(inside, 'still layout: all slots within [0.04, 0.96]');
console.log('hash(0..3) =', [0, 1, 2, 3].map(R.hash).join(', '));
