import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { HelpTip } from "../components/HelpTip";
import { PageHeader } from "../components/PageHeader";
import { useAuth } from "../context/AuthContext";
import { ApiError, apiFetch } from "../lib/api";
import { getToken } from "../lib/auth";
import { canManageMasterData } from "../lib/roles";

type Field = { key: string; label: string; type: string; required?: boolean; options?: string[]; entity_slug?: string };
type Entity = { name: string; slug: string; fields: Field[] };
type Step = { id: string; name: string; type: string; assignee?: { value?: string } };
type Plan = {
  name: string;
  summary: string;
  entities: Entity[];
  workflow: { name: string; form_schema: { fields: Field[] }; steps: Step[]; routing_rules: unknown[]; settings: Record<string, unknown> };
  record_entity: string | null;
  traceability: { artifact: string; requirement: string }[];
  warnings: string[];
};
type CreatedEntity = { id: string; slug: string; name: string; reused: boolean };
type CreateResult = { workflow_id: string; workflow_name: string; entities: CreatedEntity[]; record_entity: string | null; warnings: string[] };

export function AppBuilderPage() {
  const { user } = useAuth();
  const canManage = canManageMasterData(user?.roles);

  const [title, setTitle] = useState("");
  const [requirements, setRequirements] = useState("");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [result, setResult] = useState<CreateResult | null>(null);
  const [generating, setGenerating] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  async function onFile(file: File) {
    const content = await file.text();
    setRequirements((prev) => (prev ? `${prev}\n\n${content}` : content));
    if (!title.trim()) setTitle(file.name.replace(/\.[^.]+$/, ""));
  }

  async function generate() {
    if (requirements.trim().length < 20) {
      setError("Add more detail to the requirements first.");
      return;
    }
    setGenerating(true);
    setError("");
    setPlan(null);
    setResult(null);
    try {
      const p = await apiFetch<Plan>(
        "/api/v1/ai-apps/generate",
        { method: "POST", body: JSON.stringify({ requirements, title: title.trim() || null }) },
        getToken(),
      );
      setPlan(p);
    } catch (e) {
      setError(e instanceof ApiError ? e.detail ?? e.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  async function createApp() {
    if (!plan) return;
    setCreating(true);
    setError("");
    try {
      const r = await apiFetch<CreateResult>(
        "/api/v1/ai-apps/create",
        { method: "POST", body: JSON.stringify(plan) },
        getToken(),
      );
      setResult(r);
    } catch (e) {
      setError(e instanceof ApiError ? e.detail ?? e.message : "Could not create the app");
    } finally {
      setCreating(false);
    }
  }

  if (!canManage) return <Navigate to="/" replace />;

  return (
    <div className="wf-analytics-page">
      <PageHeader
        title="App Builder"
        subtitle="Describe or upload a requirements pack — AI designs the data, forms, process and rules."
        help={
          <HelpTip>
            Paste SOPs, policies or notes and generate a whole app at once: data entities, a request form, approval
            steps and routing. Review the plan, create it, then publish the workflow through the normal flow.
          </HelpTip>
        }
      />

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      <section className="wf-panel mb-6">
        <input
          className="wf-input w-full mb-3"
          placeholder="App name (optional)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <textarea
          className="wf-input w-full mb-3"
          rows={10}
          placeholder="Paste your requirements: who submits what, what data is captured, who approves, any thresholds or rules…"
          value={requirements}
          onChange={(e) => setRequirements(e.target.value)}
        />
        <div className="flex flex-wrap items-center gap-3">
          <button className="wf-btn-primary px-4 py-2 text-sm disabled:opacity-50" disabled={generating} onClick={generate}>
            {generating ? "Designing…" : "Generate app"}
          </button>
          <label className="text-sm text-slate-500 cursor-pointer">
            or upload .txt / .md
            <input
              type="file"
              accept=".txt,.md,text/plain,text/markdown"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
            />
          </label>
        </div>
      </section>

      {plan && !result && (
        <section className="wf-panel mb-6">
          <h2 className="text-lg font-semibold">{plan.name}</h2>
          {plan.summary && <p className="text-sm text-slate-600 mb-4">{plan.summary}</p>}

          {plan.warnings.length > 0 && (
            <div className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
              {plan.warnings.map((w, i) => (
                <div key={i}>⚠ {w}</div>
              ))}
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <h3 className="font-medium mb-2">Data ({plan.entities.length})</h3>
              {plan.entities.map((e) => (
                <div key={e.slug} className="mb-3 border border-slate-200 rounded-lg p-3">
                  <div className="font-medium text-sm">
                    {e.name}
                    {plan.record_entity === e.slug && (
                      <span className="ml-2 text-[10px] uppercase text-[rgb(var(--wf-brand-600))]">submissions saved here</span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    {e.fields.map((f) => `${f.label} (${f.type})`).join(" · ")}
                  </div>
                </div>
              ))}
              {plan.entities.length === 0 && <p className="text-xs text-slate-500">No data entities.</p>}
            </div>

            <div>
              <h3 className="font-medium mb-2">Process — {plan.workflow.name}</h3>
              <div className="text-xs text-slate-500 mb-2">
                Form fields: {plan.workflow.form_schema.fields.map((f) => f.label).join(", ") || "—"}
              </div>
              <ol className="text-sm list-decimal ml-5 space-y-1">
                {plan.workflow.steps.map((s) => (
                  <li key={s.id}>
                    {s.name}
                    {s.type === "approval" && s.assignee?.value && (
                      <span className="text-slate-400"> · {s.assignee.value}</span>
                    )}
                    {s.type !== "approval" && <span className="text-slate-400"> · {s.type}</span>}
                  </li>
                ))}
              </ol>
              {plan.workflow.routing_rules.length > 0 && (
                <p className="text-xs text-slate-500 mt-2">{plan.workflow.routing_rules.length} routing rule(s).</p>
              )}
            </div>
          </div>

          {plan.traceability.length > 0 && (
            <details className="mt-4">
              <summary className="text-sm font-medium cursor-pointer">Traceability</summary>
              <ul className="mt-2 space-y-1 text-xs text-slate-600">
                {plan.traceability.map((t, i) => (
                  <li key={i}>
                    <span className="font-medium">{t.artifact}</span> — {t.requirement}
                  </li>
                ))}
              </ul>
            </details>
          )}

          <div className="mt-5 flex items-center gap-3">
            <button className="wf-btn-primary px-4 py-2 text-sm disabled:opacity-50" disabled={creating} onClick={createApp}>
              {creating ? "Creating…" : "Create this app"}
            </button>
            <span className="text-xs text-slate-500">Creates the data + a draft workflow. You publish it after review.</span>
          </div>
        </section>
      )}

      {result && (
        <section className="wf-panel mb-6">
          <h2 className="text-lg font-semibold text-emerald-700 mb-2">App created ✓</h2>
          <p className="text-sm text-slate-700 mb-3">
            Workflow <span className="font-medium">{result.workflow_name}</span> was created as a draft, with{" "}
            {result.entities.length} data {result.entities.length === 1 ? "entity" : "entities"}.
          </p>
          {result.warnings.length > 0 && (
            <div className="mb-3 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
              {result.warnings.map((w, i) => (
                <div key={i}>⚠ {w}</div>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-3">
            <Link to="/workflows" className="wf-btn-primary px-4 py-2 text-sm">
              Review &amp; publish the workflow
            </Link>
            <Link to="/data" className="px-4 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">
              View the data
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
