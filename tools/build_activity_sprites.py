"""Adds the 14 activity animations to assets/tito (strips + manifest.json/js).

usage: python tools/build_activity_sprites.py <dir with 01_*.png ... 07_*.png> [out_dir] [--preview dir]
Each sheet is 12 columns x 2 rows (one animation per row). Cells are cut on the exact grid, cleaned of the
faint halo left by background removal, cropped to one shared box per animation (no jitter) and scaled up to
match the size of the existing Tito sprites.
"""
import glob, json, os, sys
import numpy as np
from PIL import Image
from scipy import ndimage

R = lambda a, b: list(range(a, b + 1))
PP = lambda seq: seq + seq[-2:0:-1]          # ping-pong without repeating the ends

# name -> (sheet number, row, intro, loop, outro, fps)
STATES = {
    'sleeping':      (1, 0, R(0, 4),  PP(R(5, 9)),  [],         8),
    'wake_up':       (1, 1, R(0, 11), [],           [],         10),
    'dancing':       (2, 0, [],       R(0, 11),     [],         10),
    'headphones':    (2, 1, R(0, 3),  R(4, 11),     [],         10),
    'alarm':         (3, 0, R(0, 3),  PP(R(4, 8)),  R(9, 11),   12),
    'worried':       (3, 1, R(0, 3),  PP(R(4, 7)),  R(8, 11),   10),
    'celebrate':     (4, 0, R(0, 11), [],           [],         12),
    'studying':      (4, 1, [],       PP(R(0, 11)), [],         6),
    'cheer':         (5, 0, R(0, 11), [],           [],         12),
    'oops':          (5, 1, R(0, 11), [],           [],         10),
    'mic_listening': (6, 0, [],       PP(R(0, 11)), [],         8),
    'checklist':     (6, 1, R(0, 11), [],           [],         9),
    'streak_fire':   (7, 0, R(0, 11), [],           [],         12),
    'drink_water':   (7, 1, R(0, 11), [],           [],         9),
}
COLS, SCALE, PAD = 12, 1.35, 6
BIG_AREA = 2500
GLOW_CUT = 170
ALPHA_CUT = 48                                # below this a pixel is background-removal haze, not part of Tito


def clean(im):
    """Drop faint haze left by background removal and re-stretch the alpha of what remains."""
    a = np.asarray(im).copy(); al = a[..., 3].astype(np.int32)
    out = np.clip((al - ALPHA_CUT) * 255 // (255 - ALPHA_CUT), 0, 255); out[al < ALPHA_CUT] = 0
    a[..., 3] = out; a[(out == 0)] = 0
    return Image.fromarray(a, 'RGBA')


def cells(sheet, row):
    """Split one row into 12 frames. Frames are not perfectly separated (ears, arms and sparkles cross the grid),
    so every connected shape is given to the frame whose character it belongs to instead of cutting on a straight line."""
    s = Image.open(sheet).convert('RGBA'); W, H = s.size; cw = W / COLS; rh = H // 2
    row_im = clean(s.crop((0, row * rh, W, (row + 1) * rh))); arr = np.asarray(row_im)
    lab, n = ndimage.label(arr[..., 3] > 0, structure=np.ones((3, 3)))
    objs = ndimage.find_objects(lab); area = ndimage.sum(np.ones_like(lab), lab, range(1, n + 1))
    big = [i for i in range(n) if area[i] > BIG_AREA]
    owner, wide = {}, set()
    for i in big:
        sl = objs[i]; x0, x1 = sl[1].start, sl[1].stop
        if x1 - x0 > 1.5 * cw: wide.add(i + 1); continue                       # shapes that merged across frames: cut on the grid
        cx = ndimage.center_of_mass(lab == i + 1)[1]; owner[i + 1] = min(COLS - 1, int(cx // cw))
    for i in range(n):                                                          # small shapes (notes, sparks, water drops) join the nearest character
        if i + 1 in owner or i + 1 in wide: continue
        sl = objs[i]; best, bd = None, 1e9
        for j in big:
            if j + 1 not in owner: continue
            bs = objs[j]; dx = max(bs[1].start - sl[1].stop, sl[1].start - bs[1].stop, 0); dy = max(bs[0].start - sl[0].stop, sl[0].start - bs[0].stop, 0)
            d = (dx * dx + dy * dy) ** .5
            if d < bd: bd, best = d, owner[j + 1]
        owner[i + 1] = best if best is not None and bd < 70 else min(COLS - 1, int(((sl[1].start + sl[1].stop) / 2) // cw))
    cell_of = np.full(n + 1, -1); 
    for k, v in owner.items(): cell_of[k] = v
    frames = []; M = int(cw * 0.45)
    for i in range(COLS):
        mask = cell_of[lab] == i
        for k in wide:
            xs = np.arange(W)[None, :]; mask |= (lab == k) & (xs >= round(i * cw)) & (xs < round((i + 1) * cw)) & (arr[..., 3] >= GLOW_CUT)   # a glow spanning frames would show hard edges: keep only its bright core
        f = arr.copy(); f[~mask] = 0
        canvas = np.zeros((rh, int(cw) + 2 * M, 4), np.uint8); lo = round(i * cw) - M; hi = lo + canvas.shape[1]
        a0, a1 = max(lo, 0), min(hi, W); canvas[:, a0 - lo:a1 - lo] = f[:, a0:a1]
        frames.append(Image.fromarray(canvas, 'RGBA'))
    return frames


def main(src, out, preview=None):
    os.makedirs(out, exist_ok=True); manifest = json.load(open(os.path.join(out, 'manifest.json')))
    if preview: os.makedirs(preview, exist_ok=True)
    for name, (num, row, intro, loop, outro, fps) in STATES.items():
        sheet = glob.glob(os.path.join(src, f'{num:02d}_*.png'))[0]
        frames = cells(sheet, row)
        used = sorted(set(intro + loop + outro)); remap = {s: n for n, s in enumerate(used)}
        boxes = [frames[i].getbbox() for i in used]; boxes = [b for b in boxes if b]
        x0 = max(0, min(b[0] for b in boxes) - PAD); y0 = max(0, min(b[1] for b in boxes) - PAD)
        x1 = max(b[2] for b in boxes) + PAD; y1 = max(b[3] for b in boxes) + PAD
        w, h = round((x1 - x0) * SCALE), round((y1 - y0) * SCALE)
        strip = Image.new('RGBA', (w * len(used), h), (0, 0, 0, 0))
        for n, s in enumerate(used):
            f = frames[s].crop((x0, y0, x1, y1)).resize((w, h), Image.LANCZOS); strip.paste(f, (n * w, 0))
        strip.save(os.path.join(out, name + '.png'), optimize=True)
        manifest[name] = dict(file=name + '.png', w=w, h=h, fps=fps, count=len(used), intro=[remap[i] for i in intro], loop=[remap[i] for i in loop], outro=[remap[i] for i in outro])
        if preview:                                   # contact sheet on a cream card, to check the cut by eye
            bg = Image.new('RGBA', strip.size, (255, 243, 234, 255)); bg.alpha_composite(strip); bg.convert('RGB').save(os.path.join(preview, name + '.png'))
        print(f'{name:14} {len(used):2} frames {w}x{h} fps {fps}')
    json.dump(manifest, open(os.path.join(out, 'manifest.json'), 'w'), indent=1)
    with open(os.path.join(out, 'manifest.js'), 'w') as f: f.write('window.TITO_MANIFEST = ' + json.dumps(manifest) + ';\n')


if __name__ == '__main__':
    a = [x for x in sys.argv[1:]]
    prev = None
    if '--preview' in a: i = a.index('--preview'); prev = a[i + 1]; del a[i:i + 2]
    main(a[0], a[1] if len(a) > 1 else os.path.join(os.path.dirname(__file__), '..', 'assets', 'tito'), prev)
