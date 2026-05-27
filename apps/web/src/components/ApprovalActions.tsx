import { Link } from "react-router-dom";

type Props = {
  needsClaim: boolean;
  canApprove: boolean;
  busy?: boolean;
  onClaim?: () => void;
  onApprove: () => void;
  onReject: () => void;
  showReturn?: boolean;
  onReturn?: () => void;
  requestId?: string;
};

/** Approve / Reject bar for approvers (hidden from initiator). */
export function ApprovalActions({
  needsClaim,
  canApprove,
  busy = false,
  onClaim,
  onApprove,
  onReject,
  showReturn = false,
  onReturn,
  requestId,
}: Props) {
  return (
    <div className="border-t border-slate-200 pt-4 mt-4 space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Approval decision</p>
      {needsClaim && onClaim && (
        <button
          type="button"
          disabled={busy}
          onClick={onClaim}
          className="px-4 py-2 bg-amber-500 text-white text-sm font-medium rounded-lg disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700"
        >
          Claim this task
        </button>
      )}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={!canApprove || needsClaim || busy}
          onClick={onApprove}
          className="px-6 py-2.5 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50 uppercase tracking-wide focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-800"
        >
          Approve
        </button>
        <button
          type="button"
          disabled={!canApprove || needsClaim || busy}
          onClick={onReject}
          className="px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50 uppercase tracking-wide focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-800"
        >
          Reject
        </button>
        {showReturn && onReturn && (
          <button
            type="button"
            disabled={!canApprove || needsClaim || busy}
            onClick={onReturn}
            className="px-4 py-2 bg-amber-500 text-white text-sm rounded-lg disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700"
          >
            Return
          </button>
        )}
        {requestId && (
          <Link to={`/requests/${requestId}`} className="px-4 py-2 wf-btn-secondary text-sm self-center">
            Full timeline
          </Link>
        )}
      </div>
    </div>
  );
}
