import { Link } from "react-router-dom";
import { AppThemeSwitcher } from "../components/ThemeSwitcher";
import { useAuth } from "../context/AuthContext";
import { useAppTheme } from "../context/ThemeContext";
import { THEME_META } from "../lib/themes";

export function SettingsPage() {
  const { user } = useAuth();
  const { appTheme } = useAppTheme();
  const meta = THEME_META[appTheme];

  return (
    <div className="max-w-2xl">
      <h1 className="wf-page-title mb-1">Settings</h1>
      <p className="text-sm text-slate-500 mb-8">Manage your workspace preferences.</p>

      <section className="wf-card p-5 mb-6">
        <h2 className="text-sm font-semibold text-slate-800 mb-3">Account</h2>
        <dl className="text-sm space-y-2">
          <div className="flex gap-3">
            <dt className="text-slate-500 w-24 shrink-0">Name</dt>
            <dd className="text-slate-800 font-medium">{user?.full_name ?? "—"}</dd>
          </div>
          <div className="flex gap-3">
            <dt className="text-slate-500 w-24 shrink-0">Email</dt>
            <dd className="text-slate-800">{user?.email ?? "—"}</dd>
          </div>
          <div className="flex gap-3">
            <dt className="text-slate-500 w-24 shrink-0">Company</dt>
            <dd className="text-slate-800">{user?.company_name ?? "—"}</dd>
          </div>
          <div className="flex gap-3">
            <dt className="text-slate-500 w-24 shrink-0">Roles</dt>
            <dd className="text-slate-800">{user?.roles?.join(", ") ?? "—"}</dd>
          </div>
        </dl>
      </section>

      <section className="wf-card p-5 mb-6">
        <h2 className="text-sm font-semibold text-slate-800 mb-1">Interface theme</h2>
        <p className="text-sm text-slate-500 mb-4">
          Changes fonts, navigation style, and home layout across the app. Current:{" "}
          <strong>{meta.label}</strong> — {meta.tagline}.
        </p>
        <AppThemeSwitcher />
      </section>

      <section className="wf-card p-5">
        <h2 className="text-sm font-semibold text-slate-800 mb-1">Workflow appearance</h2>
        <p className="text-sm text-slate-500">
          Per-workflow themes and form layouts are configured on each workflow under{" "}
          <Link to="/workflows" className="wf-link">
            Workflows
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
