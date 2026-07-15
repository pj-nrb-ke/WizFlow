import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiError } from "../lib/api";
import * as auth from "../lib/auth";
import { useAuth } from "../context/AuthContext";

export function LoginPage() {
  const navigate = useNavigate();
  const { refreshUser } = useAuth();
  const [email, setEmail] = useState("admin@demo.wizflow.biz");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [needsCode, setNeedsCode] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await auth.login(email, password, needsCode ? code.trim() : undefined);
      await refreshUser();
      navigate("/");
    } catch (err) {
      if (err instanceof ApiError && err.detail === "two_factor_required") {
        setNeedsCode(true);
        setError("");
      } else if (err instanceof ApiError && err.detail === "invalid_code") {
        setNeedsCode(true);
        setError("Incorrect code, try again");
      } else {
        setError(err instanceof ApiError ? err.detail ?? err.message : "Login failed");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-[rgb(var(--wf-page-bg))]">
      <div className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <div className="wf-home-hero mb-6 text-center">
            <img
              src="/mark.svg"
              alt="WizFlow"
              width={56}
              height={56}
              className="mx-auto mb-3 h-14 w-14"
            />
            <h1 className="!text-3xl">WizFlow</h1>
            <p className="!mx-auto">Workflow automation for your team</p>
          </div>
          <div className="wf-card p-8">
            <h2 className="wf-page-title text-xl mb-1">Sign in</h2>
            <p className="text-sm text-slate-500 mb-6">Demo workspace</p>
            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1" htmlFor="email">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="wf-input"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1" htmlFor="password">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="changeme"
                  className="wf-input"
                />
              </div>
              {needsCode && (
                <div>
                  <label
                    className="block text-sm font-medium text-slate-700 mb-1"
                    htmlFor="code"
                  >
                    Authentication code
                  </label>
                  <input
                    id="code"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    autoFocus
                    required
                    maxLength={6}
                    pattern="[0-9]{6}"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                    placeholder="123456"
                    className="wf-input tracking-[0.4em] font-mono"
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    Enter the 6-digit code from your authenticator app.
                  </p>
                </div>
              )}
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button type="submit" disabled={submitting} className="w-full wf-btn-primary py-2.5 text-sm">
                {submitting ? "Signing in…" : needsCode ? "Verify & sign in" : "Sign in"}
              </button>
            </form>
            <p className="mt-4 text-center text-sm">
              <Link to="/forgot-password" className="text-[rgb(var(--wf-brand-600))] hover:underline">
                Forgot your password?
              </Link>
            </p>
            <p className="mt-4 text-xs text-slate-400 text-center">
              admin@demo.wizflow.biz / changeme
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
