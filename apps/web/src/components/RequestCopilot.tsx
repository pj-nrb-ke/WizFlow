import { useState } from "react";
import { ApiError, apiFetch } from "../lib/api";
import { getToken } from "../lib/auth";

type Flag = { severity: string; text: string };
type Rec = { decision: string; rationale: string; confidence: string };
type Related = { reference: string; status: string; amount: string | null };
type Copilot = {
  summary: string;
  missing_info: string[];
  flags: Flag[];
  recommendation: Rec;
  related: Related[];
  ai_used: boolean;
};

const DECISION_LABEL: Record<string, string> = {
  approve: "Lean approve",
  return: "Lean return",
  reject: "Lean reject",
  none: "No clear call",
};
const DECISION_CLASS: Record<string, string> = {
  approve: "bg-emerald-100 text-emerald-700",
  return: "bg-amber-100 text-amber-700",
  reject: "bg-red-100 text-red-700",
  none: "bg-slate-100 text-slate-600",
};

export function RequestCopilot({ requestId }: { requestId: string }) {
  const [data, setData] = useState<Copilot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function run() {
    setLoading(true);
    setError("");
    try {
      const d = await apiFetch<Copilot>(
        `/api/v1/requests/${requestId}/copilot`,
        { method: "POST", body: "{}" },
        getToken(),
      );
      setData(d);
    } catch (e) {
      setError(e instanceof ApiError ? e.detail ?? e.message : "Copilot unavailable");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="wf-card p-4 border-l-4 border-[rgb(var(--wf-brand-500))]">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-slate-800">🤖 Copilot</span>
        <button
          onClick={run}
          disabled={loading}
          className="text-xs wf-btn-primary px-3 py-1.5 disabled:opacity-50"
        >
          {loading ? "Analyzing…" : data ? "Re-run" : "Analyze request"}
        </button>
      </div>

      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}

      {!data && !error && (
        <p className="text-xs text-slate-500 mt-2">
          Get a quick summary, missing-info check and a recommended decision. Advisory only — you decide.
        </p>
      )}

      {data && (
        <div className="mt-3 space-y-3 text-sm">
          <p className="text-slate-700">{data.summary}</p>

          <div className="flex flex-wrap items-center gap-2">
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${DECISION_CLASS[data.recommendation.decision] ?? DECISION_CLASS.none}`}>
              {DECISION_LABEL[data.recommendation.decision] ?? "No clear call"}
            </span>
            <span className="text-xs text-slate-400">confidence: {data.recommendation.confidence}</span>
          </div>
          {data.recommendation.rationale && (
            <p className="text-xs text-slate-600">{data.recommendation.rationale}</p>
          )}

          {data.missing_info.length > 0 && (
            <div>
              <div className="text-xs font-medium text-slate-700">Missing / check</div>
              <ul className="list-disc ml-5 text-xs text-slate-600">
                {data.missing_info.map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            </div>
          )}

          {data.flags.length > 0 && (
            <ul className="space-y-1">
              {data.flags.map((f, i) => (
                <li key={i} className={`text-xs ${f.severity === "warning" ? "text-amber-700" : "text-slate-600"}`}>
                  {f.severity === "warning" ? "⚠ " : "• "}
                  {f.text}
                </li>
              ))}
            </ul>
          )}

          {data.related.length > 0 && (
            <div>
              <div className="text-xs font-medium text-slate-700">Similar past cases</div>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {data.related.map((r, i) => (
                  <span key={i} className="text-[11px] px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                    {r.reference} · {r.status}
                    {r.amount ? ` · ${r.amount}` : ""}
                  </span>
                ))}
              </div>
            </div>
          )}

          <p className="text-[11px] text-slate-400">
            {data.ai_used ? "AI-generated suggestion — verify before deciding." : "AI unavailable — showing a basic summary."}
          </p>
        </div>
      )}
    </div>
  );
}
