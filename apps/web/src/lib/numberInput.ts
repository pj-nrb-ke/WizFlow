/** Keep only non-negative decimal input for amount-style fields. */
export function sanitizePositiveNumberInput(value: string): string {
  let s = value.replace(/[^\d.]/g, "");
  const dot = s.indexOf(".");
  if (dot >= 0) {
    s = s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, "");
  }
  return s;
}

export function parsePositiveNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

export function validatePositiveNumberField(label: string, value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = parsePositiveNumber(trimmed);
  if (n === null) return `${label} must be a positive number.`;
  return null;
}
