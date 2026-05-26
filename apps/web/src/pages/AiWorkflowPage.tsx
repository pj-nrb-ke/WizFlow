import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { HelpTip } from "../components/HelpTip";
import { PageHeader } from "../components/PageHeader";
import {
  AiDraftResponse,
  ApiError,
  apiFetch,
  postWizardFinalize,
  postWizardQuestions,
  WizardQuestion,
  WorkflowDefinition,
} from "../lib/api";
import { getToken } from "../lib/auth";

type Step = "describe" | "questions" | "preview";

export function AiWorkflowPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("describe");
  const [description, setDescription] = useState(
    "Purchase request workflow: manager approves under 10k, finance above 10k. Fields: amount, vendor, item description."
  );
  const [questions, setQuestions] = useState<WizardQuestion[]>([]);
  const [hint, setHint] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState<AiDraftResponse | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function loadQuestions() {
    setError("");
    setBusy(true);
    try {
      const res = await postWizardQuestions(description, getToken());
      setQuestions(res.questions);
      setHint(res.initial_hint);
      const initial: Record<string, string> = {};
      for (const q of res.questions) {
        initial[q.id] = q.default ?? "";
      }
      setAnswers(initial);
      setStep("questions");
    } catch (e) {
      setError(e instanceof ApiError ? e.detail ?? e.message : "Could not load questions");
    } finally {
      setBusy(false);
    }
  }

  async function finalize(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const result = await postWizardFinalize(description, answers, getToken());
      setDraft(result);
      setStep("preview");
    } catch (err) {
      setError(err instanceof ApiError ? err.detail ?? err.message : "Finalize failed");
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
      navigate("/workflows", { state: { openId: saved.id } });
    } catch (err) {
      setError(err instanceof ApiError ? err.detail ?? err.message : "Save failed");
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
      <PageHeader
        title="AI Workflow Wizard"
        subtitle="Describe your process, answer a few questions, then review and save as a draft workflow."
        help={
          <HelpTip text="The guided wizard builds form fields, approval steps, SLA, and notifications from your answers. Publish from Workflows after preview and test." />
        }
      />

      <ol className="flex flex-wrap gap-2 mb-6 text-xs">
        {(["Describe", "Questions", "Preview"] as const).map((label, i) => {
          const active =
            (step === "describe" && i === 0) ||
            (step === "questions" && i === 1) ||
            (step === "preview" && i === 2);
          const done =
            (step === "questions" && i === 0) ||
            (step === "preview" && i <= 1);
          return (
            <li
              key={label}
              className={`px-3 py-1 rounded-full border ${
                active
                  ? "border-[rgb(var(--wf-brand-600))] bg-[rgb(var(--wf-accent-muted))] font-semibold"
                  : done
                    ? "border-green-200 bg-green-50 text-green-800"
                    : "border-slate-200 text-slate-500"
              }`}
            >
              {done && !active ? "✓ " : ""}
              {label}
            </li>
          );
        })}
      </ol>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      {step === "describe" && (
        <div className="wf-card p-4">
          <label className="block text-sm font-medium text-slate-700 mb-2">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={5}
            className="wf-input w-full"
          />
          <button
            type="button"
            disabled={busy || description.length < 10}
            onClick={() => void loadQuestions()}
            className="mt-3 px-4 py-2 wf-btn-primary text-sm disabled:opacity-50"
          >
            {busy ? "Working…" : "Continue to questions"}
          </button>
        </div>
      )}

      {step === "questions" && (
        <form onSubmit={finalize} className="wf-card p-4 space-y-4">
          {hint && <p className="text-sm text-slate-600">{hint}</p>}
          {questions.map((q) => (
            <label key={q.id} className="block text-sm">
              <span className="font-medium text-slate-800">{q.prompt}</span>
              {q.type === "yesno" ? (
                <select
                  className="wf-input mt-1 w-full max-w-xs"
                  value={answers[q.id] ?? "yes"}
                  onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                >
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              ) : q.type === "number" ? (
                <input
                  type="number"
                  className="wf-input mt-1 w-full max-w-xs"
                  value={answers[q.id] ?? ""}
                  onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                />
              ) : (
                <input
                  type="text"
                  className="wf-input mt-1 w-full"
                  value={answers[q.id] ?? ""}
                  onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                />
              )}
            </label>
          ))}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="px-4 py-2 wf-btn-secondary text-sm"
              onClick={() => setStep("describe")}
            >
              Back
            </button>
            <button type="submit" disabled={busy} className="px-4 py-2 wf-btn-primary text-sm">
              {busy ? "Building draft…" : "Generate preview"}
            </button>
          </div>
        </form>
      )}

      {step === "preview" && draft && (
        <div className="space-y-4">
          <div className="wf-card p-4 text-sm">
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
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="px-4 py-2 wf-btn-secondary text-sm"
              onClick={() => setStep("questions")}
            >
              Back to questions
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void saveDraft()}
              className="px-4 py-2 wf-btn-primary text-sm disabled:opacity-50"
            >
              Save as draft workflow
            </button>
          </div>
        </div>
      )}

      <p className="text-xs text-slate-400 mt-6">
        <Link to="/workflows" className="wf-link">
          ← Workflows
        </Link>
      </p>
    </div>
  );
}
