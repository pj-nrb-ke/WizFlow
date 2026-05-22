import type { FormField } from "./api";

export function getFormFields(schema?: { fields?: FormField[] } | null): FormField[] {
  const fields = schema?.fields;
  if (!Array.isArray(fields)) return [];
  return fields.filter((f) => f && typeof f.key === "string" && f.label);
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
  for (const f of fields) {
    if (!f.required) continue;
    const v = form[f.key];
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
  for (const f of fields) {
    const v = form[f.key];
    if (v === undefined || v === "") continue;
    if (f.type === "number") data[f.key] = Number(v);
    else data[f.key] = v;
  }
  return data;
}
