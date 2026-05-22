import { useCallback, useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  ApiError,
  apiFetch,
  PublishPreview,
  PublishRequest,
  SimulationResult,
  WorkflowDefinition,
  WorkflowPreview,
  WorkflowSummary,
  WorkflowVersion,
} from "../lib/api";
import { getToken } from "../lib/auth";

export function WorkflowsPage() {
  const location = useLocation();
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [selected, setSelected] = useState<WorkflowDefinition | null>(null);
  const [preview, setPreview] = useState<WorkflowPreview | null>(null);
  const [versions, setVersions] = useState<WorkflowVersion[]>([]);
  const [publishPreview, setPublishPreview] = useState<PublishPreview | null>(null);
  const [showPublish, setShowPublish] = useState(false);
  const [confirmPreview, setConfirmPreview] = useState(false);
  const [simResult, setSimResult] = useState<SimulationResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState("3000");

  const loadExtras = useCallback(async (id: string) => {
    const token = getToken();
    const [prev, vers] = await Promise.all([
      apiFetch<WorkflowPreview>(`/api/v1/workflows/${id}/preview`, {}, token),
      apiFetch<WorkflowVersion[]>(`/api/v1/workflows/${id}/versions`, {}, token),
    ]);
    setPreview(prev);
    setVersions(vers);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await apiFetch<WorkflowSummary[]>("/api/v1/workflows", {}, getToken());
      setWorkflows(list);
      const openId =
        (location.state as { openId?: string } | null)?.openId ?? list[0]?.id;
      if (openId) {
        const detail = await apiFetch<WorkflowDefinition>(
          `/api/v1/workflows/${openId}`,
          {},
          getToken()
        );
        setSelected(detail);
        await loadExtras(openId);
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.detail ?? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [loadExtras, location.state]);

  useEffect(() => {
    load();
  }, [load]);

  async function openWorkflow(id: string) {
    setError("");
    setSimResult(null);
    setShowPublish(false);
    try {
      const detail = await apiFetch<WorkflowDefinition>(`/api/v1/workflows/${id}`, {}, getToken());
      setSelected(detail);
      await loadExtras(id);
    } catch (e) {
      setError(e instanceof ApiError ? e.detail ?? e.message : "Failed to load workflow");
    }
  }

  async function openPublishModal() {
    if (!selected) return;
    setError("");
    try {
      const pp = await apiFetch<PublishPreview>(
        `/api/v1/workflows/${selected.id}/publish-preview`,
        {},
        getToken()
      );
      setPublishPreview(pp);
      setConfirmPreview(false);
      setShowPublish(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.detail ?? e.message : "Could not load publish preview");
    }
  }

  async function publish() {
    if (!selected) return;
    setError("");
    const body: PublishRequest = {
      confirm_preview: confirmPreview,
      test_completed: Boolean(selected.settings?.last_simulated_at) || Boolean(simResult),
    };
    try {
      const updated = await apiFetch<WorkflowDefinition>(
        `/api/v1/workflows/${selected.id}/publish`,
        { method: "POST", body: JSON.stringify(body) },
        getToken()
      );
      setSelected(updated);
      setShowPublish(false);
      await load();
      await loadExtras(updated.id);
    } catch (e) {
      setError(e instanceof ApiError ? e.detail ?? e.message : "Publish failed");
    }
  }

  async function simulate() {
    if (!selected) return;
    setError("");
    try {
      const result = await apiFetch<SimulationResult>(
        `/api/v1/workflows/${selected.id}/simulate`,
        {
          method: "POST",
          body: JSON.stringify({ data: { amount: Number(amount), purpose: "Demo" } }),
        },
        getToken()
      );
      setSimResult(result);
      const detail = await apiFetch<WorkflowDefinition>(
        `/api/v1/workflows/${selected.id}`,
        {},
        getToken()
      );
      setSelected(detail);
      const prev = await apiFetch<WorkflowPreview>(
        `/api/v1/workflows/${selected.id}/preview`,
        {},
        getToken()
      );
      setPreview(prev);
    } catch (e) {
      setError(e instanceof ApiError ? e.detail ?? e.message : "Simulation failed");
    }
  }

  async function newVersion() {
    if (!selected) return;
    setError("");
    try {
      const draft = await apiFetch<WorkflowDefinition>(
        `/api/v1/workflows/${selected.id}/new-version`,
        { method: "POST" },
        getToken()
      );
      await load();
      await openWorkflow(draft.id);
    } catch (e) {
      setError(e instanceof ApiError ? e.detail ?? e.message : "New version failed");
    }
  }

  async function rollback(version: number) {
    if (!selected || !confirm(`Create draft from version ${version}?`)) return;
    setError("");
    try {
      const draft = await apiFetch<WorkflowDefinition>(
        `/api/v1/workflows/${selected.id}/rollback/${version}`,
        { method: "POST" },
        getToken()
      );
      await load();
      await openWorkflow(draft.id);
    } catch (e) {
      setError(e instanceof ApiError ? e.detail ?? e.message : "Rollback failed");
    }
  }

  if (loading) return <p className="text-slate-500">Loading workflows…</p>;

  const tested = Boolean(selected?.settings?.last_simulated_at) || Boolean(simResult);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-slate-800">Workflows</h1>
        <Link
          to="/ai"
          className="text-sm px-3 py-1.5 bg-brand-50 text-brand-700 rounded-lg hover:bg-brand-100"
        >
          AI creator
        </Link>
      </div>
      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 bg-white rounded-lg border border-slate-200 divide-y max-h-[70vh] overflow-y-auto">
          {workflows.length === 0 ? (
            <p className="p-4 text-sm text-slate-500">No workflows yet.</p>
          ) : (
            workflows.map((w) => (
              <button
                key={w.id}
                type="button"
                onClick={() => openWorkflow(w.id)}
                className={`w-full text-left p-4 hover:bg-slate-50 ${
                  selected?.id === w.id ? "bg-brand-50" : ""
                }`}
              >
                <p className="font-medium text-slate-800">{w.name}</p>
                <p className="text-xs text-slate-500">
                  v{w.version} ·{" "}
                  <span
                    className={
                      w.status === "published"
                        ? "text-green-700"
                        : w.status === "archived"
                          ? "text-slate-500"
                          : "text-amber-700"
                    }
                  >
                    {w.status}
                  </span>
                </p>
              </button>
            ))
          )}
        </div>

        <div className="lg:col-span-2 space-y-4">
          {selected ? (
            <>
              <div className="bg-white rounded-lg border border-slate-200 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                  <div>
                    <h2 className="text-lg font-semibold">{selected.name}</h2>
                    <p className="text-sm text-slate-500">
                      v{selected.version} · {selected.status}
                      {selected.ai_generated && (
                        <span className="ml-2 text-xs text-brand-600">AI draft</span>
                      )}
                    </p>
                  </div>
                </div>
                <ol className="list-decimal list-inside text-sm text-slate-700 space-y-1 mb-4">
                  {selected.steps.map((s) => (
                    <li key={String(s.id)}>
                      {String(s.name)} → assignee{" "}
                      {String((s.assignee as { value?: string })?.value)}
                    </li>
                  ))}
                </ol>
                <div className="flex flex-wrap gap-2">
                  {selected.status === "draft" && (
                    <button
                      type="button"
                      onClick={openPublishModal}
                      className="px-4 py-2 bg-brand-600 text-white text-sm rounded-lg hover:bg-brand-700"
                    >
                      Publish…
                    </button>
                  )}
                  {selected.status === "published" && (
                    <button
                      type="button"
                      onClick={newVersion}
                      className="px-4 py-2 border border-slate-300 text-sm rounded-lg hover:bg-slate-50"
                    >
                      New version (draft)
                    </button>
                  )}
                  {selected.status === "draft" && (
                    <>
                      <label className="flex items-center gap-2 text-sm">
                        Amount:
                        <input
                          type="number"
                          value={amount}
                          onChange={(e) => setAmount(e.target.value)}
                          className="border rounded px-2 py-1 w-24"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={simulate}
                        className="px-4 py-2 border border-slate-300 text-sm rounded-lg hover:bg-slate-50"
                      >
                        Test with sample data
                      </button>
                    </>
                  )}
                </div>
                {selected.status === "draft" && !tested && (
                  <p className="text-xs text-amber-700 mt-2">Run a test before publishing.</p>
                )}
              </div>

              {preview && (
                <div className="bg-white rounded-lg border border-slate-200 p-4 text-sm">
                  <h3 className="font-medium text-slate-800 mb-2">Preview</h3>
                  <p className="text-slate-600 mb-2">
                    {(preview.form_fields ?? []).length} form field(s) ·{" "}
                    {(preview.steps ?? []).length} approval step(s)
                  </p>
                  {preview.gaps.length > 0 ? (
                    <ul className="list-disc list-inside text-amber-800">
                      {preview.gaps.map((g) => (
                        <li key={g}>{g}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-green-700">No gaps detected.</p>
                  )}
                </div>
              )}

              {versions.length > 0 && (
                <div className="bg-white rounded-lg border border-slate-200 p-4 text-sm">
                  <h3 className="font-medium text-slate-800 mb-2">Version history</h3>
                  <ul className="divide-y">
                    {versions.map((v) => (
                      <li key={v.id} className="py-2 flex justify-between gap-2">
                        <div>
                          <span className="font-medium">v{v.version}</span>
                          <span className="text-slate-500 ml-2">
                            {new Date(v.published_at).toLocaleString()}
                          </span>
                          {v.change_summary && (
                            <p className="text-slate-500 text-xs mt-0.5">{v.change_summary}</p>
                          )}
                        </div>
                        {selected.status === "published" && (
                          <button
                            type="button"
                            onClick={() => rollback(v.version)}
                            className="text-xs text-brand-600 hover:underline shrink-0"
                          >
                            Rollback to draft
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {simResult && (
                <div className="bg-slate-50 rounded-lg border border-slate-200 p-4 text-sm">
                  <p className="font-medium mb-1">Test result</p>
                  <p>Steps: {simResult.steps_traversed.join(" → ")}</p>
                  <p>Status: {simResult.final_status}</p>
                </div>
              )}
            </>
          ) : (
            <p className="text-slate-500">Select a workflow</p>
          )}
        </div>
      </div>

      {showPublish && publishPreview && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-lg max-w-md w-full p-5 text-sm">
            <h3 className="font-semibold text-lg mb-2">Confirm publish</h3>
            <p className="text-slate-600 mb-3">{publishPreview.change_summary}</p>
            <label className="flex items-start gap-2 mb-4">
              <input
                type="checkbox"
                checked={confirmPreview}
                onChange={(e) => setConfirmPreview(e.target.checked)}
                className="mt-1"
              />
              <span>I have reviewed the workflow preview and test results.</span>
            </label>
            {!tested && (
              <p className="text-amber-700 text-xs mb-3">Simulation required before publish.</p>
            )}
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setShowPublish(false)}
                className="px-3 py-1.5 border rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!confirmPreview || !tested}
                onClick={publish}
                className="px-3 py-1.5 bg-brand-600 text-white rounded-lg disabled:opacity-50"
              >
                Publish
              </button>
            </div>
          </div>
        </div>
      )}

      <p className="text-xs text-slate-400 mt-4">
        <Link to="/" className="text-brand-600">
          ← Dashboard
        </Link>
      </p>
    </div>
  );
}
