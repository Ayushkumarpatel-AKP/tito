import os, glob, sys, json
from PIL import Image, ImageDraw
import numpy as np
from scipy import ndimage as ndi

def extract(path):
    arr = np.array(Image.open(path).convert('RGBA')); al = arr[..., 3]
    solid = al > 128
    lab, n = ndi.label(solid); sl = ndi.find_objects(lab)
    areas = ndi.sum(solid, lab, range(1, n + 1))
    mx = areas.max()
    big = [i for i in range(n) if areas[i] > mx * 0.35]
    cen = lambda i: ((sl[i][0].start + sl[i][0].stop) / 2, (sl[i][1].start + sl[i][1].stop) / 2)
    groups = {b: [b] for b in big}
    for i in range(n):
        if i in groups or areas[i] < 12: continue
        d = ndi.distance_transform_edt(lab != i + 1)
        best = min(big, key=lambda b: d[lab == b + 1].min())
        if d[lab == best + 1].min() < 90: groups[best].append(i)
    # rows by y centre
    order = sorted(big, key=lambda b: cen(b)[0]); rows = []
    hgt = np.median([sl[b][0].stop - sl[b][0].start for b in big])
    for b in order:
        if rows and abs(cen(b)[0] - np.mean([cen(x)[0] for x in rows[-1]])) < hgt * 0.5: rows[-1].append(b)
        else: rows.append([b])
    seq = []
    for r, row in enumerate(rows):
        for b in sorted(row, key=lambda b: cen(b)[1]): seq.append((r, b))
    info = []
    for r, b in seq:
        mask = np.isin(lab, [g + 1 for g in groups[b]])
        mask = ndi.binary_dilation(mask, iterations=2) & (al > 10)
        a = arr.copy(); a[~mask] = (0, 0, 0, 0)
        info.append(dict(r=r, a=a, cx=cen(b)[1], bot=sl[b][0].stop, top=sl[b][0].start))
    # per-row drift removal: subtract row median bottom, add global median
    rm = {r: np.median([f['bot'] for f in info if f['r'] == r]) for r in set(f['r'] for f in info)}
    for f in info: f['rm'] = int(round(rm[f['r']]))
    return info, len(rows)

def normalize(info, pad=10):
    # window around anchor per frame
    HW = 160
    wins = []
    for f in info:
        a = f['a']; H, W = a.shape[:2]
        cx = int(round(f['cx'])); 
        out = np.zeros((420, 2 * HW, 4), np.uint8)   # row's feet line -> y=340
        ty = 340 - f['rm']
        ys0 = max(0, -ty); ys1 = min(H, 420 - ty)
        xs0 = max(0, cx - HW); xs1 = min(W, cx + HW)
        out[ys0 + ty:ys1 + ty, xs0 - (cx - HW):xs1 - (cx - HW)] = a[ys0:ys1, xs0:xs1]
        wins.append(out)
    ys = []; xs = []
    for w in wins:
        yy, xx = np.where(w[..., 3] > 0); ys += [yy.min(), yy.max()]; xs += [xx.min(), xx.max()]
    y0, y1, x0, x1 = max(min(ys) - pad, 0), max(ys) + pad + 1, max(min(xs) - pad, 0), max(xs) + pad + 1
    return [Image.fromarray(w[y0:y1, x0:x1]) for w in wins]

if __name__ == '__main__':
    os.makedirs('frames', exist_ok=True); os.makedirs('contacts', exist_ok=True)
    for p in sorted(glob.glob('pack/sprites/*.png')):
        name = os.path.basename(p)[:-4]
        info, nrows = extract(p)
        fr = normalize(info)
        d = f'frames/{name}'; os.makedirs(d, exist_ok=True)
        for i, f in enumerate(fr): f.save(f'{d}/{i:02d}.png')
        print(name, len(fr), 'frames', nrows, 'rows', fr[0].size)
        # contact with numbers
        cols = 10; fw, fh = fr[0].size; sc = 0.55
        tw, th = int(fw * sc), int(fh * sc)
        rows_n = (len(fr) + cols - 1) // cols
        sheet = Image.new('RGBA', (cols * tw, rows_n * th), (190, 120, 230, 255))
        dr = ImageDraw.Draw(sheet)
        for i, f in enumerate(fr):
            t = f.resize((tw, th), Image.LANCZOS); x, y = (i % cols) * tw, (i // cols) * th
            sheet.alpha_composite(t, (x, y)); dr.rectangle((x, y, x + 34, y + 20), fill=(0, 0, 0, 255)); dr.text((x + 4, y + 4), str(i), fill=(255, 255, 0, 255))
        sheet.convert('RGB').save(f'contacts/{name}.png')
