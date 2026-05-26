import type { FormField, FormFieldOption } from "./api";

/** Palette control types (Form Designer UI labels). */
export type DesignerControlId =
  | "text"
  | "button"
  | "listbox"
  | "combobox"
  | "options"
  | "date"
  | "time"
  | "label"
  | "currency"
  | "yesno"
  | "section"
  | "attachment"
  | "master_dropdown";

export type DesignerField = FormField & {
  /** Stable id for drag-and-drop (not persisted). */
  designerId: string;
};

export type FormDesignerSchema = {
  title: string;
  description?: string;
  fields: DesignerField[];
};

export const DESIGNER_CONTROLS: {
  id: DesignerControlId;
  label: string;
  hint: string;
}[] = [
  { id: "text", label: "Textbox", hint: "Single-line text input" },
  { id: "button", label: "Button", hint: "Action button (display only in requests)" },
  { id: "listbox", label: "Listbox", hint: "Dropdown list — pick one option" },
  { id: "combobox", label: "Combobox", hint: "Editable dropdown with suggestions" },
  { id: "options", label: "Option control", hint: "Radio buttons — pick one" },
  { id: "date", label: "Date picker", hint: "Calendar date" },
  { id: "time", label: "Time picker", hint: "Time of day" },
  { id: "label", label: "Label", hint: "Static heading or help text" },
  { id: "currency", label: "Currency amount", hint: "Monetary value with validation" },
  { id: "yesno", label: "Yes / No", hint: "Binary choice" },
  { id: "section", label: "Section header", hint: "Visual divider and instructions" },
  { id: "attachment", label: "Attachment", hint: "File upload on submit" },
  {
    id: "master_dropdown",
    label: "Master data list",
    hint: "Dropdown from company master data library",
  },
];

export const MASTER_DATA_CATEGORIES = [
  "department",
  "branch",
  "cost_center",
  "vendor",
  "project",
  "expense_type",
  "category",
  "approval_limit",
] as const;

let fieldCounter = 0;

export function nextDesignerId(): string {
  fieldCounter += 1;
  return `df-${Date.now()}-${fieldCounter}`;
}

function slugKey(label: string, type: string): string {
  const base = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 24);
  return base || type;
}

function defaultOptions(): FormFieldOption[] {
  return [
    { value: "option_1", label: "Option 1" },
    { value: "option_2", label: "Option 2" },
  ];
}

/** Map palette control → WizFlow form_schema field type. */
export function schemaTypeForControl(control: DesignerControlId): string {
  switch (control) {
    case "text":
      return "text";
    case "button":
      return "button";
    case "listbox":
      return "dropdown";
    case "combobox":
      return "combobox";
    case "options":
      return "radio";
    case "date":
      return "date";
    case "time":
      return "time";
    case "label":
      return "label";
    case "currency":
      return "currency";
    case "yesno":
      return "yesno";
    case "section":
      return "section";
    case "attachment":
      return "attachment";
    case "master_dropdown":
      return "master_dropdown";
    default:
      return "text";
  }
}

export function createDesignerField(control: DesignerControlId): DesignerField {
  const meta = DESIGNER_CONTROLS.find((c) => c.id === control)!;
  const type = schemaTypeForControl(control);
  const key = slugKey(meta.label, type);
  const base: DesignerField = {
    designerId: nextDesignerId(),
    key,
    type,
    label: meta.label,
    required: type !== "label" && type !== "button",
  };
  if (control === "listbox" || control === "combobox" || control === "options") {
    base.options = defaultOptions();
  }
  if (control === "combobox") {
    base.placeholder = "Type or select…";
  }
  if (control === "button") {
    base.buttonText = "Submit";
    base.required = false;
  }
  if (control === "label" || control === "section") {
    base.content = "Section heading or instructions";
    base.required = false;
  }
  if (control === "yesno") {
    base.options = [
      { value: "yes", label: "Yes" },
      { value: "no", label: "No" },
    ];
  }
  if (control === "master_dropdown") {
    base.optionSource = { type: "master_data", category: "department" };
  }
  if (control === "attachment") {
    base.required = false;
  }
  return base;
}

export function isInputField(field: FormField): boolean {
  return (
    field.type !== "label" &&
    field.type !== "button" &&
    field.type !== "section"
  );
}

export function toPersistedSchema(design: FormDesignerSchema): {
  title: string;
  description?: string;
  fields: FormField[];
} {
  return {
    title: design.title.trim(),
    description: design.description?.trim() || undefined,
    fields: design.fields.map(({ designerId: _id, ...rest }) => rest),
  };
}

export function fromPersistedSchema(schema?: {
  title?: string;
  description?: string;
  fields?: FormField[];
} | null): FormDesignerSchema {
  const fields = (schema?.fields ?? []).map((f) => ({
    ...f,
    designerId: nextDesignerId(),
  }));
  return {
    title: schema?.title ?? "",
    description: schema?.description,
    fields,
  };
}

export function ensureUniqueKey(fields: DesignerField[], key: string, designerId: string): string {
  let candidate = key;
  let n = 1;
  while (fields.some((f) => f.designerId !== designerId && f.key === candidate)) {
    candidate = `${key}_${n}`;
    n += 1;
  }
  return candidate;
}

export const DEFAULT_WORKFLOW_STEP = {
  id: "step_manager",
  name: "Manager Approval",
  type: "approval",
  assignee: { type: "role", value: "manager" },
};
