"""Draw the home-screen icons into icons/. Needs Pillow. Run: python tools/make_icons.py"""
from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "icons"
INK = (8, 10, 24)
PINK = (255, 63, 164)
ORANGE = (255, 154, 92)
CYAN = (63, 224, 255)


def mix(a, b, t):
    return tuple(round(a[k] + (b[k] - a[k]) * t) for k in range(3))


def draw(size, art):
    """art: the share of the square the picture may use (maskable icons keep to the middle 4/5)."""
    big = size * 4                                  # drawn large, then shrunk for smooth edges
    picture = Image.new("RGB", (big, big), INK)
    pen = ImageDraw.Draw(picture)
    for y in range(big):                            # dusk sky
        pen.line([(0, y), (big, y)], fill=mix((22, 14, 54), (70, 24, 92), y / big))

    middle = big / 2
    half = big * art / 2
    horizon = middle + half * 0.22
    radius = half * 0.62
    top = horizon - radius * 1.25

    # the sun: pink at the top, orange at the horizon, cut by widening dark bands
    sun = Image.new("RGB", (big, big))
    sun_pen = ImageDraw.Draw(sun)
    for y in range(big):
        sun_pen.line([(0, y), (big, y)], fill=mix(PINK, ORANGE, min(1, max(0, (y - top) / (radius * 1.6)))))
    mask = Image.new("L", (big, big), 0)
    mask_pen = ImageDraw.Draw(mask)
    centre_y = horizon - radius * 0.25
    mask_pen.ellipse([middle - radius, centre_y - radius, middle + radius, centre_y + radius], fill=255)
    for k in range(4):
        y = centre_y + radius * (-0.34 + k * 0.155)
        mask_pen.rectangle([0, y, big, y + radius * (0.03 + k * 0.016)], fill=0)
    mask_pen.rectangle([0, horizon, big, big], fill=0)
    picture.paste(sun, (0, 0), mask)

    # the sea below the horizon, with a road running to the sun
    for y in range(int(horizon), big):
        pen.line([(0, y), (big, y)], fill=mix((16, 60, 92), INK, (y - horizon) / (big - horizon)))
    pen.line([(0, horizon), (big, horizon)], fill=CYAN, width=max(2, big // 110))
    road_far = half * 0.05
    road_near = half * 0.62
    pen.polygon([(middle - road_far, horizon), (middle + road_far, horizon), (middle + road_near, big), (middle - road_near, big)], fill=(20, 22, 40))
    for side in (-1, 1):
        pen.line([(middle + side * road_far, horizon), (middle + side * road_near, big)], fill=PINK, width=max(2, big // 90))
    for k in range(4):                              # centre dashes, longer as they come closer
        t0 = 0.12 + k * 0.24
        t1 = t0 + 0.10
        y0 = horizon + (big - horizon) * t0
        y1 = horizon + (big - horizon) * t1
        width = max(2, round(big / 160 * (1 + k)))
        pen.line([(middle, y0), (middle, y1)], fill=(255, 225, 79), width=width)
    return picture.resize((size, size), Image.LANCZOS)


def main():
    OUT.mkdir(exist_ok=True)
    draw(192, 0.96).save(OUT / "icon-192.png", optimize=True)
    draw(512, 0.96).save(OUT / "icon-512.png", optimize=True)
    draw(512, 0.76).save(OUT / "icon-maskable-512.png", optimize=True)
    draw(180, 0.92).save(OUT / "apple-touch-icon.png", optimize=True)
    for path in sorted(OUT.glob("*.png")):
        print(path.name, path.stat().st_size, "bytes")


if __name__ == "__main__":
    main()
