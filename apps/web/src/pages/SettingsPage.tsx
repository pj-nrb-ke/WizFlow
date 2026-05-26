import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AppThemeSwitcher } from "../components/ThemeSwitcher";
import { HelpTip } from "../components/HelpTip";
import { useAuth } from "../context/AuthContext";
import { useAppTheme } from "../context/ThemeContext";
import {
  ApiError,
  getCompanyBranding,
  getUserPreferences,
  patchCompanyBranding,
  patchUserPreferences,
} from "../lib/api";
import { getToken } from "../lib/auth";
import { THEME_META } from "../lib/themes";

export function SettingsPage() {
  const { user } = useAuth();
  const { appTheme } = useAppTheme();
  const meta = THEME_META[appTheme];
  const isAdmin = user?.roles?.includes("company_admin");

  const [emailEnabled, setEmailEnabled] = useState(true);
  const [inAppEnabled, setInAppEnabled] = useState(true);
  const [logoUrl, setLogoUrl] = useState("");
  const [brandColor, setBrandColor] = useState("#1d4ed8");
  const [prefsMsg, setPrefsMsg] = useState("");
  const [brandMsg, setBrandMsg] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const token = getToken();
    getUserPreferences(token)
      .then((p) => {
        setEmailEnabled(p.email_enabled);
        setInAppEnabled(p.in_app_enabled);
      })
      .catch(() => {});
    if (isAdmin) {
      getCompanyBranding(token)
        .then((b) => {
          setLogoUrl(b.logo_url ?? "");
          setBrandColor(b.brand_color ?? "#1d4ed8");
        })
        .catch(() => {});
    }
  }, [isAdmin]);

  async function savePreferences(e: FormEvent) {
    e.preventDefault();
    setPrefsMsg("");
    setError("");
    try {
      await patchUserPreferences(
        { email_enabled: emailEnabled, in_app_enabled: inAppEnabled },
        getToken()
      );
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
      setBrandMsg("Workspace branding updated.");
    } catch (err) {
      setError(err instanceof ApiError ? err.detail ?? err.message : "Could not save branding");
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="wf-page-title mb-1">Settings</h1>
      <p className="text-sm text-slate-500 mb-8">Manage your workspace preferences.</p>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

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
        <div className="flex items-center gap-2 mb-1">
          <h2 className="text-sm font-semibold text-slate-800">Notification preferences</h2>
          <HelpTip text="Choose how WizFlow reaches you. In-app alerts appear in the notification center; email sends copies to your login address when enabled." />
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
          <button type="submit" className="px-4 py-2 wf-btn-primary text-sm">
            Save preferences
          </button>
          {prefsMsg && <p className="text-sm text-green-700">{prefsMsg}</p>}
        </form>
      </section>

      {isAdmin && (
        <section className="wf-card p-5 mb-6">
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-sm font-semibold text-slate-800">Workspace branding</h2>
            <HelpTip text="Set a logo URL and accent color for your company workspace. Shown in headers and customer-facing views when supported." />
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
          <p className="text-xs text-slate-500 mt-4">
            <Link to="/setup" className="wf-link">
              Open company setup wizard →
            </Link>
          </p>
        </section>
      )}

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
