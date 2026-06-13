"""Simple PDF export for audit trails and reports."""

from __future__ import annotations

import io

from fpdf import FPDF
from fpdf.enums import XPos, YPos


def text_to_pdf(title: str, lines: list[str]) -> bytes:
    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.set_margins(15, 15, 15)
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 14)
    pdf.multi_cell(0, 10, title[:200], new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_font("Helvetica", size=10)
    for line in lines:
        safe = (line or "").encode("latin-1", errors="replace").decode("latin-1")
        if not safe.strip():
            pdf.ln(4)
            continue
        # wrapmode="CHAR" breaks long unbreakable tokens (URLs, ids) so fpdf2
        # never raises "not enough horizontal space to render a single character".
        pdf.multi_cell(0, 6, safe, new_x=XPos.LMARGIN, new_y=YPos.NEXT, wrapmode="CHAR")
    out = io.BytesIO()
    pdf.output(out)
    return out.getvalue()
