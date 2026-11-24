"""Builds assets/tito/*.png (one horizontal strip per state) + manifest.json
from the raw Tito_Animation_Pack sheets.

usage: python tools/build_sprites.py <dir containing sprites/*.png> [out_dir]
Frame choices below come from reviewing every sheet frame-by-frame: idle padding
frames (identical poses), the clipped frame in tito_error (#9) and over-long tails
were dropped so nothing looks laggy or glitchy.
"""
import json, os, sys
from PIL import Image
sys.path.insert(0, os.path.dirname(__file__))
from slicer import extract, normalize

R = lambda a, b: list(range(a, b + 1))
PP = lambda seq: seq + seq[-2:0:-1]          # ping-pong without repeating the ends

# state -> source sheet, intro (plays once), loop (repeats), outro (plays on settle), fps
STATES = {
    'greeting':       dict(src='tito_greeting',       intro=R(1, 25), fps=12),
    'idle':           dict(src='tito_greeting',       loop=[1], fps=1),
    'listening':      dict(src='tito_listening',      loop=PP(R(0, 4)), fps=6),
    'listening_wave': dict(src='tito_listening_alt',  intro=R(1, 19), fps=12),
    'searching':      dict(src='tito_searching',      intro=R(0, 9), loop=PP(R(10, 19)), outro=R(20, 26), fps=12),
    'loading':        dict(src='tito_loading',        intro=R(0, 4), loop=R(5, 16), outro=R(17, 24), fps=14),
    'thinking':       dict(src='tito_thinking',       intro=R(0, 9), loop=PP(R(11, 19)), outro=R(21, 29), fps=12),
    'typing':         dict(src='tito_typing',         intro=R(0, 10), loop=PP(R(11, 19)), outro=R(20, 32), fps=12),
    'talking':        dict(src='tito_talking',        intro=R(1, 4), loop=PP(R(5, 9)), outro=R(10, 23), fps=11),
    'talking_alt':    dict(src='tito_talking_alt',    intro=R(1, 4), loop=PP(R(5, 9)), outro=R(10, 26), fps=11),
    'confused':       dict(src='tito_confused',       intro=[3, 4] + R(5, 8) + R(10, 28), fps=12),
    'error':          dict(src='tito_error',          intro=R(2, 8) + R(10, 25), fps=12),
    'success':        dict(src='tito_success',        intro=R(2, 23), fps=12),
    'success_alt':    dict(src='tito_success_alt',    intro=R(3, 28), fps=12),
}

def main(pack, out):
    os.makedirs(out, exist_ok=True)
    cache, manifest = {}, {}
    for name, st in STATES.items():
        if st['src'] not in cache:
            info, _ = extract(os.path.join(pack, 'sprites', st['src'] + '.png'))
            cache[st['src']] = normalize(info)
        frames = cache[st['src']]
        used = sorted({i for k in ('intro', 'loop', 'outro') for i in st.get(k, [])})
        remap = {src: n for n, src in enumerate(used)}
        w, h = frames[0].size
        strip = Image.new('RGBA', (w * len(used), h), (0, 0, 0, 0))
        for n, src in enumerate(used): strip.paste(frames[src], (n * w, 0))
        strip.save(os.path.join(out, name + '.png'), optimize=True)
        m = dict(file=name + '.png', w=w, h=h, fps=st['fps'], count=len(used))
        for k in ('intro', 'loop', 'outro'): m[k] = [remap[i] for i in st.get(k, [])]
        manifest[name] = m
        secs = (len(m['intro']) + len(m['outro'])) / st['fps']
        print(f"{name:15} {len(used):2} frames {w}x{h}  intro+outro {secs:.1f}s  loop {len(m['loop'])} frames")
    json.dump(manifest, open(os.path.join(out, 'manifest.json'), 'w'), indent=1)
    # loaded with a <script> tag (fetch() of file:// JSON is blocked in the renderer)
    with open(os.path.join(out, 'manifest.js'), 'w') as f:
        f.write('window.TITO_MANIFEST = ' + json.dumps(manifest) + ';\n')

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), '..', 'assets', 'tito'))
