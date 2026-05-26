import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import {
  AnalyticsFilterBar,
  defaultAnalyticsFilters,
  filtersToParams,
  type AnalyticsFilters,
} from "../components/analytics/AnalyticsFilterBar";
import { KpiCard } from "../components/analytics/KpiCard";
import { SimpleBarChart } from "../components/analytics/SimpleBarChart";
import { TrendSparkline } from "../components/analytics/TrendSparkline";
import { HelpTip } from "../components/HelpTip";
import { PageHeader } from "../components/PageHeader";
import { useAuth } from "../context/AuthContext";
import {
  ApiError,
  apiFetch,
  getAnalyticsTrends,
  getBottlenecks,
  getDepartmentPerformance,
  getExceptionsSummary,
  getExecutiveSummary,
  getFinancialSummary,
  getUserPerformance,
  getWorkflowPerformance,
  type BottlenecksSummary,
  type DepartmentPerformanceRow,
  type ExceptionsSummary,
  type ExecutiveSummary,
  type FinancialSummary,
  type TrendPoint,
  type UserPerformanceRow,
  type WorkflowPerformanceRow,
  type WorkflowSummary,
} from "../lib/api";
import { getToken } from "../lib/auth";
import { canAccessReports } from "../lib/roles";

type TabId = "overview" | "workflows" | "people" | "financial" | "exceptions";

const TABS: { id: TabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "workflows", label: "Workflows" },
  { id: "people", label: "People" },
  { id: "financial", label: "Financial" },
  { id: "exceptions", label: "Exceptions" },
];

function fmtNum(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function fmtPct(n: number) {
  const pct = n > 1 ? n : n * 100;
  return `${pct.toFixed(1)}%`;
}

function fmtHours(h: number | null | undefined) {
  if (h == null || Number.isNaN(h)) return "—";
  if (h < 24) return `${h.toFixed(1)}h`;
  return `${(h / 24).toFixed(1)}d`;
}

function fmtMoney(n: number, currency?: string | null) {
  const sym = currency === "KES" ? "KES " : currency ? `${currency} ` : "";
  return `${sym}${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export function AnalyticsPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<TabId>("overview");
  const [draftFilters, setDraftFilters] = useState<AnalyticsFilters>(defaultAnalyticsFilters);
  const [appliedFilters, setAppliedFilters] = useState<AnalyticsFilters>(defaultAnalyticsFilters);
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [executive, setExecutive] = useState<ExecutiveSummary | null>(null);
  const [trends, setTrends] = useState<TrendPoint[]>([]);
  const [departments, setDepartments] = useState<DepartmentPerformanceRow[]>([]);
  const [bottlenecks, setBottlenecks] = useState<BottlenecksSummary | null>(null);
  const [workflowRows, setWorkflowRows] = useState<WorkflowPerformanceRow[]>([]);
  const [userRows, setUserRows] = useState<UserPerformanceRow[]>([]);
  const [financial, setFinancial] = useState<FinancialSummary | null>(null);
  const [exceptions, setExceptions] = useState<ExceptionsSummary | null>(null);
  const [narrative, setNarrative] = useState("");
  const [anomalyCount, setAnomalyCount] = useState(0);

  const params = useMemo(() => filtersToParams(appliedFilters), [appliedFilters]);

  useEffect(() => {
    apiFetch<WorkflowSummary[]>("/api/v1/workflows", {}, getToken())
      .then(setWorkflows)
      .catch(() => {});
  }, []);

  const loadTab = useCallback(async () => {
    const token = getToken();
    setLoading(true);
    setError("");
    try {
      if (tab === "overview") {
        const [exec, trendRes, dept, bn] = await Promise.all([
          getExecutiveSummary(params, token),
          getAnalyticsTrends(params, token),
          getDepartmentPerformance(params, token),
          getBottlenecks(params, token),
        ]);
        setExecutive(exec);
        setTrends(trendRes.points ?? []);
        setDepartments(dept);
        setBottlenecks(bn);
        const anom = await apiFetch<{ findings: unknown[] }>(
          "/api/v1/analytics/anomalies",
          {},
          token
        );
        setAnomalyCount(anom.findings?.length ?? 0);
      } else if (tab === "workflows") {
        setWorkflowRows(await getWorkflowPerformance(params, token));
      } else if (tab === "people") {
        setUserRows(await getUserPerformance(params, token));
      } else if (tab === "financial") {
        setFinancial(await getFinancialSummary(params, token));
      } else {
        setExceptions(await getExceptionsSummary(params, token));
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.detail ?? e.message : "Failed to load analytics");
    } finally {
      setLoading(false);
    }
  }, [tab, params]);

  useEffect(() => {
    if (!canAccessReports(user?.roles)) return;
    loadTab();
  }, [loadTab, user?.roles]);

  function applyFilters() {
    setAppliedFilters({ ...draftFilters });
  }

  if (!canAccessReports(user?.roles)) {
    return <Navigate to="/" replace />;
  }

  const wfChart = workflowRows.map((r) => ({
    label: r.workflow_name,
    value: r.total_count,
    hint: `Avg ${fmtHours(r.avg_cycle_hours)} · ${fmtPct(r.rejection_rate)} rejected`,
  }));

  const deptChart = departments.map((d) => ({
    label: d.department || "Unassigned",
    value: d.total_count,
  }));

  return (
    <div className="wf-analytics-page">
      <PageHeader
        title="Analytics"
        subtitle={`Executive KPIs, workflow performance, approver workload, financial totals, and exceptions for ${user?.company_name ?? "your organization"}.`}
        help={
          <HelpTip text="Set a date range and optional workflow, then Apply. KPI cards open filtered request lists. Data respects your company and manager permissions." />
        }
        actions={
          <Link
            to="/reports"
            className="px-3 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50"
          >
            Actions report
          </Link>
        }
      />

      <HelpTip title="How filters work">
        <p>
          <strong>From / To</strong> limit requests by submission date. <strong>Workflow</strong>{" "}
          narrows all metrics to one process. Click <strong>Apply filters</strong> after changing
          values — tabs reload with the same filter set.
        </p>
      </HelpTip>

      <AnalyticsFilterBar
        filters={draftFilters}
        workflows={workflows}
        onChange={setDraftFilters}
        onApply={applyFilters}
        loading={loading}
      />

      <nav className="wf-analytics-tabs" aria-label="Analytics sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`wf-analytics-tab${tab === t.id ? " wf-analytics-tab--active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-800 text-sm border border-red-200">
          {error}
        </div>
      )}

      {loading && !executive && !workflowRows.length && !userRows.length && !financial && !exceptions ? (
        <p className="text-slate-500 py-12 text-center">Loading analytics…</p>
      ) : (
        <>
          {tab === "overview" && executive && (
            <>
              <div className="wf-panel mb-6 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <h3 className="font-semibold text-slate-800">AI management insight</h3>
                  <button
                    type="button"
                    className="wf-btn-primary text-sm py-1.5 px-3"
                    onClick={async () => {
                      const q = new URLSearchParams();
                      if (params.from) q.set("from", params.from);
                      if (params.to) q.set("to", params.to);
                      if (params.workflow_id) q.set("workflow_id", params.workflow_id);
                      const qs = q.toString();
                      const path = `/api/v1/analytics/narrative${qs ? `?${qs}` : ""}`;
                      const res = await apiFetch<{ narrative: string }>(path, {}, getToken());
                      setNarrative(res.narrative);
                    }}
                  >
                    Generate summary
                  </button>
                </div>
                {anomalyCount > 0 && (
                  <p className="text-sm text-amber-700 mb-2">
                    {anomalyCount} anomaly signal(s) detected — review high amounts and volume patterns.
                  </p>
                )}
                {narrative ? (
                  <p className="text-sm text-slate-700 whitespace-pre-line">{narrative}</p>
                ) : (
                  <p className="text-sm text-slate-500">
                    Plain-English KPI narrative for leadership reviews (template or AI when configured).
                  </p>
                )}
              </div>
              <OverviewTab
                executive={executive}
                trends={trends}
                departments={deptChart}
                bottlenecks={bottlenecks}
              />
            </>
          )}
          {tab === "workflows" && (
            <WorkflowsTab rows={workflowRows} chartItems={wfChart} />
          )}
          {tab === "people" && <PeopleTab rows={userRows} />}
          {tab === "financial" && financial && (
            <FinancialTab summary={financial} />
          )}
          {tab === "exceptions" && exceptions && (
            <ExceptionsTab summary={exceptions} />
          )}
        </>
      )}
    </div>
  );
}

function OverviewTab({
  executive,
  trends,
  departments,
  bottlenecks,
}: {
  executive: ExecutiveSummary;
  trends: TrendPoint[];
  departments: { label: string; value: number }[];
  bottlenecks: BottlenecksSummary | null;
}) {
  return (
    <div className="space-y-6">
      <section className="wf-analytics-kpi-grid">
        <KpiCard
          label="Total requests"
          value={fmtNum(executive.total_requests)}
          deltaHint="In selected period"
          to="/requests"
        />
        <KpiCard
          label="In progress"
          value={fmtNum(executive.in_progress)}
          to="/requests?status=in_progress"
        />
        <KpiCard
          label="Approved"
          value={fmtNum(executive.approved)}
          to="/requests?status=approved"
        />
        <KpiCard
          label="Overdue"
          value={fmtNum(executive.overdue_count)}
          deltaHint="Past SLA deadline"
          to="/inbox?overdue=1"
        />
        <KpiCard
          label="Avg cycle time"
          value={fmtHours(executive.avg_cycle_hours)}
          deltaHint="Approved requests"
          subdued
        />
        <KpiCard
          label="SLA compliance"
          value={fmtPct(executive.sla_compliance_pct)}
          deltaHint="On-time completion"
          subdued
        />
        <KpiCard
          label="Rejection rate"
          value={fmtPct(executive.rejection_rate)}
          to="/requests?status=rejected"
        />
        <KpiCard
          label="Returned"
          value={fmtNum(executive.returned)}
          to="/requests?status=returned"
        />
      </section>

      <div className="wf-analytics-panels">
        <div className="wf-card p-5">
          <h2 className="font-semibold text-slate-800 mb-1">Submission trend</h2>
          <p className="text-xs text-slate-500 mb-4">Daily volume in range</p>
          <TrendSparkline points={trends} />
        </div>
        <div className="wf-card p-5">
          <h2 className="font-semibold text-slate-800 mb-1">By department</h2>
          <p className="text-xs text-slate-500 mb-4">When department is captured on forms</p>
          <SimpleBarChart items={departments} />
        </div>
      </div>

      {bottlenecks && (bottlenecks.slowest_steps.length > 0 || bottlenecks.slowest_approvers.length > 0) && (
        <div className="wf-analytics-panels">
          <div className="wf-card p-5">
            <h2 className="font-semibold text-slate-800 mb-3">Slowest steps</h2>
            <SimpleBarChart
              items={bottlenecks.slowest_steps.map((s) => ({
                label: `${s.workflow_name}: ${s.step_name}`,
                value: s.avg_hours,
                hint: `${s.event_count} events`,
              }))}
              valueFormatter={(n) => fmtHours(n)}
            />
          </div>
          <div className="wf-card p-5">
            <h2 className="font-semibold text-slate-800 mb-3">Slowest approvers</h2>
            <SimpleBarChart
              items={bottlenecks.slowest_approvers.map((a) => ({
                label: a.full_name,
                value: a.avg_response_hours,
                hint: `${a.action_count} actions`,
              }))}
              valueFormatter={(n) => fmtHours(n)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function WorkflowsTab({
  rows,
  chartItems,
}: {
  rows: WorkflowPerformanceRow[];
  chartItems: { label: string; value: number; hint?: string }[];
}) {
  if (!rows.length) {
    return <p className="text-slate-500 py-8 text-center">No workflow activity in this period.</p>;
  }
  return (
    <div className="space-y-6">
      <div className="wf-card p-5">
        <h2 className="font-semibold text-slate-800 mb-4">Volume by workflow</h2>
        <SimpleBarChart items={chartItems} />
      </div>
      <div className="wf-card overflow-x-auto">
        <table className="wf-analytics-table">
          <thead>
            <tr>
              <th>Workflow</th>
              <th>Total</th>
              <th>In progress</th>
              <th>Approved</th>
              <th>Overdue</th>
              <th>Avg cycle</th>
              <th>Rejection</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.workflow_id}>
                <td>{r.workflow_name}</td>
                <td className="wf-analytics-mono">{fmtNum(r.total_count)}</td>
                <td className="wf-analytics-mono">{fmtNum(r.in_progress)}</td>
                <td className="wf-analytics-mono">{fmtNum(r.approved)}</td>
                <td className="wf-analytics-mono">{fmtNum(r.overdue_count)}</td>
                <td className="wf-analytics-mono">{fmtHours(r.avg_cycle_hours)}</td>
                <td className="wf-analytics-mono">{fmtPct(r.rejection_rate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PeopleTab({ rows }: { rows: UserPerformanceRow[] }) {
  if (!rows.length) {
    return <p className="text-slate-500 py-8 text-center">No approver activity in this period.</p>;
  }
  const chartItems = rows
    .slice()
    .sort((a, b) => b.pending_inbox - a.pending_inbox)
    .slice(0, 8)
    .map((r) => ({
      label: r.full_name,
      value: r.pending_inbox,
      hint: `${r.approvals_count} approvals · avg ${fmtHours(r.avg_response_hours)}`,
    }));

  return (
    <div className="space-y-6">
      <div className="wf-card p-5">
        <h2 className="font-semibold text-slate-800 mb-4">Pending inbox by approver</h2>
        <SimpleBarChart items={chartItems} />
      </div>
      <div className="wf-card overflow-x-auto">
        <table className="wf-analytics-table">
          <thead>
            <tr>
              <th>Approver</th>
              <th>Approvals</th>
              <th>Rejections</th>
              <th>Avg response</th>
              <th>Pending inbox</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.user_id}>
                <td>{r.full_name}</td>
                <td className="wf-analytics-mono">{fmtNum(r.approvals_count)}</td>
                <td className="wf-analytics-mono">{fmtNum(r.rejections_count)}</td>
                <td className="wf-analytics-mono">{fmtHours(r.avg_response_hours)}</td>
                <td className="wf-analytics-mono">
                  {r.pending_inbox > 0 ? (
                    <a href="/inbox" className="wf-link">
                      {fmtNum(r.pending_inbox)}
                    </a>
                  ) : (
                    "0"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FinancialTab({ summary }: { summary: FinancialSummary }) {
  const total =
    summary.approved_total +
    summary.rejected_total +
    summary.in_progress_total +
    summary.pending_total;

  return (
    <div className="space-y-6">
      <section className="wf-analytics-kpi-grid">
        <KpiCard
          label="Approved value"
          value={fmtMoney(summary.approved_total, summary.currency)}
          to="/requests?status=approved"
        />
        <KpiCard
          label="In progress value"
          value={fmtMoney(summary.in_progress_total, summary.currency)}
          to="/requests?status=in_progress"
        />
        <KpiCard
          label="Pending approval"
          value={fmtMoney(summary.pending_total, summary.currency)}
          to="/inbox"
        />
        <KpiCard
          label="Rejected value"
          value={fmtMoney(summary.rejected_total, summary.currency)}
          to="/requests?status=rejected"
          subdued
        />
      </section>
      <div className="wf-card p-5">
        <h2 className="font-semibold text-slate-800 mb-4">Value by status</h2>
        <SimpleBarChart
          items={[
            { label: "Approved", value: summary.approved_total },
            { label: "In progress", value: summary.in_progress_total },
            { label: "Pending", value: summary.pending_total },
            { label: "Rejected", value: summary.rejected_total },
          ]}
          valueFormatter={(n) => fmtMoney(n, summary.currency)}
        />
        <p className="text-xs text-slate-500 mt-4">
          Combined pipeline: {fmtMoney(total, summary.currency)} (amount fields on requests)
        </p>
      </div>
    </div>
  );
}

function ExceptionsTab({ summary }: { summary: ExceptionsSummary }) {
  return (
    <section className="wf-analytics-kpi-grid">
      <KpiCard
        label="Rejected"
        value={fmtNum(summary.rejected_count)}
        to="/requests?status=rejected"
      />
      <KpiCard
        label="Returned for correction"
        value={fmtNum(summary.returned_count)}
        to="/requests?status=returned"
      />
      <KpiCard
        label="Overdue (SLA)"
        value={fmtNum(summary.overdue_count)}
        deltaHint="Requires attention"
        to="/inbox?overdue=1"
      />
    </section>
  );
}
