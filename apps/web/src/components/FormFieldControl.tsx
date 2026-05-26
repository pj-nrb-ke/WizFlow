import { useEffect, useState } from "react";
import type { FormField, FormFieldOption, MasterDataEntry } from "../lib/api";
import { listMasterData } from "../lib/api";
import { getToken } from "../lib/auth";
import { sanitizePositiveNumberInput } from "../lib/numberInput";

type Props = {
  field: FormField;
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  className?: string;
  /** Amount hero panel on purple background */
  variant?: "default" | "hero";
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

function useMasterDataOptions(field: FormField): FormFieldOption[] {
  const [options, setOptions] = useState<FormFieldOption[]>(field.options ?? []);
  const category =
    field.optionSource?.type === "master_data" ? field.optionSource.category : undefined;

  useEffect(() => {
    if (field.optionSource?.type !== "master_data" || !category) {
      setOptions(field.options ?? []);
      return;
    }
    let cancelled = false;
    listMasterData(category, getToken())
      .then((rows: MasterDataEntry[]) => {
        if (cancelled) return;
        setOptions(
          rows.map((r) => ({
            value: r.code,
            label: r.label,
          }))
        );
      })
      .catch(() => {
        if (!cancelled) setOptions(field.options ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [category, field.optionSource?.type, field.options]);

  return options;
}

export function FormFieldControl({
  field,
  value,
  onChange,
  readOnly = false,
  className = "wf-input",
  variant = "default",
}: Props) {
  const disabled = readOnly || !onChange;
  const set = (v: string) => onChange?.(v);
  const masterOptions = useMasterDataOptions(field);
  const options =
    field.optionSource?.type === "master_data" ? masterOptions : (field.options ?? []);

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
      <input
        type="file"
        disabled={disabled}
        className={`${className} text-sm`}
        onChange={(e) => set(e.target.files?.[0]?.name ?? "")}
      />
    );
  }

  if (
    field.type === "dropdown" ||
    field.type === "listbox" ||
    field.type === "master_dropdown"
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
};

export function FormFieldBlock({ field, value, onChange, readOnly, highlight }: BlockProps) {
  if (field.type === "label" || field.type === "section") {
    return <FormFieldControl field={field} value="" readOnly={readOnly} />;
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
      <FormFieldControl field={field} value={value} onChange={onChange} readOnly={readOnly} />
    </div>
  );
}
