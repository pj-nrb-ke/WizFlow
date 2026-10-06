import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiError, apiFetch, type BpmnDiagramSummary, type WorkflowSummary } from "../lib/api";
import { getToken } from "../lib/auth";
import { HelpTip } from "../components/HelpTip";

export function ProcessDesignerPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<BpmnDiagramSummary[]>([]);
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [newName, setNewName] = useState("");
  const [importId, setImportId] = useState("");
  const [req, setReq] = useState("");
  const [templates, setTemplates] = useState<{ id: string; name: string; category: string; description: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [d, wf, tpl] = await Promise.all([
      apiFetch<BpmnDiagramSummary[]>("/api/v1/bpmn", {}, getToken()),
      apiFetch<WorkflowSummary[]>("/api/v1/workflows?status=published", {}, getToken()).catch(() => []),
      apiFetch<typeof templates>("/api/v1/bpmn/templates", {}, getToken()).catch(() => []),
    ]);
    setRows(d);
    setWorkflows(wf);
    setTemplates(tpl);
  }, []);

  useEffect(() => {
    load()
      .catch((e) => setError(e instanceof ApiError ? e.detail ?? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [load]);

  async function create() {
    setBusy(true);
    setError("");
    try {
      const d = await apiFetch<{ id: string }>(
        "/api/v1/bpmn",
        { method: "POST", body: JSON.stringify({ name: newName.trim() || "Untitled process" }) },
        getToken()
      );
      navigate(`/process-designer/${d.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.detail ?? e.message : "Could not create diagram");
      setBusy(false);
    }
  }

  async function importWorkflow() {
    if (!importId) return;
    setBusy(true);
    setError("");
    try {
      const d = await apiFetch<{ id: string }>(
        `/api/v1/bpmn/from-workflow/${importId}`,
        { method: "POST" },
        getToken()
      );
      navigate(`/process-designer/${d.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.detail ?? e.message : "Could not import workflow");
      setBusy(false);
    }
  }

  async function createFromTemplate(templateId: string) {
    setBusy(true); setError("");
    try {
      const d = await apiFetch<{ id: string }>("/api/v1/bpmn/from-template", { method: "POST", body: JSON.stringify({ template_id: templateId }) }, getToken());
      navigate(`/process-designer/${d.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.detail ?? e.message : "Could not start from template");
      setBusy(false);
    }
  }

  async function draftFromRequirements() {
    if (req.trim().length < 10) { setError("Describe the process in a bit more detail."); return; }
    setBusy(true); setError("");
    try {
      const d = await apiFetch<{ id: string }>("/api/v1/bpmn/from-requirements", { method: "POST", body: JSON.stringify({ description: req.trim() }) }, getToken());
      navigate(`/process-designer/${d.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.detail ?? e.message : "Could not draft from your description");
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setError("");
    try {
      await apiFetch(`/api/v1/bpmn/${id}`, { method: "DELETE" }, getToken());
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.detail ?? e.message : "Could not delete");
    }
  }

  if (loading) return <p className="text-slate-500">Loading…</p>;

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex items-center gap-2 mb-1">
        <h1 className="wf-page-title">Process Designer</h1>
        <HelpTip text="Design a process on a drag-and-drop BPMN canvas, let the Copilot build it from a description, or start from a template — then Publish as app to turn it into a running workflow." />
      </div>
      <p className="text-sm text-slate-500 mb-6">Describe a process, start from a template, or draw one — then publish it as a running app.</p>

      {error && (
        <p className="text-sm text-red-600 mb-4 rounded-lg border border-red-100 bg-red-50 px-3 py-2">{error}</p>
      )}

      {/* Describe → AI draft (AI-from-requirements intake) */}
      <div className="wf-card p-4 mb-6">
        <p className="text-sm font-medium text-slate-800 mb-1">🤖 Describe your process</p>
        <p className="text-xs text-slate-500 mb-2">Tell WizFlow what should happen and it drafts the diagram + request form for you to refine.</p>
        <textarea
          className="wf-input w-full mb-2" rows={2}
          placeholder="e.g. Staff submit a travel expense with an amount; a manager approves, and anything over 8,000 also needs finance."
          value={req} onChange={(e) => setReq(e.target.value)}
        />
        <button onClick={draftFromRequirements} disabled={busy} className="wf-btn-primary px-4 py-2 text-sm disabled:opacity-50">
          {busy ? "Drafting…" : "Draft with AI"}
        </button>
      </div>

      {/* Template gallery */}
      {templates.length > 0 && (
        <div className="mb-8">
          <p className="wf-sidebar-label mb-2">Start from a template</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {templates.map((t) => (
              <button key={t.id} onClick={() => createFromTemplate(t.id)} disabled={busy}
                className="wf-card p-3 text-left hover:border-[rgb(var(--wf-brand-500))] disabled:opacity-50 transition-colors">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-slate-800 text-sm">{t.name}</span>
                  <span className="text-[10px] uppercase tracking-wide text-slate-500 border border-slate-200 rounded px-1.5 py-0.5">{t.category}</span>
                </div>
                <p className="text-xs text-slate-500 mt-1">{t.description}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 mb-8">
        <div className="wf-card p-4">
          <p className="text-sm font-medium text-slate-800 mb-2">New diagram</p>
          <input
            className="wf-input mb-2"
            placeholder="Diagram name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <button onClick={create} disabled={busy} className="wf-btn-primary w-full py-2 text-sm disabled:opacity-50">
            Create &amp; open
          </button>
        </div>

        <div className="wf-card p-4">
          <p className="text-sm font-medium text-slate-800 mb-2">From a workflow</p>
          <select className="wf-input mb-2" value={importId} onChange={(e) => setImportId(e.target.value)}>
            <option value="">Select a published workflow…</option>
            {workflows.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
          <button
            onClick={importWorkflow}
            disabled={busy || !importId}
            className="w-full py-2 text-sm rounded-lg border border-[rgb(var(--wf-brand-500))] text-[rgb(var(--wf-brand-700))] disabled:opacity-50"
          >
            Visualize as BPMN
          </button>
        </div>
      </div>

      <p className="wf-sidebar-label mb-2">Your diagrams</p>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">No diagrams yet — create one above.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((d) => (
            <li key={d.id} className="wf-card p-4 flex items-center gap-3">
              <Link to={`/process-designer/${d.id}`} className="min-w-0 flex-1">
                <p className="font-medium text-slate-800 truncate">{d.name}</p>
                {d.description ? <p className="text-xs text-slate-500 truncate">{d.description}</p> : null}
                <p className="text-xs text-slate-400 mt-0.5">
                  Updated {new Date(d.updated_at).toLocaleString()}
                </p>
              </Link>
              <Link to={`/process-designer/${d.id}`} className="wf-link text-sm shrink-0">Open</Link>
              <button
                onClick={() => remove(d.id)}
                className="text-sm text-red-600 hover:underline shrink-0"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
