import { FormEvent, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ApiError, apiFetch } from "../lib/api";

interface InvitePreview {
  email: string;
  invited_by_name: string;
  company_name: string;
  role_slugs: string[];
}

const ROLE_LABELS: Record<string, string> = {
  originator: "Requester",
  approver: "Approver",
  manager: "Manager",
  company_admin: "Admin",
};

export function AcceptInvitePage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();

  const [preview, setPreview]     = useState<InvitePreview | null>(null);
  const [loadError, setLoadError] = useState("");
  const [fullName, setFullName]   = useState("");
  const [password, setPassword]   = useState("");
  const [confirm, setConfirm]     = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [done, setDone]           = useState(false);

  useEffect(() => {
    if (!token) return;
    apiFetch<InvitePreview>(`/api/v1/invitations/${token}`)
      .then(setPreview)
      .catch((e) =>
        setLoadError(e instanceof ApiError ? e.detail ?? e.message : "Invalid or expired invitation.")
      );
  }, [token]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) { setSubmitError("Passwords do not match."); return; }
    if (password.length < 8) { setSubmitError("Password must be at least 8 characters."); return; }
    setSubmitting(true);
    setSubmitError("");
    try {
      await apiFetch(`/api/v1/invitations/${token}/accept`, {
        method: "POST",
        body: JSON.stringify({ full_name: fullName.trim(), password }),
      });
      setDone(true);
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.detail ?? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg max-w-sm w-full p-8 text-center">
          <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <h1 className="text-xl font-bold text-slate-900 mb-2">Account created!</h1>
          <p className="text-slate-500 text-sm mb-6">
            Welcome to {preview?.company_name}. You can now sign in with your email and password.
          </p>
          <button
            type="button"
            onClick={() => navigate("/login")}
            className="wf-btn-primary w-full py-3 text-sm"
          >
            Go to sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg max-w-sm w-full overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-br from-[rgb(var(--wf-brand-600))] to-[rgb(var(--wf-brand-400))] px-8 py-8 text-white text-center">
          <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center mx-auto mb-4">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.75" strokeLinecap="round"><rect width="8" height="8" x="3" y="3" rx="2"/><path d="M7 11v4a2 2 0 0 0 2 2h4"/><rect width="8" height="8" x="13" y="13" rx="2"/></svg>
          </div>
          <h1 className="text-xl font-bold">WizFlow</h1>
          {preview && (
            <p className="text-white/80 text-sm mt-1">
              You're invited to join <strong className="text-white">{preview.company_name}</strong>
            </p>
          )}
        </div>

        <div className="px-8 py-6">
          {loadError && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 text-center">
              {loadError}
            </div>
          )}

          {preview && (
            <>
              <p className="text-sm text-slate-500 mb-1">
                <strong className="text-slate-800">{preview.invited_by_name}</strong> invited you as:
              </p>
              <div className="flex flex-wrap gap-1 mb-5">
                {preview.role_slugs.map((slug) => (
                  <span key={slug} className="text-xs font-semibold px-2.5 py-1 rounded-full bg-[rgb(var(--wf-accent-muted))] text-[rgb(var(--wf-brand-700))]">
                    {ROLE_LABELS[slug] ?? slug}
                  </span>
                ))}
              </div>
              <p className="text-xs text-slate-400 mb-5">Signing in as <strong>{preview.email}</strong></p>

              <form onSubmit={handleSubmit} className="space-y-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Your full name</label>
                  <input
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Jane Smith"
                    className="wf-input w-full"
                    required
                    autoFocus
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Choose a password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    className="wf-input w-full"
                    required
                    minLength={8}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Confirm password</label>
                  <input
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="Repeat password"
                    className="wf-input w-full"
                    required
                  />
                </div>

                {submitError && (
                  <p className="text-sm text-red-600">{submitError}</p>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="wf-btn-primary w-full py-3 text-sm mt-2 disabled:opacity-50"
                >
                  {submitting ? "Creating account…" : "Create my account"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
