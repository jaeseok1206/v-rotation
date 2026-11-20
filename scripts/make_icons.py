"""icons/logo-source.png(배구공) → 앱 아이콘/서브 표시용 이미지 생성 (Pillow 필요).
사용법: python3 scripts/make_icons.py
"""
import pathlib
from PIL import Image

root = pathlib.Path(__file__).resolve().parent.parent / 'icons'
src = Image.open(root / 'logo-source.png').convert('RGBA')
src = src.crop(src.getchannel('A').getbbox())          # 투명 여백 제거
side = max(src.size)
ball = Image.new('RGBA', (side, side), (0, 0, 0, 0))
ball.paste(src, ((side - src.width) // 2, (side - src.height) // 2))

def fit(size, scale, bg=None):
    canvas = Image.new('RGBA', (size, size), bg or (0, 0, 0, 0))
    b = int(size * scale)
    canvas.alpha_composite(ball.resize((b, b), Image.LANCZOS), ((size - b) // 2, (size - b) // 2))
    return canvas

for size in (192, 512):
    fit(size, 0.94).save(root / f'icon-{size}.png')                      # 일반 아이콘 (투명 배경)
fit(512, 0.72, (15, 20, 32, 255)).save(root / 'icon-maskable-512.png')  # 안드로이드 적응형 아이콘
fit(180, 0.86, (15, 20, 32, 255)).save(root / 'apple-touch-icon.png')
fit(64, 1.0).save(root / 'ball.png')                                     # 서브 표시용
print('done')
