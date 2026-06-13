import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { HelpTip } from "../components/HelpTip";
import { StatusBadge } from "../components/StatusBadge";
import {
  ApiError,
  apiDownload,
  deleteRequestDraft,
  listMyRequests,
  listRequestDrafts,
  RequestDraft,
  RequestSummary,
  type RequestListParams,
} from "../lib/api";
import { formatDateTimeShort } from "../lib/datetime";
import { getToken } from "../lib/auth";
import { isRequestOverdue } from "../lib/sla";
import {
  deleteFilter,
  getSavedFilters,
  saveFilter,
  type SavedFilter,
} from "../lib/savedFilters";

type TabKey = "all" | "in_progress" | "returned" | "approved" | "rejected" | "drafts";

const TABS: { key: TabKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "drafts", label: "Drafts" },
  { key: "in_progress", label: "In progress" },
  { key: "returned", label: "Returned" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
];

const EMPTY_COPY: Record<TabKey, { title: string; body: string }> = {
  all: {
    title: "No requests yet",
    body: "Start a petty cash, purchase, or leave request to see it tracked here.",
  },
  drafts: {
    title: "No saved drafts",
    body: "Partial request data saved on the server will appear here.",
  },
  in_progress: {
    title: "Nothing in progress",
    body: "Submitted requests waiting for approval will appear here.",
  },
  returned: {
    title: "No returned requests",
    body: "When an approver sends a request back for edits, it will show up here.",
  },
  approved: {
    title: "No approved requests",
    body: "Completed approvals are listed here for your records.",
  },
  rejected: {
    title: "No rejected requests",
    body: "Declined requests appear here with their final status.",
  },
};

function buildExportQuery(
  tab: TabKey,
  debouncedQ: string,
  filters: { from: string; to: string; minAmount: string; maxAmount: string; department: string }
): RequestListParams {
  const params: RequestListParams = {};
  if (debouncedQ) params.q = debouncedQ;
  if (filters.from) params.from = `${filters.from}T00:00:00`;
  if (filters.to) params.to = `${filters.to}T23:59:59`;
  if (filters.minAmount) params.min_amount = Number(filters.minAmount);
  if (filters.maxAmount) params.max_amount = Number(filters.maxAmount);
  if (filters.department.trim()) params.department = filters.department.trim();
  if (tab !== "all" && tab !== "drafts") params.status = tab;
  return params;
}

function humanDuration(ms: number): string {
  const mins = Math.max(0, Math.round(ms / 60000));
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

function relTime(iso: string): string {
  return `${humanDuration(Date.now() - new Date(iso).getTime())} ago`;
}

function fmtAmount(s?: string | null): string {
  if (!s) return "—";
  const t = String(s).trim();
  const compact = t.replace(/[\s,]/g, "");
  if (/^\d+(\.\d+)?$/.test(compact)) {
    const n = Number(compact);
    if (Number.isFinite(n)) return n.toLocaleString();
  }
  return t;
}

const STATUS_ACCENT: Record<string, string> = {
  in_progress: "bg-amber-400",
  approved: "bg-emerald-500",
  rejected: "bg-red-500",
  returned: "bg-orange-400",
};

function stageText(r: RequestSummary): string {
  if (r.status === "in_progress") return r.current_step_name ?? "In review";
  if (r.status === "approved") return "Approved";
  if (r.status === "rejected") return "Rejected";
  if (r.status === "returned") return "Returned for edits";
  return r.current_step_name ?? "—";
}

function timing(r: RequestSummary): { label: string; value: string; danger?: boolean } {
  if (!r.submitted_at) return { label: "Created", value: "—" };
  if (r.status !== "in_progress") return { label: "Submitted", value: relTime(r.submitted_at) };
  const deadline = new Date(r.submitted_at).getTime() + (r.sla_hours ?? 48) * 3600 * 1000;
  const now = Date.now();
  if (now > deadline)
    return { label: "Overdue by", value: humanDuration(now - deadline), danger: true };
  return { label: "Due in", value: humanDuration(deadline - now) };
}

function Stat({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="text-right">
      <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`text-sm font-medium whitespace-nowrap ${danger ? "text-red-600" : "text-slate-700"}`}>
        {value}
      </p>
    </div>
  );
}

const ChevronRight = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 6l6 6-6 6" />
  </svg>
);

export function MyRequestsPage() {
  const [requests, setRequests] = useState<RequestSummary[]>([]);
  const [drafts, setDrafts] = useState<RequestDraft[]>([]);
  const [tab, setTab] = useState<TabKey>("all");
  const [search, setSearch] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [department, setDepartment] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>(() =>
    getSavedFilters("myrequests")
  );

  function currentFilters(): Record<string, unknown> {
    return { tab, search, dateFrom, dateTo, minAmount, maxAmount, department };
  }

  function saveCurrentFilters() {
    const name = window.prompt("Name this filter set");
    if (!name?.trim()) return;
    setSavedFilters(saveFilter("myrequests", name, currentFilters()));
  }

  function applyFilters(f: Record<string, unknown>) {
    if (
      f.tab === "all" ||
      f.tab === "in_progress" ||
      f.tab === "returned" ||
      f.tab === "approved" ||
      f.tab === "rejected" ||
      f.tab === "drafts"
    ) {
      setTab(f.tab);
    }
    setSearch(typeof f.search === "string" ? f.search : "");
    setDateFrom(typeof f.dateFrom === "string" ? f.dateFrom : "");
    setDateTo(typeof f.dateTo === "string" ? f.dateTo : "");
    setMinAmount(typeof f.minAmount === "string" ? f.minAmount : "");
    setMaxAmount(typeof f.maxAmount === "string" ? f.maxAmount : "");
    setDepartment(typeof f.department === "string" ? f.department : "");
  }

  function removeSavedFilter(name: string) {
    setSavedFilters(deleteFilter("myrequests", name));
  }

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(search), 300);
    return () => window.clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const token = getToken();
      const [reqs, dr] = await Promise.all([
        listMyRequests(
          buildExportQuery(tab === "drafts" ? "all" : tab, debouncedQ, {
            from: dateFrom,
            to: dateTo,
            minAmount,
            maxAmount,
            department,
          }),
          token
        ),
        listRequestDrafts(token),
      ]);
      setRequests(reqs);
      setDrafts(dr);
    } catch (e) {
      setError(e instanceof ApiError ? e.detail ?? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [debouncedQ, tab, dateFrom, dateTo, minAmount, maxAmount, department]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    if (tab === "drafts") return [];
    if (tab === "all") return requests;
    return requests.filter((r) => r.status === tab);
  }, [requests, tab]);

  async function exportCsv() {
    const qs = new URLSearchParams(
      Object.entries(
        buildExportQuery(tab === "drafts" ? "all" : tab, debouncedQ, {
          from: dateFrom,
          to: dateTo,
          minAmount,
          maxAmount,
          department,
        })
      ).map(([k, v]) => [k, String(v)])
    ).toString();
    await apiDownload(
      `/api/v1/requests/export.csv${qs ? `?${qs}` : ""}`,
      "my-requests.csv",
      getToken()
    );
  }

  async function exportXlsx() {
    const qs = new URLSearchParams(
      Object.entries(
        buildExportQuery(tab === "drafts" ? "all" : tab, debouncedQ, {
          from: dateFrom,
          to: dateTo,
          minAmount,
          maxAmount,
          department,
        })
      ).map(([k, v]) => [k, String(v)])
    ).toString();
    await apiDownload(
      `/api/v1/requests/export.xlsx${qs ? `?${qs}` : ""}`,
      "my-requests.xlsx",
      getToken()
    );
  }

  async function removeDraft(id: string) {
    if (!confirm("Delete this draft?")) return;
    try {
      await deleteRequestDraft(id, getToken());
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.detail ?? e.message : "Could not delete draft");
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <h1 className="wf-page-title">My requests</h1>
          <HelpTip text="Track every request you submitted. Use tabs to filter by status, search by reference or workflow name, and export a spreadsheet for reporting." />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() =>
              exportCsv().catch((e) =>
                setError(e instanceof ApiError ? e.detail ?? e.message : "Export failed")
              )
            }
            className="px-3 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50"
          >
            Export CSV
          </button>
          <button
            type="button"
            onClick={() =>
              exportXlsx().catch((e) =>
                setError(e instanceof ApiError ? e.detail ?? e.message : "Export failed")
              )
            }
            className="px-3 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50"
          >
            Export Excel
          </button>
          <Link to="/submit" className="px-4 py-2 wf-btn-primary text-sm">
            New request
          </Link>
        </div>
      </div>

      <div className="flex flex-col gap-3 mb-4 p-3 wf-card">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search reference, workflow…"
          className="wf-input max-w-md"
          aria-label="Search requests"
        />
        <div className="flex flex-wrap gap-3">
          <label className="text-xs text-slate-600">
            From
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="wf-input ml-1 block mt-0.5"
            />
          </label>
          <label className="text-xs text-slate-600">
            To
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="wf-input ml-1 block mt-0.5"
            />
          </label>
          <label className="text-xs text-slate-600">
            Min amount
            <input
              type="number"
              value={minAmount}
              onChange={(e) => setMinAmount(e.target.value)}
              className="wf-input ml-1 block mt-0.5 w-28"
            />
          </label>
          <label className="text-xs text-slate-600">
            Max amount
            <input
              type="number"
              value={maxAmount}
              onChange={(e) => setMaxAmount(e.target.value)}
              className="wf-input ml-1 block mt-0.5 w-28"
            />
          </label>
          <label className="text-xs text-slate-600 flex-1 min-w-[8rem]">
            Department
            <input
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              placeholder="Filter by department"
              className="wf-input ml-0 block mt-0.5 w-full max-w-xs"
            />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
          <span className="text-xs font-medium text-slate-500">Saved filters</span>
          <button
            type="button"
            onClick={saveCurrentFilters}
            className="wf-btn-secondary text-xs px-2 py-1"
          >
            Save current filters
          </button>
          {savedFilters.map((f) => (
            <span
              key={f.name}
              className="inline-flex items-center gap-1 rounded-full bg-[rgb(var(--wf-accent-muted))] px-2 py-1 text-xs text-[rgb(var(--wf-brand-700))]"
            >
              <button type="button" onClick={() => applyFilters(f.filters)} className="font-medium">
                {f.name}
              </button>
              <button
                type="button"
                onClick={() => removeSavedFilter(f.name)}
                aria-label={`Delete saved filter ${f.name}`}
                className="text-[rgb(var(--wf-brand-700))]/60 hover:text-[rgb(var(--wf-brand-700))]"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </span>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-1 mb-4 border-b border-slate-200 pb-px">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`px-3 py-2 text-sm font-medium rounded-t-lg border-b-2 -mb-px transition-colors ${
              tab === key
                ? "border-[rgb(var(--wf-brand-600))] text-[rgb(var(--wf-brand-700))]"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {label}
            {key === "drafts" ? (
              <span className="ml-1.5 text-xs text-slate-400">({drafts.length})</span>
            ) : key !== "all" ? (
              <span className="ml-1.5 text-xs text-slate-400">
                ({requests.filter((r) => r.status === key).length})
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      <div className="wf-card divide-y">
        {loading ? (
          <p className="p-4 text-sm text-slate-500">Loading…</p>
        ) : tab === "drafts" ? (
          drafts.length === 0 ? (
            <div className="p-8 text-center">
              <p className="font-medium text-slate-800 mb-1">{EMPTY_COPY.drafts.title}</p>
              <p className="text-sm text-slate-500">{EMPTY_COPY.drafts.body}</p>
            </div>
          ) : (
            drafts.map((d) => (
              <div
                key={d.id}
                className="p-4 flex flex-wrap justify-between gap-3 items-start hover:bg-slate-50"
              >
                <div>
                  <p className="font-medium text-slate-800">{d.workflow_name}</p>
                  <p className="text-xs text-slate-500">
                    Updated {formatDateTimeShort(d.updated_at)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Link
                    to={`/submit?workflow=${d.workflow_definition_id}`}
                    className="text-sm wf-link font-medium"
                  >
                    Continue →
                  </Link>
                  <button
                    type="button"
                    className="text-sm text-red-600 hover:underline"
                    onClick={() => removeDraft(d.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))
          )
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center">
            <p className="font-medium text-slate-800 mb-1">{EMPTY_COPY[tab].title}</p>
            <p className="text-sm text-slate-500 mb-4">{EMPTY_COPY[tab].body}</p>
            {tab === "all" && (
              <Link to="/submit" className="text-sm wf-link font-medium">
                Submit your first request →
              </Link>
            )}
          </div>
        ) : (
          filtered.map((r) => {
            const overdue = isRequestOverdue(r.submitted_at, r.sla_hours, r.status);
            const accent = overdue ? "bg-red-500" : STATUS_ACCENT[r.status] ?? "bg-slate-300";
            const t = timing(r);
            return (
              <Link
                key={r.id}
                to={`/requests/${r.id}`}
                className="block transition-colors hover:bg-slate-50"
              >
                <div className="flex items-stretch">
                  <span className={`w-1 shrink-0 ${accent}`} aria-hidden="true" />
                  <div className="flex min-w-0 flex-1 items-center gap-4 p-4">
                    <div className="min-w-0 flex-1">
                      {r.reference_number && (
                        <p className="font-mono text-xs font-semibold text-[rgb(var(--wf-brand-700))]">
                          {r.reference_number}
                        </p>
                      )}
                      <p className="truncate font-medium text-slate-800">{r.workflow_name}</p>
                      <p className="mt-0.5 text-xs text-slate-400">
                        {r.submitted_at
                          ? `Submitted ${formatDateTimeShort(r.submitted_at)}`
                          : "Not yet submitted"}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 md:hidden">
                        <span>
                          <span className="text-slate-400">Amount </span>
                          {fmtAmount(r.amount_preview)}
                        </span>
                        <span>
                          <span className="text-slate-400">Stage </span>
                          {stageText(r)}
                        </span>
                        <span className={t.danger ? "font-medium text-red-600" : ""}>
                          {t.label} {t.value}
                        </span>
                        {overdue && (
                          <span className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-700">
                            Overdue
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="hidden shrink-0 items-center gap-8 md:flex">
                      <Stat label="Amount" value={fmtAmount(r.amount_preview)} />
                      <Stat label="Stage" value={stageText(r)} />
                      <Stat label={t.label} value={t.value} danger={t.danger} />
                    </div>
                    <div className="flex w-24 shrink-0 flex-col items-end gap-1">
                      <StatusBadge status={r.status} />
                      {overdue && (
                        <span className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-700">
                          Overdue
                        </span>
                      )}
                    </div>
                    <span className="shrink-0 text-slate-300">
                      <ChevronRight />
                    </span>
                  </div>
                </div>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
