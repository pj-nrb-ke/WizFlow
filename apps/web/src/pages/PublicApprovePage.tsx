import { FormEvent, useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { RequestMetaBar } from "../components/RequestMetaBar";
import { ApiError, apiFetch, type PublicApprovalView } from "../lib/api";

export function PublicApprovePage() {
  const { token } = useParams<{ token: string }>();
  const [view, setView] = useState<PublicApprovalView | null>(null);
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    const v = await apiFetch<PublicApprovalView>(`/api/v1/public/approval/${token}`);
    setView(v);
  }, [token]);

  useEffect(() => {
    load().catch((e) => setError(e instanceof ApiError ? e.detail ?? e.message : "Invalid link"));
  }, [load]);

  async function decide(action: "approve" | "reject") {
    if (!token) return;
    setError("");
    try {
      const res = await apiFetch<{ message: string }>(`/api/v1/public/approval/${token}/decide`, {
        method: "POST",
        body: JSON.stringify({ action, comment: comment || null }),
      });
      setDone(res.message);
      setView(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.detail ?? e.message : "Action failed");
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    decide("approve");
  }

  if (done) {
    return (
      <div className="wf-public-approve min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="wf-card max-w-md w-full p-8 sm:p-10 text-center">
          <p className="text-xl font-semibold text-green-700">{done}</p>
          <p className="text-base text-slate-500 mt-3">You may close this window.</p>
        </div>
      </div>
    );
  }

  if (!view) {
    return (
      <div className="wf-public-approve min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <p className="text-base text-slate-500">{error || "Loading approval…"}</p>
      </div>
    );
  }

  return (
    <div className="wf-public-approve min-h-screen bg-slate-50 py-6 sm:py-10 px-4 sm:px-6">
      <div className="max-w-lg mx-auto wf-card p-6 sm:p-8 space-y-5">
        <RequestMetaBar
          referenceNumber={view.reference_number}
          workflowName={view.workflow_name}
          submittedAt={view.submitted_at}
        />
        <p className="text-base text-slate-600 text-center font-medium">{view.step_name}</p>
        <p className="text-base text-slate-700 leading-relaxed">
          Submitted by <strong>{view.originator_name || "—"}</strong>
          {view.submitted_at && (
            <span className="block text-slate-500 text-sm mt-1">
              {new Date(view.submitted_at).toLocaleString()}
            </span>
          )}
        </p>
        <dl className="text-base bg-slate-50 rounded-xl p-4 sm:p-5 space-y-3">
          {Object.entries(view.request_preview).map(([k, v]) => (
            <div key={k} className="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-4">
              <dt className="text-slate-500 capitalize shrink-0">{k.replace(/_/g, " ")}</dt>
              <dd className="font-medium text-slate-800 break-words">{String(v)}</dd>
            </div>
          ))}
        </dl>
        {error && <p className="text-base text-red-600">{error}</p>}
        <form onSubmit={onSubmit} className="space-y-4">
          <label className="block text-sm font-medium text-slate-700" htmlFor="public-comment">
            Comment (optional)
          </label>
          <textarea
            id="public-comment"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Add a note for the requester…"
            className="wf-input w-full text-base min-h-[5rem]"
            rows={3}
          />
          <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
            <button
              type="submit"
              className="wf-public-approve-btn flex-1 min-h-[3rem] px-5 py-3.5 bg-green-600 text-white rounded-xl font-semibold text-base"
            >
              Approve
            </button>
            <button
              type="button"
              onClick={() => decide("reject")}
              className="wf-public-approve-btn flex-1 min-h-[3rem] px-5 py-3.5 bg-red-600 text-white rounded-xl font-semibold text-base"
            >
              Reject
            </button>
          </div>
        </form>
        <p className="text-sm text-slate-400 text-center">Secure one-time link · no login required</p>
      </div>
    </div>
  );
}
