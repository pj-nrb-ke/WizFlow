import type { FormField } from "../lib/api";
import type { FormLayout } from "../lib/themes";
import { FormFieldBlock } from "./FormFieldControl";

type Props = {
  fields: FormField[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  layout: FormLayout;
  readOnly?: boolean;
};

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
}: Props) {
  const handle = (key: string, value: string) => onChange(key, value);

  if (layout === "highlight-amount") {
    const amountField = fields.find((f) => f.key === "amount");
    const rest = fields.filter((f) => f.key !== "amount");
    return (
      <div className="space-y-4">
        {amountField && (
          <FormFieldBlock
            field={amountField}
            value={values[amountField.key] ?? ""}
            onChange={(v) => handle(amountField.key, v)}
            readOnly={readOnly}
            highlight
          />
        )}
        <div className="space-y-4">
          {rest.map((f) => (
            <FormFieldBlock
              key={f.key}
              field={f}
              value={values[f.key] ?? ""}
              onChange={(v) => handle(f.key, v)}
              readOnly={readOnly}
            />
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
                <FormFieldBlock
                  key={f.key}
                  field={f}
                  value={values[f.key] ?? ""}
                  onChange={(v) => handle(f.key, v)}
                  readOnly={readOnly}
                />
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
          <div key={f.key} className={f.type === "textarea" || f.type === "label" ? "sm:col-span-2" : ""}>
            <FormFieldBlock
              field={f}
              value={values[f.key] ?? ""}
              onChange={(v) => handle(f.key, v)}
              readOnly={readOnly}
            />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {fields.map((f) => (
        <FormFieldBlock
          key={f.key}
          field={f}
          value={values[f.key] ?? ""}
          onChange={(v) => handle(f.key, v)}
          readOnly={readOnly}
        />
      ))}
    </div>
  );
}
