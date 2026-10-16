"""Simple PDF export for audit trails and reports."""

from __future__ import annotations

import io
import os
import tempfile

from fpdf import FPDF
from fpdf.enums import XPos, YPos


def _latin1(s: str) -> str:
    # Core fonts are latin-1 only; replace anything outside it so fpdf never raises.
    return (s or "").encode("latin-1", errors="replace").decode("latin-1")


class _BrandedPDF(FPDF):
    """PDF with a product-branding footer on every page (passive WizFlow marketing)."""

    footer_text = "Powered by WizFlow"

    def footer(self) -> None:
        if not self.footer_text:
            return
        self.set_y(-12)
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(150, 150, 150)
        self.cell(0, 8, _latin1(self.footer_text), align="C")
        self.set_text_color(0, 0, 0)


def _embed_logo(pdf: FPDF, logo: bytes) -> bool:
    """Best-effort: place the client logo as a top-left letterhead (~14mm tall).
    Handles raster (PNG/JPG/GIF) and SVG; returns False on any problem so the
    caller falls back to a text letterhead. Never raises."""
    try:
        head = logo[:300].lstrip().lower()
        if head.startswith(b"<?xml") or b"<svg" in head:
            # fpdf2 parses SVG from a path by its extension — write a temp .svg.
            fd, path = tempfile.mkstemp(suffix=".svg")
            try:
                with os.fdopen(fd, "wb") as f:
                    f.write(logo)
                pdf.image(path, x=15, y=12, h=14)
            finally:
                os.unlink(path)
        else:
            pdf.image(io.BytesIO(logo), x=15, y=12, h=14)  # raster; width auto-scales
        return True
    except Exception:
        return False


def text_to_pdf(
    title: str,
    lines: list[str],
    *,
    logo: bytes | None = None,
    letterhead: str | None = None,
    footer_text: str = "Powered by WizFlow",
) -> bytes:
    """Render a title + body lines to PDF.

    Two-level branding: the client appears at the top — their ``logo`` image if
    it embeds, otherwise the ``letterhead`` text — and ``footer_text`` (WizFlow)
    prints at the bottom of every page.
    """
    pdf = _BrandedPDF()
    pdf.footer_text = footer_text
    pdf.set_auto_page_break(auto=True, margin=18)
    pdf.set_margins(15, 15, 15)
    pdf.add_page()
    if logo and _embed_logo(pdf, logo):
        pdf.set_y(30)  # start content below the logo
    elif letterhead:
        pdf.set_font("Helvetica", "B", 11)
        pdf.set_text_color(90, 90, 90)
        pdf.multi_cell(0, 7, _latin1(letterhead)[:120], new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        pdf.set_text_color(0, 0, 0)
        pdf.ln(2)
    pdf.set_font("Helvetica", "B", 14)
    pdf.multi_cell(0, 10, _latin1(title)[:200], new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_font("Helvetica", size=10)
    for line in lines:
        safe = _latin1(line)
        if not safe.strip():
            pdf.ln(4)
            continue
        # wrapmode="CHAR" breaks long unbreakable tokens (URLs, ids) so fpdf2
        # never raises "not enough horizontal space to render a single character".
        pdf.multi_cell(0, 6, safe, new_x=XPos.LMARGIN, new_y=YPos.NEXT, wrapmode="CHAR")
    out = io.BytesIO()
    pdf.output(out)
    return out.getvalue()


_PNG_1x1 = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06"
    b"\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00"
    b"\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
)

if __name__ == "__main__":  # self-check: branding + logo embed + graceful fallback
    assert text_to_pdf("Title", ["a", "", "b"], letterhead="Acme Ltd")[:4] == b"%PDF"
    assert text_to_pdf("T", [], footer_text="")[:4] == b"%PDF"  # footer optional
    assert text_to_pdf("T", ["x"], logo=_PNG_1x1)[:4] == b"%PDF"  # raster logo embeds
    _svg = b'<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>'
    assert text_to_pdf("T", ["x"], logo=_svg)[:4] == b"%PDF"  # svg path (or fallback)
    assert text_to_pdf("T", ["x"], logo=b"not-an-image", letterhead="Acme")[:4] == b"%PDF"  # fallback
    print("pdf_export self-check OK")
