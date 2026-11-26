# python tools/stitch.py <slice folder> <out.png> <page height (ignored when slices.json exists)> [viewport height] [css width]
# Joins the screenfuls made by tools/shot-full.js into one long picture. The pictures are in device pixels, the page height is in CSS pixels.
# The top 100 px of every picture but the first is left out: it is the sticky menu bar, and the previous picture already shows that part.
import sys, glob, json, os
from PIL import Image
folder, out, total = sys.argv[1], sys.argv[2], int(sys.argv[3])
H = int(sys.argv[4]) if len(sys.argv) > 4 else 900; CW = int(sys.argv[5]) if len(sys.argv) > 5 else 1440
files = sorted(glob.glob(folder + '/slice-*.png'))
first = Image.open(files[0]); s = first.width / CW; top = round(100 * s)
meta = json.load(open(folder + '/slices.json')) if os.path.exists(folder + '/slices.json') else None
if meta: total = meta['total']; H = meta['h']
canvas = Image.new('RGB', (first.width, round(total * s)), 'white')
for i, f in enumerate(files):
    im = Image.open(f).convert('RGB'); y = round((meta['ys'][i] if meta else min(i * (H - 100), max(0, total - H))) * s)
    if i == 0: canvas.paste(im, (0, 0))
    else: canvas.paste(im.crop((0, top, im.width, im.height)), (0, y + top))
canvas.save(out); print('saved', out, canvas.size)
