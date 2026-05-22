import type { FormField } from "../lib/api";
import type { FormLayout } from "../lib/themes";

type Props = {
  fields: FormField[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  layout: FormLayout;
  readOnly?: boolean;
};

function FieldInput({
  field,
  value,
  onChange,
  readOnly,
  className = "wf-input",
}: {
  field: FormField;
  value: string;
  onChange: (v: string) => void;
  readOnly?: boolean;
  className?: string;
}) {
  if (readOnly) {
    return <p className="text-slate-800 font-medium">{value || "—"}</p>;
  }
  const inputType =
    field.type === "number"
      ? "number"
      : field.type === "date"
        ? "date"
        : field.type === "textarea"
          ? undefined
          : "text";

  if (field.type === "textarea") {
    return (
      <textarea
        required={field.required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${className} min-h-[80px]`}
        placeholder={field.placeholder}
      />
    );
  }

  return (
    <input
      type={inputType}
      required={field.required}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={className}
      placeholder={field.placeholder}
    />
  );
}

function FieldBlock({
  field,
  values,
  onChange,
  readOnly,
  highlight,
}: {
  field: FormField;
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  readOnly?: boolean;
  highlight?: boolean;
}) {
  if (highlight && field.key === "amount") {
    return (
      <div className="wf-form-hero-amount">
        <label className="block text-sm font-medium text-slate-600 mb-1">
          {field.label}
          {field.required && <span className="text-red-500"> *</span>}
        </label>
        <FieldInput
          field={field}
          value={values[field.key] ?? ""}
          onChange={(v) => onChange(field.key, v)}
          readOnly={readOnly}
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
      <FieldInput
        field={field}
        value={values[field.key] ?? ""}
        onChange={(v) => onChange(field.key, v)}
        readOnly={readOnly}
      />
    </div>
  );
}

function groupSections(fields: FormField[]): { title: string; fields: FormField[] }[] {
  const details: FormField[] = [];
  const amounts: FormField[] = [];
  const dates: FormField[] = [];
  const other: FormField[] = [];

  for (const f of fields) {
    if (f.key === "amount" || f.type === "number" && f.key.includes("amount")) {
      amounts.push(f);
    } else if (f.type === "date" || f.key.includes("date")) {
      dates.push(f);
    } else if (
      f.type === "textarea" ||
      ["purpose", "reason", "justification", "issue", "description"].some((k) =>
        f.key.includes(k)
      )
    ) {
      details.push(f);
    } else {
      other.push(f);
    }
  }

  const sections: { title: string; fields: FormField[] }[] = [];
  if (amounts.length) sections.push({ title: "Amount & cost", fields: amounts });
  if (dates.length) sections.push({ title: "Dates", fields: dates });
  if (other.length) sections.push({ title: "Details", fields: other });
  if (details.length) sections.push({ title: "Description", fields: details });
  if (!sections.length && fields.length) {
    sections.push({ title: "Request details", fields: [...fields] });
  }
  return sections;
}

export function WorkflowFormRenderer({
  fields,
  values,
  onChange,
  layout,
  readOnly = false,
}: Props) {
  const handle = (key: string, value: string) => onChange(key, value);

  if (layout === "highlight-amount") {
    const amountField = fields.find((f) => f.key === "amount");
    const rest = fields.filter((f) => f.key !== "amount");
    return (
      <div className="space-y-4">
        {amountField && (
          <FieldBlock
            field={amountField}
            values={values}
            onChange={handle}
            readOnly={readOnly}
            highlight
          />
        )}
        <div className="space-y-4">
          {rest.map((f) => (
            <FieldBlock key={f.key} field={f} values={values} onChange={handle} readOnly={readOnly} />
          ))}
        </div>
      </div>
    );
  }

  if (layout === "sectioned") {
    return (
      <div className="space-y-6">
        {groupSections(fields).map((sec) => (
          <div key={sec.title}>
            <h3 className="wf-form-section-title">{sec.title}</h3>
            <div className="space-y-4">
              {sec.fields.map((f) => (
                <FieldBlock key={f.key} field={f} values={values} onChange={handle} readOnly={readOnly} />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (layout === "two-column") {
    return (
      <div className="grid sm:grid-cols-2 gap-4">
        {fields.map((f) => (
          <div key={f.key} className={f.type === "textarea" ? "sm:col-span-2" : ""}>
            <FieldBlock field={f} values={values} onChange={handle} readOnly={readOnly} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {fields.map((f) => (
        <FieldBlock key={f.key} field={f} values={values} onChange={handle} readOnly={readOnly} />
      ))}
    </div>
  );
}
