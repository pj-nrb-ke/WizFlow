"""Generate WizFlow PNG/ICO icons from the 'B' workflow-nodes mark.

Draws the mark directly (rounded tile + two requester nodes routing into one
approver node) at high supersample, then downscales with LANCZOS for crisp
edges. Run with any Python that has Pillow:

    python apps/web/scripts/generate-icons.py
"""

from __future__ import annotations

import os

from PIL import Image, ImageDraw

VIOLET = (83, 74, 183, 255)      # #534AB7
LAVENDER = (238, 237, 254, 255)  # #EEEDFE
WHITE = (255, 255, 255, 255)

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "..", "public"))
SS = 8          # supersample factor
BASE = 56.0     # mark design coordinate space


def _draw_mark(size: int, *, rounded: bool, pad_ratio: float = 0.0) -> Image.Image:
    """Render the mark at `size` px. pad_ratio shrinks the mark for maskable icons."""
    big = size * SS
    img = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    pad = big * pad_ratio
    tile = big - 2 * pad
    k = tile / BASE  # scale from 56-space into the padded tile

    def X(v: float) -> float:
        return pad + v * k

    def Y(v: float) -> float:
        return pad + v * k

    # Tile background
    if rounded:
        d.rounded_rectangle([pad, pad, pad + tile, pad + tile], radius=14 * k, fill=LAVENDER)
    else:
        d.rectangle([pad, pad, pad + tile, pad + tile], fill=LAVENDER)

    def line(x1, y1, x2, y2, w):
        d.line([X(x1), Y(y1), X(x2), Y(y2)], fill=VIOLET, width=int(w * k))
        r = w * k / 2  # round caps
        for (cx, cy) in ((X(x1), Y(y1)), (X(x2), Y(y2))):
            d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=VIOLET)

    def node(cx, cy, r, fill, outline_w=0):
        rr = r * k
        ow = int(outline_w * k)
        box = [X(cx) - rr, Y(cy) - rr, X(cx) + rr, Y(cy) + rr]
        if outline_w:
            d.ellipse(box, fill=fill, outline=VIOLET, width=ow)
        else:
            d.ellipse(box, fill=fill)

    # connectors first, then nodes on top
    line(23, 20, 37.5, 28, 3.2)
    line(23, 36, 37.5, 28, 3.2)
    node(19, 19, 5, WHITE, outline_w=3.2)
    node(19, 37, 5, WHITE, outline_w=3.2)
    node(38, 28, 6.5, VIOLET)

    return img.resize((size, size), Image.LANCZOS)


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    # Standard rounded icons
    for name, size in [
        ("favicon-16.png", 16),
        ("favicon-32.png", 32),
        ("apple-touch-icon.png", 180),
        ("icon-192.png", 192),
        ("icon-512.png", 512),
    ]:
        _draw_mark(size, rounded=True).save(os.path.join(OUT, name))
        print("wrote", name)

    # Maskable: full-bleed square + padding so the OS mask never clips the mark
    _draw_mark(512, rounded=False, pad_ratio=0.12).save(os.path.join(OUT, "icon-512-maskable.png"))
    print("wrote icon-512-maskable.png")

    # Multi-size .ico for legacy /favicon.ico
    ico = _draw_mark(64, rounded=True)
    ico.save(os.path.join(OUT, "favicon.ico"), sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
    print("wrote favicon.ico")


if __name__ == "__main__":
    main()
