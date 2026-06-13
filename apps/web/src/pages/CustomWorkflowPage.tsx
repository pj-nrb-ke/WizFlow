import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  DndContext,
  DragOverlay,
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
  apiFetch,
  ApproverChainItem,
  InitiatorConfig,
  OrgDirectory,
  WorkflowSummary,
} from "../lib/api";
import { getToken } from "../lib/auth";
import { HelpTip } from "../components/HelpTip";

type ChainRow = ApproverChainItem & { sortId: string };

function SortableApprover({
  item,
  onRemove,
}: {
  item: ChainRow;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: item.sortId,
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
        aria-label="Reorder"
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
      <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
        {item.type === "user" ? "User" : "Group"}
      </span>
      <span className="flex-1 text-sm font-medium text-slate-800 truncate">{item.label}</span>
      <button
        type="button"
        className="text-slate-400 hover:text-red-600"
        onClick={onRemove}
        aria-label="Remove approver"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </li>
  );
}

export function CustomWorkflowPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [nameOk, setNameOk] = useState<boolean | null>(null);
  const [forms, setForms] = useState<WorkflowSummary[]>([]);
  const [formId, setFormId] = useState("");
  const [directory, setDirectory] = useState<OrgDirectory | null>(null);
  const [initiator, setInitiator] = useState<InitiatorConfig>({
    everyone: false,
    user_ids: [],
    group_ids: [],
  });
  const [chain, setChain] = useState<ChainRow[]>([]);
  const [addUserId, setAddUserId] = useState("");
  const [addGroupId, setAddGroupId] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [activeDrag, setActiveDrag] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    const token = getToken();
    Promise.all([
      apiFetch<WorkflowSummary[]>("/api/v1/workflows/form-options", {}, token),
      apiFetch<OrgDirectory>("/api/v1/workflows/org-directory", {}, token),
    ])
      .then(([f, d]) => {
        setForms(f);
        if (f.length) setFormId(f[0].id);
        setDirectory(d);
      })
      .catch((e) =>
        setError(e instanceof ApiError ? e.detail ?? e.message : "Failed to load directory")
      );
  }, []);

  const checkName = useCallback(async (value: string) => {
    if (!value.trim()) {
      setNameOk(null);
      return;
    }
    try {
      const res = await apiFetch<{ available: boolean }>(
        `/api/v1/workflows/check-name?name=${encodeURIComponent(value.trim())}`,
        {},
        getToken()
      );
      setNameOk(res.available);
    } catch {
      setNameOk(null);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void checkName(name), 400);
    return () => clearTimeout(t);
  }, [name, checkName]);

  function toggleInitiatorUser(uid: string) {
    setInitiator((prev) => {
      const has = prev.user_ids.includes(uid);
      return {
        ...prev,
        everyone: false,
        user_ids: has ? prev.user_ids.filter((id) => id !== uid) : [...prev.user_ids, uid],
      };
    });
  }

  function toggleInitiatorGroup(gid: string) {
    setInitiator((prev) => {
      const has = prev.group_ids.includes(gid);
      return {
        ...prev,
        everyone: false,
        group_ids: has ? prev.group_ids.filter((id) => id !== gid) : [...prev.group_ids, gid],
      };
    });
  }

  function addApprover(type: "user" | "group", id: string, label: string) {
    if (!id) return;
    if (chain.some((c) => c.type === type && c.id === id)) return;
    setChain((prev) => [
      ...prev,
      { type, id, label, sortId: `${type}-${id}-${Date.now()}` },
    ]);
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveDrag(null);
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = chain.findIndex((c) => c.sortId === active.id);
    const newIndex = chain.findIndex((c) => c.sortId === over.id);
    if (oldIndex >= 0 && newIndex >= 0) {
      setChain(arrayMove(chain, oldIndex, newIndex));
    }
  }

  async function save() {
    setError("");
    if (!name.trim()) {
      setError("Enter a workflow name.");
      return;
    }
    if (nameOk === false) {
      setError("Workflow name is already in use.");
      return;
    }
    if (!formId) {
      setError("Select a form to attach.");
      return;
    }
    if (!initiator.everyone && !initiator.user_ids.length && !initiator.group_ids.length) {
      setError("Select at least one initiator (user, group, or everyone).");
      return;
    }
    if (chain.length === 0) {
      setError("Add at least one approver in order.");
      return;
    }
    setSaving(true);
    try {
      const wf = await apiFetch<{ id: string; name: string }>(
        "/api/v1/workflows/custom",
        {
          method: "POST",
          body: JSON.stringify({
            name: name.trim(),
            attached_form_workflow_id: formId,
            initiator,
            approver_chain: chain.map(({ type, id }) => ({ type, id })),
          }),
        },
        getToken()
      );
      navigate("/workflows", { state: { openId: wf.id } });
    } catch (e) {
      setError(e instanceof ApiError ? e.detail ?? e.message : "Failed to save workflow");
    } finally {
      setSaving(false);
    }
  }

  const dragLabel = chain.find((c) => c.sortId === activeDrag)?.label;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="wf-page-title flex items-center gap-2">
          Custom workflow
          <HelpTip text="Build a simple approval chain without the full form designer. Attach an existing form workflow and drag approvers into order." />
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          Name your workflow, attach a form, choose who can start requests (initiators), and set
          approvers in order. Duplicate users in a group are ignored automatically.
        </p>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <div className="wf-card p-4 space-y-4">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Workflow name</span>
          <input
            className="wf-input mt-1 w-full max-w-md"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Capex approval"
          />
          {nameOk === true && (
            <span className="text-xs text-emerald-600 mt-1 block">Name is available</span>
          )}
          {nameOk === false && (
            <span className="text-xs text-red-600 mt-1 block">Name already in use</span>
          )}
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Attached form</span>
          <select
            className="wf-input mt-1 w-full max-w-md"
            value={formId}
            onChange={(e) => setFormId(e.target.value)}
          >
            {forms.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
          <p className="text-xs text-slate-400 mt-1">
            Published forms from{" "}
            <Link to="/form-designer" className="underline text-[rgb(var(--wf-brand-600))]">
              Form Designer
            </Link>
            . Approve &amp; Reject buttons are added for approvers automatically.
          </p>
        </label>
      </div>

      <div className="wf-card p-4">
        <h2 className="font-semibold text-slate-800 mb-2">Initiators</h2>
        <p className="text-xs text-slate-500 mb-3">
          Only these people will see this form under New request.
        </p>
        <label className="flex items-center gap-2 mb-3 cursor-pointer">
          <input
            type="checkbox"
            checked={initiator.everyone}
            onChange={(e) =>
              setInitiator({
                everyone: e.target.checked,
                user_ids: [],
                group_ids: [],
              })
            }
          />
          <span className="text-sm">Everyone in the company</span>
        </label>
        {!initiator.everyone && directory && (
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-medium text-slate-500 mb-2">Individual users</p>
              <ul className="max-h-40 overflow-y-auto border border-slate-200 rounded-lg divide-y text-sm">
                {directory.users.map((u) => (
                  <li key={u.id}>
                    <label className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-slate-50">
                      <input
                        type="checkbox"
                        checked={initiator.user_ids.includes(u.id)}
                        onChange={() => toggleInitiatorUser(u.id)}
                      />
                      {u.full_name}
                    </label>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500 mb-2">User groups</p>
              <ul className="max-h-40 overflow-y-auto border border-slate-200 rounded-lg divide-y text-sm">
                {directory.groups.map((g) => (
                  <li key={g.id}>
                    <label className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-slate-50">
                      <input
                        type="checkbox"
                        checked={initiator.group_ids.includes(g.id)}
                        onChange={() => toggleInitiatorGroup(g.id)}
                      />
                      {g.name} ({g.member_count})
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>

      <div className="wf-card p-4">
        <h2 className="font-semibold text-slate-800 mb-2">Approvers (in order)</h2>
        <p className="text-xs text-slate-500 mb-3">
          Drag to reorder. Each step must be approved before the next approver is notified.
        </p>
        <div className="flex flex-wrap gap-2 mb-3">
          <select
            className="wf-input text-sm"
            value={addUserId}
            onChange={(e) => setAddUserId(e.target.value)}
          >
            <option value="">Add user…</option>
            {directory?.users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="wf-btn-secondary text-sm"
            onClick={() => {
              const u = directory?.users.find((x) => x.id === addUserId);
              if (u) addApprover("user", u.id, u.full_name);
              setAddUserId("");
            }}
          >
            Add user
          </button>
          <select
            className="wf-input text-sm"
            value={addGroupId}
            onChange={(e) => setAddGroupId(e.target.value)}
          >
            <option value="">Add group…</option>
            {directory?.groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="wf-btn-secondary text-sm"
            onClick={() => {
              const g = directory?.groups.find((x) => x.id === addGroupId);
              if (g) addApprover("group", g.id, g.name);
              setAddGroupId("");
            }}
          >
            Add group
          </button>
        </div>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={(e) => setActiveDrag(String(e.active.id))}
          onDragEnd={onDragEnd}
        >
          <SortableContext items={chain.map((c) => c.sortId)} strategy={verticalListSortingStrategy}>
            <ul className="space-y-2 min-h-[48px]">
              {chain.length === 0 ? (
                <li className="text-sm text-slate-400 py-4 text-center border border-dashed rounded-lg">
                  Add users or groups above
                </li>
              ) : (
                chain.map((item) => (
                  <SortableApprover
                    key={item.sortId}
                    item={item}
                    onRemove={() => setChain((prev) => prev.filter((c) => c.sortId !== item.sortId))}
                  />
                ))
              )}
            </ul>
          </SortableContext>
          <DragOverlay>
            {dragLabel ? (
              <div className="px-3 py-2 bg-white border shadow rounded-lg text-sm">{dragLabel}</div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          className="wf-btn-primary"
          disabled={saving || nameOk === false}
          onClick={() => void save()}
        >
          {saving ? "Saving…" : "Save as draft workflow"}
        </button>
        <Link to="/workflows" className="wf-btn-secondary">
          Cancel
        </Link>
      </div>
    </div>
  );
}
