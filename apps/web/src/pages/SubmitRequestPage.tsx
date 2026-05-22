import { FormEvent, useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ThemeScope } from "../context/ThemeContext";
import { WorkflowFormRenderer } from "../components/WorkflowFormRenderer";
import { ApiError, apiFetch, apiUpload, FormField, WorkflowDefinition } from "../lib/api";
import { getToken } from "../lib/auth";
import {
  buildInitialForm,
  formToPayload,
  getFormFields,
  validateFormClient,
} from "../lib/formValidation";
import { LAYOUT_META, parseUiSettings, THEME_META } from "../lib/themes";

export function SubmitRequestPage() {
  const navigate = useNavigate();
  const [workflows, setWorkflows] = useState<WorkflowDefinition[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [fields, setFields] = useState<FormField[]>([]);
  const [form, setForm] = useState<Record<string, string>>({});
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [fieldsLoading, setFieldsLoading] = useState(false);

  const selected = workflows.find((w) => w.id === selectedId);
  const ui = parseUiSettings(selected?.settings);

  const applyWorkflow = useCallback((wf: WorkflowDefinition) => {
    const nextFields = getFormFields(wf.form_schema);
    setFields(nextFields);
    setForm(buildInitialForm(nextFields));
    setError("");
  }, []);

  const loadWorkflowDetail = useCallback(
    async (id: string) => {
      setFieldsLoading(true);
      try {
        const detail = await apiFetch<WorkflowDefinition>(
          `/api/v1/workflows/${id}`,
          {},
          getToken()
        );
        setWorkflows((prev) => prev.map((w) => (w.id === id ? { ...w, ...detail } : w)));
        applyWorkflow(detail);
      } catch (e) {
        setError(e instanceof ApiError ? e.detail ?? e.message : "Failed to load workflow form");
        setFields([]);
        setForm({});
      } finally {
        setFieldsLoading(false);
      }
    },
    [applyWorkflow]
  );

  useEffect(() => {
    apiFetch<WorkflowDefinition[]>("/api/v1/workflows?status=published", {}, getToken())
      .then(async (list) => {
        setWorkflows(list);
        if (list.length) {
          const first = list[0].id;
          setSelectedId(first);
          const fromList = getFormFields(list[0].form_schema);
          if (fromList.length > 0) {
            applyWorkflow(list[0]);
          } else {
            await loadWorkflowDetail(first);
          }
        }
      })
      .catch((e) => setError(e instanceof ApiError ? e.detail ?? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [applyWorkflow, loadWorkflowDetail]);

  function onWorkflowChange(id: string) {
    setSelectedId(id);
    setFile(null);
    const wf = workflows.find((w) => w.id === id);
    const fromList = wf ? getFormFields(wf.form_schema) : [];
    if (fromList.length > 0) {
      applyWorkflow(wf!);
    } else {
      loadWorkflowDetail(id);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    const clientErr = validateFormClient(fields, form);
    if (clientErr) {
      setError(clientErr);
      return;
    }
    if (fields.length === 0) {
      setError("This workflow has no form fields configured.");
      return;
    }
    try {
      const inst = await apiFetch<{ id: string }>(
        `/api/v1/workflows/${selectedId}/submit`,
        { method: "POST", body: JSON.stringify({ data: formToPayload(fields, form) }) },
        getToken()
      );
      if (file) {
        await apiUpload(`/api/v1/requests/${inst.id}/attachments`, file, getToken());
      }
      navigate(`/requests/${inst.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail ?? err.message : "Submit failed");
    }
  }

  if (loading) return <p className="text-slate-500">Loading…</p>;

  const formWidth =
    ui.form_layout === "two-column" ? "max-w-3xl" : ui.form_layout === "highlight-amount" ? "max-w-xl" : "max-w-lg";

  return (
    <div>
      <h1 className="wf-page-title mb-1">New request</h1>
      <p className="text-sm text-slate-500 mb-4">Choose a workflow and complete all required fields.</p>
      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
      {workflows.length === 0 ? (
        <p className="text-slate-600">
          No published workflows. Publish one under{" "}
          <Link to="/workflows" className="wf-link">
            Workflows
          </Link>
          .
        </p>
      ) : (
        <ThemeScope theme={ui.ui_theme} layout={ui.form_layout}>
          <form onSubmit={onSubmit} className={`wf-card p-6 ${formWidth} space-y-4`}>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="wf-badge">{THEME_META[ui.ui_theme].label}</span>
              <span className="text-xs text-slate-500">{LAYOUT_META[ui.form_layout].label} layout</span>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Workflow</label>
              <select
                value={selectedId}
                onChange={(e) => onWorkflowChange(e.target.value)}
                className="wf-input"
              >
                {workflows.map((w) => {
                  const u = parseUiSettings(w.settings);
                  return (
                    <option key={w.id} value={w.id}>
                      {w.name} ({THEME_META[u.ui_theme].label})
                    </option>
                  );
                })}
              </select>
            </div>
            {fieldsLoading ? (
              <p className="text-sm text-slate-500 py-4">Loading form fields…</p>
            ) : fields.length === 0 ? (
              <p className="text-sm text-amber-700 py-2">No form fields for this workflow.</p>
            ) : (
              <WorkflowFormRenderer
                fields={fields}
                values={form}
                onChange={(key, value) => setForm({ ...form, [key]: value })}
                layout={ui.form_layout}
              />
            )}
            <div>
              <label className="block text-sm font-medium mb-1">Attachment (optional)</label>
              <input
                type="file"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={fieldsLoading || fields.length === 0}
              className="w-full wf-btn-primary py-2 text-sm disabled:opacity-50"
            >
              Submit request
            </button>
          </form>
        </ThemeScope>
      )}
    </div>
  );
}
