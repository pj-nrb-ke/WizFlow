import { FormEvent, useEffect, useState } from "react";
import { ApiError, apiFetch, Department, UserRow } from "../lib/api";
import { getToken } from "../lib/auth";
import { useAuth } from "../context/AuthContext";

export function AdminPage() {
  const { user } = useAuth();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [deptName, setDeptName] = useState("");
  const [error, setError] = useState("");

  const isAdmin = user?.roles.includes("company_admin");

  useEffect(() => {
    if (!isAdmin) return;
    const token = getToken();
    Promise.all([
      apiFetch<Department[]>("/api/v1/admin/departments", {}, token),
      apiFetch<UserRow[]>("/api/v1/admin/users", {}, token),
    ])
      .then(([d, u]) => {
        setDepartments(d);
        setUsers(u);
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
