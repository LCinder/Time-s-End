"""Contact sheet for reviewing screenshots: a grid of labelled thumbnails in one image.

    python3 tools/playtest/sheet.py out.jpg shot1.png shot2.png ...   [--cols 3] [--w 640]

The label under each thumbnail is the file name (ev_hunt.png -> "hunt")."""
import sys
from pathlib import Path
from PIL import Image, ImageDraw

args = sys.argv[1:]
cols = 3
w = 560
if '--cols' in args:
    i = args.index('--cols'); cols = int(args[i + 1]); del args[i:i + 2]
if '--w' in args:
    i = args.index('--w'); w = int(args[i + 1]); del args[i:i + 2]
out, files = args[0], [f for f in args[1:] if Path(f).exists()]
if not files:
    sys.exit('no images')
h = int(w * 9 / 16)
lab = 26
rows = (len(files) + cols - 1) // cols
sheet = Image.new('RGB', (cols * w, rows * (h + lab)), (20, 20, 20))
d = ImageDraw.Draw(sheet)
for k, f in enumerate(files):
    im = Image.open(f).convert('RGB').resize((w, h))
    x, y = (k % cols) * w, (k // cols) * (h + lab)
    sheet.paste(im, (x, y))
    name = Path(f).stem.removeprefix('ev_')
    d.text((x + 8, y + h + 6), name, fill=(240, 236, 228))
sheet.save(out, quality=85)
print(out, f'{len(files)} images')
