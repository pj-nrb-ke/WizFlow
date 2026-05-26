import { FormEvent, useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { HelpTip } from "../components/HelpTip";
import { PageHeader } from "../components/PageHeader";
import { useAuth } from "../context/AuthContext";
import {
  ApiError,
  createMasterDataEntry,
  deleteMasterDataEntry,
  listMasterData,
  listMasterDataCategories,
  MasterDataEntry,
  updateMasterDataEntry,
} from "../lib/api";
import { getToken } from "../lib/auth";
import { canManageMasterData } from "../lib/roles";

export function MasterDataPage() {
  const { user } = useAuth();
  const [categories, setCategories] = useState<string[]>([]);
  const [category, setCategory] = useState("");
  const [entries, setEntries] = useState<MasterDataEntry[]>([]);
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (cat: string) => {
    setLoading(true);
    setError("");
    try {
      const rows = await listMasterData(cat || undefined, getToken());
      setEntries(rows);
    } catch (e) {
      setError(e instanceof ApiError ? e.detail ?? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!canManageMasterData(user?.roles)) return;
    listMasterDataCategories(getToken())
      .then((res) => {
        setCategories(res.categories);
        const first = res.categories[0] ?? "";
        setCategory(first);
        if (first) load(first);
        else setLoading(false);
      })
      .catch((e) => {
        setError(e instanceof ApiError ? e.detail ?? e.message : "Failed to load categories");
        setLoading(false);
      });
  }, [user?.roles, load]);

  useEffect(() => {
    if (category) load(category);
  }, [category, load]);

  if (!canManageMasterData(user?.roles)) {
    return <Navigate to="/" replace />;
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!category || !code.trim() || !label.trim()) return;
    setError("");
    try {
      await createMasterDataEntry(
        { category, code: code.trim(), label: label.trim() },
        getToken()
      );
      setCode("");
      setLabel("");
      await load(category);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail ?? err.message : "Could not create entry");
    }
  }

  async function toggleActive(entry: MasterDataEntry) {
    setError("");
    try {
      await updateMasterDataEntry(entry.id, { is_active: !entry.is_active }, getToken());
      await load(category);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail ?? err.message : "Update failed");
    }
  }

  async function remove(entry: MasterDataEntry) {
    if (!confirm(`Deactivate “${entry.label}”?`)) return;
    setError("");
    try {
      await deleteMasterDataEntry(entry.id, getToken());
      await load(category);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail ?? err.message : "Delete failed");
    }
  }

  return (
    <div>
      <PageHeader
        title="Master data"
        subtitle="Reusable lists for dropdowns — departments, vendors, cost centers, and more."
        help={
          <HelpTip text="Managers maintain company-wide lookup values used in forms. Deactivated entries stay in history but disappear from new dropdowns." />
        }
      />

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      <div className="flex flex-wrap gap-3 mb-4">
        <label className="text-sm text-slate-600">
          Category
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="wf-input ml-2"
          >
            {categories.map((c) => (
              <option key={c} value={c}>
                {c.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </label>
      </div>

      <form onSubmit={onCreate} className="wf-card p-4 mb-6 flex flex-wrap gap-3 items-end">
        <label className="text-sm">
          <span className="text-slate-600 block mb-1">Code</span>
          <input
            className="wf-input"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="e.g. FIN-01"
            required
          />
        </label>
        <label className="text-sm flex-1 min-w-[12rem]">
          <span className="text-slate-600 block mb-1">Label</span>
          <input
            className="wf-input w-full"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Display name"
            required
          />
        </label>
        <button type="submit" className="wf-btn-primary text-sm px-4 py-2">
          Add entry
        </button>
      </form>

      <div className="wf-card overflow-hidden">
        <table className="wf-data-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Label</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} className="wf-data-table-empty">
                  Loading…
                </td>
              </tr>
            ) : entries.length === 0 ? (
              <tr>
                <td colSpan={4} className="wf-data-table-empty">
                  No entries in this category yet.
                </td>
              </tr>
            ) : (
              entries.map((entry) => (
                <tr key={entry.id} className={!entry.is_active ? "opacity-60" : undefined}>
                  <td className="font-mono text-xs">{entry.code}</td>
                  <td>{entry.label}</td>
                  <td>{entry.is_active ? "Active" : "Inactive"}</td>
                  <td className="text-right space-x-2 whitespace-nowrap">
                    <button
                      type="button"
                      className="text-xs wf-link"
                      onClick={() => toggleActive(entry)}
                    >
                      {entry.is_active ? "Deactivate" : "Activate"}
                    </button>
                    {entry.is_active && (
                      <button
                        type="button"
                        className="text-xs text-red-600 hover:underline"
                        onClick={() => remove(entry)}
                      >
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
