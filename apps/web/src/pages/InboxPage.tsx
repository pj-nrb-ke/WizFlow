import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError, apiFetch, InboxItem, RequestDetail } from "../lib/api";
import { getToken } from "../lib/auth";

export function InboxPage() {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<RequestDetail | null>(null);
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  function loadInbox() {
    return apiFetch<InboxItem[]>("/api/v1/inbox", {}, getToken()).then(setItems);
  }

  useEffect(() => {
    loadInbox().catch((e) => setError(e instanceof ApiError ? e.detail ?? e.message : "Failed"));
  }, []);

  async function openItem(requestId: string) {
    setSelectedId(requestId);
    setMsg("");
    setError("");
    const d = await apiFetch<RequestDetail>(`/api/v1/requests/${requestId}`, {}, getToken());
    setDetail(d);
  }

  async function act(action: "approve" | "reject" | "return") {
    if (!selectedId) return;
    setError("");
    try {
      await apiFetch(
        `/api/v1/requests/${selectedId}/${action}`,
        { method: "POST", body: JSON.stringify({ comment }) },
        getToken()
      );
      setMsg(`Request ${action}d successfully.`);
      setComment("");
      setDetail(null);
      setSelectedId(null);
      await loadInbox();
    } catch (e) {
      setError(e instanceof ApiError ? e.detail ?? e.message : "Action failed");
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-800 mb-4">Approval inbox</h1>
      {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
      {msg && <p className="text-sm text-green-700 mb-2">{msg}</p>}

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 bg-white rounded-lg border border-slate-200 divide-y">
          {items.length === 0 ? (
            <p className="p-4 text-sm text-slate-500">No pending approvals.</p>
          ) : (
            items.map((item) => (
              <button
                key={item.request_id}
                type="button"
                onClick={() => openItem(item.request_id)}
                className={`w-full text-left p-4 hover:bg-slate-50 ${
                  selectedId === item.request_id ? "bg-brand-50" : ""
                }`}
              >
                <p className="font-medium">{item.workflow_name}</p>
                <p className="text-xs text-slate-500">
                  {item.originator_name} · {item.step_name}
                </p>
                {item.amount_preview && (
                  <p className="text-xs text-slate-400">Amount: {item.amount_preview}</p>
                )}
              </button>
            ))
          )}
        </div>

        <div className="lg:col-span-2">
          {detail ? (
            <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-4">
              <h2 className="font-semibold">{detail.workflow_name}</h2>
              <dl className="text-sm grid grid-cols-2 gap-2">
                {Object.entries(detail.request_data).map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-slate-500 capitalize">{k}</dt>
                    <dd>{String(v)}</dd>
                  </div>
                ))}
              </dl>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Comment (optional)"
                className="w-full border rounded-lg px-3 py-2 text-sm"
                rows={2}
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => act("approve")}
                  className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg"
                >
                  Approve
                </button>
                <button
                  type="button"
                  onClick={() => act("return")}
                  className="px-4 py-2 bg-amber-500 text-white text-sm rounded-lg"
                >
                  Return
                </button>
                <button
                  type="button"
                  onClick={() => act("reject")}
                  className="px-4 py-2 bg-red-600 text-white text-sm rounded-lg"
                >
                  Reject
                </button>
                <Link
                  to={`/requests/${detail.id}`}
                  className="px-4 py-2 border text-sm rounded-lg text-slate-600"
                >
                  Full timeline
                </Link>
              </div>
            </div>
          ) : (
            <p className="text-slate-500 text-sm">Select a request to review.</p>
          )}
        </div>
      </div>
    </div>
  );
}
