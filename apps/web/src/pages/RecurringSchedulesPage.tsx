import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  apiFetch,
  apiDownload,
  listChecklists,
  ChecklistSummary,
  OrgUser,
  UserGroup,
  WorkflowSummary,
} from "../lib/api";
import { getToken } from "../lib/auth";
import { useAuth } from "../context/AuthContext";
import { IconRepeat, IconCheckCircle, IconChevronDown } from "../components/icons";

// ── Types ────────────────────────────────────────────────────────────────────

type Freq = "weekly" | "monthly" | "yearly";
type TargetKind = "workflow" | "acknowledge" | "checklist";

type Target = {
  id: string;
  schedule_id: string;
  kind: TargetKind;
  name: string | null;
  target_name: string;
  workflow_definition_id: string | null;
  checklist_id: string | null;
  recipient_user_ids: string[];
  recipient_group_ids: string[];
  remind_enabled: boolean;
  remind_interval_days: number;
  remind_max_count: number | null;
  remind_window_days: number | null;
  escalate_after_count: number | null;
  supervisor_user_id: string | null;
  is_active: boolean;
  created_at: string;
};

type Schedule = {
  id: string;
  name: string;
  description: string | null;
  freq: Freq;
  interval: number;
  by_weekday: number | null;
  by_monthday: number | null;
  by_month: number | null;
  at_hour: number;
  timezone: string;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
  last_run_at: string | null;
  created_at: string;
  schedule_summary: string;
  targets: Target[];
};

type Obligation = {
  id: string;
  schedule_id: string;
  schedule_name: string;
  target_id: string;
  run_id: string;
  due_date: string;
  period_label: string;
  user_id: string;
  user_name: string;
  status: "outstanding" | "submitted" | "waived" | string;
  completed_at: string | null;
  reminder_count: number;
  escalated_at: string | null;
  completion_mode: "acknowledge" | "submit_workflow";
  workflow_definition_id: string | null;
};

type RunOption = { id: string; due_date: string; period_label: string };

type ComplianceSummary = {
  target_id: string;
  target_name: string;
  schedule_name: string;
  run_id: string | null;
  due_date: string | null;
  period_label: string;
  total: number;
  submitted: number;
  outstanding: number;
  compliance_pct: number;
  rows: Obligation[];
  runs: RunOption[];
};

// The schedule create/update body (recurrence only).
type ScheduleBody = {
  name: string;
  description: string | null;
  freq: Freq;
  interval: number;
  by_weekday: number | null;
  by_monthday: number | null;
  by_month: number | null;
  at_hour: number;
  timezone: string;
  start_date: string;
  end_date: string | null;
};

// The target create/update body (the "what" attached to a schedule).
type TargetBody = {
  kind: TargetKind;
  name: string | null;
  workflow_definition_id: string | null;
  checklist_id: string | null;
  recipient_user_ids: string[];
  recipient_group_ids: string[];
  remind_enabled: boolean;
  remind_interval_days: number;
  remind_max_count: number | null;
  remind_window_days: number | null;
  escalate_after_count: number | null;
  supervisor_user_id: string | null;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

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

function nullableInt(raw: string): number | null {
  const t = raw.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Build a human-readable preview of the recurrence from the builder fields. */
function schedulePreview(
  freq: Freq,
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

const KIND_LABEL: Record<TargetKind, string> = {
  workflow: "Workflow",
  acknowledge: "Acknowledge",
  checklist: "Checklist",
};

function kindBadge(kind: TargetKind) {
  const styles: Record<TargetKind, string> = {
    workflow: "bg-blue-50 text-blue-700 border-blue-200",
    acknowledge: "bg-violet-50 text-violet-700 border-violet-200",
    checklist: "bg-green-50 text-green-700 border-green-200",
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${styles[kind]}`}
    >
      {KIND_LABEL[kind]}
    </span>
  );
}

function recipientSummary(t: Target): string {
  if (t.kind === "checklist") return "Reopens its checklist each period";
  const nu = t.recipient_user_ids.length;
  const ng = t.recipient_group_ids.length;
  if (nu === 0 && ng === 0) return "No recipients";
  const parts: string[] = [];
  if (nu) parts.push(`${nu} user${nu !== 1 ? "s" : ""}`);
  if (ng) parts.push(`${ng} group${ng !== 1 ? "s" : ""}`);
  return parts.join(", ");
}

// ── Reusable toggle switch ───────────────────────────────────────────────────

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
        on ? "bg-[rgb(var(--wf-brand-600))]" : "bg-slate-300"
      }`}
      aria-pressed={on}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
          on ? "translate-x-4" : "translate-x-0"
        }`}
      />
    </button>
  );
}

// ── Schedule form modal (recurrence only) ────────────────────────────────────

function ScheduleModal({
  schedule,
  onClose,
  onSaved,
}: {
  schedule: Schedule | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const token = getToken();
  const [name, setName] = useState(schedule?.name ?? "");
  const [description, setDescription] = useState(schedule?.description ?? "");
  const [freq, setFreq] = useState<Freq>(schedule?.freq ?? "monthly");
  const [interval, setIntervalVal] = useState(schedule?.interval ?? 1);
  const [byWeekday, setByWeekday] = useState<number | null>(schedule?.by_weekday ?? 0);
  const [byMonthday, setByMonthday] = useState<number | null>(schedule?.by_monthday ?? 1);
  const [byMonth, setByMonth] = useState<number | null>(schedule?.by_month ?? 1);
  const [atHour, setAtHour] = useState(schedule?.at_hour ?? 9);
  const [timezone, setTimezone] = useState(schedule?.timezone ?? "UTC");
  const [startDate, setStartDate] = useState(schedule?.start_date ?? todayIso());
  const [endDate, setEndDate] = useState(schedule?.end_date ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const preview = schedulePreview(freq, interval, byWeekday, byMonthday, byMonth, atHour);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Name is required.");
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

    setLoading(true);
    setError("");
    try {
      const body: ScheduleBody = {
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
      };
      if (schedule) {
        await apiFetch(
          `/api/v1/recurring-schedules/${schedule.id}`,
          { method: "PATCH", body: JSON.stringify(body) },
          token
        );
      } else {
        await apiFetch(
          "/api/v1/recurring-schedules",
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
            {schedule ? "Edit schedule" : "New schedule"}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Name *</label>
              <input
                className="wf-input w-full"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Month-end close"
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
                placeholder="What this calendar rule is for."
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
                    onChange={(e) => setFreq(e.target.value as Freq)}
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

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={onClose} className="wf-btn-ghost">
                Cancel
              </button>
              <button type="submit" disabled={loading} className="wf-btn-primary">
                {loading ? "Saving…" : schedule ? "Update" : "Create"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

// ── Target form modal (attach a workflow / acknowledge / checklist) ──────────

function TargetModal({
  scheduleId,
  target,
  users,
  groups,
  workflows,
  checklists,
  onClose,
  onSaved,
}: {
  scheduleId: string;
  target: Target | null;
  users: OrgUser[];
  groups: UserGroup[];
  workflows: WorkflowSummary[];
  checklists: ChecklistSummary[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const token = getToken();
  const [kind, setKind] = useState<TargetKind>(target?.kind ?? "acknowledge");
  const [name, setName] = useState(target?.name ?? "");
  const [workflowId, setWorkflowId] = useState(target?.workflow_definition_id ?? "");
  const [checklistId, setChecklistId] = useState(target?.checklist_id ?? "");
  const [userIds, setUserIds] = useState<string[]>(target?.recipient_user_ids ?? []);
  const [groupIds, setGroupIds] = useState<string[]>(target?.recipient_group_ids ?? []);
  const [remindEnabled, setRemindEnabled] = useState(target?.remind_enabled ?? true);
  const [remindInterval, setRemindInterval] = useState(target?.remind_interval_days ?? 1);
  const [remindMax, setRemindMax] = useState<string>(
    target?.remind_max_count != null ? String(target.remind_max_count) : "10"
  );
  const [remindWindow, setRemindWindow] = useState<string>(
    target?.remind_window_days != null ? String(target.remind_window_days) : ""
  );
  const [escalateAfter, setEscalateAfter] = useState<string>(
    target?.escalate_after_count != null ? String(target.escalate_after_count) : ""
  );
  const [supervisorId, setSupervisorId] = useState(target?.supervisor_user_id ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const isObligation = kind === "workflow" || kind === "acknowledge";

  function toggleUser(id: string) {
    setUserIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function toggleGroup(id: string) {
    setGroupIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (kind === "workflow" && !workflowId) {
      setError("Choose a workflow.");
      return;
    }
    if (kind === "checklist" && !checklistId) {
      setError("Choose a checklist.");
      return;
    }
    if (isObligation && userIds.length === 0 && groupIds.length === 0) {
      setError("Select at least one recipient user or group.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const body: TargetBody = {
        kind,
        name: name.trim() || null,
        workflow_definition_id: kind === "workflow" ? workflowId : null,
        checklist_id: kind === "checklist" ? checklistId : null,
        recipient_user_ids: isObligation ? userIds : [],
        recipient_group_ids: isObligation ? groupIds : [],
        remind_enabled: isObligation ? remindEnabled : false,
        remind_interval_days: remindInterval || 1,
        remind_max_count: nullableInt(remindMax),
        remind_window_days: nullableInt(remindWindow),
        escalate_after_count: isObligation ? nullableInt(escalateAfter) : null,
        supervisor_user_id: isObligation ? supervisorId || null : null,
      };
      if (target) {
        await apiFetch(
          `/api/v1/recurring-schedules/targets/${target.id}`,
          { method: "PATCH", body: JSON.stringify(body) },
          token
        );
      } else {
        await apiFetch(
          `/api/v1/recurring-schedules/${scheduleId}/targets`,
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
          <h2 className="text-lg font-semibold mb-4">{target ? "Edit target" : "Add target"}</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Kind */}
            <div>
              <label className="block text-sm font-medium mb-2">What runs each fire?</label>
              <div className="flex flex-wrap gap-2">
                {(["workflow", "acknowledge", "checklist"] as TargetKind[]).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setKind(k)}
                    className={`px-3 py-1.5 rounded text-sm border transition-colors ${
                      kind === k
                        ? "bg-[rgb(var(--wf-brand-600))] text-white border-[rgb(var(--wf-brand-600))]"
                        : "bg-[rgb(var(--wf-card-bg))] border-[rgb(var(--wf-card-border))] text-slate-500"
                    }`}
                  >
                    {KIND_LABEL[k]}
                  </button>
                ))}
              </div>
            </div>

            {/* Kind-specific picker */}
            {kind === "workflow" && (
              <div>
                <label className="block text-sm font-medium mb-1">Workflow *</label>
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
                {workflows.length === 0 && (
                  <p className="text-xs text-slate-500 mt-1">No published workflows found.</p>
                )}
              </div>
            )}

            {kind === "checklist" && (
              <div>
                <label className="block text-sm font-medium mb-1">Checklist *</label>
                <select
                  className="wf-input text-sm w-full"
                  value={checklistId}
                  onChange={(e) => setChecklistId(e.target.value)}
                >
                  <option value="">Select a checklist…</option>
                  {checklists.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                {checklists.length === 0 && (
                  <p className="text-xs text-slate-500 mt-1">No checklists found.</p>
                )}
                <p className="text-xs text-slate-500 mt-1">
                  Each fire reopens a fresh period of this checklist for its task assignees.
                </p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium mb-1">Label (optional)</label>
              <input
                className="wf-input w-full"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={kind === "acknowledge" ? "e.g. Confirm safety walk done" : "Overrides the resolved name"}
              />
            </div>

            {/* Recipients + reminders + escalation only apply to obligation kinds */}
            {isObligation && (
              <>
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
                    <Toggle on={remindEnabled} onClick={() => setRemindEnabled((v) => !v)} />
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
              </>
            )}

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={onClose} className="wf-btn-ghost">
                Cancel
              </button>
              <button type="submit" disabled={loading} className="wf-btn-primary">
                {loading ? "Saving…" : target ? "Update" : "Add target"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

// ── Schedules tab ────────────────────────────────────────────────────────────

function SchedulesTab() {
  const token = getToken();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [users, setUsers] = useState<OrgUser[]>([]);
  const [groups, setGroups] = useState<UserGroup[]>([]);
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [checklists, setChecklists] = useState<ChecklistSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editSchedule, setEditSchedule] = useState<Schedule | null | "new">(null);
  const [targetModal, setTargetModal] = useState<{ scheduleId: string; target: Target | null } | null>(
    null
  );
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, u, g, w, c] = await Promise.all([
        apiFetch<Schedule[]>("/api/v1/recurring-schedules", {}, token),
        apiFetch<OrgUser[]>("/api/v1/admin/users", {}, token),
        apiFetch<UserGroup[]>("/api/v1/admin/user-groups", {}, token).catch(() => [] as UserGroup[]),
        apiFetch<WorkflowSummary[]>("/api/v1/workflows", {}, token),
        listChecklists(token).catch(() => [] as ChecklistSummary[]),
      ]);
      setSchedules(s);
      setUsers(u);
      setGroups(g);
      setWorkflows(w.filter((wf) => wf.status === "published"));
      setChecklists(c);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleScheduleActive(s: Schedule) {
    await apiFetch(
      `/api/v1/recurring-schedules/${s.id}`,
      { method: "PATCH", body: JSON.stringify({ is_active: !s.is_active }) },
      token
    );
    load();
  }

  async function toggleTargetActive(t: Target) {
    await apiFetch(
      `/api/v1/recurring-schedules/targets/${t.id}`,
      { method: "PATCH", body: JSON.stringify({ is_active: !t.is_active }) },
      token
    );
    load();
  }

  async function runNow(s: Schedule) {
    setMessage("");
    try {
      await apiFetch(`/api/v1/recurring-schedules/${s.id}/run-now`, { method: "POST" }, token);
      setMessage(`Opened today's runs for “${s.name}”.`);
      load();
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : "Run now failed");
    }
  }

  async function deleteSchedule(s: Schedule) {
    if (!confirm(`Delete schedule "${s.name}" and all its targets?`)) return;
    await apiFetch(`/api/v1/recurring-schedules/${s.id}`, { method: "DELETE" }, token);
    load();
  }

  async function deleteTarget(t: Target) {
    if (!confirm(`Delete this ${t.kind} target?`)) return;
    await apiFetch(`/api/v1/recurring-schedules/targets/${t.id}`, { method: "DELETE" }, token);
    load();
  }

  if (loading) return <p className="text-sm text-slate-500 py-8 text-center">Loading…</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-slate-500">
          {schedules.length} {schedules.length === 1 ? "schedule" : "schedules"}
        </p>
        <button className="wf-btn-primary text-sm" onClick={() => setEditSchedule("new")}>
          + New schedule
        </button>
      </div>

      {message && <p className="text-sm text-green-700 mb-3">{message}</p>}

      {schedules.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <IconRepeat size={36} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">No schedules yet</p>
          <p className="text-sm mt-1">
            Create a calendar rule, then attach workflows, acknowledgements, or checklists to it.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {schedules.map((s) => {
            const expanded = expandedId === s.id;
            return (
              <div
                key={s.id}
                className="rounded-lg border border-[rgb(var(--wf-card-border))] bg-[rgb(var(--wf-card-bg))] overflow-hidden"
              >
                {/* Header */}
                <div className="flex items-center gap-3 p-4">
                  <button
                    onClick={() => setExpandedId(expanded ? null : s.id)}
                    className="flex items-center gap-2 flex-1 min-w-0 text-left"
                    aria-expanded={expanded}
                  >
                    <IconChevronDown
                      size={16}
                      className={`shrink-0 transition-transform ${expanded ? "" : "-rotate-90"}`}
                    />
                    <span className="min-w-0">
                      <span className="block font-medium truncate">{s.name}</span>
                      <span className="block text-xs text-slate-500 mt-0.5">
                        {s.schedule_summary}
                      </span>
                    </span>
                  </button>
                  <span className="wf-badge shrink-0">
                    {s.targets.length} {s.targets.length === 1 ? "target" : "targets"}
                  </span>
                  <Toggle on={s.is_active} onClick={() => toggleScheduleActive(s)} />
                  <div className="flex items-center gap-3 shrink-0 whitespace-nowrap">
                    <button
                      onClick={() => runNow(s)}
                      className="text-xs text-[rgb(var(--wf-brand-600))] hover:underline"
                    >
                      Run now
                    </button>
                    <button
                      onClick={() => setEditSchedule(s)}
                      className="text-xs text-[rgb(var(--wf-brand-600))] hover:underline"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => deleteSchedule(s)}
                      className="text-xs text-red-500 hover:underline"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {/* Targets */}
                {expanded && (
                  <div className="border-t border-[rgb(var(--wf-card-border))] bg-[rgb(var(--wf-accent-muted))] p-4 space-y-2">
                    {s.targets.length === 0 ? (
                      <p className="text-sm text-slate-500 py-2">
                        No targets yet. Add one to attach a workflow, acknowledgement, or checklist.
                      </p>
                    ) : (
                      s.targets.map((t) => (
                        <div
                          key={t.id}
                          className="flex items-center gap-3 p-3 rounded-lg border border-[rgb(var(--wf-card-border))] bg-[rgb(var(--wf-card-bg))]"
                        >
                          {kindBadge(t.kind)}
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm truncate">{t.target_name}</div>
                            <div className="text-xs text-slate-500">{recipientSummary(t)}</div>
                          </div>
                          <Toggle on={t.is_active} onClick={() => toggleTargetActive(t)} />
                          <button
                            onClick={() => setTargetModal({ scheduleId: s.id, target: t })}
                            className="text-xs text-[rgb(var(--wf-brand-600))] hover:underline"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => deleteTarget(t)}
                            className="text-xs text-red-500 hover:underline"
                          >
                            Delete
                          </button>
                        </div>
                      ))
                    )}
                    <button
                      className="wf-btn-secondary text-sm mt-1"
                      onClick={() => setTargetModal({ scheduleId: s.id, target: null })}
                    >
                      + Add target
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {editSchedule !== null && (
        <ScheduleModal
          schedule={editSchedule === "new" ? null : editSchedule}
          onClose={() => setEditSchedule(null)}
          onSaved={load}
        />
      )}

      {targetModal && (
        <TargetModal
          scheduleId={targetModal.scheduleId}
          target={targetModal.target}
          users={users}
          groups={groups}
          workflows={workflows}
          checklists={checklists}
          onClose={() => setTargetModal(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}

// ── My obligations tab ───────────────────────────────────────────────────────

function MyObligationsTab() {
  const token = getToken();
  const [obligations, setObligations] = useState<Obligation[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<Obligation[]>(
        "/api/v1/recurring-schedules/mine/obligations",
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
        `/api/v1/recurring-schedules/obligations/${ob.id}/acknowledge`,
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
            <p className="text-sm mt-1">You have no outstanding obligations.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {outstanding.map((ob) => (
              <div
                key={ob.id}
                className="flex items-center justify-between p-4 rounded-lg border border-[rgb(var(--wf-card-border))] bg-[rgb(var(--wf-card-bg))]"
              >
                <div>
                  <p className="font-medium text-sm">{ob.schedule_name}</p>
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
                  <th className="text-left py-2 pr-4 font-medium">Schedule</th>
                  <th className="text-left py-2 pr-4 font-medium">Period</th>
                  <th className="text-left py-2 pr-4 font-medium">Due</th>
                  <th className="text-left py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((ob) => (
                  <tr key={ob.id} className="border-b border-[rgb(var(--wf-card-border))]">
                    <td className="py-2 pr-4">{ob.schedule_name}</td>
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

// ── Compliance tab ───────────────────────────────────────────────────────────

function ComplianceTab() {
  const token = getToken();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [scheduleId, setScheduleId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [runId, setRunId] = useState("");
  const [summary, setSummary] = useState<ComplianceSummary | null>(null);
  const [loading, setLoading] = useState(false);

  // Only workflow / acknowledge targets produce compliance obligations.
  const obligationTargets = useCallback(
    (s: Schedule | undefined) => (s?.targets ?? []).filter((t) => t.kind !== "checklist"),
    []
  );

  useEffect(() => {
    apiFetch<Schedule[]>("/api/v1/recurring-schedules", {}, token)
      .then((list) => {
        setSchedules(list);
        if (list.length > 0) {
          const first = list[0];
          setScheduleId(first.id);
          const opts = first.targets.filter((t) => t.kind !== "checklist");
          setTargetId(opts.length > 0 ? opts[0].id : "");
        }
      })
      .catch(() => {});
  }, [token]);

  const loadSummary = useCallback(
    async (tId: string, rId: string) => {
      if (!tId) {
        setSummary(null);
        return;
      }
      setLoading(true);
      try {
        const qs = rId ? `?run_id=${encodeURIComponent(rId)}` : "";
        const data = await apiFetch<ComplianceSummary>(
          `/api/v1/recurring-schedules/targets/${tId}/compliance${qs}`,
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
    loadSummary(targetId, "");
  }, [targetId, loadSummary]);

  const selectedSchedule = schedules.find((s) => s.id === scheduleId);
  const targetOptions = obligationTargets(selectedSchedule);

  function onScheduleChange(id: string) {
    setScheduleId(id);
    const opts = obligationTargets(schedules.find((s) => s.id === id));
    setRunId("");
    setTargetId(opts.length > 0 ? opts[0].id : "");
  }

  function onTargetChange(id: string) {
    setRunId("");
    setTargetId(id);
  }

  function onRunChange(id: string) {
    setRunId(id);
    loadSummary(targetId, id);
  }

  async function exportCsv() {
    if (!targetId) return;
    const currentRun = runId || summary?.run_id || "";
    const qs = currentRun ? `?run_id=${encodeURIComponent(currentRun)}` : "";
    await apiDownload(
      `/api/v1/recurring-schedules/targets/${targetId}/compliance/export.csv${qs}`,
      "schedule-compliance.csv",
      token
    );
  }

  const currentRun = runId || summary?.run_id || "";
  const hasRuns = (summary?.runs.length ?? 0) > 0;

  if (schedules.length === 0) {
    return (
      <div className="text-center py-16 text-slate-500">
        <IconRepeat size={36} className="mx-auto mb-3 opacity-30" />
        <p className="font-medium">No schedules yet</p>
        <p className="text-sm mt-1">Create a schedule and attach a target to track compliance.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Selectors */}
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-medium mb-1">Schedule</label>
          <select
            className="wf-input text-sm"
            value={scheduleId}
            onChange={(e) => onScheduleChange(e.target.value)}
          >
            {schedules.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Target</label>
          <select
            className="wf-input text-sm"
            value={targetId}
            onChange={(e) => onTargetChange(e.target.value)}
            disabled={targetOptions.length === 0}
          >
            {targetOptions.length === 0 && <option value="">No reportable targets</option>}
            {targetOptions.map((t) => (
              <option key={t.id} value={t.id}>
                {KIND_LABEL[t.kind]} · {t.target_name}
              </option>
            ))}
          </select>
        </div>
        {hasRuns && summary && (
          <div>
            <label className="block text-xs font-medium mb-1">Period</label>
            <select
              className="wf-input text-sm"
              value={currentRun}
              onChange={(e) => onRunChange(e.target.value)}
            >
              {summary.runs.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.period_label} · {r.due_date}
                </option>
              ))}
            </select>
          </div>
        )}
        {summary && summary.total > 0 && (
          <button className="wf-btn-ghost text-sm" onClick={exportCsv}>
            Export CSV
          </button>
        )}
      </div>

      {loading && <p className="text-sm text-slate-500 py-8 text-center">Loading…</p>}

      {!loading && targetOptions.length === 0 && (
        <div className="text-center py-16 text-slate-500">
          <IconRepeat size={36} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">Nothing to report on</p>
          <p className="text-sm mt-1">
            This schedule has no workflow or acknowledge targets. Add one on the Schedules tab.
          </p>
        </div>
      )}

      {!loading && summary && targetOptions.length > 0 && !hasRuns && (
        <div className="text-center py-16 text-slate-500">
          <IconRepeat size={36} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">No runs yet</p>
          <p className="text-sm mt-1">Use “Run now” on the Schedules tab to open the first run.</p>
        </div>
      )}

      {!loading && summary && hasRuns && (
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
              No recipients in this run yet.
            </p>
          )}
        </>
      )}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export function RecurringSchedulesPage() {
  const { user } = useAuth();
  const isAdmin = user?.roles.some((r) => r === "company_admin" || r === "manager") ?? false;

  type Tab = "my" | "schedules" | "compliance";
  const [tab, setTab] = useState<Tab>("my");

  const tabs = useMemo<{ id: Tab; label: string }[]>(
    () => [
      { id: "my", label: "My obligations" },
      ...(isAdmin
        ? [
            { id: "schedules" as Tab, label: "Schedules" },
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
        <h1 className="text-xl font-semibold">Recurring Schedules</h1>
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
        {tab === "schedules" && isAdmin && <SchedulesTab />}
        {tab === "compliance" && isAdmin && <ComplianceTab />}
      </div>
    </div>
  );
}
