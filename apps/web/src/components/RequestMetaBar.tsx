import { useEffect, useState } from "react";
import { formatDateTime } from "../lib/datetime";

type Props = {
  referenceNumber?: string | null;
  workflowName: string;
  submittedAt?: string | null;
  createdAt?: string | null;
  compact?: boolean;
};

export function RequestMetaBar({
  referenceNumber,
  workflowName,
  submittedAt,
  createdAt,
  compact = false,
}: Props) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const generated = submittedAt || createdAt;

  if (compact) {
    return (
      <div className="text-xs text-slate-500 space-y-0.5">
        {referenceNumber && (
          <p className="font-mono font-semibold text-slate-700">{referenceNumber}</p>
        )}
        {generated && <p>Submitted {formatDateTime(generated)}</p>}
      </div>
    );
  }

  return (
    <div className="wf-card-accent rounded-lg p-3 mb-4 text-sm border border-slate-200/80">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {referenceNumber ? (
            <p className="font-mono text-lg font-bold text-[rgb(var(--wf-brand-700))] tracking-tight">
              {referenceNumber}
            </p>
          ) : (
            <p className="text-slate-400 italic">Reference pending</p>
          )}
          <p className="text-slate-600 mt-0.5">{workflowName}</p>
        </div>
        <div className="text-right text-xs text-slate-500 space-y-1 min-w-[200px]">
          <p>
            <span className="text-slate-400">Request generated:</span>
            <br />
            <span className="font-medium text-slate-700">{formatDateTime(generated)}</span>
          </p>
          <p>
            <span className="text-slate-400">Current time:</span>
            <br />
            <span className="font-medium text-slate-700">{formatDateTime(now.toISOString())}</span>
          </p>
        </div>
      </div>
    </div>
  );
}
