"""Excel (.xlsx) export helpers."""

from __future__ import annotations

import io

from openpyxl import Workbook

from app.services.csv_export import sanitize_cell


def rows_to_xlsx(headers: list[str], rows: list[list]) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = "Export"
    ws.append([sanitize_cell(h) for h in headers])
    for row in rows:
        # Neutralise formula injection in text cells; leave numbers/dates as-is.
        ws.append([sanitize_cell(c) if isinstance(c, str) else c for c in row])
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()
