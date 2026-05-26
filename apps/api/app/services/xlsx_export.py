"""Excel (.xlsx) export helpers."""

from __future__ import annotations

import io

from openpyxl import Workbook


def rows_to_xlsx(headers: list[str], rows: list[list]) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = "Export"
    ws.append(headers)
    for row in rows:
        ws.append(row)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()
