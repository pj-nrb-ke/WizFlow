import { useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { HelpTip } from "../components/HelpTip";
import { PageHeader } from "../components/PageHeader";
import { useAuth } from "../context/AuthContext";
import { ApiError, apiFetch } from "../lib/api";
import { getToken } from "../lib/auth";
import { formatDateTime } from "../lib/datetime";

type TaskInfo = { key: string; label: string; tier: string };
type Governance = { ai_enabled: boolean; monthly_budget_usd: number | null; disabled_tasks: string[] };
type UsageByTask = { task: string; label: string; calls: number; tokens: number; cost_usd: number };
type UsageRecent = {
  task: string; label: string; model: string; tokens: number;
  cost_usd: number; latency_ms: number; ok: boolean; created_at: string;
};
type Usage = {
  month: string; total_calls: number; total_tokens: number; total_cost_usd: number;
  by_task: UsageByTask[]; recent: UsageRecent[];
};
type Overview = {
  ai_configured: boolean; provider: string; global_enabled: boolean;
  default_model: string; strong_model: string;
  governance: Governance; usage: Usage; tasks: TaskInfo[];
};

const money = (n: number) => `$${n < 1 ? n.toFixed(4) : n.toFixed(2)}`;
const num = (n: number) => n.toLocaleString();

export function AiControlsPage() {
  const { user } = useAuth();
  const isAdmin = user?.roles.includes("company_admin");

  const [ov, setOv] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  // editable policy form
  const [enabled, setEnabled] = useState(true);
  const [budget, setBudget] = useState(""); // "" = unlimited
  const [disabled, setDisabled] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch<Overview>("/api/v1/ai-admin/overview", {}, getToken());
      setOv(data);
      setEnabled(data.governance.ai_enabled);
      setBudget(data.governance.monthly_budget_usd == null ? "" : String(data.governance.monthly_budget_usd));
      setDisabled(new Set(data.governance.disabled_tasks));
    } catch (e) {
      setError(e instanceof ApiError ? e.detail ?? e.message : "Failed to load AI controls");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) void load();
  }, [isAdmin, load]);

  async function save() {
    const trimmed = budget.trim();
    if (trimmed !== "" && (isNaN(Number(trimmed)) || Number(trimmed) < 0)) {
      setError("Budget must be a positive number, or blank for no limit.");
      return;
    }
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      await apiFetch(
        "/api/v1/ai-admin/governance",
        {
          method: "PATCH",
          body: JSON.stringify({
            ai_enabled: enabled,
            monthly_budget_usd: trimmed === "" ? null : Number(trimmed),
            disabled_tasks: [...disabled],
          }),
        },
        getToken(),
      );
      setSaved(true);
      void load();
    } catch (e) {
      setError(e instanceof ApiError ? e.detail ?? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  function toggleTask(key: string) {
    setDisabled((prev) => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  }

  if (!isAdmin) return <Navigate to="/" replace />;

  return (
    <div className="wf-analytics-page">
      <PageHeader
        title="AI Controls"
        subtitle="Governance, cost and kill switches for every AI feature in this workspace."
        help={
          <HelpTip>
            Every AI feature runs through one governed gateway. Turn AI off for the whole workspace or a
            single feature, cap monthly spend, and see exactly what each feature costs. Managers never see
            these dials — they just get working AI.
          </HelpTip>
        }
      />

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
      {loading && <p className="text-sm text-slate-500">Loading…</p>}

      {ov && (
        <>
          {/* Status strip */}
          <section className="wf-panel mb-6">
            <h2 className="text-lg font-semibold mb-3">Status</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 text-sm">
              <div>
                <div className="text-slate-500">AI key</div>
                <div className="font-medium">
                  {ov.ai_configured ? (
                    <span className="text-emerald-600">Configured</span>
                  ) : (
                    <span className="text-red-600">Not configured</span>
                  )}
                  <span className="text-slate-400"> · {ov.provider}</span>
                </div>
              </div>
              <div>
                <div className="text-slate-500">Global switch (server)</div>
                <div className="font-medium">
                  {ov.global_enabled ? (
                    <span className="text-emerald-600">On</span>
                  ) : (
                    <span className="text-red-600">Off — all AI paused</span>
                  )}
                </div>
              </div>
              <div>
                <div className="text-slate-500">Models</div>
                <div className="font-medium">
                  {ov.default_model}
                  {ov.strong_model !== ov.default_model && (
                    <span className="text-slate-400"> · strong: {ov.strong_model}</span>
                  )}
                </div>
              </div>
              <div>
                <div className="text-slate-500">Spent this month</div>
                <div className="font-medium">{money(ov.usage.total_cost_usd)}</div>
              </div>
            </div>
          </section>

          {/* Workspace policy */}
          <section className="wf-panel mb-6">
            <h2 className="text-lg font-semibold mb-1">Workspace policy</h2>
            <p className="text-sm text-slate-500 mb-4">Applies to everyone in your workspace.</p>

            <label className="flex items-center gap-3 mb-4">
              <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
              <span className="text-sm">
                <span className="font-medium">AI enabled for this workspace</span>
                <span className="text-slate-500"> — turn off to pause every AI feature here.</span>
              </span>
            </label>

            <div className="mb-5 max-w-xs">
              <label className="block text-sm font-medium mb-1">Monthly budget (USD)</label>
              <input
                className="wf-input w-full"
                inputMode="decimal"
                placeholder="No limit"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
              />
              <p className="text-xs text-slate-500 mt-1">
                Leave blank for no limit. When the month's spend reaches this, AI pauses until next month.
              </p>
            </div>

            <div className="mb-5">
              <div className="text-sm font-medium mb-2">Features</div>
              <div className="grid gap-2 sm:grid-cols-2">
                {ov.tasks.map((t) => {
                  const on = !disabled.has(t.key);
                  return (
                    <label key={t.key} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={on} onChange={() => toggleTask(t.key)} />
                      <span className={on ? "" : "text-slate-400"}>
                        {t.label}
                        {t.tier === "advanced" && (
                          <span className="ml-1 text-[10px] uppercase tracking-wide text-slate-400">advanced</span>
                        )}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button className="wf-btn-primary px-4 py-2 text-sm disabled:opacity-50" disabled={saving} onClick={save}>
                {saving ? "Saving…" : "Save policy"}
              </button>
              {saved && <span className="text-sm text-emerald-600">Saved.</span>}
            </div>
          </section>

          {/* Usage */}
          <section className="wf-panel mb-6">
            <h2 className="text-lg font-semibold mb-1">This month's usage</h2>
            <p className="text-sm text-slate-500 mb-4">
              Since {ov.usage.month} · {num(ov.usage.total_calls)} calls · {num(ov.usage.total_tokens)} tokens ·{" "}
              {money(ov.usage.total_cost_usd)}
            </p>

            {ov.usage.by_task.length === 0 ? (
              <p className="text-sm text-slate-500">No AI calls yet this month.</p>
            ) : (
              <table className="w-full text-sm mb-6">
                <thead>
                  <tr className="text-left text-slate-500 border-b border-slate-200">
                    <th className="py-2">Feature</th>
                    <th className="py-2 text-right">Calls</th>
                    <th className="py-2 text-right">Tokens</th>
                    <th className="py-2 text-right">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {ov.usage.by_task.map((r) => (
                    <tr key={r.task} className="border-b border-slate-100">
                      <td className="py-2">{r.label}</td>
                      <td className="py-2 text-right">{num(r.calls)}</td>
                      <td className="py-2 text-right">{num(r.tokens)}</td>
                      <td className="py-2 text-right">{money(r.cost_usd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {ov.usage.recent.length > 0 && (
              <>
                <div className="text-sm font-medium mb-2">Recent calls</div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-slate-500 border-b border-slate-200">
                      <th className="py-1.5">When</th>
                      <th className="py-1.5">Feature</th>
                      <th className="py-1.5">Model</th>
                      <th className="py-1.5 text-right">Tokens</th>
                      <th className="py-1.5 text-right">Cost</th>
                      <th className="py-1.5 text-right">Latency</th>
                      <th className="py-1.5 text-right">OK</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ov.usage.recent.map((r, i) => (
                      <tr key={i} className="border-b border-slate-100">
                        <td className="py-1.5">{formatDateTime(r.created_at)}</td>
                        <td className="py-1.5">{r.label}</td>
                        <td className="py-1.5">{r.model}</td>
                        <td className="py-1.5 text-right">{num(r.tokens)}</td>
                        <td className="py-1.5 text-right">{money(r.cost_usd)}</td>
                        <td className="py-1.5 text-right">{r.latency_ms} ms</td>
                        <td className="py-1.5 text-right">{r.ok ? "✓" : "✕"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}
