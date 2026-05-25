import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ThemeScope } from "../context/ThemeContext";
import { RequestMetaBar } from "../components/RequestMetaBar";
import { WorkflowFormRenderer } from "../components/WorkflowFormRenderer";
import { formatDateTimeShort } from "../lib/datetime";
import { ApiError, apiFetch, FormField, InboxItem, RequestDetail } from "../lib/api";
import { getToken } from "../lib/auth";
import {
  APP_THEMES,
  filterRequestData,
  FORM_LAYOUTS,
  type AppTheme,
  type FormLayout,
} from "../lib/themes";

export function InboxPage() {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<RequestDetail | null>(null);
  const [fields, setFields] = useState<FormField[]>([]);
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  const uiTheme = APP_THEMES.includes((detail?.ui_theme ?? "") as AppTheme)
    ? (detail!.ui_theme as AppTheme)
    : "corporate";
  const formLayout = FORM_LAYOUTS.includes((detail?.form_layout ?? "") as FormLayout)
    ? (detail!.form_layout as FormLayout)
    : "stacked";

  function loadInbox() {
    return apiFetch<InboxItem[]>("/api/v1/inbox", {}, getToken()).then(setItems);
  }

  useEffect(() => {
    loadInbox().catch((e) => setError(e instanceof ApiError ? e.detail ?? e.message : "Failed"));
  }, []);

  async function claimTask(requestId: string) {
    setError("");
    const d = await apiFetch<RequestDetail>(
      `/api/v1/requests/${requestId}/claim`,
      { method: "POST" },
      getToken()
    );
    setDetail(d);
    await loadInbox();
  }

  async function openItem(requestId: string) {
    setSelectedId(requestId);
    setMsg("");
    setError("");
    let d = await apiFetch<RequestDetail>(`/api/v1/requests/${requestId}`, {}, getToken());
    if (d.needs_claim) {
      try {
        d = await apiFetch<RequestDetail>(
          `/api/v1/requests/${requestId}/claim`,
          { method: "POST" },
          getToken()
        );
        await loadInbox();
      } catch (e) {
        setError(e instanceof ApiError ? e.detail ?? e.message : "Could not claim task");
      }
    }
    setDetail(d);
    const defn = await apiFetch<{ form_schema?: { fields?: FormField[] } }>(
      `/api/v1/workflows/${d.workflow_definition_id}`,
      {},
      getToken()
    ).catch(() => ({ form_schema: { fields: [] } }));
    setFields(defn.form_schema?.fields || []);
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

  const visibleData = detail ? filterRequestData(detail.request_data) : {};

  return (
    <div>
      <h1 className="wf-page-title mb-4">Approval inbox</h1>
      {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
      {msg && <p className="text-sm text-green-700 mb-2">{msg}</p>}

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 wf-card divide-y">
          {items.length === 0 ? (
            <p className="p-4 text-sm text-slate-500">No pending approvals.</p>
          ) : (
            items.map((item) => (
              <button
                key={item.request_id}
                type="button"
                onClick={() => openItem(item.request_id)}
                className={`w-full text-left p-4 hover:bg-slate-50/80 ${
                  selectedId === item.request_id ? "bg-[rgb(var(--wf-accent-muted))]" : ""
                }`}
              >
                {item.reference_number && (
                  <p className="font-mono text-xs font-semibold text-[rgb(var(--wf-brand-700))]">
                    {item.reference_number}
                  </p>
                )}
                <p className="font-medium">{item.workflow_name}</p>
                <p className="text-xs text-slate-500">
                  {item.originator_name} · {item.step_name}
                </p>
                {item.submitted_at && (
                  <p className="text-[10px] text-slate-400">{formatDateTimeShort(item.submitted_at)}</p>
                )}
                {item.amount_preview && (
                  <p className="text-xs text-slate-400">Amount: {item.amount_preview}</p>
                )}
                {item.needs_claim && (
                  <span className="inline-block mt-1 text-[10px] font-medium text-amber-700 bg-amber-50 px-1.5 rounded">
                    Claim to assign
                  </span>
                )}
              </button>
            ))
          )}
        </div>

        <div className="lg:col-span-2">
          {detail ? (
            <ThemeScope theme={uiTheme}>
              <div className="wf-card p-4 space-y-4">
                <RequestMetaBar
                  referenceNumber={detail.reference_number}
                  workflowName={detail.workflow_name}
                  submittedAt={detail.submitted_at}
                  createdAt={detail.created_at}
                />
                {fields.length > 0 ? (
                  <WorkflowFormRenderer
                    fields={fields}
                    values={Object.fromEntries(
                      Object.entries(visibleData).map(([k, v]) => [k, String(v)])
                    )}
                    onChange={() => {}}
                    layout={formLayout}
                    readOnly
                  />
                ) : (
                  <dl className="text-sm grid grid-cols-2 gap-2">
                    {Object.entries(visibleData).map(([k, v]) => (
                      <div key={k}>
                        <dt className="text-slate-500 capitalize">{k.replace(/_/g, " ")}</dt>
                        <dd>{String(v)}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Comment (optional)"
                  className="wf-input"
                  rows={2}
                />
                {detail.needs_claim && (
                  <button
                    type="button"
                    onClick={() => selectedId && claimTask(selectedId)}
                    className="px-4 py-2 bg-amber-500 text-white text-sm rounded-lg"
                  >
                    Claim this task
                  </button>
                )}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={detail.needs_claim}
                    onClick={() => act("approve")}
                    className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg disabled:opacity-50"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={detail.needs_claim}
                    onClick={() => act("return")}
                    className="px-4 py-2 bg-amber-500 text-white text-sm rounded-lg disabled:opacity-50"
                  >
                    Return
                  </button>
                  <button
                    type="button"
                    disabled={detail.needs_claim}
                    onClick={() => act("reject")}
                    className="px-4 py-2 bg-red-600 text-white text-sm rounded-lg disabled:opacity-50"
                  >
                    Reject
                  </button>
                  <Link to={`/requests/${detail.id}`} className="px-4 py-2 wf-btn-secondary text-sm">
                    Full timeline
                  </Link>
                </div>
              </div>
            </ThemeScope>
          ) : (
            <p className="text-slate-500 text-sm">Select a request to review.</p>
          )}
        </div>
      </div>
    </div>
  );
}
