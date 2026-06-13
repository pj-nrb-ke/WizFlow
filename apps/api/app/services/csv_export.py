"""CSV row helpers for list exports."""

from __future__ import annotations

import csv
import io

# Leading characters that spreadsheet apps interpret as a formula. Cells starting
# with these are prefixed with a single quote to neutralise CSV/formula injection.
_DANGEROUS_PREFIX = ("=", "+", "-", "@", "\t", "\r")


def sanitize_cell(value: object) -> str:
    s = "" if value is None else str(value)
    if s[:1] in _DANGEROUS_PREFIX:
        return "'" + s
    return s


def rows_to_csv(headers: list[str], rows: list[list[str]]) -> str:
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([sanitize_cell(h) for h in headers])
    for row in rows:
        writer.writerow([sanitize_cell(c) for c in row])
    return buf.getvalue()
