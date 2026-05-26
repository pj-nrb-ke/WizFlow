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

export function AdminPage() {
  const { user } = useAuth();
  const { appTheme } = useAppTheme();
  const meta = THEME_META[appTheme];
  const [searchParams, setSearchParams] = useSearchParams();
  const section = sectionFromParam(searchParams.get("section"));

  const [departments, setDepartments] = useState<Department[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [deptName, setDeptName] = useState("");
  const [groups, setGroups] = useState<UserGroup[]>([]);
  const [groupName, setGroupName] = useState("");
  const [groupUserIds, setGroupUserIds] = useState<string[]>([]);
  const [error, setError] = useState("");

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
              <li className="text-slate-500">No departments yet.</li>
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

      {section === "users" && (
        <section className="wf-card p-5">
          <h2 className="font-semibold text-slate-800">Users</h2>
          <p className="text-sm text-slate-500 mb-4">Active accounts and role assignments.</p>
          <ul className="text-sm space-y-3">
            {users.map((u) => (
              <li key={u.id} className="border-b border-slate-100 pb-3 last:border-0">
                <p className="font-medium text-slate-800">{u.full_name}</p>
                <p className="text-slate-500">{u.email}</p>
                <p className="text-xs text-slate-400 mt-0.5">{u.roles.join(", ")}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {section === "groups" && (
        <section className="wf-card p-5">
          <h2 className="font-semibold text-slate-800">Groups</h2>
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
