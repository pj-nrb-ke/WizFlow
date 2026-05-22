import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiError, apiFetch, apiUpload, FormField, WorkflowDefinition } from "../lib/api";
import { getToken } from "../lib/auth";

export function SubmitRequestPage() {
  const navigate = useNavigate();
  const [workflows, setWorkflows] = useState<WorkflowDefinition[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [fields, setFields] = useState<FormField[]>([]);
  const [form, setForm] = useState<Record<string, string>>({});
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<WorkflowDefinition[]>("/api/v1/workflows?status=published", {}, getToken())
      .then((list) => {
        setWorkflows(list);
        if (list.length) {
          setSelectedId(list[0].id);
          setFields(list[0].form_schema?.fields || []);
        }
      })
      .catch((e) => setError(e instanceof ApiError ? e.detail ?? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  function onWorkflowChange(id: string) {
    setSelectedId(id);
    const wf = workflows.find((w) => w.id === id);
    setFields(wf?.form_schema?.fields || []);
    setForm({});
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    const data: Record<string, unknown> = {};
    for (const f of fields) {
      const v = form[f.key];
      if (f.type === "number" && v !== "") data[f.key] = Number(v);
      else if (v !== "") data[f.key] = v;
    }
    try {
      const inst = await apiFetch<{ id: string }>(
        `/api/v1/workflows/${selectedId}/submit`,
        { method: "POST", body: JSON.stringify({ data }) },
        getToken()
      );
      if (file) {
        await apiUpload(`/api/v1/requests/${inst.id}/attachments`, file, getToken());
      }
      navigate(`/requests/${inst.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail ?? err.message : "Submit failed");
    }
  }

  if (loading) return <p className="text-slate-500">Loading…</p>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-800 mb-4">New request</h1>
      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
      {workflows.length === 0 ? (
        <p className="text-slate-600">
          No published workflows. Publish one under{" "}
          <Link to="/workflows" className="text-brand-600">
            Workflows
          </Link>
          .
        </p>
      ) : (
        <form onSubmit={onSubmit} className="bg-white rounded-lg border border-slate-200 p-6 max-w-lg space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Workflow</label>
            <select
              value={selectedId}
              onChange={(e) => onWorkflowChange(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            >
              {workflows.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>
          {fields.map((f) => (
            <div key={f.key}>
              <label className="block text-sm font-medium mb-1">
                {f.label}
                {f.required && <span className="text-red-500"> *</span>}
              </label>
              <input
                type={f.type === "number" ? "number" : "text"}
                required={f.required}
                value={form[f.key] ?? ""}
                onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm"
                placeholder={f.placeholder}
              />
            </div>
          ))}
          <div>
            <label className="block text-sm font-medium mb-1">Attachment (optional)</label>
            <input
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="text-sm"
            />
          </div>
          <button
            type="submit"
            className="w-full bg-brand-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-brand-700"
          >
            Submit request
          </button>
        </form>
      )}
    </div>
  );
}
