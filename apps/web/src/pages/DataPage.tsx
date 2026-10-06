import { useCallback, useEffect, useState } from "react";
import { ApiError, apiFetch } from "../lib/api";
import { getToken } from "../lib/auth";

type Field = { key: string; type: string; label: string; required: boolean; options?: string[]; entity_slug?: string };
type Entity = { id: string; name: string; slug: string; description?: string | null; fields?: Field[] };
type Rec = { id: string; entity_id: string; data: Record<string, unknown>; created_at: string; updated_at: string };

const FIELD_TYPES = ["text", "textarea", "number", "date", "boolean", "select", "relation"];

function displayLabel(fields: Field[], data: Record<string, unknown>): string {
  const first = fields.find((f) => f.type === "text") ?? fields[0];
  const v = first ? data[first.key] : undefined;
  return v != null && v !== "" ? String(v) : "(untitled)";
}

export function DataPage() {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [selected, setSelected] = useState<Entity | null>(null);
  const [records, setRecords] = useState<Rec[]>([]);
  const [relOptions, setRelOptions] = useState<Record<string, { id: string; label: string }[]>>({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  // new-entity form
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newFields, setNewFields] = useState<Field[]>([]);

  // record form
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const token = getToken();

  const loadEntities = useCallback(async () => {
    const list = await apiFetch<Entity[]>("/api/v1/business/entities", {}, token);
    setEntities(list);
    return list;
  }, [token]);

  useEffect(() => {
    loadEntities().catch((e) => setError(e instanceof ApiError ? e.detail ?? e.message : "Failed to load")).finally(() => setLoading(false));
  }, [loadEntities]);

  async function selectEntity(id: string) {
    setError(""); setEditingId(null); setForm({});
    try {
      const full = await apiFetch<Entity>(`/api/v1/business/entities/${id}`, {}, token);
      setSelected(full);
      const recs = await apiFetch<Rec[]>(`/api/v1/business/entities/${id}/records`, {}, token);
      setRecords(recs);
      // load options for any relation fields
      const opts: Record<string, { id: string; label: string }[]> = {};
      for (const f of full.fields ?? []) {
        if (f.type === "relation" && f.entity_slug && !opts[f.entity_slug]) {
          const target = entities.find((e) => e.slug === f.entity_slug);
          if (target) {
            const tf = await apiFetch<Entity>(`/api/v1/business/entities/${target.id}`, {}, token);
            const trecs = await apiFetch<Rec[]>(`/api/v1/business/entities/${target.id}/records`, {}, token);
            opts[f.entity_slug] = trecs.map((r) => ({ id: r.id, label: displayLabel(tf.fields ?? [], r.data) }));
          }
        }
      }
      setRelOptions(opts);
    } catch (e) {
      setError(e instanceof ApiError ? e.detail ?? e.message : "Failed to open entity");
    }
  }

  async function createEntity() {
    if (!newName.trim()) return;
    setBusy(true); setError("");
    try {
      const created = await apiFetch<Entity>(
        "/api/v1/business/entities",
        { method: "POST", body: JSON.stringify({ name: newName.trim(), fields: newFields }) },
        token
      );
      setShowNew(false); setNewName(""); setNewFields([]);
      await loadEntities();
      selectEntity(created.id);
    } catch (e) {
      setError(e instanceof ApiError ? e.detail ?? e.message : "Could not create entity");
    } finally { setBusy(false); }
  }

  async function deleteEntity(id: string) {
    if (!confirm("Delete this entity and all its records?")) return;
    try {
      await apiFetch(`/api/v1/business/entities/${id}`, { method: "DELETE" }, token);
      if (selected?.id === id) { setSelected(null); setRecords([]); }
      await loadEntities();
    } catch (e) { setError(e instanceof ApiError ? e.detail ?? e.message : "Could not delete"); }
  }

  async function saveRecord() {
    if (!selected) return;
    setBusy(true); setError("");
    try {
      if (editingId) {
        await apiFetch(`/api/v1/business/records/${editingId}`, { method: "PATCH", body: JSON.stringify({ data: form }) }, token);
      } else {
        await apiFetch(`/api/v1/business/entities/${selected.id}/records`, { method: "POST", body: JSON.stringify({ data: form }) }, token);
      }
      setForm({}); setEditingId(null);
      setRecords(await apiFetch<Rec[]>(`/api/v1/business/entities/${selected.id}/records`, {}, token));
    } catch (e) {
      setError(e instanceof ApiError ? e.detail ?? e.message : "Could not save record");
    } finally { setBusy(false); }
  }

  async function deleteRecord(id: string) {
    if (!selected) return;
    try {
      await apiFetch(`/api/v1/business/records/${id}`, { method: "DELETE" }, token);
      setRecords(records.filter((r) => r.id !== id));
    } catch (e) { setError(e instanceof ApiError ? e.detail ?? e.message : "Could not delete record"); }
  }

  function addNewField() {
    setNewFields([...newFields, { key: "", type: "text", label: "", required: false }]);
  }
  function setNewField(i: number, patch: Partial<Field>) {
    setNewFields(newFields.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  }

  function renderInput(f: Field) {
    const v = form[f.key];
    if (f.type === "boolean")
      return <input type="checkbox" checked={!!v} onChange={(e) => setForm({ ...form, [f.key]: e.target.checked })} />;
    if (f.type === "textarea")
      return <textarea className="wf-input w-full text-sm" rows={2} value={String(v ?? "")} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />;
    if (f.type === "select")
      return (
        <select className="wf-input w-full text-sm" value={String(v ?? "")} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}>
          <option value="">—</option>
          {(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    if (f.type === "relation")
      return (
        <select className="wf-input w-full text-sm" value={String(v ?? "")} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}>
          <option value="">—</option>
          {(relOptions[f.entity_slug ?? ""] ?? []).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      );
    return <input type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"} className="wf-input w-full text-sm" value={String(v ?? "")} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />;
  }

  function cell(f: Field, data: Record<string, unknown>) {
    const v = data[f.key];
    if (f.type === "boolean") return v ? "✓" : "—";
    if (f.type === "relation") {
      const hit = (relOptions[f.entity_slug ?? ""] ?? []).find((o) => o.id === v);
      return hit ? hit.label : v ? String(v) : "—";
    }
    return v != null && v !== "" ? String(v) : "—";
  }

  if (loading) return <p className="text-slate-500">Loading…</p>;

  return (
    <div>
      <h1 className="wf-page-title mb-1">Data</h1>
      <p className="text-sm text-slate-500 mb-4">Define business objects (customers, invoices, assets…) and manage their records — shared across your apps.</p>
      {error && <p className="text-sm text-red-600 mb-3 rounded-lg border border-red-100 bg-red-50 px-3 py-2">{error}</p>}

      <div className="grid gap-4 md:grid-cols-[16rem_1fr] items-start">
        {/* entity list */}
        <aside className="wf-card p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="wf-sidebar-label">Entities</span>
            <button className="text-xs wf-link" onClick={() => setShowNew((s) => !s)}>{showNew ? "Cancel" : "+ New"}</button>
          </div>
          {showNew && (
            <div className="border border-slate-200 rounded p-2 mb-3 space-y-2">
              <input className="wf-input w-full text-sm" placeholder="Entity name (e.g. Customer)" value={newName} onChange={(e) => setNewName(e.target.value)} />
              {newFields.map((f, i) => (
                <div key={i} className="border-t border-slate-100 pt-2 space-y-1">
                  <div className="flex gap-1">
                    <input className="wf-input flex-1 text-xs" placeholder="Field label" value={f.label} onChange={(e) => setNewField(i, { label: e.target.value })} />
                    <button className="text-red-600 text-xs px-1" onClick={() => setNewFields(newFields.filter((_, j) => j !== i))}>✕</button>
                  </div>
                  <div className="flex items-center gap-2">
                    <select className="wf-input text-xs flex-1" value={f.type} onChange={(e) => setNewField(i, { type: e.target.value })}>
                      {FIELD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={f.required} onChange={(e) => setNewField(i, { required: e.target.checked })} />req</label>
                  </div>
                  {f.type === "select" && (
                    <input className="wf-input w-full text-xs" placeholder="options, comma separated" value={(f.options ?? []).join(",")} onChange={(e) => setNewField(i, { options: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} />
                  )}
                  {f.type === "relation" && (
                    <select className="wf-input w-full text-xs" value={f.entity_slug ?? ""} onChange={(e) => setNewField(i, { entity_slug: e.target.value })}>
                      <option value="">related entity…</option>
                      {entities.map((e) => <option key={e.slug} value={e.slug}>{e.name}</option>)}
                    </select>
                  )}
                </div>
              ))}
              <button className="text-xs wf-link" onClick={addNewField}>+ Add field</button>
              <button className="wf-btn-primary w-full py-1.5 text-sm disabled:opacity-50" disabled={busy || !newName.trim()} onClick={createEntity}>Create entity</button>
            </div>
          )}
          <ul className="space-y-1">
            {entities.map((e) => (
              <li key={e.id} className="flex items-center gap-1">
                <button className={`flex-1 text-left text-sm px-2 py-1 rounded ${selected?.id === e.id ? "bg-[rgb(var(--wf-brand-600))] text-white" : "hover:bg-slate-100 text-slate-700"}`} onClick={() => selectEntity(e.id)}>{e.name}</button>
                <button className="text-xs text-red-600 px-1" title="Delete entity" onClick={() => deleteEntity(e.id)}>✕</button>
              </li>
            ))}
            {entities.length === 0 && <li className="text-xs text-slate-500">No entities yet — create one above.</li>}
          </ul>
        </aside>

        {/* records */}
        <section className="min-w-0">
          {!selected ? (
            <div className="wf-card p-8 text-center text-slate-500 text-sm">Select or create an entity to manage its records.</div>
          ) : (
            <div className="wf-card p-4">
              <h2 className="font-semibold text-slate-800 mb-3">{selected.name} <span className="text-xs font-normal text-slate-400">· {records.length} record(s)</span></h2>

              {/* add / edit form */}
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 mb-3 border border-slate-200 rounded-lg p-3">
                {(selected.fields ?? []).map((f) => (
                  <label key={f.key} className="text-xs text-slate-600">
                    {f.label}{f.required ? " *" : ""}
                    <div className="mt-0.5">{renderInput(f)}</div>
                  </label>
                ))}
                <div className="flex items-end gap-2">
                  <button className="wf-btn-primary px-4 py-2 text-sm disabled:opacity-50" disabled={busy} onClick={saveRecord}>{editingId ? "Save changes" : "Add record"}</button>
                  {editingId && <button className="text-sm text-slate-500" onClick={() => { setEditingId(null); setForm({}); }}>Cancel</button>}
                </div>
              </div>

              {/* table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
                      {(selected.fields ?? []).map((f) => <th key={f.key} className="py-1 pr-3">{f.label}</th>)}
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((r) => (
                      <tr key={r.id} className="border-b border-slate-100">
                        {(selected.fields ?? []).map((f) => <td key={f.key} className="py-1.5 pr-3 text-slate-700">{cell(f, r.data)}</td>)}
                        <td className="py-1.5 whitespace-nowrap text-right">
                          <button className="text-xs wf-link mr-2" onClick={() => { setForm(r.data); setEditingId(r.id); }}>Edit</button>
                          <button className="text-xs text-red-600" onClick={() => deleteRecord(r.id)}>Delete</button>
                        </td>
                      </tr>
                    ))}
                    {records.length === 0 && <tr><td colSpan={(selected.fields?.length ?? 0) + 1} className="py-3 text-center text-slate-500 text-xs">No records yet.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
