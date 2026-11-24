"""Downloads the colourful 3dicons.co clay icons (CC0) and cuts them out of their white background.
usage: python tools/make-3d-assets.py  -> website/public/3d/*.webp (transparent)"""
import io, os, re, urllib.request
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

B = "https://bvconuycpdvgzbvbkijl.supabase.co/storage/v1/object/public/sizes"
CAT = r'C:/Users/Ayush/AppData/Local/Temp/icons_catalogue.txt'
OUT = os.path.join(os.path.dirname(__file__), '..', 'website', 'public', '3d')
WANT = "star heart rocket bulb flash target chat-text notebook file-text megaphone mic wifi computer lock shield key setting play moon magic-trick crown lab headphone tick picture folder calculator sun".split()

ids = {}
for line in open(CAT):
    m = re.match(r'sizes/([0-9a-f]{6})-(.+)$', line.strip())
    if m: ids.setdefault(m.group(2), m.group(1))

def cut(im):
    a = np.asarray(im.convert('RGB')).astype(np.float32)
    dist = 255 - a.min(axis=2)                       # 0 = pure white
    bg_like = dist < 9
    lab, n = ndi.label(bg_like)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bg = np.isin(lab, list(border))
    edge = ndi.binary_dilation(bg, iterations=3) & ~bg           # soft band next to the background
    alpha = np.ones(bg.shape, np.float32); alpha[bg] = 0
    alpha[edge] = np.clip(dist[edge] / 38.0, 0.0, 1.0)
    rgb = a.copy()
    k = np.maximum(alpha, 0.08)[..., None]
    rgb[edge] = np.clip((a[edge] - 255.0 * (1 - k[edge])) / k[edge], 0, 255)   # remove the white fringe
    out = np.dstack([rgb, alpha * 255]).astype(np.uint8)
    img = Image.fromarray(out, 'RGBA')
    bbox = img.getbbox()
    return img.crop(bbox) if bbox else img

done, size = [], 0
for n in WANT:
    if n not in ids: continue
    try:
        data = urllib.request.urlopen(f"{B}/{ids[n]}-{n}/dynamic/400/color.webp", timeout=30).read()
    except Exception as e:
        print('skip', n, e); continue
    img = cut(Image.open(io.BytesIO(data)))
    side = max(img.size); canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0)); canvas.paste(img, ((side - img.width) // 2, (side - img.height) // 2))
    canvas = canvas.resize((360, 360), Image.LANCZOS)
    p = os.path.join(OUT, n + '.webp'); canvas.save(p, 'WEBP', quality=90, alpha_quality=95, method=6); size += os.path.getsize(p); done.append(n)
print(len(done), 'icons', round(size / 1024), 'KB')
