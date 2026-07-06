import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch, apiDownload, OrgUser, UserGroup, WorkflowSummary } from "../lib/api";
import { getToken } from "../lib/auth";
import { useAuth } from "../context/AuthContext";
import { IconRepeat, IconCheckCircle } from "../components/icons";

// ── Types ──────────────────────────────────────────────────────────────────────

type RecurringActivity = {
  id: string;
  name: string;
  description: string | null;
  freq: "weekly" | "monthly" | "yearly";
  interval: number;
  by_weekday: number | null;
  by_monthday: number | null;
  by_month: number | null;
  at_hour: number;
  timezone: string;
  start_date: string;
  end_date: string | null;
  completion_mode: "acknowledge" | "submit_workflow";
  workflow_definition_id: string | null;
  workflow_name: string | null;
  recipient_user_ids: string[];
  recipient_group_ids: string[];
  remind_enabled: boolean;
  remind_interval_days: number;
  remind_max_count: number | null;
  remind_window_days: number | null;
  escalate_after_count: number | null;
  supervisor_user_id: string | null;
  is_active: boolean;
  last_run_at: string | null;
  created_at: string;
  schedule_summary: string;
};

type Obligation = {
  id: string;
  activity_id: string;
  activity_name: string;
  cycle_id: string;
  due_date: string;
  period_label: string;
  user_id: string;
  user_name: string;
  status: "outstanding" | "submitted" | "waived";
  completed_at: string | null;
  reminder_count: number;
  escalated_at: string | null;
  completion_mode: "acknowledge" | "submit_workflow";
  workflow_definition_id: string | null;
};

type CycleOption = { id: string; due_date: string; period_label: string };

type ComplianceSummary = {
  activity_id: string;
  activity_name: string;
  cycle_id: string | null;
  due_date: string | null;
  period_label: string;
  total: number;
  submitted: number;
  outstanding: number;
  compliance_pct: number;
  rows: Obligation[];
  cycles: CycleOption[];
};

// The create/update body shape sent to the API.
type ActivityBody = {
  name: string;
  description: string | null;
  freq: RecurringActivity["freq"];
  interval: number;
  by_weekday: number | null;
  by_monthday: number | null;
  by_month: number | null;
  at_hour: number;
  timezone: string;
  start_date: string;
  end_date: string | null;
  completion_mode: RecurringActivity["completion_mode"];
  workflow_definition_id: string | null;
  recipient_user_ids: string[];
  recipient_group_ids: string[];
  remind_enabled: boolean;
  remind_interval_days: number;
  remind_max_count: number | null;
  remind_window_days: number | null;
  escalate_after_count: number | null;
  supervisor_user_id: string | null;
};

// ── Helpers ────────────────────────────────────────────────────────────────────

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_LABELS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Build a human-readable preview of the schedule from the builder fields. */
function schedulePreview(
  freq: RecurringActivity["freq"],
  interval: number,
  byWeekday: number | null,
  byMonthday: number | null,
  byMonth: number | null,
  atHour: number
): string {
  const every = interval > 1 ? `${interval} ` : "";
  const time = `at ${pad2(atHour)}:00`;
  if (freq === "weekly") {
    const day = byWeekday != null ? WEEKDAY_LABELS[byWeekday] : "—";
    const unit = interval > 1 ? "weeks" : "week";
    return `Every ${every}${unit} on ${day} ${time}`;
  }
  if (freq === "monthly") {
    const day = byMonthday != null ? ordinal(byMonthday) : "—";
    const unit = interval > 1 ? "months" : "month";
    return `Every ${every}${unit} on the ${day} ${time}`;
  }
  const month = byMonth != null ? MONTH_LABELS[byMonth - 1] : "—";
  const day = byMonthday != null ? ordinal(byMonthday) : "—";
  const unit = interval > 1 ? "years" : "year";
  return `Every ${every}${unit} on ${month} ${day} ${time}`;
}

function statusBadge(status: Obligation["status"]) {
  if (status === "submitted")
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-green-50 text-green-700 border border-green-200">
        Submitted
      </span>
    );
  if (status === "waived")
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-slate-50 text-slate-600 border border-slate-200">
        Waived
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
      Outstanding
    </span>
  );
}

// ── Activity Form Modal ─────────────────────────────────────────────────────────

function ActivityModal({
  activity,
  users,
  groups,
  workflows,
  onClose,
  onSaved,
}: {
  activity: RecurringActivity | null;
  users: OrgUser[];
  groups: UserGroup[];
  workflows: WorkflowSummary[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const token = getToken();
  const [name, setName] = useState(activity?.name ?? "");
  const [description, setDescription] = useState(activity?.description ?? "");
  const [freq, setFreq] = useState<RecurringActivity["freq"]>(activity?.freq ?? "monthly");
  const [interval, setIntervalVal] = useState(activity?.interval ?? 1);
  const [byWeekday, setByWeekday] = useState<number | null>(activity?.by_weekday ?? 0);
  const [byMonthday, setByMonthday] = useState<number | null>(activity?.by_monthday ?? 1);
  const [byMonth, setByMonth] = useState<number | null>(activity?.by_month ?? 1);
  const [atHour, setAtHour] = useState(activity?.at_hour ?? 9);
  const [timezone, setTimezone] = useState(activity?.timezone ?? "UTC");
  const [startDate, setStartDate] = useState(activity?.start_date ?? todayIso());
  const [endDate, setEndDate] = useState(activity?.end_date ?? "");
  const [completionMode, setCompletionMode] = useState<RecurringActivity["completion_mode"]>(
    activity?.completion_mode ?? "acknowledge"
  );
  const [workflowId, setWorkflowId] = useState(activity?.workflow_definition_id ?? "");
  const [userIds, setUserIds] = useState<string[]>(activity?.recipient_user_ids ?? []);
  const [groupIds, setGroupIds] = useState<string[]>(activity?.recipient_group_ids ?? []);
  const [remindEnabled, setRemindEnabled] = useState(activity?.remind_enabled ?? true);
  const [remindInterval, setRemindInterval] = useState(activity?.remind_interval_days ?? 1);
  const [remindMax, setRemindMax] = useState<string>(
    activity?.remind_max_count != null ? String(activity.remind_max_count) : "10"
  );
  const [remindWindow, setRemindWindow] = useState<string>(
    activity?.remind_window_days != null ? String(activity.remind_window_days) : ""
  );
  const [escalateAfter, setEscalateAfter] = useState<string>(
    activity?.escalate_after_count != null ? String(activity.escalate_after_count) : ""
  );
  const [supervisorId, setSupervisorId] = useState(activity?.supervisor_user_id ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function toggleUser(id: string) {
    setUserIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function toggleGroup(id: string) {
    setGroupIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function nullableInt(raw: string): number | null {
    const t = raw.trim();
    if (t === "") return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }

  const preview = schedulePreview(freq, interval, byWeekday, byMonthday, byMonth, atHour);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    if (userIds.length === 0 && groupIds.length === 0) {
      setError("Select at least one recipient user or group.");
      return;
    }
    if (freq === "weekly" && byWeekday == null) {
      setError("Choose a weekday.");
      return;
    }
    if ((freq === "monthly" || freq === "yearly") && byMonthday == null) {
      setError("Choose a day of the month.");
      return;
    }
    if (freq === "yearly" && byMonth == null) {
      setError("Choose a month.");
      return;
    }
    if (completionMode === "submit_workflow" && !workflowId) {
      setError("Choose a workflow to submit.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const body: ActivityBody = {
        name: name.trim(),
        description: description.trim() || null,
        freq,
        interval: interval || 1,
        by_weekday: freq === "weekly" ? byWeekday : null,
        by_monthday: freq === "monthly" || freq === "yearly" ? byMonthday : null,
        by_month: freq === "yearly" ? byMonth : null,
        at_hour: atHour,
        timezone: timezone.trim() || "UTC",
        start_date: startDate,
        end_date: endDate || null,
        completion_mode: completionMode,
        workflow_definition_id: completionMode === "submit_workflow" ? workflowId : null,
        recipient_user_ids: userIds,
        recipient_group_ids: groupIds,
        remind_enabled: remindEnabled,
        remind_interval_days: remindInterval || 1,
        remind_max_count: nullableInt(remindMax),
        remind_window_days: nullableInt(remindWindow),
        escalate_after_count: nullableInt(escalateAfter),
        supervisor_user_id: supervisorId || null,
      };
      if (activity) {
        await apiFetch(
          `/api/v1/recurring-activities/${activity.id}`,
          { method: "PATCH", body: JSON.stringify(body) },
          token
        );
      } else {
        await apiFetch(
          "/api/v1/recurring-activities",
          { method: "POST", body: JSON.stringify(body) },
          token
        );
      }
      onSaved();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-[rgb(var(--wf-card-bg))] rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-lg font-semibold mb-4">
            {activity ? "Edit recurring activity" : "New recurring activity"}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Name *</label>
              <input
                className="wf-input w-full"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Monthly compliance sign-off"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Description</label>
              <textarea
                className="wf-input w-full resize-none"
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What recipients need to do each cycle."
              />
            </div>

            {/* Recurrence builder */}
            <div className="rounded-lg border border-[rgb(var(--wf-card-border))] p-3 space-y-3">
              <p className="text-sm font-medium">Recurrence</p>
              <div className="flex flex-wrap gap-3 items-end">
                <div>
                  <label className="block text-xs font-medium mb-1">Frequency</label>
                  <select
                    className="wf-input text-sm"
                    value={freq}
                    onChange={(e) => setFreq(e.target.value as RecurringActivity["freq"])}
                  >
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Every</label>
                  <input
                    type="number"
                    min={1}
                    className="wf-input w-20 text-sm"
                    value={interval}
                    onChange={(e) => setIntervalVal(Math.max(1, Number(e.target.value)))}
                  />
                </div>
              </div>

              {freq === "weekly" && (
                <div>
                  <label className="block text-xs font-medium mb-2">On day</label>
                  <div className="flex gap-1 flex-wrap">
                    {WEEKDAY_LABELS.map((label, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setByWeekday(i)}
                        className={`px-3 py-1 rounded text-sm border transition-colors ${
                          byWeekday === i
                            ? "bg-[rgb(var(--wf-brand-600))] text-white border-[rgb(var(--wf-brand-600))]"
                            : "bg-[rgb(var(--wf-card-bg))] border-[rgb(var(--wf-card-border))] text-slate-500"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {freq === "monthly" && (
                <div>
                  <label className="block text-xs font-medium mb-1">Day of month</label>
                  <input
                    type="number"
                    min={1}
                    max={31}
                    className="wf-input w-24 text-sm"
                    value={byMonthday ?? ""}
                    onChange={(e) => setByMonthday(e.target.value === "" ? null : Number(e.target.value))}
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    If the month is shorter, it runs on the last day.
                  </p>
                </div>
              )}

              {freq === "yearly" && (
                <div className="flex flex-wrap gap-3 items-end">
                  <div>
                    <label className="block text-xs font-medium mb-1">Month</label>
                    <select
                      className="wf-input text-sm"
                      value={byMonth ?? 1}
                      onChange={(e) => setByMonth(Number(e.target.value))}
                    >
                      {MONTH_LABELS.map((label, i) => (
                        <option key={i} value={i + 1}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Day</label>
                    <input
                      type="number"
                      min={1}
                      max={31}
                      className="wf-input w-24 text-sm"
                      value={byMonthday ?? ""}
                      onChange={(e) => setByMonthday(e.target.value === "" ? null : Number(e.target.value))}
                    />
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-3 items-end">
                <div>
                  <label className="block text-xs font-medium mb-1">At hour (0–23)</label>
                  <input
                    type="number"
                    min={0}
                    max={23}
                    className="wf-input w-20 text-sm"
                    value={atHour}
                    onChange={(e) => setAtHour(Math.min(23, Math.max(0, Number(e.target.value))))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Timezone</label>
                  <input
                    className="wf-input w-32 text-sm"
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    placeholder="UTC"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-3 items-end">
                <div>
                  <label className="block text-xs font-medium mb-1">Start date</label>
                  <input
                    type="date"
                    className="wf-input text-sm"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">End date (optional)</label>
                  <input
                    type="date"
                    className="wf-input text-sm"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>
              </div>

              <p className="text-sm text-[rgb(var(--wf-brand-600))] font-medium">{preview}</p>
            </div>

            {/* Completion mode */}
            <div className="space-y-2">
              <label className="block text-sm font-medium">Completion</label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="completion_mode"
                  checked={completionMode === "acknowledge"}
                  onChange={() => setCompletionMode("acknowledge")}
                />
                <span>Just remind (mark done)</span>
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="completion_mode"
                  checked={completionMode === "submit_workflow"}
                  onChange={() => setCompletionMode("submit_workflow")}
                />
                <span>Require workflow submission</span>
              </label>
              {completionMode === "submit_workflow" && (
                <select
                  className="wf-input text-sm w-full"
                  value={workflowId}
                  onChange={(e) => setWorkflowId(e.target.value)}
                >
                  <option value="">Select a workflow…</option>
                  {workflows.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Recipients */}
            <div>
              <label className="block text-sm font-medium mb-2">Recipients — users</label>
              <div className="max-h-36 overflow-y-auto border border-[rgb(var(--wf-card-border))] rounded p-2 space-y-1">
                {users.map((u) => (
                  <label key={u.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={userIds.includes(u.id)}
                      onChange={() => toggleUser(u.id)}
                    />
                    <span>{u.full_name}</span>
                    <span className="text-slate-500">{u.email}</span>
                  </label>
                ))}
                {users.length === 0 && <p className="text-xs text-slate-500">No users found</p>}
              </div>
            </div>

            {groups.length > 0 && (
              <div>
                <label className="block text-sm font-medium mb-2">Recipients — groups</label>
                <div className="max-h-28 overflow-y-auto border border-[rgb(var(--wf-card-border))] rounded p-2 space-y-1">
                  {groups.map((g) => (
                    <label key={g.id} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={groupIds.includes(g.id)}
                        onChange={() => toggleGroup(g.id)}
                      />
                      <span>{g.name}</span>
                      <span className="text-slate-500">({g.member_count} members)</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Reminders */}
            <div className="rounded-lg border border-[rgb(var(--wf-card-border))] p-3 space-y-3">
              <label className="flex items-center justify-between text-sm font-medium cursor-pointer">
                <span>Remind until done</span>
                <button
                  type="button"
                  onClick={() => setRemindEnabled((v) => !v)}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                    remindEnabled ? "bg-[rgb(var(--wf-brand-600))]" : "bg-slate-300"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                      remindEnabled ? "translate-x-4" : "translate-x-0"
                    }`}
                  />
                </button>
              </label>
              {remindEnabled && (
                <div className="flex flex-wrap gap-3 items-end">
                  <div>
                    <label className="block text-xs font-medium mb-1">Remind every N days</label>
                    <input
                      type="number"
                      min={1}
                      className="wf-input w-24 text-sm"
                      value={remindInterval}
                      onChange={(e) => setRemindInterval(Math.max(1, Number(e.target.value)))}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Stop after N reminders</label>
                    <input
                      type="number"
                      min={0}
                      className="wf-input w-28 text-sm"
                      value={remindMax}
                      onChange={(e) => setRemindMax(e.target.value)}
                      placeholder="blank = no limit"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Stop N days after due</label>
                    <input
                      type="number"
                      min={0}
                      className="wf-input w-28 text-sm"
                      value={remindWindow}
                      onChange={(e) => setRemindWindow(e.target.value)}
                      placeholder="optional"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Escalation */}
            <div className="rounded-lg border border-[rgb(var(--wf-card-border))] p-3 space-y-3">
              <p className="text-sm font-medium">Escalation</p>
              <div className="flex flex-wrap gap-3 items-end">
                <div>
                  <label className="block text-xs font-medium mb-1">Escalate after N reminders</label>
                  <input
                    type="number"
                    min={0}
                    className="wf-input w-32 text-sm"
                    value={escalateAfter}
                    onChange={(e) => setEscalateAfter(e.target.value)}
                    placeholder="blank = off"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Supervisor</label>
                  <select
                    className="wf-input text-sm"
                    value={supervisorId}
                    onChange={(e) => setSupervisorId(e.target.value)}
                  >
                    <option value="">None</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.full_name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={onClose} className="wf-btn-ghost">
                Cancel
              </button>
              <button type="submit" disabled={loading} className="wf-btn-primary">
                {loading ? "Saving…" : activity ? "Update" : "Create"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

// ── Activities Tab ──────────────────────────────────────────────────────────────

function ActivitiesTab() {
  const token = getToken();
  const [activities, setActivities] = useState<RecurringActivity[]>([]);
  const [users, setUsers] = useState<OrgUser[]>([]);
  const [groups, setGroups] = useState<UserGroup[]>([]);
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [editActivity, setEditActivity] = useState<RecurringActivity | null | "new">(null);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [a, u, g, w] = await Promise.all([
        apiFetch<RecurringActivity[]>("/api/v1/recurring-activities", {}, token),
        apiFetch<OrgUser[]>("/api/v1/admin/users", {}, token),
        apiFetch<UserGroup[]>("/api/v1/admin/user-groups", {}, token).catch(() => [] as UserGroup[]),
        apiFetch<WorkflowSummary[]>("/api/v1/workflows", {}, token),
      ]);
      setActivities(a);
      setUsers(u);
      setGroups(g);
      setWorkflows(w.filter((wf) => wf.status === "published"));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleActive(activity: RecurringActivity) {
    await apiFetch(
      `/api/v1/recurring-activities/${activity.id}`,
      { method: "PATCH", body: JSON.stringify({ is_active: !activity.is_active }) },
      token
    );
    load();
  }

  async function runNow(activity: RecurringActivity) {
    setMessage("");
    try {
      await apiFetch(`/api/v1/recurring-activities/${activity.id}/run-now`, { method: "POST" }, token);
      setMessage(`Opened today's cycle for “${activity.name}”.`);
      load();
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : "Run now failed");
    }
  }

  async function deleteActivity(activity: RecurringActivity) {
    if (!confirm(`Delete recurring activity "${activity.name}"?`)) return;
    await apiFetch(`/api/v1/recurring-activities/${activity.id}`, { method: "DELETE" }, token);
    load();
  }

  if (loading) return <p className="text-sm text-slate-500 py-8 text-center">Loading…</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-slate-500">
          {activities.length} {activities.length === 1 ? "activity" : "activities"}
        </p>
        <button className="wf-btn-primary text-sm" onClick={() => setEditActivity("new")}>
          + New activity
        </button>
      </div>

      {message && <p className="text-sm text-green-700 mb-3">{message}</p>}

      {activities.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <IconRepeat size={36} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">No recurring activities yet</p>
          <p className="text-sm mt-1">
            Create one to schedule recurring obligations for your team.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[rgb(var(--wf-card-border))]">
                <th className="text-left py-2 pr-4 font-medium">Name</th>
                <th className="text-left py-2 pr-4 font-medium">Schedule</th>
                <th className="text-left py-2 pr-4 font-medium">Mode</th>
                <th className="text-left py-2 pr-4 font-medium">Recipients</th>
                <th className="text-left py-2 pr-4 font-medium">Active</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {activities.map((activity) => (
                <tr
                  key={activity.id}
                  className="border-b border-[rgb(var(--wf-card-border))] hover:bg-[rgb(var(--wf-accent-muted))]"
                >
                  <td className="py-3 pr-4">
                    <div className="font-medium">{activity.name}</div>
                    {activity.description && (
                      <div className="text-xs text-slate-500 mt-0.5 truncate max-w-xs">
                        {activity.description}
                      </div>
                    )}
                  </td>
                  <td className="py-3 pr-4">{activity.schedule_summary}</td>
                  <td className="py-3 pr-4">
                    {activity.completion_mode === "submit_workflow" ? (
                      <span>
                        Workflow
                        {activity.workflow_name && (
                          <span className="text-slate-500"> · {activity.workflow_name}</span>
                        )}
                      </span>
                    ) : (
                      "Acknowledge"
                    )}
                  </td>
                  <td className="py-3 pr-4">
                    <span className="text-slate-500">
                      {activity.recipient_user_ids.length} user
                      {activity.recipient_user_ids.length !== 1 ? "s" : ""}
                      {activity.recipient_group_ids.length > 0 &&
                        `, ${activity.recipient_group_ids.length} group${
                          activity.recipient_group_ids.length !== 1 ? "s" : ""
                        }`}
                    </span>
                  </td>
                  <td className="py-3 pr-4">
                    <button
                      onClick={() => toggleActive(activity)}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                        activity.is_active ? "bg-[rgb(var(--wf-brand-600))]" : "bg-slate-300"
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                          activity.is_active ? "translate-x-4" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </td>
                  <td className="py-3 text-right whitespace-nowrap">
                    <button
                      onClick={() => runNow(activity)}
                      className="text-xs text-[rgb(var(--wf-brand-600))] hover:underline mr-3"
                    >
                      Run now
                    </button>
                    <button
                      onClick={() => setEditActivity(activity)}
                      className="text-xs text-[rgb(var(--wf-brand-600))] hover:underline mr-3"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => deleteActivity(activity)}
                      className="text-xs text-red-500 hover:underline"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editActivity !== null && (
        <ActivityModal
          activity={editActivity === "new" ? null : editActivity}
          users={users}
          groups={groups}
          workflows={workflows}
          onClose={() => setEditActivity(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}

// ── My Obligations Tab ──────────────────────────────────────────────────────────

function MyObligationsTab() {
  const token = getToken();
  const [obligations, setObligations] = useState<Obligation[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<Obligation[]>(
        "/api/v1/recurring-activities/mine/obligations",
        {},
        token
      );
      setObligations(data);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  async function acknowledge(ob: Obligation) {
    setBusyId(ob.id);
    try {
      await apiFetch(
        `/api/v1/recurring-activities/obligations/${ob.id}/acknowledge`,
        { method: "POST" },
        token
      );
      await load();
    } finally {
      setBusyId(null);
    }
  }

  const outstanding = obligations.filter((o) => o.status === "outstanding");
  const recent = obligations.filter((o) => o.status !== "outstanding");

  if (loading) return <p className="text-sm text-slate-500 py-8 text-center">Loading…</p>;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold mb-3">
          Outstanding
          {outstanding.length > 0 && (
            <span className="ml-2 px-1.5 py-0.5 bg-amber-100 text-amber-700 text-xs rounded">
              {outstanding.length}
            </span>
          )}
        </h3>
        {outstanding.length === 0 ? (
          <div className="text-center py-10 text-slate-500">
            <IconCheckCircle size={36} className="mx-auto mb-3 opacity-30" />
            <p className="font-medium">All caught up!</p>
            <p className="text-sm mt-1">You have no outstanding activities.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {outstanding.map((ob) => (
              <div
                key={ob.id}
                className="flex items-center justify-between p-4 rounded-lg border border-[rgb(var(--wf-card-border))] bg-[rgb(var(--wf-card-bg))]"
              >
                <div>
                  <p className="font-medium text-sm">{ob.activity_name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {ob.period_label} · Due {ob.due_date}
                  </p>
                </div>
                {ob.completion_mode === "submit_workflow" ? (
                  <Link
                    to={`/submit?wf=${ob.workflow_definition_id}`}
                    className="wf-btn-primary text-xs py-1.5 px-3"
                  >
                    Open form
                  </Link>
                ) : (
                  <button
                    onClick={() => acknowledge(ob)}
                    disabled={busyId === ob.id}
                    className="wf-btn-primary text-xs py-1.5 px-3 flex items-center gap-1 disabled:opacity-50"
                  >
                    <IconCheckCircle size={13} />
                    {busyId === ob.id ? "Saving…" : "Mark done"}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {recent.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-3">Recent</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[rgb(var(--wf-card-border))]">
                  <th className="text-left py-2 pr-4 font-medium">Activity</th>
                  <th className="text-left py-2 pr-4 font-medium">Period</th>
                  <th className="text-left py-2 pr-4 font-medium">Due</th>
                  <th className="text-left py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((ob) => (
                  <tr key={ob.id} className="border-b border-[rgb(var(--wf-card-border))]">
                    <td className="py-2 pr-4">{ob.activity_name}</td>
                    <td className="py-2 pr-4">{ob.period_label}</td>
                    <td className="py-2 pr-4">{ob.due_date}</td>
                    <td className="py-2">{statusBadge(ob.status)}</td>
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

// ── Compliance Tab ──────────────────────────────────────────────────────────────

function ComplianceTab() {
  const token = getToken();
  const [activities, setActivities] = useState<RecurringActivity[]>([]);
  const [activityId, setActivityId] = useState("");
  const [cycleId, setCycleId] = useState("");
  const [summary, setSummary] = useState<ComplianceSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    apiFetch<RecurringActivity[]>("/api/v1/recurring-activities", {}, token)
      .then((list) => {
        setActivities(list);
        if (list.length > 0) setActivityId(list[0].id);
      })
      .catch(() => {});
  }, [token]);

  const loadSummary = useCallback(
    async (id: string, cycle: string) => {
      if (!id) return;
      setLoading(true);
      setMessage("");
      try {
        const qs = cycle ? `?cycle_id=${encodeURIComponent(cycle)}` : "";
        const data = await apiFetch<ComplianceSummary>(
          `/api/v1/recurring-activities/${id}/compliance${qs}`,
          {},
          token
        );
        setSummary(data);
      } finally {
        setLoading(false);
      }
    },
    [token]
  );

  useEffect(() => {
    if (activityId) {
      setCycleId("");
      loadSummary(activityId, "");
    } else {
      setSummary(null);
    }
  }, [activityId, loadSummary]);

  function onCycleChange(next: string) {
    setCycleId(next);
    loadSummary(activityId, next);
  }

  async function runNow() {
    if (!activityId) return;
    setMessage("");
    try {
      await apiFetch(`/api/v1/recurring-activities/${activityId}/run-now`, { method: "POST" }, token);
      setMessage("Opened today's cycle.");
      setCycleId("");
      await loadSummary(activityId, "");
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : "Run now failed");
    }
  }

  async function exportCsv() {
    if (!activityId) return;
    const qs = cycleId ? `?cycle_id=${encodeURIComponent(cycleId)}` : "";
    await apiDownload(
      `/api/v1/recurring-activities/${activityId}/compliance/export.csv${qs}`,
      "recurring-activity-compliance.csv",
      token
    );
  }

  const hasCycles = (summary?.cycles.length ?? 0) > 0;

  return (
    <div className="space-y-6">
      {/* Selectors */}
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-medium mb-1">Activity</label>
          <select
            className="wf-input text-sm"
            value={activityId}
            onChange={(e) => setActivityId(e.target.value)}
          >
            {activities.length === 0 && <option value="">No activities</option>}
            {activities.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        {hasCycles && summary && (
          <div>
            <label className="block text-xs font-medium mb-1">Cycle</label>
            <select className="wf-input text-sm" value={cycleId} onChange={(e) => onCycleChange(e.target.value)}>
              {summary.cycles.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.period_label} · {c.due_date}
                </option>
              ))}
            </select>
          </div>
        )}
        <button className="wf-btn-primary text-sm" onClick={runNow} disabled={!activityId}>
          Run now
        </button>
        {summary && summary.total > 0 && (
          <button className="wf-btn-ghost text-sm" onClick={exportCsv}>
            Export CSV
          </button>
        )}
      </div>

      {message && <p className="text-sm text-green-700">{message}</p>}

      {loading && <p className="text-sm text-slate-500 py-8 text-center">Loading…</p>}

      {!loading && summary && !hasCycles && (
        <div className="text-center py-16 text-slate-500">
          <IconRepeat size={36} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">No cycles yet</p>
          <p className="text-sm mt-1">Run the activity now to open its first cycle.</p>
        </div>
      )}

      {!loading && summary && hasCycles && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-lg border border-[rgb(var(--wf-card-border))] p-4 bg-[rgb(var(--wf-card-bg))]">
              <p className="text-xs text-slate-500">Total</p>
              <p className="text-2xl font-bold mt-1">{summary.total}</p>
            </div>
            <div className="rounded-lg border border-green-200 p-4 bg-green-50">
              <p className="text-xs text-green-600">Submitted</p>
              <p className="text-2xl font-bold text-green-700 mt-1">{summary.submitted}</p>
            </div>
            <div className="rounded-lg border border-amber-200 p-4 bg-amber-50">
              <p className="text-xs text-amber-600">Outstanding</p>
              <p className="text-2xl font-bold text-amber-700 mt-1">{summary.outstanding}</p>
            </div>
            <div className="rounded-lg border border-[rgb(var(--wf-card-border))] p-4 bg-[rgb(var(--wf-card-bg))]">
              <p className="text-xs text-slate-500">Compliance</p>
              <p
                className={`text-2xl font-bold mt-1 ${
                  summary.compliance_pct >= 80
                    ? "text-green-600"
                    : summary.compliance_pct >= 50
                    ? "text-amber-600"
                    : "text-red-600"
                }`}
              >
                {summary.compliance_pct}%
              </p>
            </div>
          </div>

          {/* Table */}
          {summary.rows.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[rgb(var(--wf-card-border))]">
                    <th className="text-left py-2 pr-4 font-medium">Recipient</th>
                    <th className="text-left py-2 pr-4 font-medium">Status</th>
                    <th className="text-left py-2 pr-4 font-medium">Reminders</th>
                    <th className="text-left py-2 pr-4 font-medium">Escalated</th>
                    <th className="text-left py-2 font-medium">Completed at</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.rows.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-[rgb(var(--wf-card-border))] hover:bg-[rgb(var(--wf-accent-muted))]"
                    >
                      <td className="py-2 pr-4 font-medium">{row.user_name}</td>
                      <td className="py-2 pr-4">{statusBadge(row.status)}</td>
                      <td className="py-2 pr-4">{row.reminder_count}</td>
                      <td className="py-2 pr-4 text-slate-500">{row.escalated_at ? "Yes" : "—"}</td>
                      <td className="py-2 text-slate-500">
                        {row.completed_at ? new Date(row.completed_at).toLocaleString() : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-slate-500 py-8 text-center">
              No recipients in this cycle yet.
            </p>
          )}
        </>
      )}
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────────

export function RecurringActivitiesPage() {
  const { user } = useAuth();
  const isAdmin = user?.roles.some((r) => r === "company_admin" || r === "manager") ?? false;

  type Tab = "my" | "activities" | "compliance";
  const [tab, setTab] = useState<Tab>("my");

  const tabs = useMemo<{ id: Tab; label: string }[]>(
    () => [
      { id: "my", label: "My obligations" },
      ...(isAdmin
        ? [
            { id: "activities" as Tab, label: "Activities" },
            { id: "compliance" as Tab, label: "Compliance" },
          ]
        : []),
    ],
    [isAdmin]
  );

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <IconRepeat size={22} />
        <h1 className="text-xl font-semibold">Recurring Activities</h1>
      </div>

      {/* Tabs */}
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

      {/* Tab content */}
      <div>
        {tab === "my" && <MyObligationsTab />}
        {tab === "activities" && isAdmin && <ActivitiesTab />}
        {tab === "compliance" && isAdmin && <ComplianceTab />}
      </div>
    </div>
  );
}
