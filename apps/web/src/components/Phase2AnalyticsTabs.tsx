import { useEffect, useState } from "react";
import {
  ApiError,
  createKpiTarget,
  createReportSubscription,
  createWorkflowSchedule,
  deleteReportSubscription,
  getApprovalHeatmap,
  getJourneyAnalytics,
  getScorecards,
  getWorkload,
  getWorkloadHistory,
  listKpiTargets,
  listReportSubscriptions,
  listWorkflowSchedules,
  runAutomation,
  type AnalyticsFilterParams,
  type HeatmapCell,
  type JourneyEdge,
  type KpiTarget,
  type ReportSubscription,
  type ScorecardRow,
  type WorkloadHistoryRow,
  type WorkloadRow,
  type WorkflowSchedule,
  type WorkflowSummary,
} from "../lib/api";
import { getToken } from "../lib/auth";
import { SimpleBarChart } from "./analytics/SimpleBarChart";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type Props = {
  tab: "workload" | "automation" | "scorecards";
  params: AnalyticsFilterParams;
  workflows: WorkflowSummary[];
  isAdmin: boolean;
};

export function Phase2AnalyticsTabs({ tab, params, workflows, isAdmin }: Props) {
  const [workload, setWorkload] = useState<WorkloadRow[]>([]);
  const [history, setHistory] = useState<WorkloadHistoryRow[]>([]);
  const [journey, setJourney] = useState<JourneyEdge[]>([]);
  const [heatmap, setHeatmap] = useState<HeatmapCell[]>([]);
  const [scorecards, setScorecards] = useState<ScorecardRow[]>([]);
  const [targets, setTargets] = useState<KpiTarget[]>([]);
  const [subs, setSubs] = useState<ReportSubscription[]>([]);
  const [schedules, setSchedules] = useState<WorkflowSchedule[]>([]);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const token = getToken();
    setError("");
    if (tab === "workload") {
      Promise.all([getWorkload(params, token), getWorkloadHistory(params, token)])
        .then(([w, h]) => {
          setWorkload(w.users);
          setHistory(h.weeks);
        })
        .catch((e) => setError(e instanceof ApiError ? e.detail ?? e.message : "Failed"));
    } else if (tab === "automation") {
      Promise.all([getJourneyAnalytics(params, token), getApprovalHeatmap(params, token)])
        .then(([j, hm]) => {
          setJourney(j.edges);
          setHeatmap(hm.cells);
        })
        .catch((e) => setError(e instanceof ApiError ? e.detail ?? e.message : "Failed"));
    } else {
      Promise.all([getScorecards(params, token), listKpiTargets(token)])
        .then(([sc, t]) => {
          setScorecards(sc.rows);
          setTargets(t);
        })
        .catch((e) => setError(e instanceof ApiError ? e.detail ?? e.message : "Failed"));
    }
    listReportSubscriptions(token).then(setSubs).catch(() => {});
    listWorkflowSchedules(token).then(setSchedules).catch(() => {});
  }, [tab, params]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;

  if (tab === "workload") {
    const chart = workload.map((u) => ({
      label: u.full_name.split(" ")[0] || u.full_name,
      value: u.pending_count,
      hint: `${u.approvals_in_period} actions in period`,
    }));
    return (
      <div className="space-y-6">
        <div className="wf-panel p-4">
          <h3 className="font-semibold text-slate-800 mb-3">Current pending workload</h3>
          {chart.length ? (
            <SimpleBarChart items={chart} />
          ) : (
            <p className="text-sm text-slate-500">No approver workload in this period.</p>
          )}
        </div>
        <div className="wf-panel p-4 overflow-x-auto">
          <h3 className="font-semibold text-slate-800 mb-3">Historical actions (by week)</h3>
          <table className="wf-data-table w-full text-sm">
            <thead>
              <tr>
                <th>Week</th>
                <th>Approver</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {history.slice(0, 30).map((r, i) => (
                <tr key={`${r.week_start}-${r.user_id}-${i}`}>
                  <td>{r.week_start}</td>
                  <td>{r.full_name}</td>
                  <td>{r.actions_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (tab === "automation") {
    const heatByDay = DAYS.map((label, d) => ({
      label,
      value: heatmap.filter((c) => c.day_of_week === d).reduce((s, c) => s + c.count, 0),
    }));
    return (
      <div className="space-y-6">
        <div className="wf-panel p-4">
          <h3 className="font-semibold text-slate-800 mb-2">Workflow journey (slowest paths)</h3>
          <ul className="text-sm space-y-2">
            {journey.slice(0, 8).map((e) => (
              <li key={`${e.from_step}-${e.to_step}`} className="text-slate-700">
                {e.from_step} → {e.to_step}: avg {e.avg_hours}h ({e.sample_count} samples)
              </li>
            ))}
            {!journey.length && <li className="text-slate-500">Not enough step transitions yet.</li>}
          </ul>
        </div>
        <div className="wf-panel p-4">
          <h3 className="font-semibold text-slate-800 mb-3">Activity heatmap (by weekday)</h3>
          <SimpleBarChart items={heatByDay} />
        </div>
        {isAdmin && (
          <div className="wf-panel p-4 flex flex-wrap gap-2 items-center">
            <button
              type="button"
              className="wf-btn-primary text-sm px-3 py-2"
              onClick={() =>
                runAutomation(getToken())
                  .then((r) =>
                    setMsg(
                      `SLA warnings ${r.sla_warnings}, breaches ${r.sla_breaches}, escalations ${r.escalations}, reports ${r.reports_sent}, schedules ${r.schedules_run}`
                    )
                  )
                  .catch((e) => setError(e instanceof ApiError ? e.detail ?? e.message : "Failed"))
              }
            >
              Run SLA scan &amp; schedules now
            </button>
            {msg && <span className="text-sm text-green-700">{msg}</span>}
          </div>
        )}
        <ScheduleForms workflows={workflows} schedules={schedules} onRefresh={() => listWorkflowSchedules(getToken()).then(setSchedules)} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="wf-panel p-4 overflow-x-auto">
        <h3 className="font-semibold text-slate-800 mb-3">Scorecards vs targets</h3>
        <table className="wf-data-table w-full text-sm">
          <thead>
            <tr>
              <th>Entity</th>
              <th>Metric</th>
              <th>Actual</th>
              <th>Target</th>
              <th>Grade</th>
            </tr>
          </thead>
          <tbody>
            {scorecards.map((r, i) => (
              <tr key={`${r.entity_id}-${r.metric_key}-${i}`}>
                <td>{r.entity_name}</td>
                <td>{r.metric_key}</td>
                <td>{r.actual_value}</td>
                <td>{r.target_value}</td>
                <td>
                  <span className="font-semibold">{r.grade}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {isAdmin && (
        <KpiTargetForm
          targets={targets}
          onCreated={() => listKpiTargets(getToken()).then(setTargets)}
        />
      )}
      <SubscriptionPanel subs={subs} onChange={() => listReportSubscriptions(getToken()).then(setSubs)} />
    </div>
  );
}

function KpiTargetForm({
  targets,
  onCreated,
}: {
  targets: KpiTarget[];
  onCreated: () => void;
}) {
  const [key, setKey] = useState("sla_compliance_pct");
  const [label, setLabel] = useState("SLA compliance %");
  const [value, setValue] = useState("90");
  return (
    <div className="wf-panel p-4">
      <h3 className="font-semibold text-slate-800 mb-2">KPI targets</h3>
      <ul className="text-xs text-slate-600 mb-3 space-y-1">
        {targets.map((t) => (
          <li key={t.id}>
            {t.label}: {t.target_value} ({t.metric_key})
          </li>
        ))}
      </ul>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          createKpiTarget(
            { metric_key: key, label, target_value: Number(value) },
            getToken()
          ).then(onCreated);
        }}
      >
        <input className="wf-input text-sm" value={key} onChange={(e) => setKey(e.target.value)} placeholder="metric_key" />
        <input className="wf-input text-sm" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label" />
        <input className="wf-input text-sm w-24" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Target" />
        <button type="submit" className="wf-btn-secondary text-sm px-3">
          Add target
        </button>
      </form>
    </div>
  );
}

function SubscriptionPanel({
  subs,
  onChange,
}: {
  subs: ReportSubscription[];
  onChange: () => void;
}) {
  const [name, setName] = useState("Weekly executive summary");
  const [freq, setFreq] = useState("weekly");
  return (
    <div className="wf-panel p-4">
      <h3 className="font-semibold text-slate-800 mb-2">Report email subscriptions</h3>
      <ul className="text-sm space-y-2 mb-3">
        {subs.map((s) => (
          <li key={s.id} className="flex justify-between gap-2">
            <span>
              {s.name} · {s.frequency}
              {s.last_sent_at ? ` · last ${s.last_sent_at.slice(0, 10)}` : ""}
            </span>
            <button
              type="button"
              className="text-xs text-red-600"
              onClick={() => deleteReportSubscription(s.id, getToken()).then(onChange)}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          createReportSubscription({ name, frequency: freq, report_type: "executive_summary" }, getToken()).then(
            () => {
              setName("");
              onChange();
            }
          );
        }}
      >
        <input className="wf-input text-sm flex-1" value={name} onChange={(e) => setName(e.target.value)} />
        <select className="wf-input text-sm" value={freq} onChange={(e) => setFreq(e.target.value)}>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
        </select>
        <button type="submit" className="wf-btn-primary text-sm px-3">
          Subscribe
        </button>
      </form>
    </div>
  );
}

function ScheduleForms({
  workflows,
  schedules,
  onRefresh,
}: {
  workflows: WorkflowSummary[];
  schedules: WorkflowSchedule[];
  onRefresh: () => void;
}) {
  const [wfId, setWfId] = useState("");
  const [name, setName] = useState("");
  const published = workflows.filter((w) => w.status === "published");
  return (
    <div className="wf-panel p-4">
      <h3 className="font-semibold text-slate-800 mb-2">Recurring workflow schedules</h3>
      <ul className="text-sm mb-3 space-y-1">
        {schedules.map((s) => (
          <li key={s.id}>
            {s.name} · {s.frequency}
            {s.last_run_at ? ` · last ${s.last_run_at.slice(0, 10)}` : ""}
          </li>
        ))}
      </ul>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!wfId || !name.trim()) return;
          createWorkflowSchedule(
            { workflow_definition_id: wfId, name: name.trim(), frequency: "monthly" },
            getToken()
          ).then(onRefresh);
        }}
      >
        <select className="wf-input text-sm" value={wfId} onChange={(e) => setWfId(e.target.value)}>
          <option value="">Workflow…</option>
          {published.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
        <input className="wf-input text-sm" value={name} onChange={(e) => setName(e.target.value)} placeholder="Schedule name" />
        <button type="submit" className="wf-btn-secondary text-sm px-3">
          Add monthly schedule
        </button>
      </form>
    </div>
  );
}
