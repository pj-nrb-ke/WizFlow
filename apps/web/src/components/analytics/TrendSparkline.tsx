import type { TrendPoint } from "../../lib/api";

type TrendSparklineProps = {
  points: TrendPoint[];
  width?: number;
  height?: number;
};

/** Minimal SVG line sparkline for volume trends. */
export function TrendSparkline({ points, width = 280, height = 56 }: TrendSparklineProps) {
  if (!points.length) {
    return (
      <p className="text-sm text-slate-500 py-2">No trend data yet.</p>
    );
  }

  const values = points.map((p) => p.count);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const pad = 4;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;

  const coords = points.map((p, i) => {
    const x = pad + (points.length <= 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
    const y = pad + innerH - ((p.count - min) / range) * innerH;
    return { x, y };
  });

  const linePath = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${coords[coords.length - 1].x.toFixed(1)},${(pad + innerH).toFixed(1)} L${coords[0].x.toFixed(1)},${(pad + innerH).toFixed(1)} Z`;

  return (
    <svg
      className="wf-analytics-sparkline"
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      aria-hidden
    >
      <path className="wf-analytics-sparkline-area" d={areaPath} />
      <path className="wf-analytics-sparkline-line" d={linePath} fill="none" />
      {coords.map((c, i) => (
        <circle
          key={points[i].date}
          className="wf-analytics-sparkline-dot"
          cx={c.x}
          cy={c.y}
          r={points.length > 20 ? 0 : 2}
        />
      ))}
    </svg>
  );
}
