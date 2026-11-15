# 1D simulation of the shader: rows = year mix 0..1, x = arc-length position s, dot alpha = w * endfade
import math
from PIL import Image, ImageDraw
vA, vB = 3870, 2515      # Kanagawa -> Miyagi, 2012 -> 2025
r0 = 0.3717
Wd, rows, rh = 900, 25, 16
def draw(mode, out):
    im = Image.new('RGB', (Wd+40, rows*rh+30), (246,243,236)); d = ImageDraw.Draw(im)
    d.text((5,5), {'golden':'moving/golden: s = fract(k*phi + r0) (phase fixed), 3870 -> 2515 people','even':'reduced (k+0.5)/n: n = ceil(v/100)', 'goldstill':'reduced golden: s = 0.04+0.92*fract(k*phi+r0)'}[mode], fill=(180,0,0))
    for r in range(rows):
        m = r/(rows-1); n = (vA*(1-m)+vB*m)/100; y = 30 + r*rh + rh//2
        for k in range(40):
            w = min(max(n-k,0),1)
            if w <= 0: continue
            if mode=='golden': s = (k*0.618034 + r0) % 1
            elif mode=='goldstill': s = 0.04 + 0.92*((k*0.618034 + r0) % 1)
            else: s = (k+0.5)/math.ceil(n)
            fade = min(1, s/0.04) * min(1, (1-s)/0.04)
            a = w*fade; c = tuple(int(246 + (27-246)*a) for _ in range(3))
            x = 20 + s*Wd; d.ellipse((x-3,y-3,x+3,y+3), fill=c)
    im.save(out)
for m in ('golden','even','goldstill'): draw(m, f'shots/strip_{m}.png')
