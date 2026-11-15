"""Derive the arc-length -> B-spline parameter conversion used by the particle shader.

Every arc is the uniform cubic B-spline over [A,A,A,M,B,B,B] with M = mid(A,B) + n*K*|AB|
(n is a unit vector perpendicular to the chord), so all arcs are similar curves and one
universal map s (arc-length fraction, 0..1) -> t (spline parameter, 0..1) serves all of them.

Run: python3 -I arclen.py      (needs numpy)
"""
import math
import numpy as np

K = 230 / 1160
A, B, M = (0.0, 0.0), (1.0, 0.0), (0.5, K)
P = [A, A, A, M, B, B, B]

def bs(p, f):
    b0 = (1 - f) ** 3 / 6; b1 = (3 * f**3 - 6 * f**2 + 4) / 6
    b2 = (-3 * f**3 + 3 * f**2 + 3 * f + 1) / 6; b3 = f**3 / 6
    return tuple(b0 * p[0][k] + b1 * p[1][k] + b2 * p[2][k] + b3 * p[3][k] for k in range(2))

def pt(t):
    u = min(t, 0.9999999) * 4; j = int(u); return bs(P[j:j + 4], u - j)

N = 200000
ts = np.arange(N + 1) / N
pts = np.array([pt(t) for t in ts])
seg = np.hypot(*np.diff(pts, axis=0).T)
s = np.concatenate([[0], np.cumsum(seg)]); L = s[-1]; s /= L
print(f"arc length / chord = {L:.7f}; apex height / chord = {pt(0.5)[1]:.7f}")

# segment 0 ([A,A,A,M]) is a straight line from A towards M: point = A + (M-A) f^3 / 6, f = 4t
C = math.hypot(*np.subtract(M, A)) / 6 * 64 / L
S0 = s[N // 4]
print(f"segment 0: s = C t^3, C = {C:.6f}; S0 = s(t=0.25) = {S0:.7f}  (check C*0.25^3 = {C*0.25**3:.7f})")

# middle: odd polynomial in x = s - 0.5 for t - 0.5, fitted on [S0, 1-S0]
i0, i1 = N // 4, 3 * N // 4
x = s[i0:i1 + 1] - 0.5; y = ts[i0:i1 + 1] - 0.5
X = np.stack([x, x**3, x**5], 1); c, *_ = np.linalg.lstsq(X, y, rcond=None)
print("middle: t = 0.5 + x*(c1 + x^2*(c3 + c5*x^2)),  c1,c3,c5 =", ", ".join(f"{v:.8f}" for v in c))

def arcT(v):
    if v < S0: return (v / C) ** (1 / 3)
    if v > 1 - S0: return 1 - ((1 - v) / C) ** (1 / 3)
    z = v - 0.5; return 0.5 + z * (c[0] + z * z * (c[1] + c[2] * z * z))

err_t = max(abs(arcT(sv) - tv) for sv, tv in zip(s[::50], ts[::50]))
# error expressed in arc length
err_s = max(abs(np.interp(arcT(v), ts, s) - v) for v in np.linspace(0, 1, 4001))
print(f"max |t error| = {err_t:.5f}; max arc-length error = {err_s:.5f} of the arc")
print(f"jump at S0: poly gives {arcT(S0 + 1e-12):.5f} vs 0.25")
print("share of arc length covered by t in [0,0.2]:", round(float(s[int(0.2 * N)]), 4),
      "-> with uniform t, 40% of particles sit in", round(2 * float(s[int(0.2 * N)]) * 100, 1), "% of the length")
