/** Evaluate simple calculated field formulas using {fieldKey} placeholders and + - * / */
export function evaluateCalculatedFormula(
  formula: string | undefined,
  values: Record<string, string>
): string {
  if (!formula?.trim()) return "";
  let expr = formula.trim();
  for (const [key, val] of Object.entries(values)) {
    const num = parseFloat(val);
    const replacement = Number.isFinite(num) ? String(num) : "0";
    expr = expr.replace(new RegExp(`\\{${key}\\}`, "g"), replacement);
  }
  if (!/^[\d\s.+*/()-]+$/.test(expr)) return "";
  try {
    // eslint-disable-next-line no-new-func
    const result = Function(`"use strict"; return (${expr})`)() as number;
    if (!Number.isFinite(result)) return "";
    return Number.isInteger(result) ? String(result) : result.toFixed(2);
  } catch {
    return "";
  }
}
