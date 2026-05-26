export type FormFieldOption = { value: string; label: string };

export type FormField = {
  key: string;
  type: string;
  label: string;
  required?: boolean;
  placeholder?: string;
  options?: FormFieldOption[];
  content?: string;
};

const INPUT_TYPES = new Set(["text", "number", "date", "time", "listbox", "combobox", "options"]);

export function isInputField(f: FormField): boolean {
  return INPUT_TYPES.has(f.type);
}

export function getFormFields(schema?: { fields?: FormField[] } | null): FormField[] {
  const fields = schema?.fields;
  if (!Array.isArray(fields)) return [];
  return fields.filter((f) => f?.key && f.label && isInputField(f));
}

export function buildInitialForm(fields: FormField[]): Record<string, string> {
  const form: Record<string, string> = {};
  for (const f of fields) {
    if (f.type === "date") form[f.key] = new Date().toISOString().slice(0, 10);
  }
  return form;
}

export function validateForm(fields: FormField[], form: Record<string, string>): string | null {
  for (const f of fields) {
    const v = form[f.key];
    if (!f.required) continue;
    if (v === undefined || String(v).trim() === "") return `Please enter ${f.label}.`;
    if (f.type === "number" && v) {
      const n = Number(String(v).replace(/,/g, ""));
      if (Number.isNaN(n) || n < 0) return `${f.label} must be a positive number.`;
    }
  }
  return null;
}

export function formToPayload(fields: FormField[], form: Record<string, string>): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const f of fields) {
    const v = form[f.key];
    if (v === undefined || v === "") continue;
    if (f.type === "number") {
      const n = Number(String(v).replace(/,/g, ""));
      if (!Number.isNaN(n)) data[f.key] = n;
    } else data[f.key] = v;
  }
  return data;
}
