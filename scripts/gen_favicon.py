"""Render PNG favicon set + .ico from a single PIL drawing primitive.

Doesn't depend on cairosvg / Inkscape — draws circle + 'P' directly with
Pillow so it runs anywhere Pillow is installed (the project's kneeAI
conda env qualifies). Output mirrors public/assets/icons/favicon.svg.
"""
from __future__ import annotations
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parent.parent / "public" / "assets" / "icons"
OUT.mkdir(parents=True, exist_ok=True)

TEAL  = (13, 148, 136, 255)      # #0D9488
WHITE = (255, 255, 255, 255)

# Sizes to emit
PNG_SIZES = [16, 32, 180, 192, 512]

# Font candidates — prefer something close to Inter Bold; fall back through
# Windows default heavy sans-serifs.
FONT_CANDIDATES = [
    r"C:\Windows\Fonts\segoeuib.ttf",   # Segoe UI Bold
    r"C:\Windows\Fonts\arialbd.ttf",    # Arial Bold
    r"C:\Windows\Fonts\Arial.ttf",
]


def find_font():
    for p in FONT_CANDIDATES:
        if Path(p).exists():
            return p
    return None


def render(size: int, font_path: str | None) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # Filled teal circle. Use anti-aliased ellipse via supersample.
    SUPER = 4
    big = Image.new("RGBA", (size * SUPER, size * SUPER), (0, 0, 0, 0))
    bd = ImageDraw.Draw(big)
    bd.ellipse([0, 0, size * SUPER, size * SUPER], fill=TEAL)
    img = big.resize((size, size), Image.LANCZOS)

    d = ImageDraw.Draw(img)
    # 'P' centered. Letter height ~ 60% of canvas.
    if font_path:
        # Pick a font size that produces ~60% of canvas height in the rendered glyph.
        target_h = int(size * 0.62)
        # Iteratively home in on the right font size using textbbox.
        fs = max(8, target_h)
        for _ in range(6):
            font = ImageFont.truetype(font_path, fs)
            bbox = d.textbbox((0, 0), "P", font=font)
            h = bbox[3] - bbox[1]
            if h <= 0:
                break
            scale = target_h / h
            fs = max(8, int(round(fs * scale)))
        font = ImageFont.truetype(font_path, fs)
        bbox = d.textbbox((0, 0), "P", font=font)
        # Center using bbox so the visible glyph (not the type-metrics box) lands centered.
        glyph_w = bbox[2] - bbox[0]
        glyph_h = bbox[3] - bbox[1]
        x = (size - glyph_w) // 2 - bbox[0]
        y = (size - glyph_h) // 2 - bbox[1]
        d.text((x, y), "P", fill=WHITE, font=font)
    else:
        # Pillow's default bitmap font is tiny; only used as last-ditch.
        font = ImageFont.load_default()
        d.text((size // 2, size // 2), "P", fill=WHITE, font=font, anchor="mm")
    return img


def main():
    fp = find_font()
    if fp is None:
        print("WARN: no TrueType font found; using Pillow default. Letter will look small.")
    images = {sz: render(sz, fp) for sz in PNG_SIZES}

    for sz, img in images.items():
        out = OUT / f"favicon-{sz}.png"
        img.save(out, "PNG", optimize=True)
        print(f"  wrote {out}")

    # Multi-resolution .ico — 16, 32, 48 packed in one file. Build a 48 too.
    ico_sizes = [16, 32, 48]
    ico_imgs = []
    for sz in ico_sizes:
        if sz not in images:
            ico_imgs.append(render(sz, fp))
        else:
            ico_imgs.append(images[sz])
    ico_imgs[0].save(
        OUT / "favicon.ico",
        format="ICO",
        sizes=[(s, s) for s in ico_sizes],
        append_images=ico_imgs[1:],
    )
    print(f"  wrote {OUT / 'favicon.ico'} ({', '.join(str(s) for s in ico_sizes)})")
    print(f"\n  done. Source SVG: public/assets/icons/favicon.svg")


if __name__ == "__main__":
    main()
