import { FormField } from "../lib/api";

/** Loose shape for a workflow step (definitions type steps as Record<string, unknown>[]). */
export interface PreviewStep {
  id?: string;
  name?: string;
  type?: string;
  assignee?: { type?: string; value?: string; mode?: string; user_ids?: string[] };
}

const ROLE_LABELS: Record<string, string> = {
  company_admin: "Admin",
  manager: "Manager",
  approver: "Approver",
  originator: "Requester",
};

function assigneeLabel(a?: PreviewStep["assignee"]): string {
  if (!a) return "Assigned approver";
  if (a.type === "role") return `Role: ${a.value ? ROLE_LABELS[a.value] ?? a.value : "—"}`;
  if (a.type === "users") return a.user_ids?.length ? `${a.user_ids.length} user(s)` : "Specific users";
  if (a.type === "group") return "User group";
  return "Assigned approver";
}

function FlowNode({ tone, title, sub }: { tone: "start" | "step" | "end"; title: string; sub: string }) {
  const cls =
    tone === "start"
      ? "border-indigo-200 bg-indigo-50 text-indigo-900"
      : tone === "end"
        ? "border-green-200 bg-green-50 text-green-900"
        : "border-slate-200 bg-white text-slate-800";
  return (
    <div className={`rounded-xl border px-3 py-2 min-w-[128px] max-w-[190px] shadow-sm ${cls}`}>
      <p className="text-[13px] font-semibold leading-tight">{title}</p>
      <p className="text-[11px] opacity-75 mt-0.5 leading-tight">{sub}</p>
    </div>
  );
}

function Flowchart({ steps }: { steps: PreviewStep[] }) {
  const nodes: { tone: "start" | "step" | "end"; title: string; sub: string }[] = [
    { tone: "start", title: "Submitter", sub: "Fills & submits the form" },
    ...steps.map((s, i) => ({
      tone: "step" as const,
      title: s.name || `Step ${i + 1}`,
      sub: assigneeLabel(s.assignee),
    })),
    { tone: "end", title: "Complete", sub: "Approved & recorded" },
  ];
  return (
    <div className="flex flex-nowrap items-center gap-x-1 gap-y-3 min-w-max">
      {nodes.map((n, i) => (
        <div key={i} className="flex items-center gap-1">
          <FlowNode tone={n.tone} title={n.title} sub={n.sub} />
          {i < nodes.length - 1 && <span className="text-slate-300 font-bold px-1 text-lg">→</span>}
        </div>
      ))}
    </div>
  );
}

function FieldPreview({ field: f }: { field: FormField }) {
  const box = "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-slate-50 text-slate-400";
  const label = (
    <label className="block text-xs font-semibold text-slate-600 mb-1">
      {f.label || f.key}
      {f.required ? <span className="text-red-500"> *</span> : null}
    </label>
  );
  switch (f.type) {
    case "section":
    case "label":
      return <p className="text-sm font-semibold text-slate-700 pt-1">{f.content || f.label}</p>;
    case "attachment":
      return (
        <div>
          {label}
          <div className="border-2 border-dashed border-indigo-200 bg-indigo-50/60 rounded-lg p-4 text-center text-xs text-indigo-500">
            ⬆ {f.placeholder || "Attach a file"}
          </div>
        </div>
      );
    case "textarea":
    case "long_text":
      return (
        <div>
          {label}
          <div className={`${box} h-16`}>{f.placeholder || "Long text…"}</div>
        </div>
      );
    case "select":
      return (
        <div>
          {label}
          <div className={`${box} flex items-center justify-between`}>
            <span>{f.options?.[0]?.label || "Choose an option…"}</span>
            <span>▾</span>
          </div>
        </div>
      );
    case "checkbox":
      return (
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <span className="w-4 h-4 border border-slate-300 rounded bg-white inline-block" />
          {f.label || f.key}
        </label>
      );
    case "date":
      return (
        <div>
          {label}
          <div className={box}>📅 dd / mm / yyyy</div>
        </div>
      );
    case "number":
      return (
        <div>
          {label}
          <div className={box}>{f.placeholder || "0"}</div>
        </div>
      );
    case "calculated":
      return (
        <div>
          {label}
          <div className={box}>= {f.formula || "computed value"}</div>
        </div>
      );
    case "table":
      return (
        <div>
          {label}
          <div className="border border-slate-200 rounded-lg p-2 text-xs text-slate-400">
            Table: {(f.tableColumns ?? []).map((c) => c.label).join(", ") || "columns"}
          </div>
        </div>
      );
    case "button":
      return (
        <div className="inline-block bg-indigo-600 text-white text-sm rounded-lg px-4 py-2">
          {f.buttonText || f.label || "Button"}
        </div>
      );
    default:
      return (
        <div>
          {label}
          <div className={box}>{f.placeholder || "Text…"}</div>
        </div>
      );
  }
}

/** Read-only visual preview of a workflow: the flow of steps + the rendered form. */
export function WorkflowPreviewModal({
  open,
  onClose,
  name,
  fields,
  steps,
}: {
  open: boolean;
  onClose: () => void;
  name: string;
  fields: FormField[];
  steps: PreviewStep[];
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-white rounded-2xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-6 py-4 border-b border-slate-200 sticky top-0 bg-white z-10">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{name || "Workflow"}</h2>
            <p className="text-xs text-slate-500">Preview — how this workflow looks and flows</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close preview"
            className="text-slate-400 hover:text-slate-700 text-xl leading-none px-2"
          >
            ✕
          </button>
        </div>

        <div className="px-6 py-5 border-b border-slate-100">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">Flow</h3>
          <div className="overflow-x-auto pb-1">
            <Flowchart steps={steps} />
          </div>
        </div>

        <div className="px-6 py-5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">
            Form — what the submitter fills in
          </h3>
          {fields.length === 0 ? (
            <p className="text-sm text-slate-500">This workflow has no form fields.</p>
          ) : (
            <div className="space-y-4 max-w-lg">
              {fields.map((f, i) => (
                <FieldPreview key={f.key || i} field={f} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
