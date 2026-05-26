import { Link } from "react-router-dom";
import { StatusBadge } from "./StatusBadge";
import { eventLabel } from "../lib/eventLabels";
import { apiDownload, RequestDetail, WorkflowEvent } from "../lib/api";
import { formatDateTimeShort } from "../lib/datetime";
import { getToken } from "../lib/auth";

function whatHappensNext(status: string, assigneeNames: string): string {
  switch (status) {
    case "in_progress":
      return assigneeNames
        ? `Waiting for approval from ${assigneeNames}. You will be notified when the request moves forward.`
        : "Your request is in the approval queue. You will be notified when it moves forward.";
    case "returned":
      return "Your request was sent back for changes. Review the timeline, update the form, and resubmit.";
    case "approved":
      return "This request is complete. No further action is required.";
    case "rejected":
      return "This request was declined. Contact your approver if you need more detail.";
    default:
      return "Track progress here and check notifications for updates.";
  }
}

type RequestStatusPanelProps = {
  request: RequestDetail;
  events: WorkflowEvent[];
};

export function RequestStatusPanel({ request, events }: RequestStatusPanelProps) {
  const assigneeNames =
    request.assignees?.map((a) => a.full_name).filter(Boolean).join(", ") || "";
  const recent = events.slice(-4).reverse();

  async function exportAudit() {
    const ref = request.reference_number?.replace(/[^\w-]/g, "_") || request.id.slice(0, 8);
    await apiDownload(
      `/api/v1/requests/${request.id}/audit-export`,
      `audit-${ref}.csv`,
      getToken()
    );
  }

  return (
    <div className="wf-card p-4 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="font-semibold text-slate-800">Status</h2>
        <StatusBadge status={request.status} />
      </div>

      <dl className="text-sm grid gap-2">
        <div>
          <dt className="text-slate-500">Current step</dt>
          <dd className="font-medium text-slate-800">
            {request.current_step_name ?? (request.status === "in_progress" ? "—" : "Complete")}
          </dd>
        </div>
        {request.status === "in_progress" && assigneeNames && (
          <div>
            <dt className="text-slate-500">Pending with</dt>
            <dd className="text-slate-800">{assigneeNames}</dd>
          </div>
        )}
      </dl>

      <div className="rounded-lg border border-[rgb(var(--wf-card-border))] bg-[rgb(var(--wf-accent-muted))]/50 p-3 text-sm">
        <p className="font-medium text-slate-700 mb-1">What happens next</p>
        <p className="text-slate-600">{whatHappensNext(request.status, assigneeNames)}</p>
      </div>

      {recent.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
            Recent activity
          </p>
          <ul className="space-y-2 text-sm">
            {recent.map((ev) => (
              <li key={ev.id} className="flex gap-2">
                <span className="text-slate-400 shrink-0">{formatDateTimeShort(ev.created_at)}</span>
                <span className="text-slate-700">
                  {eventLabel(ev.event_type, ev.event_label)}
                  {ev.actor_name ? ` · ${ev.actor_name}` : ""}
                </span>
              </li>
            ))}
          </ul>
          {events.length > 4 && (
            <Link to="#timeline" className="text-xs wf-link mt-2 inline-block">
              View full timeline below
            </Link>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => exportAudit().catch(() => {})}
        className="text-sm wf-link font-medium"
      >
        Export audit trail (CSV)
      </button>
    </div>
  );
}
