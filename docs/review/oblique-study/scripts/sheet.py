# 使い方: python3 sheet.py <撮影ディレクトリ> <出力.png> <見出し> <crop x0,y0,x1,y1> <scale> <cols> <名前:ラベル:説明>...
import sys
from PIL import Image, ImageDraw, ImageFont
src, out, title, crop, scale, cols = sys.argv[1:7]
items = [a.split('|') for a in sys.argv[7:]]
crop = tuple(int(v) for v in crop.split(',')); scale = float(scale); cols = int(cols)
F = '/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf'
try: ImageFont.truetype(F, 10)
except Exception: F = '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc'
f1, f2, f0 = ImageFont.truetype(F, 26), ImageFont.truetype(F, 18), ImageFont.truetype(F, 34)
tw, th = int((crop[2]-crop[0])*scale), int((crop[3]-crop[1])*scale)
cap = 70; pad = 16
rows = (len(items)+cols-1)//cols
W = cols*(tw+pad)+pad; H = 70 + rows*(th+cap+pad)+pad
sheet = Image.new('RGB', (W, H), (255, 255, 255)); d = ImageDraw.Draw(sheet)
d.text((pad, 18), title, font=f0, fill=(0, 0, 0))
for i, (file, label, sub) in enumerate(items):
    r, c = divmod(i, cols); x = pad + c*(tw+pad); y = 70 + r*(th+cap+pad)
    im = Image.open(f'{src}/{file}').convert('RGB')
    k = im.width / 1440 if im.width > 1000 else im.width / int(sys.argv[2].split('@')[-1]) if False else im.width / im.width
    im = im.crop(crop).resize((tw, th), Image.LANCZOS)
    d.text((x, y+4), label, font=f1, fill=(160, 40, 20) if label.startswith('推奨') else (0, 0, 0))
    d.text((x, y+38), sub, font=f2, fill=(70, 70, 70))
    sheet.paste(im, (x, y+cap)); d.rectangle([x-1, y+cap-1, x+tw, y+cap+th], outline=(180, 180, 180))
sheet.save(out); print(out, sheet.size)
