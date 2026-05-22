import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError, apiFetch, SimulationResult, WorkflowDefinition, WorkflowSummary } from "../lib/api";
import { getToken } from "../lib/auth";

export function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [selected, setSelected] = useState<WorkflowDefinition | null>(null);
  const [simResult, setSimResult] = useState<SimulationResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState("3000");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await apiFetch<WorkflowSummary[]>("/api/v1/workflows", {}, getToken());
      setWorkflows(list);
      if (list.length) {
        const detail = await apiFetch<WorkflowDefinition>(
          `/api/v1/workflows/${list[0].id}`,
          {},
          getToken()
        );
        setSelected(detail);
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.detail ?? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function openWorkflow(id: string) {
    setError("");
    setSimResult(null);
    try {
      const detail = await apiFetch<WorkflowDefinition>(`/api/v1/workflows/${id}`, {}, getToken());
      setSelected(detail);
    } catch (e) {
      setError(e instanceof ApiError ? e.detail ?? e.message : "Failed to load workflow");
    }
  }

  async function publish() {
    if (!selected) return;
    setError("");
    try {
      const updated = await apiFetch<WorkflowDefinition>(
        `/api/v1/workflows/${selected.id}/publish`,
        { method: "POST" },
        getToken()
      );
      setSelected(updated);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.detail ?? e.message : "Publish failed");
    }
  }

  async function simulate() {
    if (!selected) return;
    setError("");
    try {
      const result = await apiFetch<SimulationResult>(
        `/api/v1/workflows/${selected.id}/simulate`,
        {
          method: "POST",
          body: JSON.stringify({ data: { amount: Number(amount), purpose: "Demo" } }),
        },
        getToken()
      );
      setSimResult(result);
    } catch (e) {
      setError(e instanceof ApiError ? e.detail ?? e.message : "Simulation failed");
    }
  }

  if (loading) return <p className="text-slate-500">Loading workflows…</p>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-800 mb-4">Workflows</h1>
      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 bg-white rounded-lg border border-slate-200 divide-y">
          {workflows.length === 0 ? (
            <p className="p-4 text-sm text-slate-500">No workflows yet.</p>
          ) : (
            workflows.map((w) => (
              <button
                key={w.id}
                type="button"
                onClick={() => openWorkflow(w.id)}
                className={`w-full text-left p-4 hover:bg-slate-50 ${
                  selected?.id === w.id ? "bg-brand-50" : ""
                }`}
              >
                <p className="font-medium text-slate-800">{w.name}</p>
                <p className="text-xs text-slate-500">
                  v{w.version} ·{" "}
                  <span
                    className={
                      w.status === "published"
                        ? "text-green-700"
                        : "text-amber-700"
                    }
                  >
                    {w.status}
                  </span>
                </p>
              </button>
            ))
          )}
        </div>

        <div className="lg:col-span-2 space-y-4">
          {selected ? (
            <>
              <div className="bg-white rounded-lg border border-slate-200 p-4">
                <h2 className="text-lg font-semibold">{selected.name}</h2>
                <p className="text-sm text-slate-500 mb-4">
                  {selected.steps.length} step(s) · {selected.status}
                </p>
                <ol className="list-decimal list-inside text-sm text-slate-700 space-y-1 mb-4">
                  {selected.steps.map((s) => (
                    <li key={String(s.id)}>
                      {String(s.name)} → assignee {String((s.assignee as { value?: string })?.value)}
                    </li>
                  ))}
                </ol>
                <div className="flex flex-wrap gap-2">
                  {selected.status === "draft" && (
                    <button
                      type="button"
                      onClick={publish}
                      className="px-4 py-2 bg-brand-600 text-white text-sm rounded-lg hover:bg-brand-700"
                    >
                      Publish
                    </button>
                  )}
                  <label className="flex items-center gap-2 text-sm">
                    Amount:
                    <input
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="border rounded px-2 py-1 w-24"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={simulate}
                    className="px-4 py-2 border border-slate-300 text-sm rounded-lg hover:bg-slate-50"
                  >
                    Simulate
                  </button>
                </div>
              </div>
              {simResult && (
                <div className="bg-slate-50 rounded-lg border border-slate-200 p-4 text-sm">
                  <p className="font-medium mb-1">Simulation result</p>
                  <p>Steps: {simResult.steps_traversed.join(" → ")}</p>
                  <p>Status: {simResult.final_status}</p>
                  {simResult.routing_applied.length > 0 && (
                    <p className="text-slate-500 mt-1">
                      Routing: {simResult.routing_applied.join(", ")}
                    </p>
                  )}
                </div>
              )}
            </>
          ) : (
            <p className="text-slate-500">Select a workflow</p>
          )}
        </div>
      </div>
      <p className="text-xs text-slate-400 mt-4">
        <Link to="/" className="text-brand-600">
          ← Dashboard
        </Link>
      </p>
    </div>
  );
}
