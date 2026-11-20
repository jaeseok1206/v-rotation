"""icons/icon-192.png, icon-512.png 생성 (Pillow 필요)."""
import pathlib
from PIL import Image, ImageDraw
root = pathlib.Path(__file__).resolve().parent.parent / 'icons'
for size in (192, 512):
    s = size / 512
    im = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=int(96 * s), fill='#0f1420')
    d.rectangle([136 * s, 56 * s, 376 * s, 456 * s], fill='#c9773c', outline='#f4e7d6', width=max(2, int(12 * s)))
    d.rectangle([130 * s, 250 * s, 382 * s, 262 * s], fill='#ffffff')
    for color, ys in (('#e2392f', (120, 200)), ('#2a6fd6', (312, 392))):
        for y in ys:
            for x in (196, 256, 316):
                r = 26 * s
                d.ellipse([x * s - r, y * s - r, x * s + r, y * s + r], fill=color, outline='#ffffff', width=max(1, int(6 * s)))
    im.save(root / f'icon-{size}.png')
    print('saved', size)
