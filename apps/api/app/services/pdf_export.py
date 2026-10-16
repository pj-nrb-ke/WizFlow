"""Simple PDF export for audit trails and reports."""

from __future__ import annotations

import io

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


def text_to_pdf(
    title: str,
    lines: list[str],
    *,
    letterhead: str | None = None,
    footer_text: str = "Powered by WizFlow",
) -> bytes:
    """Render a title + body lines to PDF.

    Two-level branding: ``letterhead`` (the client company) prints at the top,
    and ``footer_text`` (WizFlow) prints at the bottom of every page.
    """
    pdf = _BrandedPDF()
    pdf.footer_text = footer_text
    pdf.set_auto_page_break(auto=True, margin=18)
    pdf.set_margins(15, 15, 15)
    pdf.add_page()
    if letterhead:
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


if __name__ == "__main__":  # self-check: renders with letterhead + footer → valid PDF
    pdf = text_to_pdf("Title", ["line one", "", "line two"], letterhead="Acme Ltd")
    assert pdf[:4] == b"%PDF" and len(pdf) > 500, (pdf[:8], len(pdf))
    assert text_to_pdf("T", [], footer_text="")[:4] == b"%PDF"  # footer optional
    print("pdf_export self-check OK")
