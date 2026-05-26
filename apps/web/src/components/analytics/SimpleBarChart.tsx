export type BarChartItem = {
  label: string;
  value: number;
  hint?: string;
};

type SimpleBarChartProps = {
  items: BarChartItem[];
  valueFormatter?: (n: number) => string;
  maxItems?: number;
};

/** CSS horizontal bar chart — no external chart library. */
export function SimpleBarChart({
  items,
  valueFormatter = (n) => String(n),
  maxItems = 8,
}: SimpleBarChartProps) {
  const slice = items.slice(0, maxItems);
  const max = Math.max(...slice.map((i) => i.value), 1);

  if (slice.length === 0) {
    return <p className="text-sm text-slate-500 py-4">No data for this period.</p>;
  }

  return (
    <div className="wf-analytics-bar-chart" role="img" aria-label="Bar chart">
      {slice.map((item) => {
        const pct = Math.round((item.value / max) * 100);
        return (
          <div key={item.label} className="wf-analytics-bar-row">
            <div className="wf-analytics-bar-label" title={item.hint ?? item.label}>
              <span className="truncate">{item.label}</span>
              <span className="wf-analytics-bar-value">{valueFormatter(item.value)}</span>
            </div>
            <div className="wf-analytics-bar-track">
              <div className="wf-analytics-bar-fill" style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
