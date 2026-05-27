import { useCallback, useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  ApiError,
  apiDownload,
  apiFetch,
  getWorkflowHealthCheck,
  tuneWorkflow,
  PublishPreview,
  PublishRequest,
  SimulationResult,
  WorkflowDefinition,
  WorkflowHealthCheck,
  WorkflowPreview,
  WorkflowSummary,
  WorkflowVersion,
} from "../lib/api";
import { getToken } from "../lib/auth";
import { HelpTip } from "../components/HelpTip";
import { ThemeSwatches } from "../components/ThemeSwitcher";
import { StatusBadge } from "../components/StatusBadge";
import {
  FORM_LAYOUTS,
  LAYOUT_META,
  parseUiSettings,
  THEME_META,
  type UiSettings,
} from "../lib/themes";

export function WorkflowsPage() {
  const location = useLocation();
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [selected, setSelected] = useState<WorkflowDefinition | null>(null);
  const [preview, setPreview] = useState<WorkflowPreview | null>(null);
  const [versions, setVersions] = useState<WorkflowVersion[]>([]);
  const [publishPreview, setPublishPreview] = useState<PublishPreview | null>(null);
  const [showPublish, setShowPublish] = useState(false);
  const [healthCheck, setHealthCheck] = useState<WorkflowHealthCheck | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [confirmPreview, setConfirmPreview] = useState(false);
  const [simResult, setSimResult] = useState<SimulationResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState("3000");
  const [tuneText, setTuneText] = useState("");
  const [tuneMsg, setTuneMsg] = useState("");

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
    setHealthLoading(true);
    setHealthCheck(null);
    try {
      const [pp, health] = await Promise.all([
        apiFetch<PublishPreview>(
          `/api/v1/workflows/${selected.id}/publish-preview`,
          {},
          getToken()
        ),
        getWorkflowHealthCheck(selected.id, getToken()).catch(() => ({
          ok: true,
          issues: [] as WorkflowHealthCheck["issues"],
        })),
      ]);
      setPublishPreview(pp);
      setHealthCheck(health);
      setConfirmPreview(false);
      setShowPublish(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.detail ?? e.message : "Could not load publish preview");
    } finally {
      setHealthLoading(false);
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

  async function applyTune() {
    if (!selected || !tuneText.trim()) return;
    setError("");
    setTuneMsg("");
    try {
      const res = await tuneWorkflow(selected.id, tuneText.trim(), getToken());
      setTuneMsg(res.explanation);
      setTuneText("");
      const detail = await apiFetch<WorkflowDefinition>(
        `/api/v1/workflows/${selected.id}`,
        {},
        getToken()
      );
      setSelected(detail);
      await loadExtras(selected.id);
    } catch (e) {
      setError(e instanceof ApiError ? e.detail ?? e.message : "Tune failed");
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

  const selectedUi = parseUiSettings(selected?.settings);

  async function saveUiSettings(next: UiSettings) {
    if (!selected) return;
    setError("");
    try {
      const updated = await apiFetch<WorkflowDefinition>(
        `/api/v1/workflows/${selected.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            settings: { ...(selected.settings || {}), ui_theme: next.ui_theme, form_layout: next.form_layout },
          }),
        },
        getToken()
      );
      setSelected(updated);
    } catch (e) {
      setError(e instanceof ApiError ? e.detail ?? e.message : "Failed to save theme");
    }
  }

  if (loading) return <p className="text-slate-500">Loading workflows…</p>;

  const tested = Boolean(selected?.settings?.last_simulated_at) || Boolean(simResult);
  const previewReady = preview != null && preview.gaps.length === 0;
  const publishStep = selected?.status === "published" ? 4 : !previewReady ? 1 : !tested ? 2 : 3;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2">
          <h1 className="wf-page-title">Workflows</h1>
          <HelpTip text="Draft → preview → simulate → publish. Use plain-English tune on draft workflows. Export the workflow list to Excel for audits." />
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="text-sm px-3 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50"
            onClick={() =>
              apiDownload("/api/v1/workflows/export.xlsx", "workflows.xlsx", getToken()).catch(
                (e) => setError(e instanceof ApiError ? e.detail ?? e.message : "Export failed")
              )
            }
          >
            Export Excel
          </button>
          <Link to="/ai" className="text-sm px-3 py-1.5 wf-card-accent wf-link font-medium">
            AI creator
          </Link>
        </div>
      </div>
      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      <div className="grid lg:grid-cols-3 gap-6">
        <div
          className="lg:col-span-1 wf-card divide-y max-h-[70vh] overflow-y-auto"
          data-testid="workflow-list"
          data-workflow-count={loading ? "" : String(workflows.length)}
        >
          {workflows.length === 0 ? (
            <p className="p-4 text-sm text-slate-500">No workflows yet.</p>
          ) : (
            workflows.map((w) => (
              <button
                key={w.id}
                type="button"
                data-testid="workflow-list-item"
                onClick={() => openWorkflow(w.id)}
                className={`w-full text-left p-4 hover:bg-slate-50/80 ${
                  selected?.id === w.id ? "bg-[rgb(var(--wf-accent-muted))]" : ""
                }`}
              >
                <p className="font-medium text-slate-800">{w.name}</p>
                <p className="text-xs text-slate-500 flex flex-wrap gap-1 items-center mt-0.5">
                  v{w.version} · <StatusBadge status={w.status} />
                </p>
              </button>
            ))
          )}
        </div>

        <div className="lg:col-span-2 space-y-4">
          {selected ? (
            <>
              <div className="wf-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                  <div>
                    <h2 className="text-lg font-semibold">{selected.name}</h2>
                    <p className="text-sm text-slate-500 flex flex-wrap gap-2 items-center">
                      v{selected.version} · <StatusBadge status={selected.status} />
                      {selected.ai_generated && <span className="wf-badge">AI draft</span>}
                    </p>
                  </div>
                </div>

                <div className="mb-4 p-3 wf-card-accent text-sm space-y-3">
                  <p className="font-medium text-slate-700">Appearance</p>
                  <ThemeSwatches
                    value={selectedUi.ui_theme}
                    onChange={(t) => saveUiSettings({ ...selectedUi, ui_theme: t })}
                  />
                  <div className="flex flex-wrap gap-2">
                    {FORM_LAYOUTS.map((layout) => (
                      <button
                        key={layout}
                        type="button"
                        title={LAYOUT_META[layout].description}
                        onClick={() => saveUiSettings({ ...selectedUi, form_layout: layout })}
                        className={`px-3 py-1 rounded-lg text-xs border ${
                          selectedUi.form_layout === layout
                            ? "border-slate-800 bg-white font-medium"
                            : "border-slate-200 hover:border-slate-400"
                        }`}
                      >
                        {LAYOUT_META[layout].label}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-slate-500">
                    Theme: {THEME_META[selectedUi.ui_theme].description}. Applies to new submissions.
                  </p>
                </div>
                <ol className="list-decimal list-inside text-sm text-slate-700 space-y-1 mb-4">
                  {selected.steps.map((s) => {
                    const a = (s.assignee || {}) as {
                      type?: string;
                      value?: string;
                      mode?: string;
                      user_ids?: string[];
                    };
                    const label =
                      a.type === "users"
                        ? `users (${(a.user_ids || []).length}) · ${a.mode || "claim"}`
                        : a.type === "role"
                          ? `role: ${a.value}${a.mode ? ` · ${a.mode}` : ""}`
                          : "—";
                    const slaH = (s as { sla_hours?: number }).sla_hours;
                    return (
                      <li key={String(s.id)}>
                        {String(s.name)} → {label}
                        {slaH != null ? ` · SLA ${slaH}h` : ""}
                      </li>
                    );
                  })}
                </ol>
                {selected.status === "draft" && (
                  <SlaStepEditor
                    workflow={selected}
                    onSaved={(updated) => setSelected(updated)}
                  />
                )}
                {selected.status === "draft" && (
                  <div className="mb-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                      Publishing steps
                    </p>
                    <ol className="flex flex-wrap gap-2 text-xs">
                      {(["Draft", "Preview", "Simulate", "Publish"] as const).map((label, i) => {
                        const stepIndex = i;
                        const active = publishStep === stepIndex;
                        const done = publishStep > stepIndex;
                        return (
                          <li
                            key={label}
                            className={`px-2.5 py-1 rounded-full border ${
                              active
                                ? "border-[rgb(var(--wf-brand-600))] bg-[rgb(var(--wf-accent-muted))] font-semibold text-[rgb(var(--wf-brand-700))]"
                                : done
                                  ? "border-green-200 bg-green-50 text-green-800"
                                  : "border-slate-200 text-slate-500"
                            }`}
                          >
                            {done && !active ? "✓ " : ""}
                            {label}
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                )}
                <div className="flex flex-wrap gap-2 items-center">
                  {selected.status === "draft" && (
                    <button
                      type="button"
                      onClick={openPublishModal}
                      disabled={healthLoading}
                      className="px-4 py-2 wf-btn-primary text-sm disabled:opacity-50"
                    >
                      {healthLoading ? "Checking…" : "Publish…"}
                    </button>
                  )}
                  {selected.status === "draft" && (
                    <HelpTip text="Review the preview, run a simulation with sample data, then publish. Health check warns about missing assignees or form gaps before go-live." />
                  )}
                  {selected.status === "published" && (
                    <button
                      type="button"
                      onClick={newVersion}
                      className="px-4 py-2 wf-btn-secondary text-sm"
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
                        className="px-4 py-2 wf-btn-secondary text-sm"
                      >
                        Test with sample data
                      </button>
                    </>
                  )}
                </div>
                {selected.status === "draft" && !tested && (
                  <p className="text-xs text-amber-700 mt-2">Run a test before publishing.</p>
                )}
                {selected.status === "draft" && (
                  <div className="mt-4 p-3 border border-slate-200 rounded-lg bg-slate-50/80">
                    <p className="text-sm font-medium text-slate-800 mb-2">Plain-English tune</p>
                    <p className="text-xs text-slate-500 mb-2">
                      e.g. “Add Finance approval for amounts over 5000” or “Require attachment on submit”
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <input
                        value={tuneText}
                        onChange={(e) => setTuneText(e.target.value)}
                        placeholder="Describe the change…"
                        className="wf-input flex-1 min-w-[12rem]"
                      />
                      <button
                        type="button"
                        disabled={tuneText.trim().length < 3}
                        onClick={() => void applyTune()}
                        className="px-4 py-2 wf-btn-secondary text-sm disabled:opacity-50"
                      >
                        Apply tune
                      </button>
                    </div>
                    {tuneMsg && <p className="text-xs text-green-700 mt-2">{tuneMsg}</p>}
                  </div>
                )}
              </div>

              {preview && (
                <div className="wf-card p-4 text-sm">
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
                <div className="wf-card p-4 text-sm">
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
          <div className="bg-white rounded-lg shadow-lg max-w-md w-full p-5 text-sm max-h-[90vh] overflow-y-auto">
            <h3 className="font-semibold text-lg mb-2">Confirm publish</h3>
            {healthCheck && (
              <div
                className={`mb-3 rounded-lg border p-3 ${
                  healthCheck.ok
                    ? "border-green-200 bg-green-50 text-green-900"
                    : "border-amber-300 bg-amber-50 text-amber-950"
                }`}
              >
                <p className="font-medium mb-1">
                  Health check {healthCheck.ok ? "passed" : "— review issues"}
                </p>
                {healthCheck.issues.length > 0 ? (
                  <ul className="list-disc list-inside space-y-0.5">
                    {healthCheck.issues.map((issue, i) => (
                      <li key={`${issue.message}-${i}`}>{issue.message}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs">No blocking issues detected.</p>
                )}
              </div>
            )}
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
                disabled={!confirmPreview || !tested || (healthCheck != null && !healthCheck.ok)}
                onClick={publish}
                className="px-3 py-1.5 wf-btn-primary disabled:opacity-50"
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

function SlaStepEditor({
  workflow,
  onSaved,
}: {
  workflow: WorkflowDefinition;
  onSaved: (w: WorkflowDefinition) => void;
}) {
  const [wfSla, setWfSla] = useState(String((workflow.settings as { sla_hours?: number })?.sla_hours ?? 48));
  const [steps, setSteps] = useState(
    workflow.steps.map((s) => ({
      ...(s as Record<string, unknown>),
      sla_hours: String((s as { sla_hours?: number }).sla_hours ?? ""),
    }))
  );
  const [msg, setMsg] = useState("");

  async function save() {
    const nextSteps = workflow.steps.map((orig, i) => {
      const patch = steps[i] as { sla_hours?: string | number };
      const hours = patch.sla_hours === "" || patch.sla_hours == null ? undefined : Number(patch.sla_hours);
      const out = { ...orig } as Record<string, unknown>;
      if (hours != null && !Number.isNaN(hours)) out.sla_hours = hours;
      else delete out.sla_hours;
      return out;
    });
    const settings = {
      ...(workflow.settings || {}),
      sla_hours: Number(wfSla) || 48,
      escalation: { enabled: true, escalate_to_role: "manager" },
    };
    const updated = await apiFetch<WorkflowDefinition>(
      `/api/v1/workflows/${workflow.id}`,
      {
        method: "PATCH",
        body: JSON.stringify({ steps: nextSteps, settings }),
      },
      getToken()
    );
    onSaved(updated);
    setMsg("SLA settings saved.");
  }

  return (
    <div className="mb-4 p-3 border border-slate-200 rounded-lg bg-white">
      <p className="text-sm font-medium text-slate-800 mb-2">SLA by step</p>
      <label className="text-xs text-slate-600 block mb-2">
        Workflow default (hours)
        <input
          type="number"
          className="wf-input block mt-0.5 w-24"
          value={wfSla}
          onChange={(e) => setWfSla(e.target.value)}
        />
      </label>
      <ul className="space-y-2 mb-2">
        {steps.map((s, i) => (
          <li key={String((s as { id?: string }).id ?? i)} className="flex items-center gap-2 text-sm">
            <span className="flex-1 truncate">{String((s as { name?: string }).name ?? `Step ${i + 1}`)}</span>
            <input
              type="number"
              placeholder="hrs"
              className="wf-input w-20 text-xs"
              value={(s as { sla_hours?: string | number }).sla_hours ?? ""}
              onChange={(e) => {
                const next = [...steps];
                next[i] = { ...next[i], sla_hours: e.target.value };
                setSteps(next);
              }}
            />
          </li>
        ))}
      </ul>
      <button type="button" onClick={() => void save()} className="wf-btn-secondary text-sm px-3 py-1.5">
        Save SLA
      </button>
      {msg && <p className="text-xs text-green-700 mt-1">{msg}</p>}
    </div>
  );
}
