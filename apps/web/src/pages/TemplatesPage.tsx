import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { HelpTip } from "../components/HelpTip";
import { ApiError } from "../lib/api";
import { getToken } from "../lib/auth";
import {
  cloneTemplate,
  fetchTemplates,
  TEMPLATE_CATEGORIES,
  type TemplateCategory,
  type WorkflowTemplate,
} from "../lib/templates";

const CATEGORY_STYLES: Record<TemplateCategory, string> = {
  Finance: "bg-emerald-50 text-emerald-800 border-emerald-200",
  HR: "bg-violet-50 text-violet-800 border-violet-200",
  Operations: "bg-sky-50 text-sky-800 border-sky-200",
  Compliance: "bg-amber-50 text-amber-900 border-amber-200",
};

export function TemplatesPage() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [category, setCategory] = useState<TemplateCategory | "All">("All");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cloningId, setCloningId] = useState<string | null>(null);

  useEffect(() => {
    fetchTemplates(getToken())
      .then(setTemplates)
      .catch((e) => setError(e instanceof ApiError ? e.detail ?? e.message : "Failed to load templates"))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return templates.filter((t) => {
      if (category !== "All" && t.category !== category) return false;
      if (!q) return true;
      return (
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.tags?.some((tag) => tag.toLowerCase().includes(q))
      );
    });
  }, [templates, category, query]);

  async function useTemplate(tpl: WorkflowTemplate) {
    setError("");
    setCloningId(tpl.id);
    try {
      const { workflow_definition_id } = await cloneTemplate(tpl.id);
      navigate("/workflows", { state: { openId: workflow_definition_id } });
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.detail ?? e.message
          : "Could not create workflow from template. The clone API may not be live yet."
      );
    } finally {
      setCloningId(null);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4 mb-2">
        <div>
          <h1 className="wf-page-title">Workflow templates</h1>
          <p className="text-sm text-slate-500 mt-1">
            Start from proven office workflows, then customize in the designer.
          </p>
        </div>
      </div>

      <HelpTip title="How templates work">
        <p>
          Each template is a ready-made workflow with form fields and approval steps. Choose{" "}
          <strong>Use template</strong> to copy it into your company as a draft workflow. You can
          rename steps, adjust approvers, and publish when ready.
        </p>
      </HelpTip>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      <div className="wf-filter-bar mb-6">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search templates…"
          className="wf-input max-w-xs"
          aria-label="Search templates"
        />
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by category">
          <button
            type="button"
            className={`wf-filter-chip${category === "All" ? " active" : ""}`}
            onClick={() => setCategory("All")}
          >
            All
          </button>
          {TEMPLATE_CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              className={`wf-filter-chip${category === c ? " active" : ""}`}
              onClick={() => setCategory(c)}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-slate-500 py-12 text-center">Loading template library…</p>
      ) : filtered.length === 0 ? (
        <p className="text-slate-500 py-12 text-center">No templates match your filters.</p>
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((tpl) => (
            <article key={tpl.id} className="wf-template-card flex flex-col">
              <div className="flex items-start justify-between gap-2 mb-2">
                <h2 className="font-semibold text-slate-800 leading-snug">{tpl.name}</h2>
                <span
                  className={`shrink-0 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded border ${CATEGORY_STYLES[tpl.category]}`}
                >
                  {tpl.category}
                </span>
              </div>
              <p className="text-sm text-slate-600 flex-1 mb-4">{tpl.description}</p>
              {tpl.step_count != null && (
                <p className="text-xs text-slate-400 mb-3">{tpl.step_count} approval steps</p>
              )}
              <button
                type="button"
                className="wf-btn-primary w-full py-2.5 text-sm mt-auto"
                disabled={cloningId === tpl.id}
                onClick={() => useTemplate(tpl)}
              >
                {cloningId === tpl.id ? "Creating…" : "Use template"}
              </button>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
