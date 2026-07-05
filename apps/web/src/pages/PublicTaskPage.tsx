import { ChangeEvent, ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { PublicTaskView, completePublicTask, getPublicTask, uploadPublicTaskFile } from "../lib/api";

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[rgb(var(--wf-page-bg))]">
      <div className="w-full max-w-lg rounded-2xl border border-[rgb(var(--wf-card-border))] bg-[rgb(var(--wf-card-bg))] shadow-sm p-6 sm:p-8">
        {children}
      </div>
    </div>
  );
}

export function PublicTaskPage() {
  const { token = "" } = useParams();
  const [view, setView] = useState<PublicTaskView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [justDone, setJustDone] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setView(await getPublicTask(token));
    } catch (e) {
      setError(e instanceof Error ? e.message : "This task link is no longer active.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  async function onUpload(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setBusy(true);
    setError("");
    try {
      await uploadPublicTaskFile(token, f);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function onComplete() {
    setBusy(true);
    setError("");
    try {
      const v = await completePublicTask(token);
      setView(v);
      setJustDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not complete the task.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <Shell>
        <p className="text-center text-slate-500">Loading task…</p>
      </Shell>
    );
  }

  if (!view) {
    return (
      <Shell>
        <div className="text-center">
          <h1 className="text-lg font-semibold mb-2">Link unavailable</h1>
          <p className="text-sm text-slate-500">{error || "This task link is no longer active."}</p>
        </div>
      </Shell>
    );
  }

  const settled = view.status === "done" || view.status === "awaiting_approval";
  const needsFile = view.attachment_required && view.attachments.length === 0;

  return (
    <Shell>
      <p className="text-xs uppercase tracking-wide text-slate-500">{view.company_name}</p>
      <p className="text-xs text-slate-500 mt-0.5">Checklist · {view.checklist_name}</p>
      <h1 className="text-xl font-semibold mt-2">{view.title}</h1>
      {view.description && <p className="text-sm text-slate-500 mt-2 whitespace-pre-wrap">{view.description}</p>}

      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-sm">
        {view.assignee_name && (
          <span className="text-slate-500">Assigned to <b className="text-slate-900">{view.assignee_name}</b></span>
        )}
        {view.due_date && (
          <span className="text-slate-500">Due <b className="text-slate-900">{view.due_date}</b></span>
        )}
      </div>

      {settled ? (
        <div className="mt-6 rounded-lg border border-green-200 bg-green-50 p-4 text-center">
          <p className="font-medium text-green-800">
            {view.status === "awaiting_approval" ? "Submitted — awaiting approval" : "Task completed"}
          </p>
          <p className="text-sm text-green-700 mt-1">
            {justDone ? "Thank you. " : ""}
            {view.status === "awaiting_approval"
              ? "Your manager will review and approve it."
              : "This task is marked done. You can close this page."}
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {view.attachments.length > 0 && (
            <div className="text-sm">
              <p className="font-medium mb-1">Attached files</p>
              <ul className="list-disc list-inside text-slate-500">
                {view.attachments.map((a) => (
                  <li key={a.id}>{a.original_filename}</li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-1">
              {view.attachment_required ? "Attach a file (required)" : "Attach a file (optional)"}
            </label>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={onUpload}
              disabled={busy}
              className="block w-full text-sm text-slate-500 file:mr-3 file:rounded-md file:border-0 file:bg-[rgb(var(--wf-brand-600))] file:px-3 file:py-1.5 file:text-white"
            />
            <p className="text-xs text-slate-500 mt-1">PDF, JPG or PNG · up to 10 MB.</p>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            onClick={onComplete}
            disabled={busy || needsFile}
            className="wf-btn-primary w-full"
            title={needsFile ? "Attach the required file first" : undefined}
          >
            {busy ? "Working…" : "Mark task complete"}
          </button>
          {needsFile && (
            <p className="text-xs text-center text-slate-500">A file attachment is required before you can complete this task.</p>
          )}
        </div>
      )}
    </Shell>
  );
}
