import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ApiError,
  cloneSuiteTemplate,
  createSuite,
  deleteSuite,
  getSuite,
  listAvailableProcesses,
  listSuiteTemplates,
  listSuites,
  setSuiteItems,
  updateSuite,
  type Suite,
  type SuiteProcess,
  type SuiteTemplate,
} from "../lib/api";
import { getToken } from "../lib/auth";
import { HelpTip } from "../components/HelpTip";

const STATUS_BADGE: Record<string, string> = {
  published: "bg-emerald-50 text-emerald-700 border-emerald-200",
  draft: "bg-amber-50 text-amber-800 border-amber-200",
  unavailable: "bg-slate-100 text-slate-500 border-slate-200",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`shrink-0 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded border ${
        STATUS_BADGE[status] ?? STATUS_BADGE.unavailable
      }`}
    >
      {status}
    </span>
  );
}

function SortableMember({ item, onRemove }: { item: SuiteProcess; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: item.family_id,
  });
  const style = { transform: CSS.Transform.toString(transform), transition };
  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2"
    >
      <button
        type="button"
        className="text-slate-400 cursor-grab hover:text-slate-600"
        {...listeners}
        {...attributes}
        aria-label="Reorder process"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="9" cy="6" r="1" />
          <circle cx="9" cy="12" r="1" />
          <circle cx="9" cy="18" r="1" />
          <circle cx="15" cy="6" r="1" />
          <circle cx="15" cy="12" r="1" />
          <circle cx="15" cy="18" r="1" />
        </svg>
      </button>
      <span className="flex-1 text-sm text-slate-800 truncate">{item.name}</span>
      <StatusBadge status={item.status} />
      <button
        type="button"
        onClick={onRemove}
        className="text-slate-400 hover:text-red-600 px-1"
        aria-label={`Remove ${item.name}`}
      >
        ✕
      </button>
    </li>
  );
}

type Meta = {
  name: string;
  description: string;
  icon: string;
  accent: string;
  status: string;
};

export function SuitesPage() {
  const [suites, setSuites] = useState<Suite[]>([]);
  const [available, setAvailable] = useState<SuiteProcess[]>([]);
  const [templates, setTemplates] = useState<SuiteTemplate[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [members, setMembers] = useState<SuiteProcess[]>([]);
  const [addId, setAddId] = useState("");
  const [newName, setNewName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyTpl, setBusyTpl] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const fail = (e: unknown, fallback: string) =>
    setError(e instanceof ApiError ? e.detail ?? e.message : fallback);

  const refreshLists = useCallback(async () => {
    const tok = getToken();
    const [s, a, t] = await Promise.all([
      listSuites(tok),
      listAvailableProcesses(tok),
      listSuiteTemplates(tok),
    ]);
    setSuites(s);
    setAvailable(a);
    setTemplates(t);
    return s;
  }, []);

  useEffect(() => {
    refreshLists()
      .catch((e) => fail(e, "Failed to load suites"))
      .finally(() => setLoading(false));
  }, [refreshLists]);

  const loadSuite = useCallback(async (id: string) => {
    setError("");
    setMsg("");
    try {
      const d = await getSuite(id, getToken());
      setSelectedId(id);
      setMeta({
        name: d.name,
        description: d.description ?? "",
        icon: d.icon ?? "",
        accent: d.accent ?? "",
        status: d.status,
      });
      setMembers(d.items);
      setAddId("");
    } catch (e) {
      fail(e, "Failed to load suite");
    }
  }, []);

  async function createNew() {
    const name = newName.trim();
    if (!name) return;
    setError("");
    try {
      const created = await createSuite({ name }, getToken());
      setNewName("");
      await refreshLists();
      await loadSuite(created.id);
      setMsg(`Created “${created.name}”. Add processes, then publish.`);
    } catch (e) {
      fail(e, "Could not create suite");
    }
  }

  async function saveChanges() {
    if (!selectedId || !meta) return;
    setSaving(true);
    setError("");
    setMsg("");
    try {
      const tok = getToken();
      await updateSuite(
        selectedId,
        {
          name: meta.name.trim(),
          description: meta.description.trim() || null,
          icon: meta.icon.trim() || null,
          accent: meta.accent.trim() || null,
        },
        tok
      );
      const updated = await setSuiteItems(selectedId, members.map((m) => m.family_id), tok);
      setMembers(updated.items);
      await refreshLists();
      setMsg("Saved.");
    } catch (e) {
      fail(e, "Could not save suite");
    } finally {
      setSaving(false);
    }
  }

  async function togglePublish() {
    if (!selectedId || !meta) return;
    const next = meta.status === "published" ? "draft" : "published";
    setError("");
    try {
      const updated = await updateSuite(selectedId, { status: next }, getToken());
      setMeta((m) => (m ? { ...m, status: updated.status } : m));
      await refreshLists();
      setMsg(next === "published" ? "Suite published — visible in Apps." : "Suite unpublished.");
    } catch (e) {
      fail(e, "Could not change status");
    }
  }

  async function removeSuite() {
    if (!selectedId) return;
    if (!window.confirm("Delete this suite? The processes inside it are not deleted.")) return;
    setError("");
    try {
      await deleteSuite(selectedId, getToken());
      setSelectedId(null);
      setMeta(null);
      setMembers([]);
      await refreshLists();
      setMsg("Suite deleted.");
    } catch (e) {
      fail(e, "Could not delete suite");
    }
  }

  async function useTemplate(id: string) {
    setBusyTpl(id);
    setError("");
    try {
      const res = await cloneSuiteTemplate(id, getToken());
      await refreshLists();
      await loadSuite(res.suite_id);
      setMsg(
        `Created “${res.name}” with ${res.created_workflows} draft process${
          res.created_workflows === 1 ? "" : "es"
        }. Publish each process (in Workflows) and the suite to go live.`
      );
    } catch (e) {
      fail(e, "Could not create suite from template");
    } finally {
      setBusyTpl(null);
    }
  }

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (over && active.id !== over.id) {
      setMembers((prev) => {
        const oldI = prev.findIndex((m) => m.family_id === active.id);
        const newI = prev.findIndex((m) => m.family_id === over.id);
        return oldI < 0 || newI < 0 ? prev : arrayMove(prev, oldI, newI);
      });
    }
  };

  const addable = useMemo(
    () => available.filter((a) => !members.some((m) => m.family_id === a.family_id)),
    [available, members]
  );

  return (
    <div>
      <div className="wf-page-header">
        <div>
          <h1 className="wf-page-title">Suites</h1>
          <p className="wf-page-subtitle">
            Bundle related processes into a no-code application your people launch from one place —
            e.g. an “Expense Management” suite holding petty cash, imprest and transport claims.
          </p>
        </div>
      </div>

      <HelpTip title="How suites work">
        <p>
          A suite groups several <strong>published</strong> processes behind one branded launcher in{" "}
          <strong>Apps</strong>. Build each process as usual (Workflows, Form designer, AI), then drag
          them into a suite and publish. Only published processes appear to end users; drafts stay
          hidden until you publish them.
        </p>
      </HelpTip>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
      {msg && <p className="text-sm text-emerald-700 mb-4">{msg}</p>}

      <div className="grid gap-6 lg:grid-cols-3 items-start">
        {/* ── Left: suite list + create ── */}
        <div className="space-y-4">
          <div className="wf-card p-4">
            <h2 className="font-semibold text-slate-800 mb-3">Your suites</h2>
            {loading ? (
              <p className="text-sm text-slate-500 py-4">Loading…</p>
            ) : suites.length === 0 ? (
              <p className="text-sm text-slate-500 py-2">No suites yet. Create one below.</p>
            ) : (
              <ul className="space-y-1.5 mb-3">
                {suites.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => void loadSuite(s.id)}
                      className={`w-full flex items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors ${
                        selectedId === s.id
                          ? "border-[rgb(var(--wf-brand-500))] bg-[rgb(var(--wf-accent-muted))]"
                          : "border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      <span className="text-lg leading-none">{s.icon || "🗂️"}</span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-medium text-slate-800 truncate">
                          {s.name}
                        </span>
                        <span className="block text-xs text-slate-500">
                          {s.item_count} process{s.item_count === 1 ? "" : "es"}
                        </span>
                      </span>
                      <StatusBadge status={s.status} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex gap-2 border-t border-slate-100 pt-3">
              <input
                className="wf-input text-sm"
                placeholder="New suite name…"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void createNew()}
              />
              <button
                type="button"
                className="wf-btn-primary text-sm shrink-0"
                disabled={!newName.trim()}
                onClick={() => void createNew()}
              >
                Create
              </button>
            </div>
          </div>

          {/* Starter templates */}
          <div className="wf-card p-4">
            <h2 className="font-semibold text-slate-800 mb-1">Start from a template</h2>
            <p className="text-xs text-slate-500 mb-3">
              Ready-made applications. Each clones its processes as drafts for you to tweak.
            </p>
            <div className="space-y-2">
              {templates.map((t) => (
                <div key={t.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex items-start gap-2">
                    <span className="text-xl leading-none">{t.icon || "🗂️"}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-800">{t.name}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{t.description}</p>
                      <p className="text-[11px] text-slate-400 mt-1">
                        {t.process_names.join(" · ")}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="wf-btn-secondary text-xs w-full mt-2"
                    disabled={busyTpl === t.id}
                    onClick={() => void useTemplate(t.id)}
                  >
                    {busyTpl === t.id ? "Creating…" : `Use this suite (${t.process_count})`}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Right: editor ── */}
        <div className="lg:col-span-2">
          {!meta || !selectedId ? (
            <div className="wf-card p-10 text-center text-slate-500">
              Select a suite on the left, or create one, to start building.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="wf-card p-5">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                  <h2 className="font-semibold text-slate-800">Suite details</h2>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={meta.status} />
                    <button type="button" className="wf-btn-secondary text-sm" onClick={() => void togglePublish()}>
                      {meta.status === "published" ? "Unpublish" : "Publish"}
                    </button>
                  </div>
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <label className="sm:col-span-2 block">
                    <span className="block text-sm font-medium text-slate-700 mb-1">Name</span>
                    <input
                      className="wf-input"
                      value={meta.name}
                      onChange={(e) => setMeta({ ...meta, name: e.target.value })}
                    />
                  </label>
                  <label className="sm:col-span-2 block">
                    <span className="block text-sm font-medium text-slate-700 mb-1">Description</span>
                    <textarea
                      className="wf-input min-h-[70px]"
                      value={meta.description}
                      placeholder="What this application is for…"
                      onChange={(e) => setMeta({ ...meta, description: e.target.value })}
                    />
                  </label>
                  <label className="block">
                    <span className="block text-sm font-medium text-slate-700 mb-1">
                      Icon <span className="font-normal text-slate-400">(emoji)</span>
                    </span>
                    <input
                      className="wf-input"
                      maxLength={4}
                      value={meta.icon}
                      placeholder="💳"
                      onChange={(e) => setMeta({ ...meta, icon: e.target.value })}
                    />
                  </label>
                  <label className="block">
                    <span className="block text-sm font-medium text-slate-700 mb-1">Accent colour</span>
                    <input
                      type="color"
                      className="wf-input h-[42px] p-1"
                      value={meta.accent || "#1d4ed8"}
                      onChange={(e) => setMeta({ ...meta, accent: e.target.value })}
                    />
                  </label>
                </div>
              </div>

              <div className="wf-card p-5">
                <h2 className="font-semibold text-slate-800 mb-1">Processes in this suite</h2>
                <p className="text-xs text-slate-500 mb-3">
                  Drag to reorder. Only <strong>published</strong> processes show to end users.
                </p>
                <div className="flex flex-wrap gap-2 mb-3">
                  <select className="wf-input text-sm" value={addId} onChange={(e) => setAddId(e.target.value)}>
                    <option value="">Add a process…</option>
                    {addable.map((p) => (
                      <option key={p.family_id} value={p.family_id}>
                        {p.name}
                        {p.status !== "published" ? ` (${p.status})` : ""}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="wf-btn-secondary text-sm"
                    disabled={!addId}
                    onClick={() => {
                      const p = available.find((x) => x.family_id === addId);
                      if (p) setMembers((prev) => [...prev, p]);
                      setAddId("");
                    }}
                  >
                    Add
                  </button>
                </div>

                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                  <SortableContext items={members.map((m) => m.family_id)} strategy={verticalListSortingStrategy}>
                    <ul className="space-y-2 min-h-[48px]">
                      {members.length === 0 ? (
                        <li className="text-sm text-slate-400 py-4 text-center border border-dashed rounded-lg">
                          Add processes above
                        </li>
                      ) : (
                        members.map((item) => (
                          <SortableMember
                            key={item.family_id}
                            item={item}
                            onRemove={() =>
                              setMembers((prev) => prev.filter((m) => m.family_id !== item.family_id))
                            }
                          />
                        ))
                      )}
                    </ul>
                  </SortableContext>
                </DndContext>
              </div>

              <div className="flex flex-wrap gap-3">
                <button type="button" className="wf-btn-primary" disabled={saving} onClick={() => void saveChanges()}>
                  {saving ? "Saving…" : "Save changes"}
                </button>
                <button type="button" className="wf-btn-ghost text-red-600" onClick={() => void removeSuite()}>
                  Delete suite
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
