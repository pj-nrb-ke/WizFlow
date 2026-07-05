import { FormEvent, useCallback, useEffect, useState } from "react";
import { apiFetch, apiDownload, OrgUser, UserGroup } from "../lib/api";
import { getToken } from "../lib/auth";
import { useAuth } from "../context/AuthContext";
import { IconCheckCircle, IconRepeat } from "../components/icons";

// ── Types ──────────────────────────────────────────────────────────────────────

type ReminderRule = {
  id: string;
  name: string;
  description: string | null;
  days_of_week: number[];
  send_hour: number;
  assignee_user_ids: string[];
  assignee_group_ids: string[];
  is_active: boolean;
  created_at: string;
};

type ReminderOccurrence = {
  id: string;
  rule_id: string;
  rule_name: string;
  user_id: string;
  user_name: string;
  due_date: string;
  status: "pending" | "done" | "missed";
  acknowledged_at: string | null;
};

type ComplianceRow = {
  occurrence_id: string;
  rule_id: string;
  rule_name: string;
  user_id: string;
  user_name: string;
  due_date: string;
  status: string;
  acknowledged_at: string | null;
};

type ComplianceReport = {
  rows: ComplianceRow[];
  total: number;
  done: number;
  missed: number;
  pending: number;
  compliance_pct: number;
};

// ── Helpers ────────────────────────────────────────────────────────────────────

const DOW_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function formatDays(days: number[]): string {
  if (!days.length) return "—";
  if (days.length === 7) return "Every day";
  if (JSON.stringify(days.slice().sort()) === JSON.stringify([0, 1, 2, 3, 4])) return "Weekdays";
  return days.map((d) => DOW_LABELS[d]).join(", ");
}

function statusBadge(status: string) {
  if (status === "done")
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-green-50 text-green-700 border border-green-200">
        Done
      </span>
    );
  if (status === "missed")
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-red-50 text-red-700 border border-red-200">
        Missed
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
      Pending
    </span>
  );
}

// ── Rule Form Modal ────────────────────────────────────────────────────────────

function RuleModal({
  rule,
  users,
  groups,
  onClose,
  onSaved,
}: {
  rule: ReminderRule | null;
  users: OrgUser[];
  groups: UserGroup[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const token = getToken();
  const [name, setName] = useState(rule?.name ?? "");
  const [description, setDescription] = useState(rule?.description ?? "");
  const [days, setDays] = useState<number[]>(rule?.days_of_week ?? [0, 1, 2, 3, 4]);
  const [sendHour, setSendHour] = useState(rule?.send_hour ?? 8);
  const [userIds, setUserIds] = useState<string[]>(rule?.assignee_user_ids ?? []);
  const [groupIds, setGroupIds] = useState<string[]>(rule?.assignee_group_ids ?? []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function toggleDay(d: number) {
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  }

  function toggleUser(id: string) {
    setUserIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function toggleGroup(id: string) {
    setGroupIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    if (days.length === 0) { setError("Select at least one day."); return; }
    if (userIds.length === 0 && groupIds.length === 0) { setError("Assign at least one person or group."); return; }
    setLoading(true);
    setError("");
    try {
      const body = {
        name: name.trim(),
        description: description.trim() || null,
        days_of_week: days,
        send_hour: sendHour,
        assignee_user_ids: userIds,
        assignee_group_ids: groupIds,
      };
      if (rule) {
        await apiFetch(`/api/v1/reminders/rules/${rule.id}`, { method: "PATCH", body: JSON.stringify(body) }, token);
      } else {
        await apiFetch("/api/v1/reminders/rules", { method: "POST", body: JSON.stringify(body) }, token);
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
          <h2 className="text-lg font-semibold mb-4">{rule ? "Edit reminder rule" : "New reminder rule"}</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Task name *</label>
              <input
                className="wf-input w-full"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Submit timesheet"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Message to staff</label>
              <textarea
                className="wf-input w-full resize-none"
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Please submit your timesheet before 5pm today."
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Send on</label>
              <div className="flex gap-1 flex-wrap">
                {DOW_LABELS.map((label, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => toggleDay(i)}
                    className={`px-3 py-1 rounded text-sm border transition-colors ${
                      days.includes(i)
                        ? "bg-[rgb(var(--wf-brand-600))] text-white border-[rgb(var(--wf-brand-600))]"
                        : "bg-[rgb(var(--wf-card-bg))] border-[rgb(var(--wf-card-border))] text-slate-500"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Send at hour (UTC 0–23)
              </label>
              <input
                type="number"
                min={0}
                max={23}
                className="wf-input w-24"
                value={sendHour}
                onChange={(e) => setSendHour(Number(e.target.value))}
              />
              <p className="text-xs text-slate-500 mt-1">
                Reminders fire once per day when the scheduler runs at or after this UTC hour.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Assign to users</label>
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
                <label className="block text-sm font-medium mb-2">Assign to groups</label>
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

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={onClose} className="wf-btn-ghost">
                Cancel
              </button>
              <button type="submit" disabled={loading} className="wf-btn-primary">
                {loading ? "Saving…" : rule ? "Update" : "Create"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

// ── Rules Tab ──────────────────────────────────────────────────────────────────

function RulesTab() {
  const token = getToken();
  const [rules, setRules] = useState<ReminderRule[]>([]);
  const [users, setUsers] = useState<OrgUser[]>([]);
  const [groups, setGroups] = useState<UserGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [editRule, setEditRule] = useState<ReminderRule | null | "new">(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, u, g] = await Promise.all([
        apiFetch<ReminderRule[]>("/api/v1/reminders/rules", {}, token),
        apiFetch<OrgUser[]>("/api/v1/admin/users", {}, token),
        apiFetch<UserGroup[]>("/api/v1/user-groups", {}, token),
      ]);
      setRules(r);
      setUsers(u);
      setGroups(g);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  async function toggleActive(rule: ReminderRule) {
    await apiFetch(`/api/v1/reminders/rules/${rule.id}`, {
      method: "PATCH",
      body: JSON.stringify({ is_active: !rule.is_active }),
    }, token);
    load();
  }

  async function deleteRule(rule: ReminderRule) {
    if (!confirm(`Delete reminder "${rule.name}"?`)) return;
    await apiFetch(`/api/v1/reminders/rules/${rule.id}`, { method: "DELETE" }, token);
    load();
  }

  if (loading) return <p className="text-sm text-slate-500 py-8 text-center">Loading…</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-slate-500">
          {rules.length} reminder {rules.length === 1 ? "rule" : "rules"}
        </p>
        <button className="wf-btn-primary text-sm" onClick={() => setEditRule("new")}>
          + New rule
        </button>
      </div>

      {rules.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <IconRepeat size={36} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">No reminder rules yet</p>
          <p className="text-sm mt-1">Create a rule to start sending recurring reminders to your team.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[rgb(var(--wf-card-border))]">
                <th className="text-left py-2 pr-4 font-medium">Name</th>
                <th className="text-left py-2 pr-4 font-medium">Schedule</th>
                <th className="text-left py-2 pr-4 font-medium">Hour (UTC)</th>
                <th className="text-left py-2 pr-4 font-medium">Assignees</th>
                <th className="text-left py-2 pr-4 font-medium">Active</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.id} className="border-b border-[rgb(var(--wf-card-border))] hover:bg-[rgb(var(--wf-accent-muted))]">
                  <td className="py-3 pr-4">
                    <div className="font-medium">{rule.name}</div>
                    {rule.description && (
                      <div className="text-xs text-slate-500 mt-0.5 truncate max-w-xs">{rule.description}</div>
                    )}
                  </td>
                  <td className="py-3 pr-4">{formatDays(rule.days_of_week)}</td>
                  <td className="py-3 pr-4">{rule.send_hour}:00</td>
                  <td className="py-3 pr-4">
                    <span className="text-slate-500">
                      {rule.assignee_user_ids.length} user{rule.assignee_user_ids.length !== 1 ? "s" : ""}
                      {rule.assignee_group_ids.length > 0 && `, ${rule.assignee_group_ids.length} group${rule.assignee_group_ids.length !== 1 ? "s" : ""}`}
                    </span>
                  </td>
                  <td className="py-3 pr-4">
                    <button
                      onClick={() => toggleActive(rule)}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                        rule.is_active ? "bg-[rgb(var(--wf-brand-600))]" : "bg-slate-300"
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                          rule.is_active ? "translate-x-4" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </td>
                  <td className="py-3 text-right">
                    <button
                      onClick={() => setEditRule(rule)}
                      className="text-xs text-[rgb(var(--wf-brand-600))] hover:underline mr-3"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => deleteRule(rule)}
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

      {editRule !== null && (
        <RuleModal
          rule={editRule === "new" ? null : editRule}
          users={users}
          groups={groups}
          onClose={() => setEditRule(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}

// ── My Reminders Tab ──────────────────────────────────────────────────────────

function MyRemindersTab() {
  const token = getToken();
  const [occs, setOccs] = useState<ReminderOccurrence[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<ReminderOccurrence[]>("/api/v1/reminders/my", {}, token);
      setOccs(data);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  async function markDone(occ: ReminderOccurrence) {
    await apiFetch(`/api/v1/reminders/occurrences/${occ.id}/acknowledge`, { method: "POST" }, token);
    load();
  }

  const pending = occs.filter((o) => o.status === "pending");
  const recent = occs.filter((o) => o.status !== "pending");

  if (loading) return <p className="text-sm text-slate-500 py-8 text-center">Loading…</p>;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold mb-3">
          Pending reminders{pending.length > 0 && <span className="ml-2 px-1.5 py-0.5 bg-amber-100 text-amber-700 text-xs rounded">{pending.length}</span>}
        </h3>
        {pending.length === 0 ? (
          <div className="text-center py-10 text-slate-500">
            <IconCheckCircle size={36} className="mx-auto mb-3 opacity-30" />
            <p className="font-medium">All caught up!</p>
            <p className="text-sm mt-1">No pending reminders today.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {pending.map((occ) => (
              <div
                key={occ.id}
                className="flex items-center justify-between p-4 rounded-lg border border-[rgb(var(--wf-card-border))] bg-[rgb(var(--wf-card-bg))]"
              >
                <div>
                  <p className="font-medium text-sm">{occ.rule_name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">Due {occ.due_date}</p>
                </div>
                <button
                  onClick={() => markDone(occ)}
                  className="wf-btn-primary text-xs py-1.5 px-3 flex items-center gap-1"
                >
                  <IconCheckCircle size={13} />
                  Mark done
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {recent.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-3">Recent history</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[rgb(var(--wf-card-border))]">
                  <th className="text-left py-2 pr-4 font-medium">Task</th>
                  <th className="text-left py-2 pr-4 font-medium">Due</th>
                  <th className="text-left py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((occ) => (
                  <tr key={occ.id} className="border-b border-[rgb(var(--wf-card-border))]">
                    <td className="py-2 pr-4">{occ.rule_name}</td>
                    <td className="py-2 pr-4">{occ.due_date}</td>
                    <td className="py-2">{statusBadge(occ.status)}</td>
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

// ── Compliance Report Tab ─────────────────────────────────────────────────────

function ComplianceTab() {
  const token = getToken();
  const [report, setReport] = useState<ComplianceReport | null>(null);
  const [rules, setRules] = useState<ReminderRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterRule, setFilterRule] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  async function loadReport() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterRule) params.set("rule_id", filterRule);
      if (filterStatus) params.set("status", filterStatus);
      if (fromDate) params.set("from_date", fromDate);
      if (toDate) params.set("to_date", toDate);
      const qs = params.toString();
      const data = await apiFetch<ComplianceReport>(`/api/v1/reminders/report${qs ? `?${qs}` : ""}`, {}, token);
      setReport(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    apiFetch<ReminderRule[]>("/api/v1/reminders/rules", {}, token).then(setRules).catch(() => {});
    loadReport();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function exportCsv() {
    const params = new URLSearchParams();
    if (filterRule) params.set("rule_id", filterRule);
    if (filterStatus) params.set("status", filterStatus);
    if (fromDate) params.set("from_date", fromDate);
    if (toDate) params.set("to_date", toDate);
    const qs = params.toString();
    await apiDownload(`/api/v1/reminders/report/export.csv${qs ? `?${qs}` : ""}`, "reminder-compliance.csv", token);
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-medium mb-1">Rule</label>
          <select className="wf-input text-sm" value={filterRule} onChange={(e) => setFilterRule(e.target.value)}>
            <option value="">All rules</option>
            {rules.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Status</label>
          <select className="wf-input text-sm" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="done">Done</option>
            <option value="missed">Missed</option>
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
        <button className="wf-btn-primary text-sm" onClick={loadReport} disabled={loading}>
          {loading ? "Loading…" : "Apply"}
        </button>
        {report && report.total > 0 && (
          <button className="wf-btn-ghost text-sm" onClick={exportCsv}>
            Export CSV
          </button>
        )}
      </div>

      {/* Summary cards */}
      {report && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-lg border border-[rgb(var(--wf-card-border))] p-4 bg-[rgb(var(--wf-card-bg))]">
            <p className="text-xs text-slate-500">Total</p>
            <p className="text-2xl font-bold mt-1">{report.total}</p>
          </div>
          <div className="rounded-lg border border-green-200 p-4 bg-green-50">
            <p className="text-xs text-green-600">Completed</p>
            <p className="text-2xl font-bold text-green-700 mt-1">{report.done}</p>
          </div>
          <div className="rounded-lg border border-red-200 p-4 bg-red-50">
            <p className="text-xs text-red-600">Missed</p>
            <p className="text-2xl font-bold text-red-700 mt-1">{report.missed}</p>
          </div>
          <div className="rounded-lg border border-[rgb(var(--wf-card-border))] p-4 bg-[rgb(var(--wf-card-bg))]">
            <p className="text-xs text-slate-500">Compliance rate</p>
            <p
              className={`text-2xl font-bold mt-1 ${
                report.compliance_pct >= 80
                  ? "text-green-600"
                  : report.compliance_pct >= 50
                  ? "text-amber-600"
                  : "text-red-600"
              }`}
            >
              {report.compliance_pct}%
            </p>
          </div>
        </div>
      )}

      {/* Table */}
      {report && report.rows.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[rgb(var(--wf-card-border))]">
                <th className="text-left py-2 pr-4 font-medium">Staff member</th>
                <th className="text-left py-2 pr-4 font-medium">Task</th>
                <th className="text-left py-2 pr-4 font-medium">Due date</th>
                <th className="text-left py-2 pr-4 font-medium">Status</th>
                <th className="text-left py-2 font-medium">Acknowledged</th>
              </tr>
            </thead>
            <tbody>
              {report.rows.map((row) => (
                <tr key={row.occurrence_id} className="border-b border-[rgb(var(--wf-card-border))] hover:bg-[rgb(var(--wf-accent-muted))]">
                  <td className="py-2 pr-4 font-medium">{row.user_name}</td>
                  <td className="py-2 pr-4">{row.rule_name}</td>
                  <td className="py-2 pr-4">{row.due_date}</td>
                  <td className="py-2 pr-4">{statusBadge(row.status)}</td>
                  <td className="py-2 text-slate-500">
                    {row.acknowledged_at ? new Date(row.acknowledged_at).toLocaleString() : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : report ? (
        <p className="text-sm text-slate-500 py-8 text-center">No records match the selected filters.</p>
      ) : null}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export function RemindersPage() {
  const { user } = useAuth();
  const isAdmin = user?.roles.some((r) => r === "company_admin" || r === "manager") ?? false;

  type Tab = "my" | "rules" | "report";
  const [tab, setTab] = useState<Tab>("my");

  const tabs: { id: Tab; label: string }[] = [
    { id: "my", label: "My reminders" },
    ...(isAdmin ? [{ id: "rules" as Tab, label: "Rules" }, { id: "report" as Tab, label: "Compliance report" }] : []),
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <IconRepeat size={22} />
        <h1 className="text-xl font-semibold">Reminders</h1>
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
        {tab === "my" && <MyRemindersTab />}
        {tab === "rules" && isAdmin && <RulesTab />}
        {tab === "report" && isAdmin && <ComplianceTab />}
      </div>
    </div>
  );
}
