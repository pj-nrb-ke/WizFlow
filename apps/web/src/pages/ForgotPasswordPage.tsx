import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../lib/api";
import * as auth from "../lib/auth";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await auth.forgotPassword(email.trim());
      setSent(true);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.detail ?? err.message : "Something went wrong. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-[rgb(var(--wf-page-bg))]">
      <div className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <div className="wf-home-hero mb-6 text-center">
            <img src="/mark.svg" alt="WizFlow" width={56} height={56} className="mx-auto mb-3 h-14 w-14" />
            <h1 className="!text-3xl">WizFlow</h1>
            <p className="!mx-auto">Workflow automation for your team</p>
          </div>
          <div className="wf-card p-8">
            {sent ? (
              <div className="text-center">
                <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m22 2-7 20-4-9-9-4Z" />
                    <path d="M22 2 11 13" />
                  </svg>
                </div>
                <h2 className="wf-page-title text-xl mb-2">Check your email</h2>
                <p className="text-sm text-slate-500 mb-6">
                  If an account exists for <strong>{email.trim()}</strong>, we've sent a link to reset your
                  password. The link expires in 1 hour.
                </p>
                <Link to="/login" className="wf-btn-primary inline-block px-5 py-2.5 text-sm">
                  Back to sign in
                </Link>
              </div>
            ) : (
              <>
                <h2 className="wf-page-title text-xl mb-1">Forgot your password?</h2>
                <p className="text-sm text-slate-500 mb-6">
                  Enter your account email and we'll send you a link to reset it.
                </p>
                <form onSubmit={onSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1" htmlFor="email">
                      Email
                    </label>
                    <input
                      id="email"
                      type="email"
                      required
                      autoFocus
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="wf-input"
                      placeholder="you@company.com"
                    />
                  </div>
                  {error && <p className="text-sm text-red-600">{error}</p>}
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full wf-btn-primary py-2.5 text-sm disabled:opacity-50"
                  >
                    {submitting ? "Sending…" : "Send reset link"}
                  </button>
                </form>
                <p className="mt-4 text-center text-sm">
                  <Link to="/login" className="text-[rgb(var(--wf-brand-600))] hover:underline">
                    Back to sign in
                  </Link>
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
