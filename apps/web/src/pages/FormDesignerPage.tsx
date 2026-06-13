import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FormDesigner, getDesignerJson } from "../components/FormDesigner";
import { HelpTip } from "../components/HelpTip";
import { ApiError, apiFetch } from "../lib/api";
import { getToken } from "../lib/auth";
import {
  DEFAULT_WORKFLOW_STEP,
  type FormDesignerSchema,
  toPersistedSchema,
} from "../lib/formDesigner";

const emptyDesign = (): FormDesignerSchema => ({
  title: "",
  fields: [],
});

export function FormDesignerPage() {
  const navigate = useNavigate();
  const [design, setDesign] = useState<FormDesignerSchema>(emptyDesign);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function saveAsWorkflow() {
    setError("");
    setMessage("");
    const title = design.title.trim();
    if (!title) {
      setError("Enter a form title before saving.");
      return;
    }
    if (design.fields.length === 0) {
      setError("Add at least one control to the form.");
      return;
    }
    const persisted = toPersistedSchema(design);
    setSaving(true);
    try {
      const wf = await apiFetch<{ id: string; name: string }>(
        "/api/v1/workflows",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: title,
            form_schema: persisted,
            steps: [DEFAULT_WORKFLOW_STEP],
            routing_rules: [],
            settings: {},
          }),
        },
        getToken()
      );
      setMessage(`Saved as draft workflow “${wf.name}”.`);
      navigate("/workflows", { state: { openId: wf.id } });
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.detail ?? e.message
          : "Could not save workflow. Manager role may be required."
      );
    } finally {
      setSaving(false);
    }
  }

  function copyJson() {
    const json = getDesignerJson(design);
    void navigator.clipboard.writeText(json).then(
      () => setMessage("Form JSON copied to clipboard."),
      () => setError("Could not copy to clipboard.")
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="wf-page-title">Form designer</h1>
            <HelpTip text="Drag controls onto the canvas, set keys and options, then save as a draft workflow. Use Master data lists for company-wide dropdowns." />
          </div>
          <p className="text-slate-600 mt-1 text-sm max-w-xl">
            Build a form visually—drag controls from the toolbar onto the canvas, like Form.io.
            Save as a draft workflow or copy the JSON schema.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="wf-btn-secondary text-sm" onClick={copyJson}>
            Copy JSON
          </button>
          <button
            type="button"
            className="wf-btn-primary text-sm"
            disabled={saving}
            onClick={() => void saveAsWorkflow()}
          >
            {saving ? "Saving…" : "Save as draft workflow"}
          </button>
        </div>
      </div>

      <div className="wf-card p-4 space-y-4">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Form title</span>
          <input
            className="wf-input mt-1 w-full max-w-md"
            placeholder="e.g. Petty cash request"
            value={design.title}
            onChange={(e) => setDesign({ ...design, title: e.target.value })}
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Description (optional)</span>
          <input
            className="wf-input mt-1 w-full"
            placeholder="Short instructions for people filling in this form"
            value={design.description ?? ""}
            onChange={(e) => setDesign({ ...design, description: e.target.value })}
          />
        </label>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          {error}
        </p>
      )}
      {message && (
        <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
          {message}
        </p>
      )}

      <FormDesigner value={design} onChange={setDesign} />

      <p className="text-xs text-slate-400">
        Saved workflows appear under{" "}
        <Link to="/workflows" className="text-[rgb(var(--wf-brand-600))] underline">
          Workflows
        </Link>
        . Publish when ready for requests.
      </p>
    </div>
  );
}
