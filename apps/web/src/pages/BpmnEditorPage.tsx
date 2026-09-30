import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError, apiFetch, type BpmnDiagramDetail } from "../lib/api";
import { getToken } from "../lib/auth";
import type { BpmnHandle } from "../components/BpmnModeler";

// Code-split: bpmn-js only loads when the editor is opened.
const BpmnCanvas = lazy(() => import("../components/BpmnModeler"));

export function BpmnEditorPage() {
  const { id } = useParams<{ id: string }>();
  const [diagram, setDiagram] = useState<BpmnDiagramDetail | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState("");
  const canvasRef = useRef<BpmnHandle>(null);

  useEffect(() => {
    if (!id) return;
    apiFetch<BpmnDiagramDetail>(`/api/v1/bpmn/${id}`, {}, getToken())
      .then(setDiagram)
      .catch((e) => setError(e instanceof ApiError ? e.detail ?? e.message : "Failed to load"));
  }, [id]);

  async function save() {
    if (!id || !canvasRef.current) return;
    setSaving(true);
    setError("");
    try {
      const xml = await canvasRef.current.getXml();
      await apiFetch(
        `/api/v1/bpmn/${id}`,
        { method: "PATCH", body: JSON.stringify({ bpmn_xml: xml }) },
        getToken()
      );
      setSavedAt(new Date().toLocaleTimeString());
    } catch (e) {
      setError(e instanceof ApiError ? e.detail ?? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function download(kind: "xml" | "svg") {
    if (!canvasRef.current) return;
    const content = kind === "xml" ? await canvasRef.current.getXml() : await canvasRef.current.getSvg();
    const blob = new Blob([content], { type: kind === "xml" ? "application/xml" : "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${diagram?.name ?? "diagram"}.${kind === "xml" ? "bpmn" : "svg"}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (error && !diagram) return <p className="text-sm text-red-600">{error}</p>;
  if (!diagram) return <p className="text-slate-500">Loading…</p>;

  return (
    <div>
      <Link to="/process-designer" className="text-sm wf-link mb-3 inline-block">
        ← Process Designer
      </Link>
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <h1 className="wf-page-title">{diagram.name}</h1>
        <div className="flex gap-2 ml-auto">
          <button
            onClick={() => download("svg")}
            className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg hover:bg-slate-50"
          >
            Export SVG
          </button>
          <button
            onClick={() => download("xml")}
            className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg hover:bg-slate-50"
          >
            Export BPMN
          </button>
          <button onClick={save} disabled={saving} className="wf-btn-primary px-4 py-1.5 text-sm disabled:opacity-50">
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
      {error ? <p className="text-sm text-red-600 mb-2">{error}</p> : null}
      {savedAt ? <p className="text-xs text-slate-400 mb-2">Saved at {savedAt}</p> : null}
      <Suspense fallback={<p className="text-slate-500">Loading designer…</p>}>
        <BpmnCanvas ref={canvasRef} xml={diagram.bpmn_xml} />
      </Suspense>
    </div>
  );
}
