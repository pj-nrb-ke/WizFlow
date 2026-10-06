import { useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { HelpTip } from "../components/HelpTip";
import { PageHeader } from "../components/PageHeader";
import { useAuth } from "../context/AuthContext";
import { ApiError, apiFetch } from "../lib/api";
import { getToken } from "../lib/auth";
import { canAccessReports } from "../lib/roles";

type Wf = { id: string; name: string; status?: string };
type Variant = { path: string[]; count: number; has_rework: boolean };
type StepDwell = { step: string; avg_hours: number; samples: number };
type Metrics = {
  total: number;
  completed: number;
  rejected: number;
  in_progress: number;
  avg_cycle_hours: number | null;
  median_cycle_hours: number | null;
  rework_rate: number;
  variants: Variant[];
  distinct_variants: number;
  bottleneck: { step: string; avg_hours: number; samples: number } | null;
  step_dwell: StepDwell[];
};
type Report = {
  workflow_id: string;
  workflow_name: string;
  metrics: Metrics;
  narrative: string;
  suggestion: { title: string; detail: string } | null;
  ai_used: boolean;
};

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="wf-card p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-xl font-semibold text-slate-800">{value}</div>
    </div>
  );
}

export function ProcessIntelPage() {
  const { user } = useAuth();
  const canView = canAccessReports(user?.roles);

  const [workflows, setWorkflows] = useState<Wf[]>([]);
  const [selected, setSelected] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadWorkflows = useCallback(async () => {
    try {
      const wfs = await apiFetch<Wf[]>("/api/v1/workflows", {}, getToken());
      setWorkflows(wfs);
      if (wfs.length && !selected) setSelected(wfs[0].id);
    } catch (e) {
      setError(e instanceof ApiError ? e.detail ?? e.message : "Failed to load workflows");
    }
  }, [selected]);

  useEffect(() => {
    if (canView) void loadWorkflows();
  }, [canView, loadWorkflows]);

  const loadReport = useCallback(async (id: string) => {
    setLoading(true);
    setError("");
    try {
      setReport(await apiFetch<Report>(`/api/v1/process-intel/${id}`, {}, getToken()));
    } catch (e) {
      setError(e instanceof ApiError ? e.detail ?? e.message : "Failed to analyze");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selected) void loadReport(selected);
  }, [selected, loadReport]);

  if (!canView) return <Navigate to="/" replace />;

  const m = report?.metrics;
  const hrs = (h: number | null) => (h == null ? "—" : h >= 48 ? `${(h / 24).toFixed(1)}d` : `${h}h`);

  return (
    <div className="wf-analytics-page">
      <PageHeader
        title="Process Intelligence"
        subtitle="See how a process actually runs — variants, bottlenecks, rework — and what to improve."
        help={
          <HelpTip>
            Computed from your real request history. Pick a workflow to see where cases pile up, how often they
            get sent back, and the paths they take — plus an AI suggestion for one concrete improvement.
          </HelpTip>
        }
      />

      <div className="mb-5 max-w-md">
        <label className="block text-sm font-medium mb-1">Workflow</label>
        <select className="wf-input w-full" value={selected} onChange={(e) => setSelected(e.target.value)}>
          {workflows.length === 0 && <option value="">No workflows yet</option>}
          {workflows.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
      {loading && <p className="text-sm text-slate-500">Analyzing…</p>}

      {report && m && (
        <>
          {m.total === 0 ? (
            <p className="text-sm text-slate-500">No submitted cases for this workflow yet — insights appear once it runs.</p>
          ) : (
            <>
              <div className="grid gap-3 grid-cols-2 lg:grid-cols-5 mb-6">
                <Stat label="Cases" value={String(m.total)} />
                <Stat label="Completed" value={String(m.completed)} />
                <Stat label="In progress" value={String(m.in_progress)} />
                <Stat label="Avg cycle" value={hrs(m.avg_cycle_hours)} />
                <Stat label="Rework rate" value={`${Math.round(m.rework_rate * 100)}%`} />
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <section className="wf-panel">
                  <h2 className="text-lg font-semibold mb-1">AI analysis</h2>
                  <p className="text-xs text-slate-400 mb-3">
                    {report.ai_used ? "AI-generated — verify before acting." : "Basic summary (AI unavailable)."}
                  </p>
                  <p className="text-sm text-slate-700 whitespace-pre-line">{report.narrative}</p>
                  {report.suggestion && (
                    <div className="mt-4 p-3 rounded-lg bg-[rgb(var(--wf-accent-muted))] border border-[rgb(var(--wf-brand-200))]">
                      <div className="text-sm font-semibold text-[rgb(var(--wf-brand-700))]">
                        💡 {report.suggestion.title}
                      </div>
                      <p className="text-sm text-slate-700 mt-1">{report.suggestion.detail}</p>
                      <p className="text-[11px] text-slate-400 mt-2">
                        Apply it in the workflow designer and publish through the normal flow.
                      </p>
                    </div>
                  )}
                </section>

                <section className="wf-panel">
                  <h2 className="text-lg font-semibold mb-3">Where time goes</h2>
                  {m.bottleneck ? (
                    <p className="text-sm text-slate-700 mb-3">
                      Bottleneck: <span className="font-medium">{m.bottleneck.step}</span> — avg{" "}
                      {hrs(m.bottleneck.avg_hours)} ({m.bottleneck.samples} case(s)).
                    </p>
                  ) : (
                    <p className="text-sm text-slate-500 mb-3">Not enough step history for dwell times yet.</p>
                  )}
                  {m.step_dwell.length > 0 && (
                    <table className="w-full text-sm mb-4">
                      <thead>
                        <tr className="text-left text-slate-500 border-b border-slate-200">
                          <th className="py-1.5">Step</th>
                          <th className="py-1.5 text-right">Avg</th>
                          <th className="py-1.5 text-right">Cases</th>
                        </tr>
                      </thead>
                      <tbody>
                        {m.step_dwell.map((s, i) => (
                          <tr key={i} className="border-b border-slate-100">
                            <td className="py-1.5">{s.step}</td>
                            <td className="py-1.5 text-right">{hrs(s.avg_hours)}</td>
                            <td className="py-1.5 text-right">{s.samples}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}

                  <h3 className="font-medium text-sm mb-2">Variants ({m.distinct_variants})</h3>
                  {m.variants.length === 0 ? (
                    <p className="text-xs text-slate-500">No path data yet.</p>
                  ) : (
                    <ul className="space-y-1 text-xs">
                      {m.variants.map((v, i) => (
                        <li key={i} className="flex items-center gap-2">
                          <span className="font-medium text-slate-600">{v.count}×</span>
                          <span className="text-slate-700">{v.path.join(" → ") || "(direct)"}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
