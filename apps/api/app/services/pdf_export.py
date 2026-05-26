"""Simple PDF export for audit trails and reports."""

from __future__ import annotations

import io

from fpdf import FPDF


def text_to_pdf(title: str, lines: list[str]) -> bytes:
    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 14)
    pdf.cell(0, 10, title[:120], ln=True)
    pdf.set_font("Helvetica", size=10)
    for line in lines:
        safe = line.encode("latin-1", errors="replace").decode("latin-1")
        pdf.multi_cell(0, 6, safe)
    out = io.BytesIO()
    pdf.output(out)
    return out.getvalue()
