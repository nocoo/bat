#!/usr/bin/env python3
"""
Generate all derived logo assets from the single source logo.png.

Usage: python3 scripts/resize-logos.py

Outputs:
  packages/dashboard/public/logo-24.png     — sidebar icon
  packages/dashboard/public/logo-80.png     — login page
  packages/dashboard/src/app/icon.png       — 32x32 favicon
  packages/dashboard/src/app/apple-icon.png — 180x180 Apple touch icon
  packages/dashboard/src/app/favicon.ico    — 16+32 multi-size ICO
  packages/dashboard/src/app/opengraph-image.png — 1200x630 OG image
"""

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "logo.png"
DASHBOARD = ROOT / "packages" / "dashboard"
PUBLIC = DASHBOARD / "public"
APP = DASHBOARD / "src" / "app"

# Brand color extracted from logo — primary pink
BG_COLOR = (214, 95, 138)  # HSL ~340 58% 60%


def resize(img: Image.Image, size: int) -> Image.Image:
    return img.resize((size, size), Image.LANCZOS)


def main() -> None:
    PUBLIC.mkdir(parents=True, exist_ok=True)
    APP.mkdir(parents=True, exist_ok=True)

    img = Image.open(SRC).convert("RGBA")
    print(f"Source: {img.size[0]}x{img.size[1]} {img.mode}")

    # public/ assets — referenced via <img src>
    targets = {
        PUBLIC / "logo-24.png": 24,
        PUBLIC / "logo-80.png": 80,
    }
    for path, size in targets.items():
        resize(img, size).save(path)
        print(f"  {path.relative_to(ROOT)}  ({size}x{size})")

    # src/app/ assets — Next.js file-based metadata convention
    icon = resize(img, 32)
    icon.save(APP / "icon.png")
    print(f"  {(APP / 'icon.png').relative_to(ROOT)}  (32x32)")

    apple = resize(img, 180)
    apple.save(APP / "apple-icon.png")
    print(f"  {(APP / 'apple-icon.png').relative_to(ROOT)}  (180x180)")

    # favicon.ico — 16+32 multi-size
    ico_16 = resize(img, 16)
    ico_32 = resize(img, 32)
    ico_16.save(APP / "favicon.ico", format="ICO", append_images=[ico_32], sizes=[(16, 16), (32, 32)])
    print(f"  {(APP / 'favicon.ico').relative_to(ROOT)}  (16+32 ICO)")

    # opengraph-image.png — 1200x630, brand bg, logo centered ~40% height
    og_w, og_h = 1200, 630
    canvas = Image.new("RGB", (og_w, og_h), BG_COLOR)
    logo_h = int(og_h * 0.40)  # ~252px
    logo_resized = resize(img, logo_h)
    # Convert RGBA to RGB by compositing onto brand background
    bg_patch = Image.new("RGBA", logo_resized.size, (*BG_COLOR, 255))
    composited = Image.alpha_composite(bg_patch, logo_resized)
    paste_x = (og_w - logo_h) // 2
    paste_y = (og_h - logo_h) // 2
    canvas.paste(composited.convert("RGB"), (paste_x, paste_y))
    canvas.save(APP / "opengraph-image.png")
    print(f"  {(APP / 'opengraph-image.png').relative_to(ROOT)}  ({og_w}x{og_h})")

    print("Done.")


if __name__ == "__main__":
    main()
