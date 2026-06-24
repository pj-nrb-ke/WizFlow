import { useEffect, useState } from "react";
import type { FormField, FormFieldOption, MasterDataEntry, TableColumn } from "../lib/api";
import { apiFetch, listMasterData } from "../lib/api";
import { getToken } from "../lib/auth";
import { evaluateCalculatedFormula } from "../lib/calculatedFields";
import { sanitizePositiveNumberInput } from "../lib/numberInput";

type Props = {
  field: FormField;
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  className?: string;
  /** Amount hero panel on purple background */
  variant?: "default" | "hero";
  /** All form values — used for calculated fields */
  allValues?: Record<string, string>;
};

function OptionsList({ options }: { options: FormFieldOption[] }) {
  return (
    <>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </>
  );
}

function useFieldOptions(field: FormField): FormFieldOption[] {
  const [options, setOptions] = useState<FormFieldOption[]>(field.options ?? []);
  const sourceType = field.optionSource?.type;
  const category =
    sourceType === "master_data" ? field.optionSource?.category : undefined;
  const apiUrl = sourceType === "api_url" ? field.optionSource?.apiUrl : undefined;
  const useOrg =
    sourceType === "org_users" ||
    field.type === "employee_selector";

  useEffect(() => {
    if (useOrg) {
      let cancelled = false;
      apiFetch<{ id: string; full_name: string; email: string }[]>(
        "/api/v1/workflows/company-users",
        {},
        getToken()
      )
        .then((users) => {
          if (cancelled) return;
          setOptions(
            users.map((u) => ({
              value: u.id,
              label: u.full_name || u.email,
            }))
          );
        })
        .catch(() => {
          if (!cancelled) setOptions([]);
        });
      return () => {
        cancelled = true;
      };
    }
    if (sourceType === "master_data" && category) {
      let cancelled = false;
      listMasterData(category, getToken())
        .then((rows: MasterDataEntry[]) => {
          if (cancelled) return;
          setOptions(rows.map((r) => ({ value: r.code, label: r.label })));
        })
        .catch(() => {
          if (!cancelled) setOptions(field.options ?? []);
        });
      return () => {
        cancelled = true;
      };
    }
    if (sourceType === "api_url" && apiUrl?.trim()) {
      let cancelled = false;
      fetch(apiUrl.trim())
        .then((r) => r.json())
        .then((data: unknown) => {
          if (cancelled || !Array.isArray(data)) return;
          setOptions(
            data.map((row: { value?: string; label?: string; code?: string }) => ({
              value: String(row.value ?? row.code ?? ""),
              label: String(row.label ?? row.value ?? row.code ?? ""),
            }))
          );
        })
        .catch(() => {
          if (!cancelled) setOptions(field.options ?? []);
        });
      return () => {
        cancelled = true;
      };
    }
    setOptions(field.options ?? []);
  }, [useOrg, sourceType, category, apiUrl, field.options]);

  return options;
}

export function FormFieldControl({
  field,
  value,
  onChange,
  readOnly = false,
  className = "wf-input",
  variant = "default",
  allValues = {},
}: Props) {
  const disabled = readOnly || !onChange;
  const set = (v: string) => onChange?.(v);
  const dynamicOptions = useFieldOptions(field);
  const options =
    field.optionSource?.type === "static" || !field.optionSource
      ? (field.options ?? [])
      : dynamicOptions;

  if (field.type === "table" || field.type === "attendance_table") {
    const columns: TableColumn[] = (field as FormField & { tableColumns?: TableColumn[] }).tableColumns
      ?? [{ key: "value", label: "Value", type: "text" }];
    const rowLabels: string[] = (field as FormField & { tableRowLabels?: string[] }).tableRowLabels ?? [];
    const numRows = rowLabels.length || 1;

    // Parse stored value: array of row objects
    let rows: Record<string, string | boolean>[] = [];
    try {
      if (value) rows = JSON.parse(value);
    } catch { /* ignore */ }
    // Pad / trim to match numRows
    while (rows.length < numRows) rows.push({});
    rows = rows.slice(0, numRows);

    const updateCell = (rowIdx: number, colKey: string, cellVal: string | boolean) => {
      const next = rows.map((r) => ({ ...r }));
      next[rowIdx] = { ...next[rowIdx], [colKey]: cellVal };
      onChange?.(JSON.stringify(next));
    };

    const thClass = "px-3 py-2 border-b border-slate-200 font-semibold text-slate-500 text-xs uppercase tracking-wide bg-slate-50 text-left";

    return (
      <div className="overflow-auto rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead>
            <tr>
              {rowLabels.length > 0 && <th className={thClass} />}
              {columns.map((col) => (
                <th key={col.key} className={`${thClass} ${col.type === "checkbox" ? "text-center" : ""}`}>
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: numRows }, (_, rowIdx) => (
              <tr key={rowIdx} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                {rowLabels.length > 0 && (
                  <td className="px-3 py-2.5 text-slate-700 font-medium whitespace-nowrap">{rowLabels[rowIdx]}</td>
                )}
                {columns.map((col) => {
                  const cellVal = rows[rowIdx]?.[col.key];
                  return (
                    <td key={col.key} className={`px-3 py-2 ${col.type === "checkbox" ? "text-center" : ""}`}>
                      {readOnly ? (
                        col.type === "checkbox" ? (
                          cellVal ? <span className="text-green-600 font-bold">✓</span> : <span className="text-slate-300">—</span>
                        ) : (
                          <span className="text-slate-700">{String(cellVal ?? "")}</span>
                        )
                      ) : col.type === "checkbox" ? (
                        <input
                          type="checkbox"
                          checked={!!cellVal}
                          onChange={(e) => updateCell(rowIdx, col.key, e.target.checked)}
                          disabled={disabled}
                          className="w-4 h-4 cursor-pointer accent-[rgb(var(--wf-brand-600))]"
                        />
                      ) : col.type === "number" ? (
                        <input
                          type="text"
                          inputMode="numeric"
                          value={String(cellVal ?? "")}
                          onChange={(e) => updateCell(rowIdx, col.key, e.target.value)}
                          disabled={disabled}
                          className="wf-input w-full text-sm py-1"
                        />
                      ) : col.type === "date" ? (
                        <input
                          type="date"
                          value={String(cellVal ?? "")}
                          onChange={(e) => updateCell(rowIdx, col.key, e.target.value)}
                          disabled={disabled}
                          className="wf-input w-full text-sm py-1"
                        />
                      ) : (
                        <input
                          type="text"
                          value={String(cellVal ?? "")}
                          onChange={(e) => updateCell(rowIdx, col.key, e.target.value)}
                          disabled={disabled}
                          className="wf-input w-full text-sm py-1"
                          placeholder={col.label}
                        />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (field.type === "calculated") {
    const computed = evaluateCalculatedFormula(field.formula, allValues);
    return (
      <p className={variant === "hero" ? "wf-readonly-value" : "text-slate-800 font-medium"}>
        {computed || "—"}
      </p>
    );
  }

  if (field.type === "section") {
    return (
      <div className="border-t border-slate-200 pt-4 mt-2">
        {field.label && (
          <p className="text-sm font-semibold text-slate-800 mb-1">{field.label}</p>
        )}
        {field.content && (
          <p className="text-sm text-slate-600 whitespace-pre-wrap">{field.content}</p>
        )}
      </div>
    );
  }

  if (field.type === "label") {
    return (
      <div className="text-slate-700">
        {field.label && (
          <p className="text-sm font-semibold text-slate-800 mb-1">{field.label}</p>
        )}
        <p className="text-sm text-slate-600 whitespace-pre-wrap">
          {field.content ?? field.placeholder ?? ""}
        </p>
      </div>
    );
  }

  if (field.type === "button") {
    return (
      <button
        type="button"
        disabled={disabled}
        className="wf-btn-primary px-4 py-2 text-sm font-medium rounded-lg opacity-90"
        onClick={() => undefined}
      >
        {field.buttonText ?? field.label ?? "Button"}
      </button>
    );
  }

  if (readOnly) {
    const roClass =
      variant === "hero" ? "wf-readonly-value" : "text-slate-800 font-medium";
    if (field.type === "yesno") {
      const label = options.find((o) => o.value === value)?.label ?? value;
      return <p className={roClass}>{label || "—"}</p>;
    }
    return <p className={roClass}>{value || "—"}</p>;
  }

  if (field.type === "attachment") {
    return (
      <div className="space-y-1">
        {field.attachmentCategory && (
          <p className="text-xs text-slate-500">Category: {field.attachmentCategory}</p>
        )}
        <input
          type="file"
          disabled={disabled}
          className={`${className} text-sm`}
          onChange={(e) => set(e.target.files?.[0]?.name ?? "")}
        />
      </div>
    );
  }

  if (
    field.type === "dropdown" ||
    field.type === "listbox" ||
    field.type === "master_dropdown" ||
    field.type === "employee_selector"
  ) {
    return (
      <select
        required={field.required}
        value={value}
        onChange={(e) => set(e.target.value)}
        className={className}
      >
        <option value="">— Select —</option>
        <OptionsList options={options} />
      </select>
    );
  }

  if (field.type === "combobox") {
    return (
      <>
        <input
          list={`${field.key}-datalist`}
          required={field.required}
          value={value}
          onChange={(e) => set(e.target.value)}
          className={className}
          placeholder={field.placeholder ?? "Type or select…"}
        />
        <datalist id={`${field.key}-datalist`}>
          <OptionsList options={options} />
        </datalist>
      </>
    );
  }

  if (field.type === "radio" || field.type === "options" || field.type === "yesno") {
    return (
      <div className="space-y-2" role="radiogroup" aria-label={field.label}>
        {options.map((o) => (
          <label key={o.value} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
            <input
              type="radio"
              name={field.key}
              required={field.required}
              checked={value === o.value}
              onChange={() => set(o.value)}
              className="text-[rgb(var(--wf-brand-600))]"
            />
            {o.label}
          </label>
        ))}
      </div>
    );
  }

  if (field.type === "date") {
    return (
      <input
        type="date"
        required={field.required}
        value={value}
        onChange={(e) => set(e.target.value)}
        className={className}
      />
    );
  }

  if (field.type === "time") {
    return (
      <input
        type="time"
        required={field.required}
        value={value}
        onChange={(e) => set(e.target.value)}
        className={className}
      />
    );
  }

  if (field.type === "textarea") {
    return (
      <textarea
        required={field.required}
        value={value}
        onChange={(e) => set(e.target.value)}
        className={`${className} min-h-[80px]`}
        placeholder={field.placeholder}
      />
    );
  }

  if (field.type === "number" || field.type === "currency") {
    return (
      <input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        required={field.required}
        value={value}
        onChange={(e) => set(sanitizePositiveNumberInput(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === "-" || e.key === "+" || e.key === "e" || e.key === "E") {
            e.preventDefault();
          }
        }}
        onPaste={(e) => {
          e.preventDefault();
          const text = e.clipboardData.getData("text");
          set(sanitizePositiveNumberInput(text));
        }}
        className={`${className} wf-input-number`}
        placeholder={field.placeholder ?? (field.type === "currency" ? "0.00" : undefined)}
      />
    );
  }

  return (
    <input
      type="text"
      required={field.required}
      value={value}
      onChange={(e) => set(e.target.value)}
      className={className}
      placeholder={field.placeholder}
    />
  );
}

type BlockProps = {
  field: FormField;
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  highlight?: boolean;
  allValues?: Record<string, string>;
};

export function FormFieldBlock({ field, value, onChange, readOnly, highlight, allValues }: BlockProps) {
  if (field.type === "label" || field.type === "section") {
    return <FormFieldControl field={field} value="" readOnly={readOnly} />;
  }

  if (field.type === "table" || field.type === "attendance_table") {
    return (
      <div>
        {field.label && (
          <p className="text-sm font-medium text-slate-700 mb-2">{field.label}</p>
        )}
        <FormFieldControl
          field={field}
          value={value}
          onChange={onChange}
          readOnly={readOnly}
          allValues={allValues}
        />
      </div>
    );
  }

  if (field.type === "button") {
    return (
      <div>
        <FormFieldControl field={field} value="" readOnly={readOnly} />
      </div>
    );
  }

  if (highlight && (field.key === "amount" || field.type === "currency")) {
    return (
      <div className="wf-form-hero-amount">
        <label className="block text-sm font-medium mb-1">
          {field.label}
          {field.required && <span className="text-red-300"> *</span>}
        </label>
        <FormFieldControl
          field={field}
          value={value}
          onChange={onChange}
          readOnly={readOnly}
          variant="hero"
          allValues={allValues}
        />
      </div>
    );
  }

  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">
        {field.label}
        {field.required && <span className="text-red-500"> *</span>}
      </label>
      <FormFieldControl
        field={field}
        value={value}
        onChange={onChange}
        readOnly={readOnly}
        allValues={allValues}
      />
    </div>
  );
}
