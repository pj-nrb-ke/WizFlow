import { FormEvent, useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ThemeScope } from "../context/ThemeContext";
import { ApprovalActions } from "../components/ApprovalActions";
import { RequestMetaBar } from "../components/RequestMetaBar";
import { RequestStatusPanel } from "../components/RequestStatusPanel";
import { StatusBadge } from "../components/StatusBadge";
import { eventLabel } from "../lib/eventLabels";
import { WorkflowFormRenderer } from "../components/WorkflowFormRenderer";
import { ApiError, apiFetch, FormField, RequestDetail, WorkflowEvent } from "../lib/api";
import { getToken } from "../lib/auth";
import {
  formToPayload,
  getFormFields,
  validateFormClient,
} from "../lib/formValidation";
import { useAuth } from "../context/AuthContext";
import {
  APP_THEMES,
  filterRequestData,
  FORM_LAYOUTS,
  LAYOUT_META,
  THEME_META,
  type AppTheme,
  type FormLayout,
} from "../lib/themes";

export function RequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [request, setRequest] = useState<RequestDetail | null>(null);
  const [fields, setFields] = useState<FormField[]>([]);
  const [events, setEvents] = useState<WorkflowEvent[]>([]);
  const [error, setError] = useState("");
  const [resubmitData, setResubmitData] = useState<Record<string, string>>({});

  const ui: { ui_theme: AppTheme; form_layout: FormLayout } = {
    ui_theme: APP_THEMES.includes((request?.ui_theme ?? "") as AppTheme)
      ? (request!.ui_theme as AppTheme)
      : "corporate",
    form_layout: FORM_LAYOUTS.includes((request?.form_layout ?? "") as FormLayout)
      ? (request!.form_layout as FormLayout)
      : "stacked",
  };

  const load = useCallback(async () => {
    if (!id) return;
    const req = await apiFetch<RequestDetail>(`/api/v1/requests/${id}`, {}, getToken());
    const [ev, defn] = await Promise.all([
      apiFetch<WorkflowEvent[]>(`/api/v1/requests/${id}/events`, {}, getToken()),
      apiFetch<{ form_schema?: { fields?: FormField[] } }>(
        `/api/v1/workflows/${req.workflow_definition_id}`,
        {},
        getToken()
      ).catch(() => ({ form_schema: { fields: [] } })),
    ]);
    setRequest(req);
    setEvents(ev);
    setFields(getFormFields(defn.form_schema));
    const visible = filterRequestData(req.request_data);
    const data: Record<string, string> = {};
    for (const [k, v] of Object.entries(visible)) {
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
    setError("");
    const clientErr = validateFormClient(fields, resubmitData);
    if (clientErr) {
      setError(clientErr);
      return;
    }
    const data = formToPayload(fields, resubmitData);
    try {
      await apiFetch(
        `/api/v1/requests/${id}`,
        { method: "PATCH", body: JSON.stringify({ data }) },
        getToken()
      );
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.detail ?? err.message : "Resubmit failed");
    }
  }

  if (!request) return <p className="text-slate-500">Loading…</p>;

  const isOriginator = user?.id === request.originator_user_id;
  const visibleData = filterRequestData(request.request_data);

  async function approvalAction(action: "approve" | "reject") {
    if (!id) return;
    setError("");
    try {
      await apiFetch(
        `/api/v1/requests/${id}/${action}`,
        { method: "POST", body: JSON.stringify({ comment: "" }) },
        getToken()
      );
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.detail ?? err.message : "Action failed");
    }
  }

  return (
    <ThemeScope theme={ui.ui_theme} layout={ui.form_layout}>
      <div>
        <Link to="/requests" className="text-sm wf-link mb-4 inline-block">
          ← My requests
        </Link>
        <RequestMetaBar
          referenceNumber={request.reference_number}
          workflowName={request.workflow_name}
          submittedAt={request.submitted_at}
          createdAt={request.created_at}
        />
        <div className="flex flex-wrap items-center gap-3 mb-1">
          <h1 className="wf-page-title">{request.workflow_name}</h1>
          <StatusBadge status={request.status} />
        </div>
        <p className="text-sm text-slate-500 mb-2">
          {request.current_step_name && `Step: ${request.current_step_name} · `}
          <span className="wf-badge">{THEME_META[ui.ui_theme].label}</span>
          <span className="text-xs text-slate-400 ml-2">{LAYOUT_META[ui.form_layout].label}</span>
        </p>
        {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

        {request.status === "returned" && isOriginator && (
          <div
            className="mb-6 rounded-xl border-2 border-amber-400 bg-amber-50 px-5 py-4"
            role="alert"
          >
            <h2 className="text-lg font-bold text-amber-950">Action required</h2>
            <p className="text-sm text-amber-900 mt-1">
              This request was returned for correction. Update the highlighted fields below and
              resubmit to continue approval.
            </p>
          </div>
        )}

        <div className="grid lg:grid-cols-2 gap-6">
          <div
            className={`wf-card p-4 ${
              request.status === "returned" && isOriginator
                ? "ring-2 ring-amber-400 ring-offset-2"
                : ""
            }`}
          >
            <h2 className="font-semibold mb-3">Request data</h2>
            {fields.length > 0 ? (
              <WorkflowFormRenderer
                fields={fields}
                values={Object.fromEntries(
                  Object.entries(visibleData).map(([k, v]) => [k, String(v)])
                )}
                onChange={() => {}}
                layout={ui.form_layout}
                readOnly
              />
            ) : (
              <dl className="text-sm space-y-2">
                {Object.entries(visibleData).map(([k, v]) => (
                  <div key={k} className="flex gap-2">
                    <dt className="text-slate-500 capitalize w-28">{k.replace(/_/g, " ")}</dt>
                    <dd className="text-slate-800">{String(v)}</dd>
                  </div>
                ))}
              </dl>
            )}
            {request.status === "in_progress" && request.can_approve && (
              <ApprovalActions
                needsClaim={!!request.needs_claim}
                canApprove={!!request.can_approve}
                onApprove={() => approvalAction("approve")}
                onReject={() => approvalAction("reject")}
              />
            )}
            {request.status === "returned" && isOriginator && (
              <form
                onSubmit={resubmit}
                className="mt-4 space-y-4 border-t border-amber-200 pt-4 bg-amber-50/60 -mx-4 px-4 pb-4 rounded-b-lg"
              >
                <p className="text-sm font-semibold text-amber-950">Resubmit after edits</p>
                <WorkflowFormRenderer
                  fields={fields}
                  values={resubmitData}
                  onChange={(key, value) => setResubmitData({ ...resubmitData, [key]: value })}
                  layout={ui.form_layout}
                />
                <button type="submit" className="px-4 py-2 wf-btn-primary text-sm">
                  Resubmit
                </button>
              </form>
            )}
          </div>

          <div className="space-y-6">
            <RequestStatusPanel request={request} events={events} />

            <div id="timeline" className="wf-card p-4">
            <h2 className="font-semibold mb-3">Timeline</h2>
            <ul className="space-y-3 text-sm">
              {events.map((ev) => (
                <li key={ev.id} className="border-l-2 wf-timeline-border pl-3">
                  <p className="font-medium text-slate-800">
                    {eventLabel(ev.event_type, ev.event_label)}
                  </p>
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
      </div>
    </ThemeScope>
  );
}
