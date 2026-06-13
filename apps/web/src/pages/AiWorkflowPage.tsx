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

const EXAMPLE_PROMPTS: { label: string; text: string }[] = [
  {
    label: "Purchase request",
    text: "Purchase request workflow: manager approves under 10k, finance above 10k. Fields: amount, vendor, item description.",
  },
  {
    label: "Leave request",
    text: "Leave request: employee submits start date, end date, and reason. Their line manager approves, then HR confirms.",
  },
  {
    label: "Petty cash",
    text: "Petty cash claim: staff enter amount, purpose, and a receipt photo. Manager approves up to 5,000; finance approves anything higher.",
  },
];

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
        <div className="grid items-start gap-6 lg:grid-cols-3">
          <div className="wf-card p-5 lg:col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Describe the process in plain English
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={6}
              className="wf-input w-full"
              placeholder="Who submits, what they fill in, who approves, and any amount thresholds…"
            />
            <div className="mt-3 mb-4">
              <p className="text-xs font-medium text-slate-500 mb-2">Need a starting point? Try one:</p>
              <div className="flex flex-wrap gap-2">
                {EXAMPLE_PROMPTS.map((ex) => (
                  <button
                    key={ex.label}
                    type="button"
                    onClick={() => setDescription(ex.text)}
                    className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:border-slate-400 hover:bg-slate-50"
                  >
                    {ex.label}
                  </button>
                ))}
              </div>
            </div>
            <button
              type="button"
              disabled={busy || description.length < 10}
              onClick={() => void loadQuestions()}
              className="px-4 py-2 wf-btn-primary text-sm disabled:opacity-50"
            >
              {busy ? "Working…" : "Continue to questions"}
            </button>
          </div>

          <aside className="space-y-4">
            <div className="wf-card p-5">
              <h2 className="text-sm font-semibold text-slate-800 mb-3">How it works</h2>
              <ol className="space-y-3">
                {[
                  "Describe your process — who starts it, who approves, and any rules.",
                  "Answer a few clarifying questions to fill in the gaps.",
                  "Review the generated form fields and approval steps.",
                  "Save as a draft, then test and publish from Workflows.",
                ].map((tipText, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--wf-accent-muted))] text-xs font-semibold text-[rgb(var(--wf-brand-700))]">
                      {i + 1}
                    </span>
                    <p className="text-sm leading-snug text-slate-600">{tipText}</p>
                  </li>
                ))}
              </ol>
            </div>
            <div className="wf-card p-5">
              <p className="text-sm font-medium text-slate-800 mb-1">Tips for better results</p>
              <ul className="list-disc list-inside text-xs text-slate-500 space-y-1">
                <li>Name the fields people will fill in.</li>
                <li>State approval thresholds (e.g. over 10,000).</li>
                <li>Mention required attachments or documents.</li>
              </ul>
            </div>
          </aside>
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
