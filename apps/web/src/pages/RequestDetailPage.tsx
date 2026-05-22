import { FormEvent, useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError, apiFetch, RequestDetail, WorkflowEvent } from "../lib/api";
import { getToken } from "../lib/auth";
import { useAuth } from "../context/AuthContext";

export function RequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [request, setRequest] = useState<RequestDetail | null>(null);
  const [events, setEvents] = useState<WorkflowEvent[]>([]);
  const [error, setError] = useState("");
  const [resubmitData, setResubmitData] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!id) return;
    const [req, ev] = await Promise.all([
      apiFetch<RequestDetail>(`/api/v1/requests/${id}`, {}, getToken()),
      apiFetch<WorkflowEvent[]>(`/api/v1/requests/${id}/events`, {}, getToken()),
    ]);
    setRequest(req);
    setEvents(ev);
    const data: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.request_data)) {
      data[k] = String(v);
    }
    setResubmitData(data);
  }, [id]);

  useEffect(() => {
    load().catch((e) => setError(e instanceof ApiError ? e.detail ?? e.message : "Failed to load"));
  }, [load]);

  async function resubmit(e: FormEvent) {
    e.preventDefault();
    if (!id) return;
    const data: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(resubmitData)) {
      data[k] = k === "amount" ? Number(v) : v;
    }
    try {
      await apiFetch(`/api/v1/requests/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ data }),
      }, getToken());
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.detail ?? err.message : "Resubmit failed");
    }
  }

  if (!request) return <p className="text-slate-500">Loading…</p>;

  const isOriginator = user?.id === request.originator_user_id;

  return (
    <div>
      <Link to="/requests" className="text-sm text-brand-600 mb-4 inline-block">
        ← My requests
      </Link>
      <h1 className="text-2xl font-bold text-slate-800 mb-1">{request.workflow_name}</h1>
      <p className="text-sm text-slate-500 mb-6">
        Status: <span className="font-medium">{request.status}</span>
        {request.current_step_name && ` · ${request.current_step_name}`}
      </p>
      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <h2 className="font-semibold mb-3">Request data</h2>
          <dl className="text-sm space-y-2">
            {Object.entries(request.request_data).map(([k, v]) => (
              <div key={k} className="flex gap-2">
                <dt className="text-slate-500 capitalize w-28">{k}</dt>
                <dd className="text-slate-800">{String(v)}</dd>
              </div>
            ))}
          </dl>
          {request.status === "returned" && isOriginator && (
            <form onSubmit={resubmit} className="mt-4 space-y-2 border-t pt-4">
              <p className="text-sm font-medium">Resubmit after edits</p>
              {Object.keys(resubmitData).map((k) => (
                <input
                  key={k}
                  value={resubmitData[k]}
                  onChange={(e) => setResubmitData({ ...resubmitData, [k]: e.target.value })}
                  className="w-full border rounded px-2 py-1 text-sm"
                  placeholder={k}
                />
              ))}
              <button type="submit" className="px-3 py-2 bg-brand-600 text-white text-sm rounded-lg">
                Resubmit
              </button>
            </form>
          )}
        </div>

        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <h2 className="font-semibold mb-3">Timeline</h2>
          <ul className="space-y-3 text-sm">
            {events.map((ev) => (
              <li key={ev.id} className="border-l-2 border-brand-200 pl-3">
                <p className="font-medium text-slate-800">{ev.event_type}</p>
                <p className="text-xs text-slate-500">
                  {ev.actor_name ?? "System"} · {new Date(ev.created_at).toLocaleString()}
                </p>
                {ev.payload?.comment != null && String(ev.payload.comment) !== "" && (
                  <p className="text-slate-600 mt-1">{String(ev.payload.comment)}</p>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
