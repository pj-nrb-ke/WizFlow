import { Link } from "react-router-dom";

type KpiCardProps = {
  label: string;
  value: string | number;
  deltaHint?: string;
  to?: string;
  subdued?: boolean;
};

/** KPI tile with monospace value and optional drill-down link. */
export function KpiCard({ label, value, deltaHint, to, subdued }: KpiCardProps) {
  const inner = (
    <>
      <p className="wf-analytics-kpi-label">{label}</p>
      <p className={`wf-analytics-kpi-value${subdued ? " wf-analytics-kpi-value--subdued" : ""}`}>
        {value}
      </p>
      {deltaHint && <p className="wf-analytics-kpi-delta">{deltaHint}</p>}
      {to && <span className="wf-analytics-kpi-link">View details →</span>}
    </>
  );

  if (to) {
    return (
      <Link to={to} className="wf-analytics-kpi-card wf-analytics-kpi-card--link">
        {inner}
      </Link>
    );
  }

  return <div className="wf-analytics-kpi-card">{inner}</div>;
}
