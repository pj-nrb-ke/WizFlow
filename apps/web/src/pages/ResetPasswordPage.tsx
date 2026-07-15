import { FormEvent, ReactNode, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ApiError } from "../lib/api";
import * as auth from "../lib/auth";

/** Module-level shell so re-renders don't remount the inputs (which would drop focus). */
function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-[rgb(var(--wf-page-bg))]">
      <div className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <div className="wf-home-hero mb-6 text-center">
            <img src="/mark.svg" alt="WizFlow" width={56} height={56} className="mx-auto mb-3 h-14 w-14" />
            <h1 className="!text-3xl">WizFlow</h1>
            <p className="!mx-auto">Workflow automation for your team</p>
          </div>
          <div className="wf-card p-8">{children}</div>
        </div>
      </div>
    </div>
  );
}

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const navigate = useNavigate();

  const [checking, setChecking] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) {
      setChecking(false);
      setTokenValid(false);
      return;
    }
    auth
      .validateResetToken(token)
      .then((r) => {
        setTokenValid(r.valid);
        setEmail(r.email ?? null);
      })
      .catch(() => setTokenValid(false))
      .finally(() => setChecking(false));
  }, [token]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      await auth.resetPassword(token, password);
      setDone(true);
      setTimeout(() => navigate("/login"), 2500);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.detail ?? err.message : "Something went wrong. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (checking) {
    return (
      <Shell>
        <p className="text-center text-sm text-slate-500">Checking your link…</p>
      </Shell>
    );
  }

  if (!tokenValid) {
    return (
      <Shell>
        <h2 className="wf-page-title text-xl mb-2">Link invalid or expired</h2>
        <p className="text-sm text-slate-500 mb-6">
          This password reset link is no longer valid. Please request a new one.
        </p>
        <Link to="/forgot-password" className="wf-btn-primary inline-block px-5 py-2.5 text-sm">
          Request a new link
        </Link>
      </Shell>
    );
  }

  if (done) {
    return (
      <Shell>
        <div className="text-center">
          <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h2 className="wf-page-title text-xl mb-2">Password reset</h2>
          <p className="text-sm text-slate-500 mb-6">
            Your password has been updated. Taking you to sign in…
          </p>
          <Link to="/login" className="wf-btn-primary inline-block px-5 py-2.5 text-sm">
            Go to sign in
          </Link>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <h2 className="wf-page-title text-xl mb-1">Choose a new password</h2>
      <p className="text-sm text-slate-500 mb-6">
        {email ? (
          <>
            For <strong>{email}</strong>
          </>
        ) : (
          "Enter a new password for your account."
        )}
      </p>
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1" htmlFor="password">
            New password
          </label>
          <input
            id="password"
            type="password"
            required
            minLength={8}
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="wf-input"
            placeholder="At least 8 characters"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1" htmlFor="confirm">
            Confirm new password
          </label>
          <input
            id="confirm"
            type="password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="wf-input"
            placeholder="Repeat password"
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="w-full wf-btn-primary py-2.5 text-sm disabled:opacity-50"
        >
          {submitting ? "Saving…" : "Reset password"}
        </button>
      </form>
    </Shell>
  );
}
