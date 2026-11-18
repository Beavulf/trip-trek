from pathlib import Path
from PIL import Image

media = Path(__file__).parent / "media"
for source in media.glob("*.webp"):
    target = source.with_suffix(".png")
    with Image.open(source) as image:
        image.save(target, "PNG", optimize=True)
    print(f"{source.name} -> {target.name}")
