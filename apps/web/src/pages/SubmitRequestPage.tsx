import { FormEvent, useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ThemeScope } from "../context/ThemeContext";
import { HelpTip } from "../components/HelpTip";
import { WorkflowFormRenderer } from "../components/WorkflowFormRenderer";
import { API_BASE, ApiError, apiFetch, apiUpload, FormField, WorkflowDefinition } from "../lib/api";
import { getToken } from "../lib/auth";
import {
  buildInitialForm,
  formToPayload,
  getFormFields,
  validateFormClient,
} from "../lib/formValidation";
import { parseUiSettings } from "../lib/themes";
import { clearDraft, loadDraft, saveDraft } from "../lib/offlineDrafts";

const UploadIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 16V4m0 0L8 8m4-4l4 4" />
    <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
  </svg>
);
const ClockIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);
const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 13l4 4L19 7" />
  </svg>
);

function assigneeLabel(a?: { type?: string; value?: string; user_ids?: string[] }): string {
  if (!a) return "Approver";
  if (a.type === "users") return `${(a.user_ids || []).length} named approver(s)`;
  if (a.type === "role") {
    if (a.value === "manager") return "Manager";
    if (a.value === "company_admin") return "Finance / Admin";
    if (a.value === "approver") return "Approver";
    return a.value || "Approver";
  }
  return "Approver";
}

export function SubmitRequestPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [workflows, setWorkflows] = useState<WorkflowDefinition[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [fields, setFields] = useState<FormField[]>([]);
  const [form, setForm] = useState<Record<string, string>>({});
  const [file, setFile] = useState<File | null>(null);
  const [draftHint, setDraftHint] = useState("");
  const [ocrHint, setOcrHint] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [fieldsLoading, setFieldsLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

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
    apiFetch<WorkflowDefinition[]>(
      "/api/v1/workflows?status=published&initiator_only=true",
      {},
      getToken()
    )
      .then(async (list) => {
        setWorkflows(list);
        if (list.length) {
          const paramWf = searchParams.get("wf");
          const first = (paramWf && list.find((w) => w.id === paramWf)?.id) || list[0].id;
          setSelectedId(first);
          const found = list.find((w) => w.id === first);
          const fromList = found ? getFormFields(found.form_schema) : [];
          if (fromList.length > 0) {
            applyWorkflow(found!);
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
    setOcrHint("");
    const wf = workflows.find((w) => w.id === id);
    const fromList = wf ? getFormFields(wf.form_schema) : [];
    if (fromList.length > 0) {
      applyWorkflow(wf!);
      const draft = loadDraft(id);
      if (draft?.form) {
        setForm(draft.form as Record<string, string>);
        setDraftHint(`Draft restored from ${new Date(draft.savedAt).toLocaleString()}`);
      } else {
        setDraftHint("");
      }
    } else {
      loadWorkflowDetail(id);
    }
  }

  function onFormChange(key: string, value: string) {
    const next = { ...form, [key]: value };
    setForm(next);
    if (selectedId) {
      saveDraft(selectedId, next);
      setDraftHint("Draft saved on this device");
    }
  }

  async function onFileSelected(f: File | null) {
    setFile(f);
    setOcrHint("");
    if (!f) return;
    try {
      const formData = new FormData();
      formData.append("file", f);
      formData.append("doc_type", "auto");
      const token = getToken();
      const res = await fetch(`${API_BASE}/api/v1/documents/extract`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      if (!res.ok) return;
      const data = (await res.json()) as {
        fields: { key: string; value: string; confidence: number }[];
        message: string;
        requires_review: boolean;
      };
      const patch: Record<string, string> = { ...form };
      for (const field of data.fields) {
        if (field.key in patch || fields.some((x) => x.key === field.key)) {
          patch[field.key] = String(field.value);
        }
      }
      setForm(patch);
      if (selectedId) saveDraft(selectedId, patch);
      setOcrHint(
        data.requires_review
          ? `${data.message} Review highlighted values before submit.`
          : data.message
      );
    } catch {
      /* OCR optional */
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
      clearDraft(selectedId);
      navigate(`/requests/${inst.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail ?? err.message : "Submit failed");
    }
  }

  if (loading) return <p className="text-slate-500">Loading…</p>;

  const steps = (selected?.steps ?? []) as Array<{
    id?: string;
    name?: string;
    assignee?: { type?: string; value?: string; user_ids?: string[] };
  }>;
  const slaHours = (selected?.settings as { sla_hours?: number } | undefined)?.sla_hours;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex items-center gap-2 mb-1">
        <h1 className="wf-page-title">New request</h1>
        <HelpTip text="Pick a published workflow, fill required fields, and attach supporting documents. Your progress is auto-saved on this device until you submit." />
      </div>
      <p className="text-sm text-slate-500 mb-6">Choose a workflow and complete all required fields.</p>
      {error && (
        <p className="text-sm text-red-600 mb-4 rounded-lg border border-red-100 bg-red-50 px-3 py-2">
          {error}
        </p>
      )}
      {workflows.length === 0 ? (
        <p className="text-slate-600">
          No forms available for you to start. You may not be listed as an initiator, or workflows need
          to be published under{" "}
          <Link to="/workflows" className="wf-link">
            Workflows
          </Link>
          .
        </p>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-3">
          <ThemeScope theme={ui.ui_theme} layout={ui.form_layout} className="lg:col-span-2">
            <form onSubmit={onSubmit} className="wf-card p-6 space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Workflow</label>
                <select
                  value={selectedId}
                  onChange={(e) => onWorkflowChange(e.target.value)}
                  className="wf-input"
                >
                  {workflows.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
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
                  onChange={onFormChange}
                  layout={ui.form_layout}
                />
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Attachment / photo <span className="font-normal text-slate-400">(optional)</span>
                </label>
                <label
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                    const f = e.dataTransfer.files?.[0];
                    if (f) void onFileSelected(f);
                  }}
                  className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed px-4 py-3 transition-colors ${
                    dragOver
                      ? "border-[rgb(var(--wf-brand-500))] bg-[rgb(var(--wf-accent-muted))]"
                      : "border-slate-200 hover:border-slate-300 hover:bg-slate-50/60"
                  }`}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[rgb(var(--wf-accent-muted))] text-[rgb(var(--wf-brand-600))]">
                    <UploadIcon />
                  </span>
                  <span className="min-w-0 text-sm">
                    {file ? (
                      <>
                        <span className="block truncate font-medium text-slate-800">{file.name}</span>
                        <span className="text-xs text-slate-500">
                          Click to replace · {(file.size / 1024).toFixed(0)} KB
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="font-medium text-slate-700">
                          Drag a file here, or click to upload
                        </span>
                        <span className="block text-xs text-slate-400">
                          Image, PDF, CSV or text — receipts auto-fill the form
                        </span>
                      </>
                    )}
                  </span>
                  <input
                    type="file"
                    accept="image/*,.pdf,.txt,.csv"
                    capture="environment"
                    onChange={(e) => void onFileSelected(e.target.files?.[0] ?? null)}
                    className="hidden"
                  />
                </label>
                {ocrHint && <p className="mt-1.5 text-xs text-slate-600">{ocrHint}</p>}
              </div>

              <button
                type="submit"
                disabled={fieldsLoading || fields.length === 0}
                className="w-full wf-btn-primary py-2.5 text-sm font-medium disabled:opacity-50"
              >
                Submit request
              </button>
              {draftHint && <p className="text-center text-xs text-slate-400">{draftHint}</p>}
            </form>
          </ThemeScope>

          <aside className="space-y-4">
            <div className="wf-card p-5">
              <h2 className="text-sm font-semibold text-slate-800">{selected?.name}</h2>
              <p className="mt-1 text-xs text-slate-500">
                Fill in the form and submit — your request routes through the approval chain below.
              </p>
              {steps.length > 0 && (
                <ol className="mt-4 space-y-3">
                  {steps.map((s, i) => (
                    <li key={s.id ?? i} className="flex gap-3">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--wf-accent-muted))] text-xs font-semibold text-[rgb(var(--wf-brand-700))]">
                        {i + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm leading-tight text-slate-800">{s.name}</p>
                        <p className="text-xs text-slate-500">{assigneeLabel(s.assignee)}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
              {slaHours != null && (
                <div className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
                  <ClockIcon /> Target turnaround: {slaHours}h
                </div>
              )}
            </div>
            <div className="wf-card p-5">
              <p className="flex items-center gap-2 text-xs text-slate-500">
                <span className="text-[rgb(var(--wf-brand-600))]">
                  <CheckIcon />
                </span>
                Your progress is auto-saved on this device until you submit.
              </p>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
