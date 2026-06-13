"""Generate WizFlow mobile app assets (icon, adaptive icon, splash) from the
'B' workflow-nodes mark. Run: python apps/mobile/scripts/generate-icons.py
"""

from __future__ import annotations

import os

from PIL import Image, ImageDraw

VIOLET = (83, 74, 183, 255)      # #534AB7
LAVENDER = (238, 237, 254, 255)  # #EEEDFE
WHITE = (255, 255, 255, 255)

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "..", "assets"))
SS = 8
BASE = 56.0


def draw(size: int, *, bg, pad_ratio: float) -> Image.Image:
    big = size * SS
    img = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    pad = big * pad_ratio
    tile = big - 2 * pad
    k = tile / BASE
    X = lambda v: pad + v * k  # noqa: E731
    if bg is not None:
        d.rectangle([0, 0, big, big], fill=bg)

    def line(x1, y1, x2, y2, w):
        d.line([X(x1), X(y1), X(x2), X(y2)], fill=VIOLET, width=int(w * k))
        r = w * k / 2
        for cx, cy in ((X(x1), X(y1)), (X(x2), X(y2))):
            d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=VIOLET)

    def node(cx, cy, r, fill, ow=0.0):
        rr = r * k
        box = [X(cx) - rr, X(cy) - rr, X(cx) + rr, X(cy) + rr]
        if ow:
            d.ellipse(box, fill=fill, outline=VIOLET, width=int(ow * k))
        else:
            d.ellipse(box, fill=fill)

    line(23, 20, 37.5, 28, 3.2)
    line(23, 36, 37.5, 28, 3.2)
    node(19, 19, 5, WHITE, 3.2)
    node(19, 37, 5, WHITE, 3.2)
    node(38, 28, 6.5, VIOLET)
    return img.resize((size, size), Image.LANCZOS)


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    draw(1024, bg=LAVENDER, pad_ratio=0.16).save(os.path.join(OUT, "icon.png"))
    draw(1024, bg=None, pad_ratio=0.28).save(os.path.join(OUT, "adaptive-icon.png"))
    draw(1024, bg=LAVENDER, pad_ratio=0.34).save(os.path.join(OUT, "splash.png"))
    print("wrote icon.png, adaptive-icon.png, splash.png to", OUT)


if __name__ == "__main__":
    main()
