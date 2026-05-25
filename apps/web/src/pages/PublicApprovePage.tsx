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
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="wf-card max-w-md w-full p-8 text-center">
          <p className="text-lg font-semibold text-green-700">{done}</p>
          <p className="text-sm text-slate-500 mt-2">You may close this window.</p>
        </div>
      </div>
    );
  }

  if (!view) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <p className="text-slate-500">{error || "Loading approval…"}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4">
      <div className="max-w-lg mx-auto wf-card p-6 space-y-4">
        <RequestMetaBar
          referenceNumber={view.reference_number}
          workflowName={view.workflow_name}
          submittedAt={view.submitted_at}
        />
        <p className="text-sm text-slate-500 text-center">{view.step_name}</p>
        <p className="text-sm text-slate-600">
          Submitted by <strong>{view.originator_name || "—"}</strong>
          {view.submitted_at && (
            <span className="text-slate-400">
              {" "}
              · {new Date(view.submitted_at).toLocaleString()}
            </span>
          )}
        </p>
        <dl className="text-sm bg-slate-50 rounded-lg p-4 space-y-2">
          {Object.entries(view.request_preview).map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4">
              <dt className="text-slate-500 capitalize">{k.replace(/_/g, " ")}</dt>
              <dd className="font-medium text-slate-800">{String(v)}</dd>
            </div>
          ))}
        </dl>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <form onSubmit={onSubmit} className="space-y-3">
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Comment (optional)"
            className="wf-input w-full"
            rows={2}
          />
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="flex-1 min-w-[120px] px-4 py-2.5 bg-green-600 text-white rounded-lg font-medium">
              Approve
            </button>
            <button
              type="button"
              onClick={() => decide("reject")}
              className="flex-1 min-w-[120px] px-4 py-2.5 bg-red-600 text-white rounded-lg font-medium"
            >
              Reject
            </button>
          </div>
        </form>
        <p className="text-xs text-slate-400 text-center">Secure one-time link · no login required</p>
      </div>
    </div>
  );
}
