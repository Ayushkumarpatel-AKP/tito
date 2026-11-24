"""Makes a harmless fake "screen" for the self-test so the real desktop is never captured.
usage: python tools/make-test-backdrop.py out.jpg"""
import sys
from PIL import Image, ImageDraw, ImageFont
W, H = 1920, 1080
im = Image.new('RGB', (W, H), (246, 244, 240)); d = ImageDraw.Draw(im)
F = lambda n, s: ImageFont.truetype(f'C:/Windows/Fonts/{n}', s)
d.rectangle((0, 0, W, 70), fill=(36, 41, 56)); d.text((40, 20), 'Reading list  -  daily-notes.html', font=F('segoeui.ttf', 28), fill=(220, 225, 235))
d.text((120, 130), 'Notes from the week', font=F('segoeuib.ttf', 54), fill=(40, 40, 60))
body = F('segoeui.ttf', 30)
for i, line in enumerate(['The library opens at nine and closes at six on weekdays.', 'Ask the librarian if you cannot find a book.']):
    d.text((120, 220 + i * 46), line, font=body, fill=(70, 70, 90))
d.text((560, 440), 'Où est la bibliothèque, s\u2019il vous plaît ?', font=F('segoeuib.ttf', 40), fill=(150, 40, 70))
d.text((560, 500), 'Je voudrais emprunter ce livre pour une semaine.', font=F('segoeui.ttf', 34), fill=(60, 60, 80))
d.rounded_rectangle((1040, 300, 1500, 600), 18, fill=(28, 30, 40))
code = F('consola.ttf', 26)
for i, line in enumerate(["const items = undefined;", "items.map((x) => x * 2);", "", "TypeError: Cannot read properties", "of undefined (reading 'map')"]):
    d.text((1070, 330 + i * 44), line, font=code, fill=(255, 120, 120) if i >= 3 else (180, 230, 190))
d.rectangle((120, 700, 920, 940), outline=(180, 180, 195), width=3)
for k, (v, c) in enumerate([(120, (255, 130, 160)), (200, (120, 180, 255)), (90, (150, 220, 170)), (170, (255, 200, 110))]):
    d.rectangle((170 + k * 180, 920 - v, 290 + k * 180, 920), fill=c)
d.text((140, 710), 'Books borrowed per day', font=F('segoeui.ttf', 26), fill=(90, 90, 110))
im.save(sys.argv[1], quality=92); print('wrote', sys.argv[1])
