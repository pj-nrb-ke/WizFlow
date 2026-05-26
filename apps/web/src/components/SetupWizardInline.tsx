import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  ApiError,
  apiFetch,
  Branch,
  Department,
  getSetupStatus,
  UserGroup,
  UserRow,
  type SetupStatus,
} from "../lib/api";
import { getToken } from "../lib/auth";

type Props = {
  onStatusChange: (status: SetupStatus) => void;
};

export function SetupWizardOrganization({ onStatusChange }: Props) {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [deptName, setDeptName] = useState("");
  const [branchName, setBranchName] = useState("");
  const [error, setError] = useState("");

  const refresh = useCallback(() => {
    const token = getToken();
    Promise.all([
      apiFetch<Department[]>("/api/v1/admin/departments", {}, token),
      apiFetch<Branch[]>("/api/v1/admin/branches", {}, token),
      getSetupStatus(token),
    ])
      .then(([d, b, s]) => {
        setDepartments(d);
        setBranches(b);
        onStatusChange(s);
      })
      .catch(() => {});
  }, [onStatusChange]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function addDepartment(e: FormEvent) {
    e.preventDefault();
    if (!deptName.trim()) return;
    setError("");
    try {
      await apiFetch("/api/v1/admin/departments", {
        method: "POST",
        body: JSON.stringify({ name: deptName.trim() }),
      }, getToken());
      setDeptName("");
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.detail ?? err.message : "Failed");
    }
  }

  async function addBranch(e: FormEvent) {
    e.preventDefault();
    if (!branchName.trim()) return;
    setError("");
    try {
      await apiFetch("/api/v1/admin/branches", {
        method: "POST",
        body: JSON.stringify({ name: branchName.trim() }),
      }, getToken());
      setBranchName("");
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.detail ?? err.message : "Failed");
    }
  }

  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-red-600">{error}</p>}
      <form onSubmit={addDepartment} className="flex flex-wrap gap-2">
        <input
          value={deptName}
          onChange={(e) => setDeptName(e.target.value)}
          placeholder="Department name"
          className="wf-input flex-1 min-w-[10rem]"
        />
        <button type="submit" className="wf-btn-primary px-4 py-2 text-sm">
          Add department
        </button>
      </form>
      <ul className="text-sm text-slate-700 space-y-1">
        {departments.map((d) => (
          <li key={d.id}>• {d.name}</li>
        ))}
        {departments.length === 0 && <li className="text-slate-400">No departments yet.</li>}
      </ul>
      <form onSubmit={addBranch} className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
        <input
          value={branchName}
          onChange={(e) => setBranchName(e.target.value)}
          placeholder="Branch name"
          className="wf-input flex-1 min-w-[10rem]"
        />
        <button type="submit" className="wf-btn-secondary px-4 py-2 text-sm">
          Add branch
        </button>
      </form>
      <ul className="text-sm text-slate-700 space-y-1">
        {branches.map((b) => (
          <li key={b.id}>• {b.name}</li>
        ))}
        {branches.length === 0 && <li className="text-slate-400">No branches yet (optional).</li>}
      </ul>
    </div>
  );
}

export function SetupWizardUsers({ onStatusChange }: Props) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("changeme");
  const [roles, setRoles] = useState<string[]>(["originator"]);
  const [error, setError] = useState("");

  const refresh = useCallback(() => {
    const token = getToken();
    Promise.all([
      apiFetch<UserRow[]>("/api/v1/admin/users", {}, token),
      getSetupStatus(token),
    ])
      .then(([u, s]) => {
        setUsers(u);
        onStatusChange(s);
      })
      .catch(() => {});
  }, [onStatusChange]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function addUser(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || !fullName.trim()) return;
    setError("");
    try {
      await apiFetch("/api/v1/admin/users", {
        method: "POST",
        body: JSON.stringify({
          email: email.trim(),
          full_name: fullName.trim(),
          password,
          role_slugs: roles,
        }),
      }, getToken());
      setEmail("");
      setFullName("");
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.detail ?? err.message : "Failed");
    }
  }

  const roleOptions = ["originator", "approver", "manager", "company_admin"];

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-red-600">{error}</p>}
      <form onSubmit={addUser} className="space-y-3">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          className="wf-input w-full"
          required
        />
        <input
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Full name"
          className="wf-input w-full"
          required
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Temporary password"
          className="wf-input w-full"
        />
        <div className="flex flex-wrap gap-2">
          {roleOptions.map((r) => (
            <label key={r} className="text-xs flex items-center gap-1 border rounded px-2 py-1">
              <input
                type="checkbox"
                checked={roles.includes(r)}
                onChange={() =>
                  setRoles((prev) =>
                    prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]
                  )
                }
              />
              {r}
            </label>
          ))}
        </div>
        <button type="submit" className="wf-btn-primary px-4 py-2 text-sm">
          Add user
        </button>
      </form>
      <ul className="text-sm space-y-2 max-h-40 overflow-y-auto">
        {users.map((u) => (
          <li key={u.id} className="text-slate-700">
            <span className="font-medium">{u.full_name}</span>
            <span className="text-slate-400 ml-2">{u.email}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SetupWizardGroups({ onStatusChange }: Props) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [groups, setGroups] = useState<UserGroup[]>([]);
  const [groupName, setGroupName] = useState("");
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [error, setError] = useState("");

  const refresh = useCallback(() => {
    const token = getToken();
    Promise.all([
      apiFetch<UserRow[]>("/api/v1/admin/users", {}, token),
      apiFetch<UserGroup[]>("/api/v1/admin/user-groups", {}, token).catch(() => []),
      getSetupStatus(token),
    ])
      .then(([u, g, s]) => {
        setUsers(u);
        setGroups(g);
        onStatusChange(s);
      })
      .catch(() => {});
  }, [onStatusChange]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function addGroup(e: FormEvent) {
    e.preventDefault();
    if (!groupName.trim()) return;
    setError("");
    try {
      await apiFetch("/api/v1/admin/user-groups", {
        method: "POST",
        body: JSON.stringify({ name: groupName.trim(), user_ids: memberIds }),
      }, getToken());
      setGroupName("");
      setMemberIds([]);
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.detail ?? err.message : "Failed");
    }
  }

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-red-600">{error}</p>}
      <form onSubmit={addGroup} className="space-y-3">
        <input
          value={groupName}
          onChange={(e) => setGroupName(e.target.value)}
          placeholder="Group name (e.g. Finance Committee)"
          className="wf-input w-full"
        />
        <div className="flex flex-wrap gap-2 max-h-28 overflow-y-auto">
          {users.map((u) => (
            <label key={u.id} className="text-xs flex items-center gap-1 border rounded px-2 py-1">
              <input
                type="checkbox"
                checked={memberIds.includes(u.id)}
                onChange={() =>
                  setMemberIds((prev) =>
                    prev.includes(u.id) ? prev.filter((x) => x !== u.id) : [...prev, u.id]
                  )
                }
              />
              {u.full_name}
            </label>
          ))}
        </div>
        <button type="submit" className="wf-btn-primary px-4 py-2 text-sm">
          Create group
        </button>
      </form>
      <ul className="text-sm space-y-2">
        {groups.map((g) => (
          <li key={g.id} className="text-slate-700">
            <span className="font-medium">{g.name}</span>
            <span className="text-slate-400 ml-2">
              ({g.members.map((m) => m.full_name).join(", ") || "no members"})
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
