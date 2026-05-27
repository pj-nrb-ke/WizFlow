/** Lightweight skeleton placeholders for list/detail loading states. */
export function LoadingSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="animate-pulse space-y-3" aria-busy="true" aria-label="Loading">
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="h-4 rounded bg-slate-200 dark:bg-slate-700"
          style={{ width: `${85 - i * 12}%` }}
        />
      ))}
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="wf-card p-4 animate-pulse space-y-3" aria-busy="true">
      <div className="h-5 w-1/3 rounded bg-slate-200 dark:bg-slate-700" />
      <div className="h-4 w-full rounded bg-slate-100 dark:bg-slate-800" />
      <div className="h-4 w-2/3 rounded bg-slate-100 dark:bg-slate-800" />
    </div>
  );
}
