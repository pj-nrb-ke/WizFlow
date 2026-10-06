import { useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { HelpTip } from "../components/HelpTip";
import { PageHeader } from "../components/PageHeader";
import { useAuth } from "../context/AuthContext";
import { ApiError, apiFetch } from "../lib/api";
import { getToken } from "../lib/auth";
import { formatDateTime } from "../lib/datetime";
import { canManageMasterData } from "../lib/roles";

type Doc = { id: string; title: string; source: string | null; chunk_count: number; created_at: string };
type Hit = { title: string; content: string; score: number };

export function KnowledgePage() {
  const { user } = useAuth();
  const canManage = canManageMasterData(user?.roles);

  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [title, setTitle] = useState("");
  const [source, setSource] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [searching, setSearching] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setDocs(await apiFetch<Doc[]>("/api/v1/knowledge/docs", {}, getToken()));
    } catch (e) {
      setError(e instanceof ApiError ? e.detail ?? e.message : "Failed to load knowledge base");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (canManage) void load();
  }, [canManage, load]);

  async function addDoc() {
    if (!title.trim() || !text.trim()) {
      setError("Give the document a title and some text.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await apiFetch(
        "/api/v1/knowledge/docs",
        { method: "POST", body: JSON.stringify({ title, text, source: source.trim() || null }) },
        getToken(),
      );
      setTitle("");
      setSource("");
      setText("");
      void load();
    } catch (e) {
      setError(e instanceof ApiError ? e.detail ?? e.message : "Could not add document");
    } finally {
      setBusy(false);
    }
  }

  async function onFile(file: File) {
    const content = await file.text();
    setText(content);
    if (!title.trim()) setTitle(file.name.replace(/\.[^.]+$/, ""));
  }

  async function removeDoc(id: string) {
    if (!confirm("Delete this document from the knowledge base?")) return;
    try {
      await apiFetch(`/api/v1/knowledge/docs/${id}`, { method: "DELETE" }, getToken());
      setDocs((d) => d.filter((x) => x.id !== id));
    } catch (e) {
      setError(e instanceof ApiError ? e.detail ?? e.message : "Could not delete");
    }
  }

  async function runSearch() {
    if (!query.trim()) return;
    setSearching(true);
    setError("");
    try {
      setHits(await apiFetch<Hit[]>(`/api/v1/knowledge/search?q=${encodeURIComponent(query)}`, {}, getToken()));
    } catch (e) {
      setError(e instanceof ApiError ? e.detail ?? e.message : "Search failed");
    } finally {
      setSearching(false);
    }
  }

  if (!canManage) return <Navigate to="/" replace />;

  return (
    <div className="wf-analytics-page">
      <PageHeader
        title="Knowledge"
        subtitle="Attach policies and SOPs so the copilots answer from your rules — with citations."
        help={
          <HelpTip>
            Paste or upload a policy/SOP. WizFlow splits and indexes it, then the approver copilot retrieves the
            relevant parts when reviewing a request, citing the document. Nothing here changes how approvals run.
          </HelpTip>
        }
      />

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      <section className="wf-panel mb-6">
        <h2 className="text-lg font-semibold mb-3">Add a document</h2>
        <div className="grid gap-3 sm:grid-cols-2 mb-3">
          <input
            className="wf-input"
            placeholder="Title (e.g. Procurement Policy)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <input
            className="wf-input"
            placeholder="Source (optional, e.g. Finance Handbook v3)"
            value={source}
            onChange={(e) => setSource(e.target.value)}
          />
        </div>
        <textarea
          className="wf-input w-full mb-3"
          rows={8}
          placeholder="Paste the policy / SOP text here…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="flex flex-wrap items-center gap-3">
          <button className="wf-btn-primary px-4 py-2 text-sm disabled:opacity-50" disabled={busy} onClick={addDoc}>
            {busy ? "Indexing…" : "Add document"}
          </button>
          <label className="text-sm text-slate-500 cursor-pointer">
            or upload .txt / .md
            <input
              type="file"
              accept=".txt,.md,text/plain,text/markdown"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
            />
          </label>
        </div>
      </section>

      <section className="wf-panel mb-6">
        <h2 className="text-lg font-semibold mb-3">Documents</h2>
        {loading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : docs.length === 0 ? (
          <p className="text-sm text-slate-500">No documents yet. Add your first policy above.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-200">
                <th className="py-2">Title</th>
                <th className="py-2">Source</th>
                <th className="py-2 text-right">Chunks</th>
                <th className="py-2">Added</th>
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.id} className="border-b border-slate-100">
                  <td className="py-2 font-medium text-slate-800">{d.title}</td>
                  <td className="py-2 text-slate-500">{d.source || "—"}</td>
                  <td className="py-2 text-right">{d.chunk_count}</td>
                  <td className="py-2 text-slate-500">{formatDateTime(d.created_at)}</td>
                  <td className="py-2 text-right">
                    <button className="text-xs text-red-600" onClick={() => removeDoc(d.id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="wf-panel mb-6">
        <h2 className="text-lg font-semibold mb-1">Test retrieval</h2>
        <p className="text-sm text-slate-500 mb-3">See what the copilot would pull for a question.</p>
        <div className="flex gap-2 mb-3">
          <input
            className="wf-input flex-1"
            placeholder="e.g. What is the approval limit for a manager?"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && runSearch()}
          />
          <button className="wf-btn-primary px-4 py-2 text-sm disabled:opacity-50" disabled={searching} onClick={runSearch}>
            {searching ? "Searching…" : "Search"}
          </button>
        </div>
        {hits && hits.length === 0 && <p className="text-sm text-slate-500">No relevant passages found.</p>}
        {hits && hits.length > 0 && (
          <ul className="space-y-2">
            {hits.map((h, i) => (
              <li key={i} className="text-sm border border-slate-200 rounded-lg p-3">
                <div className="flex justify-between text-xs text-slate-500 mb-1">
                  <span className="font-medium">{h.title}</span>
                  <span>score {h.score}</span>
                </div>
                <p className="text-slate-700">{h.content}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
