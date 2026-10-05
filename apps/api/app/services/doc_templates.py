"""Fill a per-workflow document template with request data → PDF.

Templates live in ``defn.settings["document_templates"]`` (no migration, no-code):
each is ``{id, name, title?, body}`` where ``title``/``body`` contain
``{{placeholder}}`` tokens filled from the request's form data plus a few system
fields (reference, workflow, date, status). Rendering reuses pdf_export.text_to_pdf.

ponytail: text → PDF (title + body lines). Rich letterhead/logo layout and DOCX
output are follow-ups; English/latin-1 now (pdf_export sanitises), a Unicode TTF
is the upgrade for multilingual.
"""

from __future__ import annotations

import re
from datetime import date

from app.db.models import WorkflowDefinition, WorkflowInstance
from app.services.pdf_export import text_to_pdf
from app.services.ui_settings import strip_ui_keys

_PLACEHOLDER = re.compile(r"\{\{\s*([\w.]+)\s*\}\}")


def list_templates(defn: WorkflowDefinition) -> list[dict]:
    tpls = (defn.settings or {}).get("document_templates") or []
    return [t for t in tpls if isinstance(t, dict) and t.get("id")]


def find_template(defn: WorkflowDefinition, template_id: str) -> dict | None:
    return next((t for t in list_templates(defn) if t.get("id") == template_id), None)


def _system_fields(inst: WorkflowInstance) -> dict:
    return {
        "reference": inst.reference_number or "",
        "workflow": inst.workflow_name or "",
        "status": inst.status or "",
        "date": date.today().isoformat(),
    }


def fill(text: str | None, values: dict) -> str:
    """Replace {{key}} with values[key]; unknown placeholders become ''."""
    def repl(m: re.Match) -> str:
        v = values.get(m.group(1))
        return "" if v is None else str(v)

    return _PLACEHOLDER.sub(repl, text or "")


def render_pdf(template: dict, inst: WorkflowInstance) -> bytes:
    # System fields win over form fields for the 4 reserved names (predictable docs).
    values = {**strip_ui_keys(inst.request_data or {}), **_system_fields(inst)}
    title = fill(template.get("title") or template.get("name") or "Document", values)
    body = fill(template.get("body") or "", values)
    return text_to_pdf(title, body.split("\n"))


def output_filename(template: dict, inst: WorkflowInstance) -> str:
    ref = inst.reference_number or str(inst.id)[:8]
    return f"{template.get('name') or 'document'}-{ref}.pdf"


if __name__ == "__main__":  # self-check: placeholder fill + real PDF bytes
    from types import SimpleNamespace as NS

    inst = NS(
        id="00000000-0000-0000-0000-000000000000",
        reference_number="CLM-9",
        workflow_name="Claim",
        status="approved",
        request_data={"claimant": "Pat", "amount": 500, "__wf_ui": "x"},
    )
    tpl = {
        "id": "demand", "name": "Demand Letter", "title": "Demand {{reference}}",
        "body": "Dear {{claimant}},\nAmount due: {{amount}}\nUnknown: {{nope}}\nIssued: {{date}}",
    }
    assert fill("{{ claimant }}", {"claimant": "Pat"}) == "Pat"
    assert fill("{{nope}}", {}) == ""
    pdf = render_pdf(tpl, inst)
    assert pdf[:4] == b"%PDF" and len(pdf) > 500, (pdf[:8], len(pdf))
    assert output_filename(tpl, inst) == "Demand Letter-CLM-9.pdf"
    print("doc_templates self-check OK")
