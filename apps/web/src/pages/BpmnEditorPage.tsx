import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError, apiFetch, type BpmnBindings, type BpmnDiagramDetail } from "../lib/api";
import { getToken } from "../lib/auth";
import type { BpmnHandle, BpmnSelection } from "../components/BpmnModeler";

// Code-split: bpmn-js only loads when the editor is opened.
const BpmnCanvas = lazy(() => import("../components/BpmnModeler"));

const APPROVAL_TYPES = ["bpmn:UserTask", "bpmn:Task", "bpmn:ManualTask"];
const SERVICE_TYPES = ["bpmn:ServiceTask", "bpmn:SendTask", "bpmn:ScriptTask"];
const SERVICE_KINDS = ["notify", "webhook", "ai", "document"] as const;
const OPS = ["eq", "ne", "gt", "gte", "lt", "lte", "contains", "in"];
const FIELD_TYPES = ["text", "number", "date", "textarea"];
const SERVICE_FIELD: Record<string, { attr: string; label: string }> = {
  notify: { attr: "message", label: "Message ({field} placeholders allowed)" },
  webhook: { attr: "url", label: "Webhook URL" },
  ai: { attr: "prompt", label: "AI instruction" },
  document: { attr: "template_id", label: "Document template id" },
};

export function BpmnEditorPage() {
  const { id } = useParams<{ id: string }>();
  const [diagram, setDiagram] = useState<BpmnDiagramDetail | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState<{ workflow_id: string; name: string; warnings: string[] } | null>(null);
  const [runningNative, setRunningNative] = useState(false);
  const [nativeStarted, setNativeStarted] = useState<{ status: string; ready: number } | null>(null);
  const [bindings, setBindings] = useState<BpmnBindings>({});
  const [selected, setSelected] = useState<BpmnSelection | null>(null);
  const [chat, setChat] = useState<{ role: "you" | "copilot"; text: string }[]>([]);
  const [prompt, setPrompt] = useState("");
  const [asking, setAsking] = useState(false);
  const canvasRef = useRef<BpmnHandle>(null);

  useEffect(() => {
    if (!id) return;
    apiFetch<BpmnDiagramDetail>(`/api/v1/bpmn/${id}`, {}, getToken())
      .then((d) => { setDiagram(d); setBindings(d.bindings ?? {}); })
      .catch((e) => setError(e instanceof ApiError ? e.detail ?? e.message : "Failed to load"));
  }, [id]);

  async function persist(): Promise<void> {
    if (!id || !canvasRef.current) return;
    const xml = await canvasRef.current.getXml();
    await apiFetch(`/api/v1/bpmn/${id}`, { method: "PATCH", body: JSON.stringify({ bpmn_xml: xml, bindings }) }, getToken());
  }

  async function save() {
    setSaving(true); setError("");
    try { await persist(); setSavedAt(new Date().toLocaleTimeString()); }
    catch (e) { setError(e instanceof ApiError ? e.detail ?? e.message : "Save failed"); }
    finally { setSaving(false); }
  }

  async function publishAsApp() {
    if (!id) return;
    setPublishing(true); setError(""); setPublished(null);
    try {
      await persist();
      const res = await apiFetch<{ workflow_id: string; name: string; warnings: string[] }>(
        `/api/v1/bpmn/${id}/publish-as-app`, { method: "POST" }, getToken()
      );
      setPublished(res);
    } catch (e) {
      setError(e instanceof ApiError ? e.detail ?? e.message : "Could not publish as app");
    } finally { setPublishing(false); }
  }

  async function ask() {
    const message = prompt.trim();
    if (!id || !message || asking) return;
    setAsking(true); setError("");
    setChat((c) => [...c, { role: "you", text: message }]);
    setPrompt("");
    try {
      const res = await apiFetch<{ reply: string; bpmn_xml: string; bindings: BpmnBindings; warnings: string[] }>(
        `/api/v1/bpmn/${id}/assistant`, { method: "POST", body: JSON.stringify({ message }) }, getToken()
      );
      await canvasRef.current?.importXml(res.bpmn_xml);
      setBindings(res.bindings ?? {});
      const note = res.warnings?.length ? `\n• ${res.warnings.join("\n• ")}` : "";
      setChat((c) => [...c, { role: "copilot", text: res.reply + note }]);
    } catch (e) {
      setChat((c) => [...c, { role: "copilot", text: "Sorry — I couldn't apply that." }]);
      setError(e instanceof ApiError ? e.detail ?? e.message : "Copilot failed");
    } finally { setAsking(false); }
  }

  async function runAsNative() {
    if (!id) return;
    setRunningNative(true); setError(""); setNativeStarted(null);
    try {
      await persist();
      const res = await apiFetch<{ id: string; status: string; ready_tasks: unknown[] }>(
        `/api/v1/bpmn/${id}/run`, { method: "POST", body: JSON.stringify({ data: {} }) }, getToken()
      );
      setNativeStarted({ status: res.status, ready: res.ready_tasks.length });
    } catch (e) {
      setError(e instanceof ApiError ? e.detail ?? e.message : "Could not start native app");
    } finally { setRunningNative(false); }
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
      <Link to="/process-designer" className="text-sm wf-link mb-3 inline-block">← Process Designer</Link>
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <h1 className="wf-page-title">{diagram.name}</h1>
        <div className="flex gap-2 ml-auto">
          <button onClick={() => download("svg")} className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg hover:bg-slate-50">Export SVG</button>
          <button onClick={() => download("xml")} className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg hover:bg-slate-50">Export BPMN</button>
          <button onClick={save} disabled={saving} className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50">{saving ? "Saving…" : "Save"}</button>
          <button onClick={publishAsApp} disabled={publishing} className="wf-btn-primary px-4 py-1.5 text-sm disabled:opacity-50">{publishing ? "Publishing…" : "Publish as app"}</button>
          <button onClick={runAsNative} disabled={runningNative} title="For diagrams with parallel branches, events or loops that Publish as app can't run"
            className="px-3 py-1.5 text-sm border border-[rgb(var(--wf-brand-500))] text-[rgb(var(--wf-brand-700))] rounded-lg hover:bg-slate-50 disabled:opacity-50">
            {runningNative ? "Starting…" : "Run as native app"}
          </button>
        </div>
      </div>
      {error ? <p className="text-sm text-red-600 mb-2">{error}</p> : null}
      {savedAt ? <p className="text-xs text-slate-400 mb-2">Saved at {savedAt}</p> : null}
      {published ? (
        <div className="mb-3 rounded-lg border border-green-200 bg-green-50 p-3 text-sm">
          <p className="font-medium text-green-800">
            “{published.name}” was created as a draft app.{" "}
            <Link to="/workflows" className="wf-link underline">Review &amp; publish it →</Link>
          </p>
          {published.warnings.length > 0 && (
            <ul className="mt-1 list-disc pl-5 text-amber-700 text-xs">
              {published.warnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          )}
        </div>
      ) : null}
      {nativeStarted ? (
        <div className="mb-3 rounded-lg border border-green-200 bg-green-50 p-3 text-sm">
          <p className="font-medium text-green-800">
            Native app {nativeStarted.status === "completed" ? "ran to completion" : "started"} —{" "}
            {nativeStarted.ready} task(s) now awaiting action in the{" "}
            <Link to="/inbox" className="wf-link underline">inbox →</Link>
          </p>
        </div>
      ) : null}
      <div className="wf-card p-3 mb-3">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm font-semibold text-slate-800">🤖 Copilot</span>
          <span className="text-xs text-slate-500">Describe the process and it builds the diagram & form.</span>
        </div>
        {chat.length > 0 && (
          <div className="mb-2 max-h-36 overflow-y-auto space-y-1 text-sm">
            {chat.map((m, i) => (
              <p key={i} className={m.role === "you" ? "text-slate-700" : "text-[rgb(var(--wf-brand-700))] whitespace-pre-line"}>
                <span className="font-medium">{m.role === "you" ? "You" : "Copilot"}:</span> {m.text}
              </p>
            ))}
          </div>
        )}
        <form onSubmit={(e) => { e.preventDefault(); ask(); }} className="flex gap-2">
          <input className="wf-input flex-1 text-sm" placeholder='e.g. "Start with a purchase request, then manager then finance approval; collect an amount field"'
            value={prompt} onChange={(e) => setPrompt(e.target.value)} disabled={asking} />
          <button type="submit" disabled={asking || !prompt.trim()} className="wf-btn-primary px-4 py-1.5 text-sm disabled:opacity-50">
            {asking ? "Thinking…" : "Send"}
          </button>
        </form>
      </div>
      <div className="flex gap-3 items-start">
        <div className="flex-1 min-w-0">
          <Suspense fallback={<p className="text-slate-500">Loading designer…</p>}>
            <BpmnCanvas ref={canvasRef} xml={diagram.bpmn_xml} onSelect={setSelected} />
          </Suspense>
        </div>
        <BindingPanel selected={selected} bindings={bindings} setBindings={setBindings} />
      </div>
    </div>
  );
}

function BindingPanel({
  selected, bindings, setBindings,
}: {
  selected: BpmnSelection | null;
  bindings: BpmnBindings;
  setBindings: (b: BpmnBindings) => void;
}) {
  const form = bindings.form ?? [];
  const setForm = (f: BpmnBindings["form"]) => setBindings({ ...bindings, form: f });
  const taskB = (id: string) => bindings.tasks?.[id] ?? {};
  const setTask = (id: string, patch: Record<string, unknown>) =>
    setBindings({ ...bindings, tasks: { ...(bindings.tasks ?? {}), [id]: { ...taskB(id), ...patch } } });
  const flowB = (id: string) => bindings.flows?.[id];
  const setFlow = (id: string, cond: { field: string; op: string; value: string | number } | undefined) => {
    const flows = { ...(bindings.flows ?? {}) };
    if (cond) flows[id] = cond; else delete flows[id];
    setBindings({ ...bindings, flows });
  };

  const isApproval = selected && APPROVAL_TYPES.includes(selected.type);
  const isService = selected && SERVICE_TYPES.includes(selected.type);
  const isFlow = selected && selected.type === "bpmn:SequenceFlow";

  return (
    <aside className="w-80 shrink-0 wf-card p-4 text-sm" style={{ maxHeight: "72vh", overflowY: "auto" }}>
      {/* Request form — process-level */}
      <h3 className="font-semibold text-slate-800">Request form</h3>
      <p className="text-xs text-slate-500 mb-2">Fields the requester fills when starting the app.</p>
      {form.map((f, i) => (
        <div key={i} className="border border-slate-200 rounded p-2 mb-2">
          <div className="flex gap-1 mb-1">
            <input className="wf-input flex-1 text-xs" placeholder="key" value={f.key}
              onChange={(e) => setForm(form.map((x, j) => j === i ? { ...x, key: e.target.value.replace(/[^a-z0-9_]/gi, "_").toLowerCase() } : x))} />
            <button className="text-red-600 text-xs px-1" onClick={() => setForm(form.filter((_, j) => j !== i))}>✕</button>
          </div>
          <input className="wf-input w-full text-xs mb-1" placeholder="Label" value={f.label}
            onChange={(e) => setForm(form.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} />
          <div className="flex items-center gap-2">
            <select className="wf-input text-xs flex-1" value={f.type}
              onChange={(e) => setForm(form.map((x, j) => j === i ? { ...x, type: e.target.value } : x))}>
              {FIELD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={f.required}
              onChange={(e) => setForm(form.map((x, j) => j === i ? { ...x, required: e.target.checked } : x))} />req</label>
          </div>
        </div>
      ))}
      <button className="text-xs wf-link" onClick={() => setForm([...form, { key: `field_${form.length + 1}`, type: "text", label: "New field", required: false }])}>+ Add field</button>

      <hr className="my-3 border-slate-200" />

      {/* Element-specific */}
      {!selected && <p className="text-xs text-slate-500">Select a step or flow on the canvas to configure it.</p>}
      {selected && !isApproval && !isService && !isFlow && (
        <p className="text-xs text-slate-500">“{selected.name || selected.type.replace("bpmn:", "")}” has no settings.</p>
      )}

      {isApproval && selected && (
        <div>
          <h3 className="font-semibold text-slate-800 mb-1">Approval: {selected.name || selected.id}</h3>
          <label className="text-xs text-slate-600">Assignee role</label>
          <input className="wf-input w-full text-xs mb-2" placeholder="e.g. manager"
            value={String((taskB(selected.id).assignee as any)?.value ?? "")}
            onChange={(e) => setTask(selected.id, { assignee: { ...(taskB(selected.id).assignee as any ?? {}), type: "role", value: e.target.value } })} />
          <label className="text-xs text-slate-600">Approval mode</label>
          <select className="wf-input w-full text-xs"
            value={String((taskB(selected.id).assignee as any)?.mode ?? "claim")}
            onChange={(e) => setTask(selected.id, { assignee: { ...(taskB(selected.id).assignee as any ?? { type: "role" }), mode: e.target.value } })}>
            <option value="claim">First to claim</option>
            <option value="parallel">All must approve (parallel)</option>
            <option value="round_robin">Round robin</option>
            <option value="load_balance">Load balance</option>
          </select>
        </div>
      )}

      {isService && selected && (
        <div>
          <h3 className="font-semibold text-slate-800 mb-1">Automated step: {selected.name || selected.id}</h3>
          <label className="text-xs text-slate-600">Action</label>
          <select className="wf-input w-full text-xs mb-2"
            value={String((taskB(selected.id).service as any)?.type ?? "notify")}
            onChange={(e) => setTask(selected.id, { service: { ...(taskB(selected.id).service as any ?? {}), type: e.target.value } })}>
            {SERVICE_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
          {(() => {
            const stype = String((taskB(selected.id).service as any)?.type ?? "notify");
            const cfg = SERVICE_FIELD[stype];
            return (
              <>
                <label className="text-xs text-slate-600">{cfg.label}</label>
                <input className="wf-input w-full text-xs" value={String((taskB(selected.id).service as any)?.[cfg.attr] ?? "")}
                  onChange={(e) => setTask(selected.id, { service: { ...(taskB(selected.id).service as any ?? { type: stype }), [cfg.attr]: e.target.value } })} />
              </>
            );
          })()}
        </div>
      )}

      {isFlow && selected && (
        <div>
          <h3 className="font-semibold text-slate-800 mb-1">Branch condition</h3>
          <p className="text-xs text-slate-500 mb-2">On a flow out of a gateway: take this path when…</p>
          <input className="wf-input w-full text-xs mb-1" placeholder="form field key (e.g. amount)"
            value={flowB(selected.id)?.field ?? ""}
            onChange={(e) => setFlow(selected.id, { field: e.target.value, op: flowB(selected.id)?.op ?? "gt", value: flowB(selected.id)?.value ?? "" })} />
          <div className="flex gap-1">
            <select className="wf-input text-xs" value={flowB(selected.id)?.op ?? "gt"}
              onChange={(e) => setFlow(selected.id, { field: flowB(selected.id)?.field ?? "", op: e.target.value, value: flowB(selected.id)?.value ?? "" })}>
              {OPS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
            <input className="wf-input text-xs flex-1" placeholder="value" value={String(flowB(selected.id)?.value ?? "")}
              onChange={(e) => setFlow(selected.id, { field: flowB(selected.id)?.field ?? "", op: flowB(selected.id)?.op ?? "gt", value: e.target.value })} />
          </div>
          {flowB(selected.id) && <button className="text-xs text-red-600 mt-1" onClick={() => setFlow(selected.id, undefined)}>Clear condition</button>}
        </div>
      )}
    </aside>
  );
}
