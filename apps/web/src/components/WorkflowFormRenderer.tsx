import type { FormField } from "../lib/api";
import type { FormLayout } from "../lib/themes";
import { filterVisibleFields } from "../lib/fieldPermissions";
import { FormFieldBlock } from "./FormFieldControl";

type Props = {
  fields: FormField[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  layout: FormLayout;
  readOnly?: boolean;
  userRoles?: string[];
};

/** Long-form controls read better spanning the full row than squeezed into a column. */
function isWideField(f: FormField): boolean {
  return (
    f.type === "textarea" ||
    f.type === "table" ||
    f.type === "attendance_table" ||
    f.type === "section" ||
    f.type === "label"
  );
}

function groupSections(fields: FormField[]): { title: string; fields: FormField[] }[] {
  const details: FormField[] = [];
  const amounts: FormField[] = [];
  const dates: FormField[] = [];
  const other: FormField[] = [];

  for (const f of fields) {
    if (f.key === "amount" || (f.type === "number" && f.key.includes("amount"))) {
      amounts.push(f);
    } else if (f.type === "date" || f.type === "time" || f.key.includes("date")) {
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
  userRoles = [],
}: Props) {
  const visible = userRoles.length ? filterVisibleFields(fields, userRoles) : fields;
  const handle = (key: string, value: string) => onChange(key, value);

  const renderField = (f: FormField) => (
    <div key={f.key} className={isWideField(f) ? "wf-field wf-field-full" : "wf-field"}>
      <FormFieldBlock
        field={f}
        value={values[f.key] ?? ""}
        onChange={(v) => handle(f.key, v)}
        readOnly={readOnly}
        allValues={values}
      />
    </div>
  );

  if (layout === "highlight-amount") {
    const amountField = visible.find((f) => f.key === "amount");
    const rest = visible.filter((f) => f.key !== "amount");
    return (
      <div className="space-y-4">
        {amountField && (
          <FormFieldBlock
            field={amountField}
            value={values[amountField.key] ?? ""}
            onChange={(v) => handle(amountField.key, v)}
            readOnly={readOnly}
            highlight
            allValues={values}
          />
        )}
        <div className="wf-form-grid">{rest.map(renderField)}</div>
      </div>
    );
  }

  if (layout === "sectioned") {
    return (
      <div>
        {groupSections(visible).map((sec) => (
          <div key={sec.title} className="wf-form-panel">
            <h3 className="wf-form-section-title">{sec.title}</h3>
            <div className="wf-form-grid">{sec.fields.map(renderField)}</div>
          </div>
        ))}
      </div>
    );
  }

  // "stacked" (default) and "two-column" both render as a responsive grid:
  // a crisp two-column layout on desktop that collapses to one column on mobile.
  return <div className="wf-form-grid">{visible.map(renderField)}</div>;
}
