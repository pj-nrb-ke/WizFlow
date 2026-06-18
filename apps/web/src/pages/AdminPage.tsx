import { FormEvent, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ApiError, apiFetch, Department, UserGroup, UserRow } from "../lib/api";
import { getToken } from "../lib/auth";
import { useAuth } from "../context/AuthContext";
import { AppThemeSwitcher } from "../components/ThemeSwitcher";
import { useAppTheme } from "../context/ThemeContext";
import { THEME_META } from "../lib/themes";

const SECTIONS = [
  { id: "organization", label: "Organization", desc: "Departments and org structure." },
  { id: "users", label: "Users", desc: "People, emails, and assigned roles." },
  { id: "groups", label: "Groups", desc: "Approval teams for workflow routing." },
  { id: "branding", label: "Branding", desc: "Workspace look and company identity." },
] as const;

type AdminSection = (typeof SECTIONS)[number]["id"];

function sectionFromParam(value: string | null): AdminSection {
  if (SECTIONS.some((s) => s.id === value)) return value as AdminSection;
  return "organization";
}

const ROLE_OPTIONS = [
  { slug: "originator",    label: "Requester",  desc: "Can submit approval requests",          color: "bg-blue-50 text-blue-700 border-blue-200" },
  { slug: "approver",      label: "Approver",   desc: "Can approve or reject requests",        color: "bg-green-50 text-green-700 border-green-200" },
  { slug: "manager",       label: "Manager",    desc: "Broader oversight and reporting access", color: "bg-amber-50 text-amber-700 border-amber-200" },
  { slug: "company_admin", label: "Admin",      desc: "Full administrative access",            color: "bg-purple-50 text-purple-700 border-purple-200" },
];

function roleBadge(slug: string) {
  const r = ROLE_OPTIONS.find((o) => o.slug === slug);
  return r ? { label: r.label, color: r.color } : { label: slug, color: "bg-slate-50 text-slate-600 border-slate-200" };
}

function UserInitials({ name }: { name: string }) {
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <span className="flex items-center justify-center w-9 h-9 rounded-full bg-[rgb(var(--wf-brand-600))] text-white text-sm font-semibold shrink-0">
      {initials}
    </span>
  );
}

function InviteModal({
  users,
  onClose,
  onCreated,
}: {
  users: UserRow[];
  onClose: () => void;
  onCreated: (u: UserRow) => void;
}) {
  const [email, setEmail]       = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("changeme");
  const [roles, setRoles]       = useState<string[]>(["originator"]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [success, setSuccess]   = useState("");

  function toggleRole(slug: string) {
    setRoles((prev) =>
      prev.includes(slug) ? prev.filter((r) => r !== slug) : [...prev, slug]
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || !fullName.trim() || roles.length === 0) return;
    setLoading(true);
    setError("");
    try {
      const created = await apiFetch<UserRow>("/api/v1/admin/users", {
        method: "POST",
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          full_name: fullName.trim(),
          password,
          role_slugs: roles,
        }),
      }, getToken());
      onCreated(created);
      setSuccess(`${fullName.trim()} has been added. They can log in with the password you set.`);
      setEmail("");
      setFullName("");
      setPassword("changeme");
      setRoles(["originator"]);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail ?? err.message : "Failed to create user");
    } finally {
      setLoading(false);
    }
  }

  const emailTaken = email.trim() !== "" && users.some(
    (u) => u.email.toLowerCase() === email.trim().toLowerCase()
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Invite user</h2>
            <p className="text-xs text-slate-500 mt-0.5">Create an account and assign roles</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
            aria-label="Close"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {success && (
            <div className="flex items-start gap-2.5 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
              <svg className="shrink-0 mt-0.5" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
              {success}
            </div>
          )}

          {error && (
            <p className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</p>
          )}

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Full name</label>
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
            <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Email address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jane@company.com"
              className={`wf-input w-full ${emailTaken ? "border-red-400 focus:border-red-500" : ""}`}
              required
            />
            {emailTaken && <p className="text-xs text-red-600">This email is already registered.</p>}
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Temporary password</label>
            <input
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="wf-input w-full font-mono"
            />
            <p className="text-xs text-slate-400">Share this with the user — they should change it after first login.</p>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Roles</label>
            <div className="grid grid-cols-2 gap-2">
              {ROLE_OPTIONS.map((r) => {
                const checked = roles.includes(r.slug);
                return (
                  <label
                    key={r.slug}
                    className={`relative flex flex-col gap-0.5 p-3 border rounded-xl cursor-pointer transition-all ${
                      checked
                        ? "border-[rgb(var(--wf-brand-600))] bg-[rgb(var(--wf-accent-muted))]"
                        : "border-slate-200 hover:border-slate-300 bg-white"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={checked}
                      onChange={() => toggleRole(r.slug)}
                    />
                    <span className="text-sm font-semibold text-slate-800">{r.label}</span>
                    <span className="text-[11px] text-slate-500 leading-tight">{r.desc}</span>
                    {checked && (
                      <span className="absolute top-2 right-2 w-4 h-4 flex items-center justify-center rounded-full bg-[rgb(var(--wf-brand-600))]">
                        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
            {roles.length === 0 && (
              <p className="text-xs text-red-600">Select at least one role.</p>
            )}
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={loading || emailTaken || roles.length === 0}
              className="wf-btn-primary flex-1 py-2.5 text-sm disabled:opacity-50"
            >
              {loading ? "Creating…" : "Create account"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="wf-btn-secondary px-4 py-2.5 text-sm"
            >
              Done
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function AdminPage() {
  const { user } = useAuth();
  const { appTheme } = useAppTheme();
  const meta = THEME_META[appTheme];
  const [searchParams, setSearchParams] = useSearchParams();
  const section = sectionFromParam(searchParams.get("section"));

  const [departments, setDepartments] = useState<Department[]>([]);
  const [users, setUsers]             = useState<UserRow[]>([]);
  const [deptName, setDeptName]       = useState("");
  const [groups, setGroups]           = useState<UserGroup[]>([]);
  const [groupName, setGroupName]     = useState("");
  const [groupUserIds, setGroupUserIds] = useState<string[]>([]);
  const [error, setError]             = useState("");
  const [showInvite, setShowInvite]   = useState(false);

  const isAdmin = user?.roles.includes("company_admin");

  useEffect(() => {
    if (!isAdmin) return;
    const token = getToken();
    Promise.all([
      apiFetch<Department[]>("/api/v1/admin/departments", {}, token),
      apiFetch<UserRow[]>("/api/v1/admin/users", {}, token),
      apiFetch<UserGroup[]>("/api/v1/admin/user-groups", {}, token).catch(() => []),
    ])
      .then(([d, u, g]) => {
        setDepartments(d);
        setUsers(u);
        setGroups(g);
      })
      .catch((e) => setError(e instanceof ApiError ? e.detail ?? e.message : "Failed to load"));
  }, [isAdmin]);

  async function addDepartment(e: FormEvent) {
    e.preventDefault();
    if (!deptName.trim()) return;
    try {
      const created = await apiFetch<Department>(
        "/api/v1/admin/departments",
        { method: "POST", body: JSON.stringify({ name: deptName.trim() }) },
        getToken()
      );
      setDepartments((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setDeptName("");
    } catch (err) {
      setError(err instanceof ApiError ? err.detail ?? err.message : "Failed to create");
    }
  }

  if (!isAdmin) {
    return (
      <p className="text-slate-600">Admin setup requires the company_admin role.</p>
    );
  }

  return (
    <div>
      {showInvite && (
        <InviteModal
          users={users}
          onClose={() => setShowInvite(false)}
          onCreated={(u) => setUsers((prev) => [...prev, u])}
        />
      )}

      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="wf-page-title">Administration</h1>
          <p className="text-sm text-slate-500 mt-1">
            Configure {user?.company_name ?? "your company"} — organization, people, and branding.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/setup" className="wf-btn-secondary px-3 py-2 text-sm">
            Setup wizard
          </Link>
          <Link to="/templates" className="wf-btn-primary px-3 py-2 text-sm">
            Templates
          </Link>
        </div>
      </div>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      <nav className="flex flex-wrap gap-2 mb-6 border-b border-slate-200 pb-4" aria-label="Admin sections">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`px-3 py-2 text-sm rounded-lg font-medium transition-colors ${
              section === s.id
                ? "bg-[rgb(var(--wf-brand-600))] text-white"
                : "text-slate-600 hover:bg-slate-100"
            }`}
            onClick={() => setSearchParams({ section: s.id })}
          >
            {s.label}
          </button>
        ))}
      </nav>

      {/* ─── Organization ─── */}
      {section === "organization" && (
        <section className="wf-card p-5">
          <h2 className="font-semibold text-slate-800">Organization</h2>
          <p className="text-sm text-slate-500 mb-4">Departments used in routing and reporting.</p>
          <form onSubmit={addDepartment} className="flex flex-wrap gap-2 mb-4">
            <input
              value={deptName}
              onChange={(e) => setDeptName(e.target.value)}
              placeholder="New department"
              className="wf-input flex-1 min-w-[12rem]"
            />
            <button type="submit" className="wf-btn-primary px-4 py-2 text-sm">
              Add department
            </button>
          </form>
          <ul className="text-sm space-y-2">
            {departments.length === 0 ? (
              <li className="text-slate-500">
                No departments yet. Add one above so requests can route and report by department.
              </li>
            ) : (
              departments.map((d) => (
                <li key={d.id} className="py-2 border-b border-slate-100 last:border-0 text-slate-700">
                  {d.name}
                  {d.code && <span className="text-slate-400 ml-2">({d.code})</span>}
                </li>
              ))
            )}
          </ul>
        </section>
      )}

      {/* ─── Users ─── */}
      {section === "users" && (
        <section className="wf-card p-5">
          <div className="flex items-center justify-between mb-1">
            <div>
              <h2 className="font-semibold text-slate-800">Users</h2>
              <p className="text-sm text-slate-500">{users.length} account{users.length !== 1 ? "s" : ""} in your workspace</p>
            </div>
            <button
              type="button"
              onClick={() => setShowInvite(true)}
              className="wf-btn-primary px-4 py-2 text-sm flex items-center gap-2"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" x2="19" y1="8" y2="14"/><line x1="22" x2="16" y1="11" y2="11"/></svg>
              Invite user
            </button>
          </div>

          <div className="mt-4 divide-y divide-slate-100">
            {users.length === 0 ? (
              <div className="py-10 text-center">
                <p className="text-slate-500 text-sm mb-3">No users yet.</p>
                <button
                  type="button"
                  onClick={() => setShowInvite(true)}
                  className="wf-btn-primary px-4 py-2 text-sm"
                >
                  Invite your first user
                </button>
              </div>
            ) : (
              users.map((u) => (
                <div key={u.id} className="flex items-center gap-3 py-3">
                  <UserInitials name={u.full_name} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{u.full_name}</p>
                    <p className="text-xs text-slate-500 truncate">{u.email}</p>
                  </div>
                  <div className="flex flex-wrap gap-1 justify-end">
                    {u.roles.map((slug) => {
                      const { label, color } = roleBadge(slug);
                      return (
                        <span
                          key={slug}
                          className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${color}`}
                        >
                          {label}
                        </span>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      )}

      {/* ─── Groups ─── */}
      {section === "groups" && (
        <section className="wf-card p-5">
          <h2 className="font-semibold text-slate-800">Groups ({groups.length})</h2>
          <p className="text-sm text-slate-500 mb-4">
            Groups are used in custom workflows for initiators and approvers.
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!groupName.trim()) return;
              try {
                const created = await apiFetch<UserGroup>(
                  "/api/v1/admin/user-groups",
                  {
                    method: "POST",
                    body: JSON.stringify({
                      name: groupName.trim(),
                      user_ids: groupUserIds,
                    }),
                  },
                  getToken()
                );
                setGroups((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
                setGroupName("");
                setGroupUserIds([]);
              } catch (err) {
                setError(err instanceof ApiError ? err.detail ?? err.message : "Failed to create group");
              }
            }}
            className="space-y-3 mb-6"
          >
            <input
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="Group name"
              className="wf-input max-w-xs"
            />
            <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
              {users.map((u) => (
                <label key={u.id} className="text-xs flex items-center gap-1 border rounded px-2 py-1 bg-white">
                  <input
                    type="checkbox"
                    checked={groupUserIds.includes(u.id)}
                    onChange={() =>
                      setGroupUserIds((prev) =>
                        prev.includes(u.id) ? prev.filter((x) => x !== u.id) : [...prev, u.id]
                      )
                    }
                  />
                  {u.full_name}
                </label>
              ))}
            </div>
            <button type="submit" className="wf-btn-primary text-sm px-4 py-2">
              Create group
            </button>
          </form>
          {groups.length === 0 && (
            <p className="text-sm text-slate-500 mb-3">
              No groups yet. Create one above to route requests to a team of approvers.
            </p>
          )}
          <ul className="text-sm space-y-3">
            {groups.map((g) => (
              <li key={g.id} className="border-b border-slate-100 pb-3 last:border-0">
                <p className="font-medium text-slate-800">{g.name}</p>
                <p className="text-xs text-slate-500">
                  {g.members.map((m) => m.full_name).join(", ") || "No members"}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ─── Branding ─── */}
      {section === "branding" && (
        <section className="wf-card p-5 space-y-6">
          <div>
            <h2 className="font-semibold text-slate-800">Branding</h2>
            <p className="text-sm text-slate-500 mb-4">
              Company name and interface theme shown across WizFlow.
            </p>
            <dl className="text-sm space-y-2 mb-6">
              <div className="flex gap-3">
                <dt className="text-slate-500 w-28 shrink-0">Company</dt>
                <dd className="font-medium text-slate-800">{user?.company_name ?? "—"}</dd>
              </div>
              <div className="flex gap-3">
                <dt className="text-slate-500 w-28 shrink-0">Theme</dt>
                <dd className="text-slate-800">
                  {meta.label} — {meta.tagline}
                </dd>
              </div>
            </dl>
            <p className="text-sm text-slate-600 mb-3">
              Set your company logo and brand color under{" "}
              <Link to="/settings" className="wf-link font-medium">
                Settings → Workspace branding
              </Link>
              . The accent color applies across the app shell.
            </p>
            <AppThemeSwitcher />
          </div>
        </section>
      )}
    </div>
  );
}
