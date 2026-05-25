import type { FormField, FormFieldOption } from "../lib/api";

type Props = {
  field: FormField;
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  className?: string;
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

export function FormFieldControl({
  field,
  value,
  onChange,
  readOnly = false,
  className = "wf-input",
}: Props) {
  const disabled = readOnly || !onChange;
  const set = (v: string) => onChange?.(v);

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
    return <p className="text-slate-800 font-medium">{value || "—"}</p>;
  }

  const options = field.options ?? [];

  if (field.type === "dropdown" || field.type === "listbox") {
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

  if (field.type === "radio" || field.type === "options") {
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

  const inputType = field.type === "number" ? "number" : "text";
  return (
    <input
      type={inputType}
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
  if (field.type === "label") {
    return <FormFieldControl field={field} value="" readOnly={readOnly} />;
  }

  if (field.type === "button") {
    return (
      <div>
        <FormFieldControl field={field} value="" readOnly={readOnly} />
      </div>
    );
  }

  if (highlight && field.key === "amount") {
    return (
      <div className="wf-form-hero-amount">
        <label className="block text-sm font-medium text-slate-600 mb-1">
          {field.label}
          {field.required && <span className="text-red-500"> *</span>}
        </label>
        <FormFieldControl field={field} value={value} onChange={onChange} readOnly={readOnly} />
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
