import type { FormField } from "./api";

/** Filter fields visible to the current user's roles. */
export function filterVisibleFields(fields: FormField[], roles: string[]): FormField[] {
  return fields.filter((f) => {
    if (f.type === "section" || f.type === "label") return true;
    if (!f.visibleTo?.length) return true;
    return f.visibleTo.some((r) => roles.includes(r));
  });
}

export function canEditField(field: FormField, roles: string[]): boolean {
  if (!field.editableBy?.length) return true;
  return field.editableBy.some((r: string) => roles.includes(r));
}
