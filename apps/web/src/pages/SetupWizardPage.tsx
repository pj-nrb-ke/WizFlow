import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { HelpTip } from "../components/HelpTip";
import { ApiError, getSetupStatus, SetupStatus } from "../lib/api";
import { getToken } from "../lib/auth";
import { useAuth } from "../context/AuthContext";

const STEPS = [
  { id: "welcome", label: "Welcome", link: null },
  { id: "organization", label: "Organization", link: "/admin", field: "organization_complete" as const },
  { id: "users", label: "Users", link: "/admin", field: "users_complete" as const },
  { id: "groups", label: "Groups", link: "/admin", field: "groups_complete" as const },
  { id: "workflows", label: "Workflows", link: "/workflows", field: "workflows_complete" as const },
  { id: "complete", label: "Complete", link: null },
] as const;

export function SetupWizardPage() {
  const { user } = useAuth();
  const isAdmin = user?.roles?.includes("company_admin");
  const [activeStep, setActiveStep] = useState(0);
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isAdmin) return;
    getSetupStatus(getToken())
      .then(setStatus)
      .catch((e) => {
        if (e instanceof ApiError && e.status === 404) {
          setStatus({
            organization_complete: false,
            users_complete: false,
            groups_complete: false,
            workflows_complete: false,
            overall_percent: 0,
          });
        } else {
          setError(e instanceof ApiError ? e.detail ?? e.message : "Could not load setup status");
        }
      });
  }, [isAdmin]);

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  const percent = status?.overall_percent ?? computePercent(status);
  const step = STEPS[activeStep];

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center gap-2 mb-2">
        <h1 className="wf-page-title">Company setup</h1>
        <HelpTip text="Guided checklist for company administrators. Complete each area so your team can submit and approve requests." />
      </div>
      <p className="text-sm text-slate-500 mb-6">
        {user?.company_name ?? "Your workspace"} — {percent}% complete
      </p>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      <nav aria-label="Setup progress" className="mb-8">
        <ol className="flex flex-wrap gap-2 sm:gap-0 sm:justify-between">
          {STEPS.map((s, i) => {
            const field = "field" in s ? s.field : undefined;
            const done =
              field && status
                ? Boolean(status[field])
                : i < activeStep || (i === STEPS.length - 1 && percent >= 100);
            const current = i === activeStep;
            return (
              <li key={s.id} className="flex items-center gap-2 sm:flex-1 sm:flex-col sm:text-center">
                <button
                  type="button"
                  onClick={() => setActiveStep(i)}
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold border-2 transition-colors ${
                    current
                      ? "border-[rgb(var(--wf-brand-600))] bg-[rgb(var(--wf-brand-600))] text-white"
                      : done
                        ? "border-green-600 bg-green-50 text-green-800"
                        : "border-slate-200 bg-white text-slate-500"
                  }`}
                  aria-current={current ? "step" : undefined}
                >
                  {done && !current ? "✓" : i + 1}
                </button>
                <span
                  className={`text-xs font-medium hidden sm:block ${
                    current ? "text-[rgb(var(--wf-brand-700))]" : "text-slate-500"
                  }`}
                >
                  {s.label}
                </span>
              </li>
            );
          })}
        </ol>
        <div className="mt-4 h-2 rounded-full bg-slate-100 overflow-hidden">
          <div
            className="h-full bg-[rgb(var(--wf-brand-600))] transition-all"
            style={{ width: `${percent}%` }}
          />
        </div>
      </nav>

      <div className="wf-card p-6">
        {step.id === "welcome" && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-slate-800">Welcome to WizFlow</h2>
            <p className="text-sm text-slate-600">
              This wizard walks you through the essentials: organization structure, people, groups,
              and live workflows. You can return here anytime from Settings or Admin.
            </p>
            <button
              type="button"
              onClick={() => setActiveStep(1)}
              className="px-4 py-2 wf-btn-primary text-sm"
            >
              Get started
            </button>
          </div>
        )}

        {step.id === "organization" && (
          <StepPanel
            title="Organization"
            body="Configure departments, branches, and roles so requests route to the right people."
            done={status?.organization_complete}
            href="/admin"
            onNext={() => setActiveStep(2)}
            onBack={() => setActiveStep(0)}
          />
        )}

        {step.id === "users" && (
          <StepPanel
            title="Users"
            body="Invite colleagues and assign roles (admin, manager, originator, approver)."
            done={status?.users_complete}
            href="/admin"
            onNext={() => setActiveStep(3)}
            onBack={() => setActiveStep(1)}
          />
        )}

        {step.id === "groups" && (
          <StepPanel
            title="Groups"
            body="Create approval groups (e.g. Finance Committee) for shared inbox queues."
            done={status?.groups_complete}
            href="/admin"
            onNext={() => setActiveStep(4)}
            onBack={() => setActiveStep(2)}
          />
        )}

        {step.id === "workflows" && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-slate-800">Workflows</h2>
            <p className="text-sm text-slate-600">
              Publish at least one workflow, or start from a template library entry.
            </p>
            <div className="flex flex-wrap gap-2">
              <Link to="/workflows" className="px-4 py-2 wf-btn-primary text-sm">
                Open workflows
              </Link>
              <Link to="/templates" className="px-4 py-2 wf-btn-secondary text-sm">
                Browse templates
              </Link>
              <Link to="/ai" className="px-4 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">
                AI creator
              </Link>
            </div>
            {status?.workflows_complete && (
              <p className="text-sm text-green-700">At least one published workflow detected.</p>
            )}
            <StepNav onBack={() => setActiveStep(3)} onNext={() => setActiveStep(5)} />
          </div>
        )}

        {step.id === "complete" && (
          <div className="space-y-4 text-center py-4">
            <p className="text-4xl" aria-hidden>
              ✓
            </p>
            <h2 className="text-lg font-semibold text-slate-800">Setup complete</h2>
            <p className="text-sm text-slate-600">
              Your workspace is ready. Team members can submit requests and managers can use the
              approval inbox.
            </p>
            <div className="flex flex-wrap justify-center gap-2 pt-2">
              <Link to="/" className="px-4 py-2 wf-btn-primary text-sm">
                Go to dashboard
              </Link>
              <Link to="/submit" className="px-4 py-2 wf-btn-secondary text-sm">
                Submit a test request
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function computePercent(status: SetupStatus | null): number {
  if (!status) return 0;
  if (status.overall_percent != null) return status.overall_percent;
  const flags = [
    status.organization_complete,
    status.users_complete,
    status.groups_complete,
    status.workflows_complete,
  ];
  return Math.round((flags.filter(Boolean).length / flags.length) * 100);
}

function StepPanel({
  title,
  body,
  done,
  href,
  onNext,
  onBack,
}: {
  title: string;
  body: string;
  done?: boolean;
  href: string;
  onNext: () => void;
  onBack: () => void;
}) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-slate-800">{title}</h2>
      <p className="text-sm text-slate-600">{body}</p>
      {done && <p className="text-sm text-green-700">This step looks complete.</p>}
      <Link to={href} className="inline-block px-4 py-2 wf-btn-primary text-sm">
        Open admin →
      </Link>
      <StepNav onBack={onBack} onNext={onNext} />
    </div>
  );
}

function StepNav({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  return (
    <div className="flex justify-between pt-4 border-t border-slate-100">
      <button type="button" onClick={onBack} className="text-sm text-slate-600 hover:text-slate-900">
        ← Back
      </button>
      <button type="button" onClick={onNext} className="text-sm wf-link font-medium">
        Continue →
      </button>
    </div>
  );
}
