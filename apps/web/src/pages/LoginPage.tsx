import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError } from "../lib/api";
import * as auth from "../lib/auth";
import { useAuth } from "../context/AuthContext";

export function LoginPage() {
  const navigate = useNavigate();
  const { refreshUser } = useAuth();
  const [email, setEmail] = useState("admin@demo.wizflow.biz");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await auth.login(email, password);
      await refreshUser();
      navigate("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.detail ?? err.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" data-theme="corporate">
      <div className="w-full max-w-md wf-card p-8 shadow-md">
        <h1 className="text-2xl font-bold wf-header-brand mb-1">WizFlow</h1>
        <p className="text-slate-500 text-sm mb-6">Sign in to your workspace</p>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1" htmlFor="email">
              Email
            </label>
            <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="wf-input" />
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
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="submit" disabled={submitting} className="w-full wf-btn-primary py-2 text-sm">
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <p className="mt-4 text-xs text-slate-400 text-center">Demo: admin@demo.wizflow.biz / changeme</p>
      </div>
    </div>
  );
}
