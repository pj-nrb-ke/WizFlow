import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import {
  apiDownload,
  apiFetch,
  OrgUser,
  ChecklistSummary,
  ChecklistDetail,
  ChecklistTask,
  ChecklistTaskInput,
  ChecklistTaskLibraryRow,
  ChecklistReport,
  listChecklists,
  getChecklist,
  createChecklist,
  deleteChecklist,
  listMyChecklistTasks,
  completeChecklistTask,
  approveChecklistTask,
  rejectChecklistTask,
  skipChecklistTask,
  reassignChecklistTask,
  getChecklistTaskLibrary,
  getChecklistReport,
  uploadChecklistTaskFile,
} from "../lib/api";
import { getToken } from "../lib/auth";
import { useAuth } from "../context/AuthContext";
import { IconCheckCircle, IconClipboardList } from "../components/icons";

// ── Helpers ──────────────────────────────────────────────────────────────────

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDaysISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const COMMON_TZS = [
  "UTC",
  "Africa/Lagos",
  "Africa/Nairobi",
  "Europe/London",
  "Europe/Paris",
  "America/New_York",
  "America/Los_Angeles",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Australia/Sydney",
];

function detectedTz(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function isOverdue(t: { due_date: string | null; status: string }): boolean {
  return Boolean(t.due_date) && t.status !== "done" && t.status !== "skipped" && t.due_date! < todayISO();
}

function statusBadge(t: ChecklistTask) {
  const map: Record<string, [string, string]> = {
    done: ["Done", "bg-green-50 text-green-700 border-green-200"],
    awaiting_approval: ["Awaiting approval", "bg-indigo-50 text-indigo-700 border-indigo-200"],
    skipped: ["Skipped", "bg-slate-100 text-slate-600 border-slate-200"],
    in_progress: [t.reject_reason ? "Returned" : "In progress", "bg-blue-50 text-blue-700 border-blue-200"],
    not_started: ["To do", "bg-amber-50 text-amber-700 border-amber-200"],
  };
  let [label, cls] = map[t.status] ?? [t.status, "bg-slate-100 text-slate-600 border-slate-200"];
  if (isOverdue(t)) {
    label = "Overdue";
    cls = "bg-red-50 text-red-700 border-red-200";
  }
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${cls}`}>{label}</span>;
}

async function copyLink(link: string | null) {
  if (!link) return;
  try {
    await navigator.clipboard.writeText(link);
  } catch {
    /* ignore */
  }
}

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className={`bg-[rgb(var(--wf-card-bg))] rounded-xl shadow-xl w-full ${wide ? "max-w-3xl" : "max-w-lg"} max-h-[92vh] overflow-y-auto`}>
        <div className="flex items-center justify-between p-5 border-b border-[rgb(var(--wf-card-border))] sticky top-0 bg-[rgb(var(--wf-card-bg))]">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="wf-btn-ghost text-sm">Close</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

// ── My tasks tab ─────────────────────────────────────────────────────────────

function MyTasksTab() {
  const token = getToken();
  const [tasks, setTasks] = useState<ChecklistTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setTasks(await listMyChecklistTasks(token));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  async function markDone(t: ChecklistTask) {
    setMsg("");
    try {
      await completeChecklistTask(t.id, token);
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not complete task");
    }
  }

  async function onUpload(t: ChecklistTask, file: File) {
    setMsg("");
    try {
      await uploadChecklistTaskFile(t.id, file, token);
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Upload failed");
    }
  }

  const open = tasks.filter((t) => t.status !== "done" && t.status !== "skipped");
  const closed = tasks.filter((t) => t.status === "done" || t.status === "skipped");

  if (loading) return <p className="text-sm text-slate-500 py-8 text-center">Loading…</p>;

  return (
    <div className="space-y-6">
      {msg && <p className="text-sm text-red-600">{msg}</p>}
      <div>
        <h3 className="text-sm font-semibold mb-3">
          Open tasks {open.length > 0 && <span className="ml-2 px-1.5 py-0.5 bg-amber-100 text-amber-700 text-xs rounded">{open.length}</span>}
        </h3>
        {open.length === 0 ? (
          <div className="text-center py-10 text-slate-500">
            <IconCheckCircle size={36} className="mx-auto mb-3 opacity-30" />
            <p className="font-medium">All caught up!</p>
            <p className="text-sm mt-1">You have no open checklist tasks.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {open.map((t) => (
              <div key={t.id} className="p-4 rounded-lg border border-[rgb(var(--wf-card-border))] bg-[rgb(var(--wf-card-bg))]">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-sm">{t.title}</p>
                      {statusBadge(t)}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {t.checklist_name}
                      {t.due_date ? ` · due ${t.due_date}` : ""}
                      {t.attachment_required ? " · file required" : ""}
                    </p>
                    {t.description && <p className="text-xs text-slate-500 mt-1">{t.description}</p>}
                    {t.reject_reason && <p className="text-xs text-red-600 mt-1">Returned: {t.reject_reason}</p>}
                    {t.attachments.length > 0 && (
                      <p className="text-xs text-slate-500 mt-1">📎 {t.attachments.map((a) => a.original_filename).join(", ")}</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    {t.status === "awaiting_approval" ? (
                      <span className="text-xs text-indigo-600">Awaiting approval</span>
                    ) : (
                      <button
                        onClick={() => markDone(t)}
                        disabled={t.attachment_required && t.attachments.length === 0}
                        className="wf-btn-primary text-xs py-1.5 px-3 flex items-center gap-1"
                        title={t.attachment_required && t.attachments.length === 0 ? "Attach the required file first" : undefined}
                      >
                        <IconCheckCircle size={13} /> Mark done
                      </button>
                    )}
                    <label className="text-xs text-[rgb(var(--wf-brand-600))] hover:underline cursor-pointer">
                      Attach file
                      <input
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) onUpload(t, f);
                          e.target.value = "";
                        }}
                      />
                    </label>
                    {t.link && (
                      <button onClick={() => copyLink(t.link)} className="text-xs text-slate-500 hover:underline">
                        Copy link
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {closed.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-3">Recently closed</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[rgb(var(--wf-card-border))]">
                  <th className="text-left py-2 pr-4 font-medium">Task</th>
                  <th className="text-left py-2 pr-4 font-medium">Checklist</th>
                  <th className="text-left py-2 pr-4 font-medium">Due</th>
                  <th className="text-left py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {closed.map((t) => (
                  <tr key={t.id} className="border-b border-[rgb(var(--wf-card-border))]">
                    <td className="py-2 pr-4">{t.title}</td>
                    <td className="py-2 pr-4 text-slate-500">{t.checklist_name}</td>
                    <td className="py-2 pr-4">{t.due_date ?? "—"}</td>
                    <td className="py-2">{statusBadge(t)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Compose picker (clone tasks from existing checklists) ────────────────────

function ComposePicker({ onClose, onAdd }: { onClose: () => void; onAdd: (rows: ChecklistTaskLibraryRow[]) => void }) {
  const token = getToken();
  const [rows, setRows] = useState<ChecklistTaskLibraryRow[]>([]);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (query: string) => {
      setLoading(true);
      try {
        setRows(await getChecklistTaskLibrary(query, token));
      } finally {
        setLoading(false);
      }
    },
    [token]
  );

  useEffect(() => {
    load("");
  }, [load]);

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <Modal title="Add tasks from existing checklists" onClose={onClose} wide>
      <div className="flex gap-2 mb-3">
        <input
          className="wf-input flex-1 text-sm"
          placeholder="Search by checklist or task…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load(q)}
        />
        <button className="wf-btn-ghost text-sm" onClick={() => load(q)}>Search</button>
      </div>
      {loading ? (
        <p className="text-sm text-slate-500 py-8 text-center">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-500 py-8 text-center">No existing tasks found.</p>
      ) : (
        <div className="max-h-[50vh] overflow-y-auto border border-[rgb(var(--wf-card-border))] rounded">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[rgb(var(--wf-card-bg))]">
              <tr className="border-b border-[rgb(var(--wf-card-border))]">
                <th className="w-8" />
                <th className="text-left py-2 px-2 font-medium">Checklist</th>
                <th className="text-left py-2 px-2 font-medium">Task</th>
                <th className="text-left py-2 px-2 font-medium">Description</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.task_id}
                  className="border-b border-[rgb(var(--wf-card-border))] hover:bg-[rgb(var(--wf-accent-muted))] cursor-pointer"
                  onClick={() => toggle(r.task_id)}
                >
                  <td className="text-center">
                    <input type="checkbox" checked={picked.has(r.task_id)} readOnly />
                  </td>
                  <td className="py-2 px-2 text-slate-500">{r.checklist_name}</td>
                  <td className="py-2 px-2 font-medium">{r.title}</td>
                  <td className="py-2 px-2 text-slate-500 truncate max-w-xs">{r.description ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex justify-between items-center mt-4">
        <span className="text-sm text-slate-500">{picked.size} selected</span>
        <div className="flex gap-2">
          <button className="wf-btn-ghost text-sm" onClick={onClose}>Cancel</button>
          <button
            className="wf-btn-primary text-sm"
            disabled={picked.size === 0}
            onClick={() => {
              onAdd(rows.filter((r) => picked.has(r.task_id)));
              onClose();
            }}
          >
            Add {picked.size > 0 ? picked.size : ""} task{picked.size === 1 ? "" : "s"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── Builder (create checklist) ───────────────────────────────────────────────

type TaskDraft = ChecklistTaskInput & { _k: string };

let _kSeq = 0;
function newDraft(partial?: Partial<ChecklistTaskInput>): TaskDraft {
  _kSeq += 1;
  return {
    _k: `t${_kSeq}`,
    title: "",
    description: "",
    assignee_user_id: null,
    due_date: null,
    priority: "normal",
    weight: 1,
    attachment_required: false,
    order_index: 0,
    ...partial,
  };
}

function BuilderModal({ users, onClose, onSaved }: { users: OrgUser[]; onClose: () => void; onSaved: () => void }) {
  const token = getToken();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [timezone, setTimezone] = useState(detectedTz());
  const [startDate, setStartDate] = useState(todayISO());
  const [dueDate, setDueDate] = useState(addDaysISO(14));
  const [verification, setVerification] = useState(false);
  const [verifier, setVerifier] = useState("");
  const [completionRule, setCompletionRule] = useState("all");
  const [carryOver, setCarryOver] = useState("reset");
  const [tasks, setTasks] = useState<TaskDraft[]>([newDraft()]);
  const [showPicker, setShowPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const tzOptions = useMemo(() => {
    const set = new Set([detectedTz(), ...COMMON_TZS]);
    return Array.from(set);
  }, []);

  function updateTask(k: string, patch: Partial<TaskDraft>) {
    setTasks((prev) => prev.map((t) => (t._k === k ? { ...t, ...patch } : t)));
  }
  function removeTask(k: string) {
    setTasks((prev) => prev.filter((t) => t._k !== k));
  }
  function addFromLibrary(rows: ChecklistTaskLibraryRow[]) {
    setTasks((prev) => [...prev, ...rows.map((r) => newDraft({ title: r.title, description: r.description ?? "" }))]);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    const clean = tasks.filter((t) => t.title.trim());
    if (!name.trim()) return setError("Give the checklist a name.");
    if (dueDate < startDate) return setError("Due date must be on or after the start date.");
    if (clean.length === 0) return setError("Add at least one task.");
    for (const t of clean) {
      if (t.due_date && (t.due_date < startDate || t.due_date > dueDate)) {
        return setError(`Task "${t.title}" due date must be within the checklist window.`);
      }
    }
    setSaving(true);
    try {
      await createChecklist(
        {
          name: name.trim(),
          description: description.trim() || null,
          category: category.trim() || null,
          timezone,
          start_date: startDate,
          due_date: dueDate,
          verification_required: verification,
          verifier_user_id: verification ? verifier || null : null,
          completion_rule: completionRule,
          carry_over: carryOver,
          tasks: clean.map((t, i) => ({
            title: t.title.trim(),
            description: (t.description || "").trim() || null,
            assignee_user_id: t.assignee_user_id || null,
            due_date: t.due_date || null,
            priority: t.priority,
            weight: t.weight,
            attachment_required: t.attachment_required,
            order_index: i,
          })),
        },
        token
      );
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create checklist");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="New checklist" onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-5">
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium mb-1">Name *</label>
            <input className="wf-input w-full" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Tender Submission — ACME" required />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea className="wf-input w-full resize-none" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Category</label>
            <input className="wf-input w-full" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Compliance" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Time zone</label>
            <select className="wf-input w-full" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
              {tzOptions.map((tz) => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Start date *</label>
            <input type="date" className="wf-input w-full" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Due date *</label>
            <input type="date" className="wf-input w-full" value={dueDate} onChange={(e) => setDueDate(e.target.value)} required />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Completion rule</label>
            <select className="wf-input w-full" value={completionRule} onChange={(e) => setCompletionRule(e.target.value)}>
              <option value="all">All tasks</option>
              <option value="required">Required tasks only</option>
              <option value="percent">Percentage by weight</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Recurring carry-over</label>
            <select className="wf-input w-full" value={carryOver} onChange={(e) => setCarryOver(e.target.value)}>
              <option value="reset">Reset each cycle</option>
              <option value="carry_forward">Carry overdue forward</option>
              <option value="block">Block next until closed</option>
            </select>
          </div>
        </div>

        <div className="rounded-lg border border-[rgb(var(--wf-card-border))] p-3">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={verification} onChange={(e) => setVerification(e.target.checked)} />
            Require manager approval on every task
          </label>
          {verification && (
            <div className="mt-3">
              <label className="block text-sm font-medium mb-1">Approver</label>
              <select className="wf-input w-full sm:w-72" value={verifier} onChange={(e) => setVerifier(e.target.value)}>
                <option value="">Checklist owner (you)</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.full_name}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Tasks */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold">Tasks</p>
            <div className="flex gap-2">
              <button type="button" className="wf-btn-ghost text-xs" onClick={() => setShowPicker(true)}>Add from existing</button>
              <button type="button" className="wf-btn-ghost text-xs" onClick={() => setTasks((p) => [...p, newDraft()])}>+ Add task</button>
            </div>
          </div>
          <div className="space-y-3">
            {tasks.map((t, idx) => (
              <div key={t._k} className="rounded-lg border border-[rgb(var(--wf-card-border))] p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 w-5">{idx + 1}.</span>
                  <input
                    className="wf-input flex-1 text-sm"
                    placeholder="Task title"
                    value={t.title}
                    onChange={(e) => updateTask(t._k, { title: e.target.value })}
                  />
                  <button type="button" onClick={() => removeTask(t._k)} className="text-xs text-red-500 hover:underline shrink-0">Remove</button>
                </div>
                <input
                  className="wf-input w-full text-sm"
                  placeholder="Description (optional)"
                  value={t.description ?? ""}
                  onChange={(e) => updateTask(t._k, { description: e.target.value })}
                />
                <div className="grid sm:grid-cols-4 gap-2">
                  <select
                    className="wf-input text-sm"
                    value={t.assignee_user_id ?? ""}
                    onChange={(e) => updateTask(t._k, { assignee_user_id: e.target.value || null })}
                  >
                    <option value="">Unassigned</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>{u.full_name}</option>
                    ))}
                  </select>
                  <input
                    type="date"
                    className="wf-input text-sm"
                    value={t.due_date ?? ""}
                    min={startDate}
                    max={dueDate}
                    onChange={(e) => updateTask(t._k, { due_date: e.target.value || null })}
                  />
                  <select className="wf-input text-sm" value={t.priority} onChange={(e) => updateTask(t._k, { priority: e.target.value })}>
                    <option value="low">Low</option>
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={t.attachment_required}
                      onChange={(e) => updateTask(t._k, { attachment_required: e.target.checked })}
                    />
                    File required
                  </label>
                </div>
              </div>
            ))}
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="wf-btn-ghost">Cancel</button>
          <button type="submit" disabled={saving} className="wf-btn-primary">{saving ? "Creating…" : "Create checklist"}</button>
        </div>
      </form>
      {showPicker && <ComposePicker onClose={() => setShowPicker(false)} onAdd={addFromLibrary} />}
    </Modal>
  );
}

// ── Reassign modal ───────────────────────────────────────────────────────────

function ReassignModal({ task, users, onClose, onDone }: { task: ChecklistTask; users: OrgUser[]; onClose: () => void; onDone: () => void }) {
  const token = getToken();
  const [uid, setUid] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!uid) return setError("Pick a person.");
    setBusy(true);
    setError("");
    try {
      await reassignChecklistTask(task.id, uid, reason.trim(), token);
      onDone();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reassign failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`Reassign: ${task.title}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-slate-500">
          A fresh no-login link is generated for the new assignee; the old link stops working.
        </p>
        <div>
          <label className="block text-sm font-medium mb-1">New assignee *</label>
          <select className="wf-input w-full" value={uid} onChange={(e) => setUid(e.target.value)}>
            <option value="">Select…</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.full_name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Reason (optional)</label>
          <input className="wf-input w-full" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. on leave" />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="wf-btn-ghost">Cancel</button>
          <button type="submit" disabled={busy} className="wf-btn-primary">{busy ? "Reassigning…" : "Reassign"}</button>
        </div>
      </form>
    </Modal>
  );
}

// ── Checklist detail modal ───────────────────────────────────────────────────

function DetailModal({ id, users, onClose, onChanged }: { id: string; users: OrgUser[]; onClose: () => void; onChanged: () => void }) {
  const token = getToken();
  const [detail, setDetail] = useState<ChecklistDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [reassign, setReassign] = useState<ChecklistTask | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setDetail(await getChecklist(id, token));
    } finally {
      setLoading(false);
    }
  }, [id, token]);

  useEffect(() => {
    load();
  }, [load]);

  async function act(fn: () => Promise<unknown>) {
    setMsg("");
    try {
      await fn();
      await load();
      onChanged();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Action failed");
    }
  }

  return (
    <Modal title={detail ? detail.name : "Checklist"} onClose={onClose} wide>
      {loading || !detail ? (
        <p className="text-sm text-slate-500 py-8 text-center">Loading…</p>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <span className="text-slate-500">Window: <b className="text-slate-900">{detail.start_date} → {detail.due_date}</b></span>
            <span className="text-slate-500">Time zone: <b className="text-slate-900">{detail.timezone}</b></span>
            <span className="text-slate-500">Approval: <b className="text-slate-900">{detail.verification_required ? "required" : "off"}</b></span>
            <span className="text-slate-500">Progress: <b className="text-slate-900">{detail.done_count}/{detail.task_count} ({detail.progress_pct}%)</b></span>
          </div>
          {detail.description && <p className="text-sm text-slate-500">{detail.description}</p>}
          {msg && <p className="text-sm text-red-600">{msg}</p>}

          <div className="overflow-x-auto border border-[rgb(var(--wf-card-border))] rounded">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[rgb(var(--wf-card-border))] bg-[rgb(var(--wf-accent-muted))]">
                  <th className="text-left py-2 px-3 font-medium">Task</th>
                  <th className="text-left py-2 px-3 font-medium">Assignee</th>
                  <th className="text-left py-2 px-3 font-medium">Due</th>
                  <th className="text-left py-2 px-3 font-medium">Status</th>
                  <th className="text-right py-2 px-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {detail.tasks.map((t) => (
                  <tr key={t.id} className="border-b border-[rgb(var(--wf-card-border))] align-top">
                    <td className="py-2 px-3">
                      <div className="font-medium">{t.title}</div>
                      {t.description && <div className="text-xs text-slate-500">{t.description}</div>}
                      {t.attachments.length > 0 && (
                        <div className="text-xs text-slate-500 mt-0.5">📎 {t.attachments.length}</div>
                      )}
                    </td>
                    <td className="py-2 px-3">{t.assignee_name ?? <span className="text-slate-500">—</span>}</td>
                    <td className="py-2 px-3">{t.due_date ?? "—"}</td>
                    <td className="py-2 px-3">{statusBadge(t)}</td>
                    <td className="py-2 px-3 text-right whitespace-nowrap">
                      {t.status === "awaiting_approval" && (
                        <>
                          <button className="text-xs text-green-600 hover:underline mr-2" onClick={() => act(() => approveChecklistTask(t.id, token))}>Approve</button>
                          <button
                            className="text-xs text-red-500 hover:underline mr-2"
                            onClick={() => {
                              const r = window.prompt("Reason for returning this task?");
                              if (r) act(() => rejectChecklistTask(t.id, r, token));
                            }}
                          >
                            Return
                          </button>
                        </>
                      )}
                      <button className="text-xs text-[rgb(var(--wf-brand-600))] hover:underline mr-2" onClick={() => setReassign(t)}>Reassign</button>
                      {t.link && (
                        <button className="text-xs text-slate-500 hover:underline mr-2" onClick={() => copyLink(t.link)}>Copy link</button>
                      )}
                      {t.status !== "done" && t.status !== "skipped" && (
                        <button
                          className="text-xs text-slate-500 hover:underline"
                          onClick={() => {
                            const r = window.prompt("Reason for skipping this task?");
                            if (r) act(() => skipChecklistTask(t.id, r, token));
                          }}
                        >
                          Skip
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-between pt-2">
            <button
              className="text-sm text-red-500 hover:underline"
              onClick={() => {
                if (window.confirm(`Delete checklist "${detail.name}"? This removes all its tasks.`)) {
                  act(() => deleteChecklist(detail.id, token)).then(onClose);
                }
              }}
            >
              Delete checklist
            </button>
          </div>
        </div>
      )}
      {reassign && <ReassignModal task={reassign} users={users} onClose={() => setReassign(null)} onDone={() => { load(); onChanged(); }} />}
    </Modal>
  );
}

// ── Checklists tab (manager) ─────────────────────────────────────────────────

function ChecklistsTab({ users }: { users: OrgUser[] }) {
  const token = getToken();
  const [rows, setRows] = useState<ChecklistSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showBuilder, setShowBuilder] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await listChecklists(token));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <p className="text-sm text-slate-500 py-8 text-center">Loading…</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-slate-500">{rows.length} checklist{rows.length === 1 ? "" : "s"}</p>
        <button className="wf-btn-primary text-sm" onClick={() => setShowBuilder(true)}>+ New checklist</button>
      </div>

      {rows.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <IconClipboardList size={36} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">No checklists yet</p>
          <p className="text-sm mt-1">Create a checklist to assign a set of tasks with due dates.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[rgb(var(--wf-card-border))]">
                <th className="text-left py-2 pr-4 font-medium">Name</th>
                <th className="text-left py-2 pr-4 font-medium">Window</th>
                <th className="text-left py-2 pr-4 font-medium">Progress</th>
                <th className="text-left py-2 pr-4 font-medium">Approval</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="border-b border-[rgb(var(--wf-card-border))] hover:bg-[rgb(var(--wf-accent-muted))]">
                  <td className="py-3 pr-4">
                    <div className="font-medium">{c.name}</div>
                    {c.category && <div className="text-xs text-slate-500">{c.category}</div>}
                  </td>
                  <td className="py-3 pr-4 text-slate-500">{c.start_date} → {c.due_date}</td>
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-2 rounded-full bg-slate-200 overflow-hidden">
                        <div className="h-full bg-[rgb(var(--wf-brand-600))]" style={{ width: `${c.progress_pct}%` }} />
                      </div>
                      <span className="text-xs text-slate-500">{c.done_count}/{c.task_count}</span>
                    </div>
                  </td>
                  <td className="py-3 pr-4 text-slate-500">{c.verification_required ? "Required" : "—"}</td>
                  <td className="py-3 text-right">
                    <button className="text-xs text-[rgb(var(--wf-brand-600))] hover:underline" onClick={() => setOpenId(c.id)}>Open</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showBuilder && <BuilderModal users={users} onClose={() => setShowBuilder(false)} onSaved={load} />}
      {openId && <DetailModal id={openId} users={users} onClose={() => setOpenId(null)} onChanged={load} />}
    </div>
  );
}

// ── Report tab ───────────────────────────────────────────────────────────────

function ReportTab() {
  const token = getToken();
  const [report, setReport] = useState<ChecklistReport | null>(null);
  const [checklists, setChecklists] = useState<ChecklistSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterChecklist, setFilterChecklist] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  async function loadReport() {
    setLoading(true);
    try {
      setReport(
        await getChecklistReport(
          { checklist_id: filterChecklist || undefined, from_date: fromDate || undefined, to_date: toDate || undefined },
          token
        )
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    listChecklists(token).then(setChecklists).catch(() => {});
    loadReport();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function exportCsv() {
    const s = new URLSearchParams();
    if (filterChecklist) s.set("checklist_id", filterChecklist);
    if (fromDate) s.set("from_date", fromDate);
    if (toDate) s.set("to_date", toDate);
    const qs = s.toString();
    await apiDownload(`/api/v1/checklists/report/export.csv${qs ? `?${qs}` : ""}`, "checklist-report.csv", token);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-medium mb-1">Checklist</label>
          <select className="wf-input text-sm" value={filterChecklist} onChange={(e) => setFilterChecklist(e.target.value)}>
            <option value="">All checklists</option>
            {checklists.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">From</label>
          <input type="date" className="wf-input text-sm" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">To</label>
          <input type="date" className="wf-input text-sm" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </div>
        <button className="wf-btn-primary text-sm" onClick={loadReport} disabled={loading}>{loading ? "Loading…" : "Apply"}</button>
        {report && report.total > 0 && <button className="wf-btn-ghost text-sm" onClick={exportCsv}>Export CSV</button>}
      </div>

      {report && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-lg border border-[rgb(var(--wf-card-border))] p-4 bg-[rgb(var(--wf-card-bg))]">
            <p className="text-xs text-slate-500">Tasks</p>
            <p className="text-2xl font-bold mt-1">{report.total}</p>
          </div>
          <div className="rounded-lg border border-green-200 p-4 bg-green-50">
            <p className="text-xs text-green-600">Completed</p>
            <p className="text-2xl font-bold text-green-700 mt-1">{report.completed}</p>
          </div>
          <div className="rounded-lg border border-red-200 p-4 bg-red-50">
            <p className="text-xs text-red-600">Late</p>
            <p className="text-2xl font-bold text-red-700 mt-1">{report.late}</p>
          </div>
          <div className="rounded-lg border border-[rgb(var(--wf-card-border))] p-4 bg-[rgb(var(--wf-card-bg))]">
            <p className="text-xs text-slate-500">On-time rate</p>
            <p className={`text-2xl font-bold mt-1 ${report.on_time_pct >= 80 ? "text-green-600" : report.on_time_pct >= 50 ? "text-amber-600" : "text-red-600"}`}>
              {report.on_time_pct}%
            </p>
          </div>
        </div>
      )}

      {report && report.by_user.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-2">By person</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[rgb(var(--wf-card-border))]">
                  <th className="text-left py-2 pr-4 font-medium">Person</th>
                  <th className="text-left py-2 pr-4 font-medium">Total</th>
                  <th className="text-left py-2 pr-4 font-medium">Completed</th>
                  <th className="text-left py-2 pr-4 font-medium">On time</th>
                  <th className="text-left py-2 pr-4 font-medium">Late</th>
                  <th className="text-left py-2 pr-4 font-medium">On-time %</th>
                  <th className="text-left py-2 font-medium">Avg variance (days)</th>
                </tr>
              </thead>
              <tbody>
                {report.by_user.map((u) => (
                  <tr key={u.user_id ?? "unassigned"} className="border-b border-[rgb(var(--wf-card-border))]">
                    <td className="py-2 pr-4 font-medium">{u.user_name}</td>
                    <td className="py-2 pr-4">{u.total}</td>
                    <td className="py-2 pr-4">{u.completed}</td>
                    <td className="py-2 pr-4">{u.on_time}</td>
                    <td className="py-2 pr-4">{u.late}</td>
                    <td className="py-2 pr-4">{u.on_time_pct}%</td>
                    <td className="py-2">{u.avg_variance_days ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {report && report.rows.length > 0 ? (
        <div>
          <h3 className="text-sm font-semibold mb-2">Task detail</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[rgb(var(--wf-card-border))]">
                  <th className="text-left py-2 pr-4 font-medium">Checklist</th>
                  <th className="text-left py-2 pr-4 font-medium">Task</th>
                  <th className="text-left py-2 pr-4 font-medium">Assignee</th>
                  <th className="text-left py-2 pr-4 font-medium">Due</th>
                  <th className="text-left py-2 pr-4 font-medium">Completed</th>
                  <th className="text-left py-2 font-medium">Outcome</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((r) => (
                  <tr key={r.task_id} className="border-b border-[rgb(var(--wf-card-border))]">
                    <td className="py-2 pr-4 text-slate-500">{r.checklist_name}</td>
                    <td className="py-2 pr-4">{r.title}</td>
                    <td className="py-2 pr-4">{r.assignee_name ?? "—"}</td>
                    <td className="py-2 pr-4">{r.due_date ?? "—"}</td>
                    <td className="py-2 pr-4">{r.completed_on ?? "—"}</td>
                    <td className="py-2">
                      <span
                        className={
                          r.outcome === "late" || r.outcome === "overdue"
                            ? "text-red-600"
                            : r.outcome === "on_time" || r.outcome === "early"
                            ? "text-green-600"
                            : "text-slate-500"
                        }
                      >
                        {r.outcome.replace("_", " ")}
                        {r.variance_days != null && r.variance_days !== 0 ? ` (${r.variance_days > 0 ? "+" : ""}${r.variance_days}d)` : ""}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : report ? (
        <p className="text-sm text-slate-500 py-8 text-center">No tasks match the selected filters.</p>
      ) : null}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export function ChecklistsPage() {
  const { user } = useAuth();
  const token = getToken();
  const isManager = user?.roles.some((r) => r === "company_admin" || r === "manager") ?? false;

  type Tab = "my" | "checklists" | "report";
  const [tab, setTab] = useState<Tab>("my");
  const [users, setUsers] = useState<OrgUser[]>([]);

  useEffect(() => {
    if (isManager) {
      apiFetch<OrgUser[]>("/api/v1/admin/users", {}, token).then(setUsers).catch(() => {});
    }
  }, [isManager, token]);

  const tabs: { id: Tab; label: string }[] = [
    { id: "my", label: "My tasks" },
    ...(isManager ? [{ id: "checklists" as Tab, label: "Checklists" }, { id: "report" as Tab, label: "Report" }] : []),
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <IconClipboardList size={22} />
        <h1 className="text-xl font-semibold">Checklists</h1>
      </div>

      <div className="flex gap-1 border-b border-[rgb(var(--wf-card-border))]">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === t.id
                ? "border-[rgb(var(--wf-brand-600))] text-[rgb(var(--wf-brand-600))]"
                : "border-transparent text-slate-500 hover:text-slate-900"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div>
        {tab === "my" && <MyTasksTab />}
        {tab === "checklists" && isManager && <ChecklistsTab users={users} />}
        {tab === "report" && isManager && <ReportTab />}
      </div>
    </div>
  );
}
