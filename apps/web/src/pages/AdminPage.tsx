import { FormEvent, useEffect, useState } from "react";
import { ApiError, apiFetch, Department, UserGroup, UserRow } from "../lib/api";
import { getToken } from "../lib/auth";
import { useAuth } from "../context/AuthContext";

export function AdminPage() {
  const { user } = useAuth();
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
      <h1 className="text-2xl font-bold text-slate-800 mb-4">Admin setup</h1>
      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      <div className="grid md:grid-cols-2 gap-6">
        <section className="bg-white rounded-lg border border-slate-200 p-4">
          <h2 className="font-semibold mb-3">Departments</h2>
          <form onSubmit={addDepartment} className="flex gap-2 mb-4">
            <input
              value={deptName}
              onChange={(e) => setDeptName(e.target.value)}
              placeholder="New department"
              className="flex-1 border rounded-lg px-3 py-2 text-sm"
            />
            <button
              type="submit"
              className="px-3 py-2 bg-brand-600 text-white text-sm rounded-lg"
            >
              Add
            </button>
          </form>
          <ul className="text-sm space-y-1">
            {departments.map((d) => (
              <li key={d.id} className="text-slate-700">
                {d.name}
              </li>
            ))}
          </ul>
        </section>

        <section className="bg-white rounded-lg border border-slate-200 p-4 md:col-span-2">
          <h2 className="font-semibold mb-3">User groups</h2>
          <p className="text-xs text-slate-500 mb-3">
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
            className="space-y-3 mb-4"
          >
            <input
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="Group name"
              className="wf-input max-w-xs"
            />
            <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto">
              {users.map((u) => (
                <label key={u.id} className="text-xs flex items-center gap-1 border rounded px-2 py-1">
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
            <button type="submit" className="wf-btn-primary text-sm">
              Create group
            </button>
          </form>
          <ul className="text-sm space-y-2">
            {groups.map((g) => (
              <li key={g.id} className="border-b border-slate-100 pb-2">
                <p className="font-medium">{g.name}</p>
                <p className="text-xs text-slate-500">
                  {g.members.map((m) => m.full_name).join(", ") || "No members"}
                </p>
              </li>
            ))}
          </ul>
        </section>

        <section className="bg-white rounded-lg border border-slate-200 p-4">
          <h2 className="font-semibold mb-3">Users</h2>
          <ul className="text-sm space-y-2">
            {users.map((u) => (
              <li key={u.id} className="border-b border-slate-100 pb-2">
                <p className="font-medium">{u.full_name}</p>
                <p className="text-slate-500">{u.email}</p>
                <p className="text-xs text-slate-400">{u.roles.join(", ")}</p>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
