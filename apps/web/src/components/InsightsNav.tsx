import { Link, useLocation } from "react-router-dom";

const ITEMS = [
  { to: "/analytics", label: "Dashboards" },
  { to: "/reports", label: "Reports" },
] as const;

/** Segmented sub-nav linking the two Insights views (Dashboards and Reports). */
export function InsightsNav() {
  const location = useLocation();
  return (
    <nav className="mb-4 inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-sm">
      {ITEMS.map((item) => {
        const active = location.pathname === item.to;
        return (
          <Link
            key={item.to}
            to={item.to}
            aria-current={active ? "page" : undefined}
            className={`rounded-md px-4 py-1.5 font-medium transition-colors ${
              active
                ? "bg-white text-[rgb(var(--wf-brand-700))] shadow-sm"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
