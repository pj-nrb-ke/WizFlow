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
    <div className="min-h-screen flex flex-col">
      <div className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <div className="wf-home-hero mb-6 text-center">
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
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button type="submit" disabled={submitting} className="w-full wf-btn-primary py-2.5 text-sm">
                {submitting ? "Signing in…" : "Sign in"}
              </button>
            </form>
            <p className="mt-4 text-xs text-slate-400 text-center">
              admin@demo.wizflow.biz / changeme
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
