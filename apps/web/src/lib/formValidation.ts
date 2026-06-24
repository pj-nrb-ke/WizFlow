import type { FormField } from "./api";
import { isInputField } from "./formDesigner";
import { parsePositiveNumber, validatePositiveNumberField } from "./numberInput";

export function getFormFields(schema?: { fields?: FormField[] } | null): FormField[] {
  const fields = schema?.fields;
  if (!Array.isArray(fields)) return [];
  return fields.filter(
    (f) => f && typeof f.key === "string" && f.label && isInputField(f)
  );
}

export function defaultValueForField(field: FormField): string {
  if (field.type === "date") {
    const d = new Date();
    if (field.key === "end_date") {
      d.setDate(d.getDate() + 7);
    }
    return d.toISOString().slice(0, 10);
  }
  if (field.key === "leave_type") return "Annual";
  if (field.key === "department") return "Operations";
  return "";
}

export function buildInitialForm(fields: FormField[]): Record<string, string> {
  const form: Record<string, string> = {};
  for (const f of fields) {
    const d = defaultValueForField(f);
    if (d) form[f.key] = d;
  }
  return form;
}

export function validateFormClient(
  fields: FormField[],
  form: Record<string, string>
): string | null {
  const inputs = fields.filter(isInputField);
  for (const f of inputs) {
    const v = form[f.key];
    if (f.type === "number") {
      const trimmed = v === undefined || v === null ? "" : String(v).trim();
      if (trimmed) {
        const numErr = validatePositiveNumberField(f.label, trimmed);
        if (numErr) return numErr;
      }
    }
    if (!f.required) continue;
    if (v === undefined || v === null || String(v).trim() === "") {
      return `Please enter ${f.label}.`;
    }
  }
  return null;
}

export function formToPayload(
  fields: FormField[],
  form: Record<string, string>
): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const f of fields.filter(isInputField)) {
    const v = form[f.key];
    if (v === undefined || v === "") continue;
    if (f.type === "number") {
      const n = parsePositiveNumber(String(v));
      if (n !== null) data[f.key] = n;
    } else if (f.type === "attendance_table") {
      try { data[f.key] = JSON.parse(v); } catch { data[f.key] = v; }
    } else {
      data[f.key] = v;
    }
  }
  return data;
}
