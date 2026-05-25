import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError, apiFetch, RequestSummary } from "../lib/api";
import { formatDateTimeShort } from "../lib/datetime";
import { getToken } from "../lib/auth";

const statusColor: Record<string, string> = {
  in_progress: "text-amber-700 bg-amber-50",
  approved: "text-green-700 bg-green-50",
  rejected: "text-red-700 bg-red-50",
  returned: "text-blue-700 bg-blue-50",
};

export function MyRequestsPage() {
  const [requests, setRequests] = useState<RequestSummary[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch<RequestSummary[]>("/api/v1/requests", {}, getToken())
      .then(setRequests)
      .catch((e) => setError(e instanceof ApiError ? e.detail ?? e.message : "Failed to load"));
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="wf-page-title">My requests</h1>
        <Link to="/submit" className="px-4 py-2 wf-btn-primary text-sm">
          New request
        </Link>
      </div>
      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
      <div className="wf-card divide-y">
        {requests.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">No requests yet.</p>
        ) : (
          requests.map((r) => (
            <Link
              key={r.id}
              to={`/requests/${r.id}`}
              className="block p-4 hover:bg-slate-50"
            >
              <div className="flex justify-between items-start">
                <div>
                  {r.reference_number && (
                    <p className="font-mono text-xs font-semibold text-[rgb(var(--wf-brand-700))]">
                      {r.reference_number}
                    </p>
                  )}
                  <p className="font-medium text-slate-800">{r.workflow_name}</p>
                  {r.submitted_at && (
                    <p className="text-[10px] text-slate-400">{formatDateTimeShort(r.submitted_at)}</p>
                  )}
                  <p className="text-xs text-slate-500 mt-1">
                    {r.current_step_name
                      ? `Pending: ${r.current_step_name}`
                      : "Completed"}
                  </p>
                </div>
                <span
                  className={`text-xs px-2 py-1 rounded-full ${
                    statusColor[r.status] ?? "text-slate-600 bg-slate-100"
                  }`}
                >
                  {r.status.replace("_", " ")}
                </span>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
