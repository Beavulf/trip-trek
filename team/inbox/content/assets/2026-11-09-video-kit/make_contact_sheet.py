from pathlib import Path
from PIL import Image, ImageDraw

root = Path(__file__).parent
preview = root.parent / "2026-11-09-video-kit-preview"
thumb_w, thumb_h = 270, 480
margin, gap = 24, 16
width = margin * 2 + thumb_w * 3 + gap * 2
height = margin * 2 + thumb_h * 2 + gap
sheet = Image.new("RGB", (width, height), "#201d1a")
for index in range(6):
    with Image.open(preview / f"page-{index + 1}.png") as source:
        image = source.convert("RGB")
        image.thumbnail((thumb_w, thumb_h), Image.Resampling.LANCZOS)
        x = margin + (index % 3) * (thumb_w + gap)
        y = margin + (index // 3) * (thumb_h + gap)
        sheet.paste(image, (x, y))
out = root / "preview-all.jpg"
sheet.save(out, "JPEG", quality=90, optimize=True)
print(out)
