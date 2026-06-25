import { useCallback, useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  ApiError,
  apiDownload,
  apiFetch,
  cloneWorkflow,
  deleteWorkflow,
  getWorkflowHealthCheck,
  tuneWorkflow,
  getPublicLink,
  createPublicLink,
  revokePublicLink,
  listGuestSubmissions,
  getGuestSubmission,
  acceptGuestSubmission,
  rejectGuestSubmission,
  sendFormNow,
  listFormSchedules,
  createFormSchedule,
  toggleFormSchedule,
  deleteFormSchedule,
  getFormReport,
  PublishPreview,
  PublishRequest,
  SimulationResult,
  WorkflowDefinition,
  WorkflowHealthCheck,
  WorkflowPreview,
  WorkflowSummary,
  WorkflowVersion,
  PublicLinkOut,
  GuestSubOut,
  GuestSubDetail,
  GuestAttachmentInfo,
  FormScheduleOut,
  FormReport,
  OrgUser,
  downloadGuestAttachment,
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
  const [cloneMsg, setCloneMsg] = useState("");
  const [cloning, setCloning] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Public link
  const [publicLink, setPublicLink] = useState<PublicLinkOut | null>(null);
  const [linkLoading, setLinkLoading] = useState(false);
  const [linkMsg, setLinkMsg] = useState("");
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  // Guest submissions
  const [guestSubs, setGuestSubs] = useState<GuestSubOut[]>([]);
  const [selectedSub, setSelectedSub] = useState<GuestSubDetail | null>(null);
  const [subTab, setSubTab] = useState<"pending" | "all">("pending");
  const [rejectReason, setRejectReason] = useState("");
  const [subAction, setSubAction] = useState<"accept" | "reject" | null>(null);
  const [subWorking, setSubWorking] = useState(false);
  const [subMsg, setSubMsg] = useState("");

  // Send form (Feature 1 & 2)
  const [orgUsers, setOrgUsers] = useState<OrgUser[]>([]);
  const [sendSelected, setSendSelected] = useState<Set<string>>(new Set());
  const [sendMsg, setSendMsg] = useState("");
  const [sending, setSending] = useState(false);
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [schedules, setSchedules] = useState<FormScheduleOut[]>([]);
  const [schedName, setSchedName] = useState("");
  const [schedFreq, setSchedFreq] = useState<"weekly" | "monthly" | "once">("weekly");
  const [schedDate, setSchedDate] = useState("");
  const [schedCreating, setSchedCreating] = useState(false);

  // Form report (Feature 8)
  const [report, setReport] = useState<FormReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);

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
    setCloneMsg("");
    setSelectedSub(null);
    setPublicLink(null);
    setGuestSubs([]);
    setLinkMsg("");
    setSubMsg("");
    setSendMsg("");
    setSendSelected(new Set());
    setShowScheduleForm(false);
    setSchedules([]);
    setReport(null);
    try {
      const detail = await apiFetch<WorkflowDefinition>(`/api/v1/workflows/${id}`, {}, getToken());
      setSelected(detail);
      await loadExtras(id);
      if (detail.status === "published") {
        void loadPublicLink(id);
        void loadGuestSubs(id);
        void loadOrgUsers();
        void loadSchedules(id);
        void loadReport(id);
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.detail ?? e.message : "Failed to load workflow");
    }
  }

  async function loadOrgUsers() {
    if (orgUsers.length > 0) return;
    try {
      const dir = await apiFetch<{ users: OrgUser[] }>("/api/v1/org-directory", {}, getToken());
      setOrgUsers(dir.users);
    } catch {
      // non-critical
    }
  }

  async function loadSchedules(id: string) {
    try {
      const s = await listFormSchedules(id, getToken());
      setSchedules(s);
    } catch {
      setSchedules([]);
    }
  }

  async function loadReport(id: string) {
    setReportLoading(true);
    try {
      const r = await getFormReport(id, getToken());
      setReport(r);
    } catch {
      setReport(null);
    } finally {
      setReportLoading(false);
    }
  }

  async function loadPublicLink(id: string) {
    try {
      const link = await getPublicLink(id, getToken());
      setPublicLink(link);
    } catch {
      setPublicLink(null);
    }
  }

  async function loadGuestSubs(id: string) {
    try {
      const subs = await listGuestSubmissions(id, getToken());
      setGuestSubs(subs);
    } catch {
      setGuestSubs([]);
    }
  }

  async function handleCreateLink() {
    if (!selected) return;
    setLinkLoading(true);
    setLinkMsg("");
    try {
      const link = await createPublicLink(selected.id, getToken());
      setPublicLink(link);
      setConfirmRevoke(false);
    } catch (e) {
      setLinkMsg(e instanceof ApiError ? e.detail ?? e.message : "Failed to generate link");
    } finally {
      setLinkLoading(false);
    }
  }

  async function handleRevokeLink() {
    if (!selected) return;
    setLinkLoading(true);
    try {
      await revokePublicLink(selected.id, getToken());
      setPublicLink(null);
      setConfirmRevoke(false);
      setLinkMsg("Link revoked. Anyone with the old URL can no longer submit.");
    } catch (e) {
      setLinkMsg(e instanceof ApiError ? e.detail ?? e.message : "Failed to revoke link");
    } finally {
      setLinkLoading(false);
    }
  }

  async function openSub(id: string) {
    if (!selected) return;
    setSubMsg("");
    setSubAction(null);
    setRejectReason("");
    try {
      const detail = await getGuestSubmission(selected.id, id, getToken());
      setSelectedSub(detail);
    } catch (e) {
      setSubMsg(e instanceof ApiError ? e.detail ?? e.message : "Failed to load submission");
    }
  }

  async function handleAccept() {
    if (!selected || !selectedSub) return;
    setSubWorking(true);
    setSubMsg("");
    try {
      const res = await acceptGuestSubmission(selected.id, selectedSub.id, getToken());
      setSubMsg(res.message);
      setSelectedSub({ ...selectedSub, status: "accepted" });
      setGuestSubs((prev) => prev.map((s) => s.id === selectedSub.id ? { ...s, status: "accepted" } : s));
      setSubAction(null);
    } catch (e) {
      setSubMsg(e instanceof ApiError ? e.detail ?? e.message : "Accept failed");
    } finally {
      setSubWorking(false);
    }
  }

  async function handleReject() {
    if (!selected || !selectedSub) return;
    setSubWorking(true);
    setSubMsg("");
    try {
      const res = await rejectGuestSubmission(selected.id, selectedSub.id, rejectReason, getToken());
      setSubMsg(res.message);
      setSelectedSub({ ...selectedSub, status: "rejected" });
      setGuestSubs((prev) => prev.map((s) => s.id === selectedSub.id ? { ...s, status: "rejected" } : s));
      setSubAction(null);
      setRejectReason("");
    } catch (e) {
      setSubMsg(e instanceof ApiError ? e.detail ?? e.message : "Reject failed");
    } finally {
      setSubWorking(false);
    }
  }

  async function handleSendNow() {
    if (!selected || sendSelected.size === 0) return;
    setSending(true);
    setSendMsg("");
    try {
      const res = await sendFormNow(selected.id, [...sendSelected], getToken());
      setSendMsg(`Sent to ${res.sent} user${res.sent !== 1 ? "s" : ""}${res.skipped ? ` (${res.skipped} skipped)` : ""}.`);
      setSendSelected(new Set());
    } catch (e) {
      setSendMsg(e instanceof ApiError ? e.detail ?? e.message : "Send failed");
    } finally {
      setSending(false);
    }
  }

  async function handleCreateSchedule() {
    if (!selected || !schedName.trim() || sendSelected.size === 0) return;
    setSchedCreating(true);
    setSendMsg("");
    try {
      const sched = await createFormSchedule(
        selected.id,
        {
          name: schedName.trim(),
          frequency: schedFreq,
          recipient_user_ids: [...sendSelected],
          next_run_at: schedFreq === "once" && schedDate ? new Date(schedDate).toISOString() : null,
        },
        getToken()
      );
      setSchedules((prev) => [sched, ...prev]);
      setSchedName("");
      setSchedDate("");
      setSendSelected(new Set());
      setShowScheduleForm(false);
      setSendMsg("Schedule created.");
    } catch (e) {
      setSendMsg(e instanceof ApiError ? e.detail ?? e.message : "Create schedule failed");
    } finally {
      setSchedCreating(false);
    }
  }

  async function handleToggleSchedule(schedId: string) {
    if (!selected) return;
    try {
      const updated = await toggleFormSchedule(selected.id, schedId, getToken());
      setSchedules((prev) => prev.map((s) => s.id === schedId ? updated : s));
    } catch { /* ignore */ }
  }

  async function handleDeleteSchedule(schedId: string) {
    if (!selected) return;
    try {
      await deleteFormSchedule(selected.id, schedId, getToken());
      setSchedules((prev) => prev.filter((s) => s.id !== schedId));
    } catch { /* ignore */ }
  }

  async function duplicate() {
    if (!selected) return;
    setError("");
    setCloneMsg("");
    setCloning(true);
    try {
      const draft = await cloneWorkflow(selected.id, getToken());
      await load();
      await openWorkflow(draft.id);
      setCloneMsg(`Duplicated as “${draft.name}” (draft).`);
    } catch (e) {
      setError(e instanceof ApiError ? e.detail ?? e.message : "Duplicate failed");
    } finally {
      setCloning(false);
    }
  }

  async function deleteSelected() {
    if (!selected) return;
    setError("");
    setDeleting(true);
    try {
      await deleteWorkflow(selected.id, getToken());
      setSelected(null);
      setConfirmDelete(false);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.detail ?? e.message : "Delete failed");
    } finally {
      setDeleting(false);
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
            <div className="p-6 text-center">
              <span className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-[rgb(var(--wf-accent-muted))] text-[rgb(var(--wf-brand-600))]">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect width="8" height="8" x="3" y="3" rx="2" />
                  <path d="M7 11v4a2 2 0 0 0 2 2h4" />
                  <rect width="8" height="8" x="13" y="13" rx="2" />
                </svg>
              </span>
              <p className="text-sm font-medium text-slate-800">No workflows yet</p>
              <p className="mt-1 text-xs text-slate-500">
                Generate one with the AI creator, or start from a template.
              </p>
              <Link to="/ai" className="mt-3 inline-block text-sm wf-link font-medium">
                Create with AI →
              </Link>
            </div>
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
                  <button
                    type="button"
                    onClick={duplicate}
                    disabled={cloning}
                    className="px-4 py-2 wf-btn-secondary text-sm disabled:opacity-50"
                  >
                    {cloning ? "Duplicating…" : "Duplicate"}
                  </button>
                  {!confirmDelete && (
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(true)}
                      className="px-4 py-2 text-sm border border-red-200 text-red-600 rounded-lg hover:bg-red-50"
                    >
                      Delete
                    </button>
                  )}
                  {confirmDelete && (
                    <span className="flex items-center gap-2 text-sm">
                      <span className="text-red-600 font-medium">Delete permanently?</span>
                      <button
                        type="button"
                        onClick={() => void deleteSelected()}
                        disabled={deleting}
                        className="px-3 py-1 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 disabled:opacity-50"
                      >
                        {deleting ? "Deleting…" : "Yes, delete"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(false)}
                        className="px-3 py-1 wf-btn-secondary text-sm"
                      >
                        Cancel
                      </button>
                    </span>
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
                          className="wf-input w-24"
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
                {cloneMsg && <p className="text-xs text-green-700 mt-2">{cloneMsg}</p>}
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
                <div className="wf-card p-4 text-sm">
                  <p className="font-medium text-slate-800 mb-1">Test result</p>
                  <p className="text-slate-600">Steps: {simResult.steps_traversed.join(" → ")}</p>
                  <p className="text-slate-600">Status: {simResult.final_status}</p>
                </div>
              )}

              {/* Public link — only for published workflows */}
              {selected.status === "published" && (
                <div className="wf-card p-4 text-sm">
                  <h3 className="font-medium text-slate-800 mb-3">Public form link</h3>
                  {publicLink ? (
                    <div className="space-y-3">
                      <div className="flex gap-2 items-center">
                        <input
                          readOnly
                          value={publicLink.url}
                          className="wf-input flex-1 text-xs"
                          onFocus={(e) => e.target.select()}
                        />
                        <button
                          type="button"
                          className="px-3 py-1.5 wf-btn-secondary text-xs shrink-0"
                          onClick={() => { void navigator.clipboard.writeText(publicLink.url); setLinkMsg("Copied!"); }}
                        >
                          Copy
                        </button>
                      </div>
                      {linkMsg && <p className="text-xs text-green-700">{linkMsg}</p>}
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="px-3 py-1.5 wf-btn-secondary text-xs"
                          onClick={() => void handleCreateLink()}
                          disabled={linkLoading}
                        >
                          {linkLoading ? "…" : "Regenerate link"}
                        </button>
                        {!confirmRevoke ? (
                          <button
                            type="button"
                            className="px-3 py-1.5 text-xs border border-red-200 text-red-600 rounded-lg hover:bg-red-50"
                            onClick={() => setConfirmRevoke(true)}
                          >
                            Revoke link
                          </button>
                        ) : (
                          <span className="flex items-center gap-2">
                            <span className="text-red-600 text-xs font-medium">Revoke permanently?</span>
                            <button
                              type="button"
                              className="px-2 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700"
                              onClick={() => void handleRevokeLink()}
                              disabled={linkLoading}
                            >
                              Yes, revoke
                            </button>
                            <button
                              type="button"
                              className="px-2 py-1 wf-btn-secondary text-xs"
                              onClick={() => setConfirmRevoke(false)}
                            >
                              Cancel
                            </button>
                          </span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-slate-500 text-xs">No active public link. Generate one to let anyone submit this form without logging in.</p>
                      {linkMsg && <p className="text-xs text-green-700">{linkMsg}</p>}
                      <button
                        type="button"
                        className="px-4 py-2 wf-btn-secondary text-xs"
                        onClick={() => void handleCreateLink()}
                        disabled={linkLoading}
                      >
                        {linkLoading ? "Generating…" : "Generate public link"}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Send form to internal users (Features 1 & 2) */}
              {selected.status === "published" && (
                <div className="wf-card p-4 text-sm">
                  <h3 className="font-medium text-slate-800 mb-3">Send form to staff</h3>
                  {orgUsers.length === 0 ? (
                    <p className="text-slate-400 text-xs">Loading users…</p>
                  ) : (
                    <div className="space-y-3">
                      <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-lg divide-y">
                        {orgUsers.map((u) => (
                          <label key={u.id} className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={sendSelected.has(u.id)}
                              onChange={(e) => {
                                const next = new Set(sendSelected);
                                if (e.target.checked) next.add(u.id); else next.delete(u.id);
                                setSendSelected(next);
                              }}
                            />
                            <span className="flex-1 text-xs">
                              <span className="font-medium text-slate-800">{u.full_name}</span>
                              <span className="text-slate-400 ml-1">{u.email}</span>
                            </span>
                          </label>
                        ))}
                      </div>
                      <p className="text-xs text-slate-400">{sendSelected.size} selected</p>

                      {sendMsg && <p className={`text-xs ${sendMsg.toLowerCase().includes("fail") || sendMsg.toLowerCase().includes("error") ? "text-red-600" : "text-green-700"}`}>{sendMsg}</p>}

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void handleSendNow()}
                          disabled={sending || sendSelected.size === 0}
                          className="px-3 py-1.5 wf-btn-primary text-xs disabled:opacity-50"
                        >
                          {sending ? "Sending…" : "Send now"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowScheduleForm(!showScheduleForm)}
                          disabled={sendSelected.size === 0}
                          className="px-3 py-1.5 wf-btn-secondary text-xs disabled:opacity-50"
                        >
                          {showScheduleForm ? "Cancel schedule" : "Schedule send"}
                        </button>
                      </div>

                      {showScheduleForm && (
                        <div className="space-y-2 p-3 bg-slate-50 border border-slate-200 rounded-lg">
                          <input
                            value={schedName}
                            onChange={(e) => setSchedName(e.target.value)}
                            placeholder="Schedule name"
                            className="wf-input w-full text-xs"
                          />
                          <div className="flex gap-2">
                            {(["weekly", "monthly", "once"] as const).map((f) => (
                              <button
                                key={f}
                                type="button"
                                onClick={() => setSchedFreq(f)}
                                className={`px-2.5 py-1 rounded-lg text-xs capitalize border ${schedFreq === f ? "border-slate-800 bg-white font-medium" : "border-slate-200 hover:border-slate-400"}`}
                              >
                                {f}
                              </button>
                            ))}
                          </div>
                          {schedFreq === "once" && (
                            <input
                              type="datetime-local"
                              value={schedDate}
                              onChange={(e) => setSchedDate(e.target.value)}
                              className="wf-input w-full text-xs"
                            />
                          )}
                          <button
                            type="button"
                            onClick={() => void handleCreateSchedule()}
                            disabled={schedCreating || !schedName.trim()}
                            className="px-3 py-1.5 wf-btn-primary text-xs disabled:opacity-50"
                          >
                            {schedCreating ? "Saving…" : "Create schedule"}
                          </button>
                        </div>
                      )}

                      {schedules.length > 0 && (
                        <div className="mt-2">
                          <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Active schedules</p>
                          <ul className="divide-y border border-slate-200 rounded-lg">
                            {schedules.map((s) => (
                              <li key={s.id} className="flex items-center gap-2 px-3 py-2 text-xs">
                                <div className="flex-1 min-w-0">
                                  <span className="font-medium text-slate-800">{s.name}</span>
                                  <span className="text-slate-400 ml-1 capitalize">{s.frequency}</span>
                                  {s.next_run_at && s.frequency === "once" && (
                                    <span className="text-slate-400 ml-1">· {new Date(s.next_run_at).toLocaleString()}</span>
                                  )}
                                  {s.last_run_at && (
                                    <span className="text-slate-400 ml-1">· last sent {new Date(s.last_run_at).toLocaleDateString()}</span>
                                  )}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => void handleToggleSchedule(s.id)}
                                  className={`px-2 py-0.5 rounded text-xs border ${s.is_active ? "border-green-200 text-green-700" : "border-slate-200 text-slate-400"}`}
                                >
                                  {s.is_active ? "Active" : "Paused"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleDeleteSchedule(s.id)}
                                  className="text-red-400 hover:text-red-600 text-xs px-1"
                                >
                                  ×
                                </button>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Form report (Feature 8) */}
              {selected.status === "published" && (
                <div className="wf-card p-4 text-sm">
                  <h3 className="font-medium text-slate-800 mb-3">
                    Submission report
                    {report && (
                      <span className="ml-2 text-xs font-normal text-slate-500">
                        {report.total_responses} total · {report.internal_count} internal · {report.guest_count} guest
                      </span>
                    )}
                  </h3>
                  {reportLoading ? (
                    <p className="text-slate-400 text-xs">Loading…</p>
                  ) : !report || report.total_responses === 0 ? (
                    <p className="text-slate-400 text-xs">No submissions yet.</p>
                  ) : (
                    <div className="space-y-4">
                      {report.first_submission && (
                        <p className="text-xs text-slate-500">
                          {new Date(report.first_submission).toLocaleDateString()} – {new Date(report.last_submission!).toLocaleDateString()}
                        </p>
                      )}
                      {report.fields.map((f) => (
                        <FieldReportCard key={f.key} field={f} />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Guest submissions inbox */}
              {selected.status === "published" && (
                <div className="wf-card p-4 text-sm">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-medium text-slate-800">
                      Guest submissions
                      {guestSubs.filter((s) => s.status === "pending").length > 0 && (
                        <span className="ml-2 text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                          {guestSubs.filter((s) => s.status === "pending").length} pending
                        </span>
                      )}
                    </h3>
                    <div className="flex gap-1">
                      {(["pending", "all"] as const).map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setSubTab(t)}
                          className={`px-3 py-1 rounded-lg text-xs capitalize ${subTab === t ? "bg-slate-800 text-white" : "border border-slate-200 text-slate-600 hover:bg-slate-50"}`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>

                  {guestSubs.length === 0 ? (
                    <p className="text-slate-400 text-xs">No submissions yet.</p>
                  ) : (
                    <ul className="divide-y">
                      {guestSubs
                        .filter((s) => subTab === "all" || s.status === "pending")
                        .map((s) => (
                          <li
                            key={s.id}
                            className={`py-2.5 flex justify-between gap-3 cursor-pointer hover:bg-slate-50 -mx-1 px-1 rounded ${selectedSub?.id === s.id ? "bg-slate-50" : ""}`}
                            onClick={() => void openSub(s.id)}
                          >
                            <div className="min-w-0">
                              <p className="font-medium text-slate-800 truncate">{s.guest_name}</p>
                              <p className="text-slate-500 text-xs truncate">{s.guest_email}</p>
                              <p className="text-slate-400 text-xs">{new Date(s.submitted_at).toLocaleString()}</p>
                            </div>
                            <span className={`shrink-0 self-start mt-0.5 text-xs font-semibold px-2 py-0.5 rounded-full ${
                              s.status === "pending" ? "bg-amber-100 text-amber-800" :
                              s.status === "accepted" ? "bg-green-100 text-green-800" :
                              "bg-red-100 text-red-700"
                            }`}>
                              {s.status}
                            </span>
                          </li>
                        ))}
                    </ul>
                  )}

                  {/* Submission detail panel */}
                  {selectedSub && (
                    <div className="mt-4 border-t pt-4">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <p className="font-semibold text-slate-800">{selectedSub.guest_name}</p>
                          <p className="text-xs text-slate-500">{selectedSub.guest_email}</p>
                        </div>
                        <button type="button" onClick={() => setSelectedSub(null)} className="text-slate-400 hover:text-slate-600 text-lg leading-none">×</button>
                      </div>

                      <dl className="space-y-2 mb-4">
                        {Object.entries(selectedSub.data)
                          .filter(([k]) => !k.startsWith("__"))
                          .map(([k, v]) => {
                            const att = selectedSub.attachments?.find((a) => a.field_key === k);
                            return (
                              <div key={k} className="flex gap-2 text-xs">
                                <dt className="text-slate-500 w-32 shrink-0 truncate">{k}</dt>
                                <dd className="text-slate-800 break-words">
                                  {att ? (
                                    <button
                                      type="button"
                                      onClick={() => void downloadGuestAttachment(att.id, getToken())}
                                      className="text-blue-600 hover:underline flex items-center gap-1"
                                    >
                                      ⬇ {att.original_filename}
                                      <span className="text-slate-400 ml-1">({(att.size_bytes / 1024).toFixed(0)} KB)</span>
                                    </button>
                                  ) : String(v ?? "—")}
                                </dd>
                              </div>
                            );
                          })}
                      </dl>

                      {subMsg && (
                        <p className={`text-xs mb-3 ${subMsg.toLowerCase().includes("fail") || subMsg.toLowerCase().includes("error") ? "text-red-600" : "text-green-700"}`}>
                          {subMsg}
                        </p>
                      )}

                      {selectedSub.status === "pending" && (
                        <div className="flex flex-wrap gap-2">
                          {subAction !== "reject" && (
                            <button
                              type="button"
                              onClick={subAction === "accept" ? () => void handleAccept() : () => setSubAction("accept")}
                              disabled={subWorking}
                              className="px-3 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                            >
                              {subAction === "accept" ? (subWorking ? "Creating account…" : "Confirm — create account & email") : "Accept"}
                            </button>
                          )}
                          {subAction === "accept" && (
                            <button type="button" onClick={() => setSubAction(null)} className="px-3 py-1.5 text-xs wf-btn-secondary">Cancel</button>
                          )}
                          {subAction !== "accept" && (
                            <>
                              {subAction !== "reject" ? (
                                <button
                                  type="button"
                                  onClick={() => setSubAction("reject")}
                                  className="px-3 py-1.5 text-xs border border-red-200 text-red-600 rounded-lg hover:bg-red-50"
                                >
                                  Reject
                                </button>
                              ) : (
                                <div className="w-full space-y-2">
                                  <textarea
                                    value={rejectReason}
                                    onChange={(e) => setRejectReason(e.target.value)}
                                    placeholder="Rejection reason (optional, sent to applicant)"
                                    rows={2}
                                    className="wf-input w-full text-xs"
                                  />
                                  <div className="flex gap-2">
                                    <button
                                      type="button"
                                      onClick={() => void handleReject()}
                                      disabled={subWorking}
                                      className="px-3 py-1.5 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                                    >
                                      {subWorking ? "Sending…" : "Confirm reject & notify"}
                                    </button>
                                    <button type="button" onClick={() => { setSubAction(null); setRejectReason(""); }} className="px-3 py-1.5 text-xs wf-btn-secondary">Cancel</button>
                                  </div>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )}

                      {selectedSub.status !== "pending" && (
                        <p className={`text-xs font-semibold ${selectedSub.status === "accepted" ? "text-green-700" : "text-red-600"}`}>
                          {selectedSub.status === "accepted" ? "Accepted — account created" : "Rejected"}
                          {selectedSub.review_note ? ` · ${selectedSub.review_note}` : ""}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="wf-card p-10 text-center">
              <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[rgb(var(--wf-accent-muted))] text-[rgb(var(--wf-brand-600))]">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect width="8" height="8" x="3" y="3" rx="2" />
                  <path d="M7 11v4a2 2 0 0 0 2 2h4" />
                  <rect width="8" height="8" x="13" y="13" rx="2" />
                </svg>
              </span>
              <p className="font-medium text-slate-800">Select a workflow to begin</p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
                Choose a workflow from the list to review its steps, edit appearance, run a test
                simulation, and publish.
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                <Link to="/ai" className="px-4 py-2 wf-btn-primary text-sm">
                  Create with AI
                </Link>
                <Link to="/templates" className="px-4 py-2 wf-btn-secondary text-sm">
                  Browse templates
                </Link>
              </div>
            </div>
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

function FieldReportCard({ field }: { field: import("../lib/api").FieldReport }) {
  const agg = field.aggregation;
  return (
    <div className="border border-slate-200 rounded-lg p-3">
      <p className="text-xs font-semibold text-slate-700 mb-2">
        {field.label}
        <span className="ml-2 font-normal text-slate-400 capitalize">{field.field_type}</span>
        <span className="ml-2 font-normal text-slate-400">{agg.count} response{agg.count !== 1 ? "s" : ""}</span>
      </p>

      {agg.type === "counts" && agg.options && agg.options.length > 0 && (
        <ul className="space-y-1.5">
          {agg.options.map((o) => (
            <li key={o.label} className="text-xs">
              <div className="flex justify-between mb-0.5">
                <span className="text-slate-700 truncate max-w-[60%]">{o.label || "(empty)"}</span>
                <span className="text-slate-500">{o.count} · {o.pct}%</span>
              </div>
              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[rgb(var(--wf-brand-600))] rounded-full"
                  style={{ width: `${o.pct}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      {agg.type === "numeric" && (
        <div className="flex gap-4 text-xs text-slate-600">
          <span>Min <strong>{agg.min}</strong></span>
          <span>Max <strong>{agg.max}</strong></span>
          <span>Avg <strong>{agg.avg}</strong></span>
        </div>
      )}

      {(agg.type === "texts" || agg.type === "raw") && agg.texts && agg.texts.length > 0 && (
        <ul className="space-y-1 text-xs text-slate-600 max-h-32 overflow-y-auto">
          {agg.texts.map((t, i) => (
            <li key={i} className="py-0.5 border-b border-slate-100 last:border-0 truncate">{t}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
