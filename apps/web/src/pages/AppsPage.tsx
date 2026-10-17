import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError, getLauncher, type Launcher, type SuiteProcess } from "../lib/api";
import { getToken } from "../lib/auth";

function ProcessCard({ p, onOpen }: { p: SuiteProcess; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="wf-action-tile text-left">
      <span className="text-sm font-semibold text-slate-800">{p.name}</span>
      {p.description && (
        <span className="text-xs text-slate-500 line-clamp-2">{p.description}</span>
      )}
      <span className="mt-auto inline-flex items-center gap-1 text-xs font-medium text-[rgb(var(--wf-brand-600))]">
        Start request
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </span>
    </button>
  );
}

export function AppsPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<Launcher | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    getLauncher(getToken())
      .then(setData)
      .catch((e) =>
        setError(e instanceof ApiError ? e.detail ?? e.message : "Failed to load applications")
      )
      .finally(() => setLoading(false));
  }, []);

  const open = (p: SuiteProcess) => {
    if (p.workflow_id) navigate(`/submit?wf=${p.workflow_id}`);
  };

  const isEmpty =
    !!data && data.suites.length === 0 && data.ungrouped.length === 0;

  return (
    <div>
      <div className="wf-page-header">
        <div>
          <h1 className="wf-page-title">Apps</h1>
          <p className="wf-page-subtitle">
            Pick an application, then start the request you need.
          </p>
        </div>
      </div>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      {loading ? (
        <p className="text-slate-500 py-12 text-center">Loading applications…</p>
      ) : isEmpty ? (
        <div className="wf-card p-10 text-center">
          <p className="font-semibold text-slate-800">Nothing to launch yet</p>
          <p className="mt-1 text-sm text-slate-500 max-w-sm mx-auto">
            Once an administrator publishes processes and groups them into a suite, they’ll appear
            here. You can still start any request from “New request”.
          </p>
          <button type="button" className="wf-btn-secondary mt-4" onClick={() => navigate("/submit")}>
            New request
          </button>
        </div>
      ) : (
        <div className="space-y-8">
          {data!.suites.map((s) => (
            <section key={s.id}>
              <div className="flex items-center gap-3 mb-3">
                <span
                  className="flex h-10 w-10 items-center justify-center rounded-xl text-xl shrink-0"
                  style={{ background: s.accent ? `${s.accent}22` : "rgb(var(--wf-accent-muted))" }}
                >
                  {s.icon || "🗂️"}
                </span>
                <div className="min-w-0">
                  <h2 className="font-semibold text-slate-800 leading-tight">{s.name}</h2>
                  {s.description && (
                    <p className="text-sm text-slate-500 truncate">{s.description}</p>
                  )}
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {s.processes.map((p) => (
                  <ProcessCard key={p.family_id} p={p} onOpen={() => open(p)} />
                ))}
              </div>
            </section>
          ))}

          {data!.ungrouped.length > 0 && (
            <section>
              <div className="flex items-center gap-3 mb-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl text-xl shrink-0 bg-[rgb(var(--wf-accent-muted))]">
                  📋
                </span>
                <div>
                  <h2 className="font-semibold text-slate-800 leading-tight">Other requests</h2>
                  <p className="text-sm text-slate-500">Not yet grouped into a suite.</p>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {data!.ungrouped.map((p) => (
                  <ProcessCard key={p.family_id} p={p} onOpen={() => open(p)} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
