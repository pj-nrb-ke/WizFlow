import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ColorSchemeSwitcher } from "../components/ColorSchemeSwitcher";
import { AppThemeSwitcher } from "../components/ThemeSwitcher";
import { HelpTip } from "../components/HelpTip";
import { useAuth } from "../context/AuthContext";
import { useAppTheme } from "../context/ThemeContext";
import {
  ApiError,
  apiFetch,
  createDelegation,
  getCompanyBranding,
  getCompanySettings,
  listDelegations,
  OrgDirectory,
  patchCompanyBranding,
  patchCompanySettings,
  patchNotificationPreferences,
  revokeDelegation,
  type Delegation,
} from "../lib/api";
import { getToken } from "../lib/auth";
import { THEME_META } from "../lib/themes";

export function SettingsPage() {
  const { user, refreshUser } = useAuth();
  const { appTheme } = useAppTheme();
  const meta = THEME_META[appTheme];
  const isAdmin = user?.roles?.includes("company_admin");

  const [emailEnabled, setEmailEnabled] = useState(true);
  const [inAppEnabled, setInAppEnabled] = useState(true);
  const [pushEnabled, setPushEnabled] = useState(true);
  const [whatsappEnabled, setWhatsappEnabled] = useState(false);
  const [logoUrl, setLogoUrl] = useState("");
  const [brandColor, setBrandColor] = useState("#1d4ed8");
  const [retentionDays, setRetentionDays] = useState("365");
  const [delegations, setDelegations] = useState<Delegation[]>([]);
  const [directory, setDirectory] = useState<OrgDirectory | null>(null);
  const [delegateId, setDelegateId] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [prefsMsg, setPrefsMsg] = useState("");
  const [brandMsg, setBrandMsg] = useState("");
  const [delegMsg, setDelegMsg] = useState("");
  const [retentionMsg, setRetentionMsg] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const token = getToken();
    const prefs = user?.notification_preferences;
    if (prefs) {
      setEmailEnabled(prefs.email);
      setInAppEnabled(prefs.in_app);
      setPushEnabled(prefs.push !== false);
      setWhatsappEnabled(!!prefs.whatsapp);
    } else {
      refreshUser().catch(() => {});
    }
    listDelegations(token)
      .then(setDelegations)
      .catch(() => {});
    apiFetch<OrgDirectory>("/api/v1/workflows/org-directory", {}, token)
      .then(setDirectory)
      .catch(() => {});
    if (isAdmin) {
      getCompanyBranding(token)
        .then((b) => {
          setLogoUrl(b.logo_url ?? "");
          setBrandColor(b.brand_color ?? "#1d4ed8");
        })
        .catch(() => {});
      getCompanySettings(token)
        .then((s) => {
          if (s.data_retention_days != null) setRetentionDays(String(s.data_retention_days));
        })
        .catch(() => {});
    }
  }, [isAdmin, user?.notification_preferences, refreshUser]);

  async function savePreferences(e: FormEvent) {
    e.preventDefault();
    setPrefsMsg("");
    setError("");
    try {
      await patchNotificationPreferences(
        {
          email: emailEnabled,
          in_app: inAppEnabled,
          push: pushEnabled,
          whatsapp: whatsappEnabled,
        },
        getToken()
      );
      await refreshUser();
      setPrefsMsg("Notification preferences saved.");
    } catch (err) {
      setError(err instanceof ApiError ? err.detail ?? err.message : "Could not save preferences");
    }
  }

  async function saveBranding(e: FormEvent) {
    e.preventDefault();
    setBrandMsg("");
    setError("");
    try {
      await patchCompanyBranding(
        {
          logo_url: logoUrl.trim() || null,
          brand_color: brandColor.trim() || null,
        },
        getToken()
      );
      await refreshUser();
      setBrandMsg("Workspace branding updated.");
    } catch (err) {
      setError(err instanceof ApiError ? err.detail ?? err.message : "Could not save branding");
    }
  }

  async function saveRetention(e: FormEvent) {
    e.preventDefault();
    setRetentionMsg("");
    setError("");
    const days = Number(retentionDays);
    if (!Number.isFinite(days) || days < 30) {
      setError("Retention must be at least 30 days.");
      return;
    }
    try {
      await patchCompanySettings({ data_retention_days: days }, getToken());
      setRetentionMsg("Data retention policy saved.");
    } catch (err) {
      setError(err instanceof ApiError ? err.detail ?? err.message : "Could not save retention");
    }
  }

  async function addDelegation(e: FormEvent) {
    e.preventDefault();
    setDelegMsg("");
    setError("");
    if (!delegateId || !startsAt || !endsAt) return;
    try {
      await createDelegation(
        {
          delegate_user_id: delegateId,
          starts_at: new Date(startsAt).toISOString(),
          ends_at: new Date(endsAt).toISOString(),
        },
        getToken()
      );
      setDelegateId("");
      setStartsAt("");
      setEndsAt("");
      setDelegations(await listDelegations(getToken()));
      setDelegMsg("Delegation added.");
    } catch (err) {
      setError(err instanceof ApiError ? err.detail ?? err.message : "Could not add delegation");
    }
  }

  async function removeDelegation(id: string) {
    try {
      await revokeDelegation(id, getToken());
      setDelegations(await listDelegations(getToken()));
    } catch (err) {
      setError(err instanceof ApiError ? err.detail ?? err.message : "Could not revoke");
    }
  }

  const colleagues = (directory?.users ?? []).filter((u) => u.id !== user?.id);

  const initials = (user?.full_name ?? "?")
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="max-w-5xl">
      <h1 className="wf-page-title mb-1">Settings</h1>
      <p className="text-sm text-slate-500 mb-6">Manage your account, notifications, and workspace preferences.</p>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      <div className="grid items-start gap-6 lg:grid-cols-3">
        <aside className="space-y-6 lg:sticky lg:top-6">
          <section className="wf-card p-5">
            <div className="flex items-center gap-3 mb-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--wf-accent-muted))] text-base font-semibold text-[rgb(var(--wf-brand-700))]">
                {initials}
              </span>
              <div className="min-w-0">
                <p className="truncate font-semibold text-slate-800">{user?.full_name ?? "—"}</p>
                <p className="truncate text-xs text-slate-500">{user?.email ?? "—"}</p>
              </div>
            </div>
            <dl className="text-sm space-y-2 border-t border-slate-100 pt-3">
              <div className="flex gap-3">
                <dt className="text-slate-500 w-20 shrink-0">Company</dt>
                <dd className="text-slate-800">{user?.company_name ?? "—"}</dd>
              </div>
              <div className="flex gap-3">
                <dt className="text-slate-500 w-20 shrink-0">Roles</dt>
                <dd className="flex flex-wrap gap-1">
                  {user?.roles?.length
                    ? user.roles.map((r) => (
                        <span key={r} className="wf-badge">
                          {r.replace(/_/g, " ")}
                        </span>
                      ))
                    : "—"}
                </dd>
              </div>
            </dl>
          </section>

          <section className="wf-card p-5">
            <h2 className="text-sm font-semibold text-slate-800 mb-3">Quick links</h2>
            <ul className="space-y-2 text-sm">
              <li>
                <Link to="/notifications" className="wf-link">
                  Notification history →
                </Link>
              </li>
              <li>
                <Link to="/workflows" className="wf-link">
                  Workflow appearance →
                </Link>
              </li>
              {isAdmin && (
                <li>
                  <Link to="/setup" className="wf-link">
                    Company setup wizard →
                  </Link>
                </li>
              )}
            </ul>
          </section>
        </aside>

        <div className="lg:col-span-2 space-y-6">

      <section className="wf-card p-5">
        <div className="flex items-center gap-2 mb-1">
          <h2 className="text-sm font-semibold text-slate-800">Notification preferences</h2>
          <HelpTip text="Choose how WizFlow reaches you — in-app, email, mobile push, and WhatsApp when enabled for your company." />
        </div>
        <form onSubmit={savePreferences} className="space-y-3 mt-4">
          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={inAppEnabled}
              onChange={(e) => setInAppEnabled(e.target.checked)}
              className="rounded border-slate-300"
            />
            In-app notifications
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={emailEnabled}
              onChange={(e) => setEmailEnabled(e.target.checked)}
              className="rounded border-slate-300"
            />
            Email notifications
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={pushEnabled}
              onChange={(e) => setPushEnabled(e.target.checked)}
              className="rounded border-slate-300"
            />
            Push notifications (mobile)
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={whatsappEnabled}
              onChange={(e) => setWhatsappEnabled(e.target.checked)}
              className="rounded border-slate-300"
            />
            WhatsApp notifications
          </label>
          <button type="submit" className="px-4 py-2 wf-btn-primary text-sm">
            Save preferences
          </button>
          {prefsMsg && <p className="text-sm text-green-700">{prefsMsg}</p>}
        </form>
      </section>

      <section className="wf-card p-5">
        <div className="flex items-center gap-2 mb-1">
          <h2 className="text-sm font-semibold text-slate-800">Approval delegations</h2>
          <HelpTip text="When you are away, delegate your approval authority to a colleague for a date range. They can act on items assigned to you during that period." />
        </div>
        {delegations.length > 0 && (
          <ul className="text-sm divide-y mb-4 mt-3">
            {delegations.map((d) => (
              <li key={d.id} className="py-2 flex justify-between gap-2">
                <span>
                  <strong>{d.delegate_name}</strong>
                  <span className="text-slate-500 block text-xs">
                    {new Date(d.starts_at).toLocaleDateString()} –{" "}
                    {new Date(d.ends_at).toLocaleDateString()}
                  </span>
                </span>
                <button
                  type="button"
                  className="text-xs text-red-600 hover:underline shrink-0"
                  onClick={() => removeDelegation(d.id)}
                >
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={addDelegation} className="space-y-3">
          <label className="block text-sm">
            <span className="text-slate-600">Delegate to</span>
            <select
              className="wf-input mt-1 w-full"
              value={delegateId}
              onChange={(e) => setDelegateId(e.target.value)}
              required
            >
              <option value="">— Select colleague —</option>
              {colleagues.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.full_name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap gap-3">
            <label className="text-sm">
              <span className="text-slate-600">Starts</span>
              <input
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                className="wf-input block mt-1"
                required
              />
            </label>
            <label className="text-sm">
              <span className="text-slate-600">Ends</span>
              <input
                type="datetime-local"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                className="wf-input block mt-1"
                required
              />
            </label>
          </div>
          <button type="submit" className="px-4 py-2 wf-btn-secondary text-sm">
            Add delegation
          </button>
          {delegMsg && <p className="text-sm text-green-700">{delegMsg}</p>}
        </form>
      </section>

      {isAdmin && (
        <>
          <section className="wf-card p-5">
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-sm font-semibold text-slate-800">Workspace branding</h2>
              <HelpTip text="Set a logo URL and accent color for your company workspace. Shown in the header when configured." />
            </div>
            <form onSubmit={saveBranding} className="space-y-3 mt-4">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Logo URL</label>
                <input
                  type="url"
                  value={logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                  placeholder="https://…/logo.png"
                  className="wf-input w-full"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Brand color</label>
                <div className="flex gap-2 items-center">
                  <input
                    type="color"
                    value={brandColor}
                    onChange={(e) => setBrandColor(e.target.value)}
                    className="h-10 w-14 rounded border border-slate-200 cursor-pointer"
                  />
                  <input
                    type="text"
                    value={brandColor}
                    onChange={(e) => setBrandColor(e.target.value)}
                    className="wf-input flex-1 font-mono text-sm"
                  />
                </div>
              </div>
              <button type="submit" className="px-4 py-2 wf-btn-primary text-sm">
                Save branding
              </button>
              {brandMsg && <p className="text-sm text-green-700">{brandMsg}</p>}
            </form>
          </section>

          <section className="wf-card p-5">
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-sm font-semibold text-slate-800">Data retention</h2>
              <HelpTip text="How long completed requests and audit data are kept before archival. Minimum 30 days." />
            </div>
            <form onSubmit={saveRetention} className="space-y-3 mt-4">
              <label className="block text-sm">
                <span className="text-slate-600">Retention period (days)</span>
                <input
                  type="number"
                  min={30}
                  max={3650}
                  value={retentionDays}
                  onChange={(e) => setRetentionDays(e.target.value)}
                  className="wf-input mt-1 w-32"
                />
              </label>
              <button type="submit" className="px-4 py-2 wf-btn-primary text-sm">
                Save retention policy
              </button>
              {retentionMsg && <p className="text-sm text-green-700">{retentionMsg}</p>}
            </form>
          </section>
        </>
      )}

      <section className="wf-card p-5">
        <h2 className="text-sm font-semibold text-slate-800 mb-1">Interface theme</h2>
        <p className="text-sm text-slate-500 mb-4">
          Changes fonts, navigation style, and home layout across the app. Current:{" "}
          <strong>{meta.label}</strong> — {meta.tagline}.
        </p>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mt-4 mb-2">
          Light / dark
        </h3>
        <ColorSchemeSwitcher />
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mt-6 mb-2">
          Brand theme
        </h3>
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
        {isAdmin && (
          <p className="text-xs text-slate-500 mt-4">
            <Link to="/setup" className="wf-link">
              Open company setup wizard →
            </Link>
          </p>
        )}
      </section>
        </div>
      </div>
    </div>
  );
}
