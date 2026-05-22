import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiError, AiDraftResponse, apiFetch, WorkflowDefinition } from "../lib/api";
import { getToken } from "../lib/auth";

export function AiWorkflowPage() {
  const navigate = useNavigate();
  const [description, setDescription] = useState(
    "Purchase request workflow: manager approves under 10k, finance above 10k. Fields: amount, vendor, item description."
  );
  const [refineText, setRefineText] = useState("");
  const [draft, setDraft] = useState<AiDraftResponse | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function generate() {
    setError("");
    setBusy(true);
    try {
      const result = await apiFetch<AiDraftResponse>(
        "/api/v1/ai/workflow/draft",
        { method: "POST", body: JSON.stringify({ description }) },
        getToken()
      );
      setDraft(result);
    } catch (e) {
      setError(e instanceof ApiError ? e.detail ?? e.message : "Draft failed");
    } finally {
      setBusy(false);
    }
  }

  async function refine() {
    if (!draft || !refineText.trim()) return;
    setError("");
    setBusy(true);
    try {
      const result = await apiFetch<AiDraftResponse>(
        "/api/v1/ai/workflow/refine",
        {
          method: "POST",
          body: JSON.stringify({
            instruction: refineText,
            current_draft: draft.draft,
          }),
        },
        getToken()
      );
      setDraft(result);
      setRefineText("");
    } catch (e) {
      setError(e instanceof ApiError ? e.detail ?? e.message : "Refine failed");
    } finally {
      setBusy(false);
    }
  }

  async function saveDraft() {
    if (!draft) return;
    setError("");
    setBusy(true);
    try {
      const saved = await apiFetch<WorkflowDefinition>(
        "/api/v1/ai/workflow/save",
        {
          method: "POST",
          body: JSON.stringify({ description, draft: draft.draft }),
        },
        getToken()
      );
      navigate(`/workflows`, { state: { openId: saved.id } });
    } catch (e) {
      setError(e instanceof ApiError ? e.detail ?? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  const d = draft?.draft as {
    name?: string;
    form_schema?: { fields?: { label: string; key: string }[] };
    steps?: { name: string }[];
  } | undefined;

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-800 mb-2">AI Workflow Creator</h1>
      <p className="text-sm text-slate-500 mb-4">
        Describe a process in plain language. Review the draft, refine it, then save and publish from
        Workflows.
      </p>
      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      <div className="bg-white rounded-lg border border-slate-200 p-4 mb-4">
        <label className="block text-sm font-medium text-slate-700 mb-2">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
        />
        <button
          type="button"
          disabled={busy || description.length < 10}
          onClick={generate}
          className="mt-3 px-4 py-2 bg-brand-600 text-white text-sm rounded-lg hover:bg-brand-700 disabled:opacity-50"
        >
          {busy ? "Working…" : "Generate draft"}
        </button>
      </div>

      {draft && (
        <div className="space-y-4">
          <div className="bg-slate-50 rounded-lg border border-slate-200 p-4 text-sm">
            <p className="font-medium text-slate-800 mb-1">
              {String(d?.name ?? "Draft")}{" "}
              <span className="text-xs text-slate-500">({draft.source})</span>
            </p>
            <p className="text-slate-600 mb-3">{draft.explanation}</p>
            {draft.gaps.length > 0 && (
              <ul className="list-disc list-inside text-amber-800 mb-2">
                {draft.gaps.map((g) => (
                  <li key={g}>{g}</li>
                ))}
              </ul>
            )}
            <p className="text-slate-500">
              {(d?.form_schema?.fields?.length ?? 0)} field(s) · {(d?.steps?.length ?? 0)} step(s)
            </p>
            <ol className="list-decimal list-inside mt-2 text-slate-700">
              {(d?.steps ?? []).map((s, i) => (
                <li key={i}>{s.name}</li>
              ))}
            </ol>
          </div>

          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <label className="block text-sm font-medium text-slate-700 mb-2">Refine</label>
            <input
              value={refineText}
              onChange={(e) => setRefineText(e.target.value)}
              placeholder="e.g. Add a finance step for amounts over 5000"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mb-2"
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy || !refineText.trim()}
                onClick={refine}
                className="px-4 py-2 border border-slate-300 text-sm rounded-lg hover:bg-slate-50 disabled:opacity-50"
              >
                Apply refinement
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={saveDraft}
                className="px-4 py-2 bg-brand-600 text-white text-sm rounded-lg hover:bg-brand-700 disabled:opacity-50"
              >
                Save as draft workflow
              </button>
            </div>
          </div>
        </div>
      )}

      <p className="text-xs text-slate-400 mt-6">
        <Link to="/workflows" className="text-brand-600">
          ← Workflows
        </Link>
      </p>
    </div>
  );
}
