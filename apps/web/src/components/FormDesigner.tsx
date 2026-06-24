import { useCallback, useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { FormField, FormFieldOption } from "../lib/api";
import { WorkflowFormRenderer } from "./WorkflowFormRenderer";
import { buildInitialForm } from "../lib/formValidation";
import {
  DESIGNER_CONTROLS,
  FIELD_ROLE_OPTIONS,
  MASTER_DATA_CATEGORIES,
  type DesignerControlId,
  type DesignerField,
  type FormDesignerSchema,
  createDesignerField,
  ensureUniqueKey,
  isInputField,
  toPersistedSchema,
} from "../lib/formDesigner";
import type { TableColumn } from "../lib/api";
import { FORM_LAYOUTS } from "../lib/themes";

type Props = {
  value: FormDesignerSchema;
  onChange: (next: FormDesignerSchema) => void;
};

function PaletteItem({ control }: { control: (typeof DESIGNER_CONTROLS)[number] }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette-${control.id}`,
    data: { kind: "palette", control: control.id },
  });

  return (
    <button
      ref={setNodeRef}
      type="button"
      className={`w-full text-left px-3 py-2.5 rounded-lg border border-slate-200 bg-white hover:border-[rgb(var(--wf-brand-400))] hover:bg-[rgb(var(--wf-accent-muted))] transition-colors ${
        isDragging ? "opacity-40" : ""
      }`}
      {...listeners}
      {...attributes}
    >
      <span className="block text-sm font-medium text-slate-800">{control.label}</span>
      <span className="block text-xs text-slate-500 mt-0.5">{control.hint}</span>
    </button>
  );
}

function SortableFieldRow({
  field,
  selected,
  onSelect,
  onRemove,
}: {
  field: DesignerField;
  selected: boolean;
  onSelect: () => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `field-${field.designerId}`,
    data: { kind: "field", designerId: field.designerId },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const typeLabel =
    field.type === "dropdown"
      ? "Listbox"
      : field.type === "radio"
        ? "Option control"
        : field.type === "combobox"
          ? "Combobox"
          : field.type === "text"
            ? "Textbox"
            : field.type === "label"
              ? "Label"
              : field.type === "button"
                ? "Button"
                : field.type === "date"
                  ? "Date picker"
                  : field.type === "time"
                    ? "Time picker"
                    : field.type === "table"
                      ? "Table / Grid"
                      : field.type;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-stretch gap-2 rounded-lg border bg-white ${
        selected
          ? "border-[rgb(var(--wf-brand-500))] ring-2 ring-[rgb(var(--wf-brand-200))]"
          : "border-slate-200"
      } ${isDragging ? "opacity-50 shadow-lg" : ""}`}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onSelect()}
    >
      <button
        type="button"
        className="px-2 text-slate-400 hover:text-slate-600 cursor-grab active:cursor-grabbing border-r border-slate-100"
        aria-label="Drag to reorder"
        {...listeners}
        {...attributes}
        onClick={(e) => e.stopPropagation()}
      >
        ⋮⋮
      </button>
      <div className="flex-1 py-3 pr-2 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-slate-800 truncate">{field.label}</span>
          <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{typeLabel}</span>
          {field.required && (
            <span className="text-xs text-red-500 font-medium">Required</span>
          )}
        </div>
        <p className="text-xs text-slate-400 mt-0.5 font-mono truncate">{field.key}</p>
      </div>
      <button
        type="button"
        className="px-3 text-slate-400 hover:text-red-600 text-lg"
        aria-label="Remove control"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
      >
        ×
      </button>
    </div>
  );
}

function FieldProperties({
  field,
  fields,
  onUpdate,
}: {
  field: DesignerField;
  fields: DesignerField[];
  onUpdate: (patch: Partial<DesignerField>) => void;
}) {
  const hasOptions =
    field.type === "dropdown" ||
    field.type === "combobox" ||
    field.type === "radio" ||
    field.type === "listbox" ||
    field.type === "yesno";

  const isMasterDropdown = field.type === "master_dropdown";
  const isCalculated = field.type === "calculated";
  const isTable = field.type === "table";
  const tableField = field as DesignerField & { tableColumns?: TableColumn[]; tableRowLabels?: string[] };
  const hasOptionSource =
    field.type === "dropdown" ||
    field.type === "combobox" ||
    field.type === "listbox";

  function setOptions(options: FormFieldOption[]) {
    onUpdate({ options });
  }

  function toggleRole(list: string[] | undefined, role: string): string[] {
    const cur = list ?? [];
    return cur.includes(role) ? cur.filter((r) => r !== role) : [...cur, role];
  }

  return (
    <div className="space-y-4 text-sm">
      <h3 className="font-semibold text-slate-800">Control properties</h3>

      <label className="block">
        <span className="text-slate-600">Caption / label</span>
        <input
          className="wf-input mt-1 w-full"
          value={field.label}
          onChange={(e) => onUpdate({ label: e.target.value })}
        />
      </label>

      {field.type !== "label" && (
        <label className="block">
          <span className="text-slate-600">Field key</span>
          <input
            className="wf-input mt-1 w-full font-mono text-xs"
            value={field.key}
            onChange={(e) => {
              const raw = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_");
              onUpdate({ key: ensureUniqueKey(fields, raw, field.designerId) });
            }}
          />
        </label>
      )}

      {(field.type === "label" || field.type === "section") && (
        <label className="block">
          <span className="text-slate-600">Text content</span>
          <textarea
            className="wf-input mt-1 w-full min-h-[72px]"
            value={field.content ?? ""}
            onChange={(e) => onUpdate({ content: e.target.value })}
          />
        </label>
      )}

      {isMasterDropdown && (
        <label className="block">
          <span className="text-slate-600">Master data category</span>
          <select
            className="wf-input mt-1 w-full"
            value={field.optionSource?.category ?? "department"}
            onChange={(e) =>
              onUpdate({
                optionSource: { type: "master_data", category: e.target.value },
              })
            }
          >
            {MASTER_DATA_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </label>
      )}

      {hasOptionSource && (
        <>
          <label className="block">
            <span className="text-slate-600">Dropdown source</span>
            <select
              className="wf-input mt-1 w-full"
              value={field.optionSource?.type ?? "static"}
              onChange={(e) => {
                const t = e.target.value as "static" | "master_data" | "org_users" | "api_url";
                if (t === "static") onUpdate({ optionSource: { type: "static" } });
                else if (t === "master_data")
                  onUpdate({ optionSource: { type: "master_data", category: "department" } });
                else if (t === "org_users") onUpdate({ optionSource: { type: "org_users" } });
                else onUpdate({ optionSource: { type: "api_url", apiUrl: "" } });
              }}
            >
              <option value="static">Fixed options</option>
              <option value="master_data">Master data library</option>
              <option value="org_users">Company users</option>
              <option value="api_url">External API (JSON)</option>
            </select>
          </label>
          {field.optionSource?.type === "master_data" && (
            <label className="block">
              <span className="text-slate-600">Category</span>
              <select
                className="wf-input mt-1 w-full"
                value={field.optionSource.category ?? "department"}
                onChange={(e) =>
                  onUpdate({
                    optionSource: { type: "master_data", category: e.target.value },
                  })
                }
              >
                {MASTER_DATA_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </label>
          )}
          {field.optionSource?.type === "api_url" && (
            <label className="block">
              <span className="text-slate-600">API URL</span>
              <input
                className="wf-input mt-1 w-full text-xs"
                value={field.optionSource.apiUrl ?? ""}
                onChange={(e) =>
                  onUpdate({
                    optionSource: { type: "api_url", apiUrl: e.target.value },
                  })
                }
                placeholder="https://…/options.json"
              />
            </label>
          )}
        </>
      )}

      {isCalculated && (
        <label className="block">
          <span className="text-slate-600">Formula</span>
          <input
            className="wf-input mt-1 w-full font-mono text-xs"
            value={field.formula ?? ""}
            onChange={(e) => onUpdate({ formula: e.target.value })}
            placeholder="{amount} * 0.15"
          />
        </label>
      )}

      {field.type === "attachment" && (
        <label className="block">
          <span className="text-slate-600">Attachment category</span>
          <input
            className="wf-input mt-1 w-full"
            value={field.attachmentCategory ?? ""}
            onChange={(e) => onUpdate({ attachmentCategory: e.target.value })}
            placeholder="e.g. invoice, receipt"
          />
        </label>
      )}

      {isInputField(field) && field.type !== "label" && (
        <div>
          <span className="text-slate-600 block mb-2">Visible to roles</span>
          <div className="flex flex-wrap gap-2">
            {FIELD_ROLE_OPTIONS.map((role) => (
              <label key={role} className="text-xs flex items-center gap-1 border rounded px-2 py-1">
                <input
                  type="checkbox"
                  checked={field.visibleTo?.includes(role) ?? false}
                  onChange={() => onUpdate({ visibleTo: toggleRole(field.visibleTo, role) })}
                />
                {role}
              </label>
            ))}
          </div>
          <span className="text-slate-600 block mb-2 mt-3">Editable by roles</span>
          <div className="flex flex-wrap gap-2">
            {FIELD_ROLE_OPTIONS.map((role) => (
              <label key={`e-${role}`} className="text-xs flex items-center gap-1 border rounded px-2 py-1">
                <input
                  type="checkbox"
                  checked={field.editableBy?.includes(role) ?? false}
                  onChange={() => onUpdate({ editableBy: toggleRole(field.editableBy, role) })}
                />
                {role}
              </label>
            ))}
          </div>
          <p className="text-xs text-slate-400 mt-1">Leave unchecked to allow all roles.</p>
        </div>
      )}

      {field.type === "button" && (
        <label className="block">
          <span className="text-slate-600">Button text</span>
          <input
            className="wf-input mt-1 w-full"
            value={field.buttonText ?? ""}
            onChange={(e) => onUpdate({ buttonText: e.target.value })}
          />
        </label>
      )}

      {isTable && (
        <div className="space-y-4">
          <div>
            <span className="text-slate-600 block mb-1 font-medium">Columns</span>
            <p className="text-xs text-slate-400 mb-2">Define the columns of your table.</p>
            <ul className="space-y-2">
              {(tableField.tableColumns ?? []).map((col, idx) => (
                <li key={idx} className="border border-slate-200 rounded-lg p-2 space-y-1.5 bg-slate-50">
                  <div className="flex gap-1 items-center">
                    <span className="text-xs text-slate-400 w-4 shrink-0">{idx + 1}.</span>
                    <input
                      className="wf-input flex-1 text-xs py-1"
                      placeholder="Column header name"
                      value={col.label}
                      onChange={(e) => {
                        const next = [...(tableField.tableColumns ?? [])];
                        next[idx] = {
                          ...col,
                          label: e.target.value,
                          key: col.key || e.target.value.toLowerCase().replace(/\s+/g, "_"),
                        };
                        onUpdate({ tableColumns: next } as Partial<DesignerField>);
                      }}
                    />
                    <button
                      type="button"
                      className="text-slate-400 hover:text-red-600 px-1 text-lg leading-none shrink-0"
                      onClick={() =>
                        onUpdate({ tableColumns: (tableField.tableColumns ?? []).filter((_, i) => i !== idx) } as Partial<DesignerField>)
                      }
                    >
                      ×
                    </button>
                  </div>
                  <div className="flex items-center gap-1.5 pl-5">
                    <span className="text-xs text-slate-400 shrink-0">Type:</span>
                    <select
                      className="wf-input flex-1 text-xs py-1"
                      value={col.type}
                      onChange={(e) => {
                        const next = [...(tableField.tableColumns ?? [])];
                        next[idx] = { ...col, type: e.target.value as TableColumn["type"] };
                        onUpdate({ tableColumns: next } as Partial<DesignerField>);
                      }}
                    >
                      <option value="row_label">Row Label</option>
                      <option value="text">Text</option>
                      <option value="checkbox">Checkbox</option>
                      <option value="number">Number</option>
                      <option value="date">Date</option>
                    </select>
                  </div>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="mt-2 text-xs text-[rgb(var(--wf-brand-600))] font-medium"
              onClick={() =>
                onUpdate({
                  tableColumns: [
                    ...(tableField.tableColumns ?? []),
                    { key: `col_${(tableField.tableColumns?.length ?? 0) + 1}`, label: "New column", type: "text" },
                  ],
                } as Partial<DesignerField>)
              }
            >
              + Add column
            </button>
          </div>

          <div>
            <span className="text-slate-600 block mb-1 font-medium">Row labels</span>
            <p className="text-xs text-slate-400 mb-2">One label per line = one fixed row. Leave blank for a single empty row.</p>
            <textarea
              className="wf-input w-full text-xs min-h-[200px]"
              value={(tableField.tableRowLabels ?? []).join("\n")}
              onChange={(e) =>
                onUpdate({
                  tableRowLabels: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean),
                } as Partial<DesignerField>)
              }
              placeholder={"Monday\nTuesday\nWednesday\n..."}
            />
          </div>
        </div>
      )}

      {(field.type === "text" || field.type === "combobox") && (
        <label className="block">
          <span className="text-slate-600">Placeholder</span>
          <input
            className="wf-input mt-1 w-full"
            value={field.placeholder ?? ""}
            onChange={(e) => onUpdate({ placeholder: e.target.value })}
          />
        </label>
      )}

      {isInputField(field) && field.type !== "button" && (
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={!!field.required}
            onChange={(e) => onUpdate({ required: e.target.checked })}
            className="rounded"
          />
          <span className="text-slate-700">Required field</span>
        </label>
      )}

      {hasOptions &&
        !isMasterDropdown &&
        (!field.optionSource || field.optionSource.type === "static") && (
        <div>
          <span className="text-slate-600 block mb-2">Options</span>
          <ul className="space-y-2">
            {(field.options ?? []).map((opt, idx) => (
              <li key={idx} className="flex gap-2">
                <input
                  className="wf-input flex-1 text-xs"
                  placeholder="Label"
                  value={opt.label}
                  onChange={(e) => {
                    const next = [...(field.options ?? [])];
                    next[idx] = {
                      ...opt,
                      label: e.target.value,
                      value: opt.value || e.target.value.toLowerCase().replace(/\s+/g, "_"),
                    };
                    setOptions(next);
                  }}
                />
                <button
                  type="button"
                  className="text-slate-400 hover:text-red-600 px-1"
                  onClick={() => setOptions((field.options ?? []).filter((_, i) => i !== idx))}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="mt-2 text-xs text-[rgb(var(--wf-brand-600))] font-medium"
            onClick={() =>
              setOptions([
                ...(field.options ?? []),
                { value: `option_${(field.options?.length ?? 0) + 1}`, label: "New option" },
              ])
            }
          >
            + Add option
          </button>
        </div>
      )}
    </div>
  );
}

function DesignerCanvas({
  fields,
  selectedId,
  onSelect,
  onRemove,
}: {
  fields: DesignerField[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: "canvas-drop" });
  const ids = fields.map((f) => `field-${f.designerId}`);

  return (
    <div
      ref={setNodeRef}
      className={`min-h-[320px] rounded-xl border-2 border-dashed p-4 transition-colors ${
        isOver
          ? "border-[rgb(var(--wf-brand-500))] bg-[rgb(var(--wf-accent-muted))]"
          : "border-slate-200 bg-slate-50/50"
      }`}
    >
      {fields.length === 0 ? (
        <p className="text-center text-slate-400 text-sm py-16 pointer-events-none">
          Drag controls from the toolbar and drop them here
        </p>
      ) : (
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <ul className="space-y-2">
            {fields.map((f) => (
              <li key={f.designerId}>
                <SortableFieldRow
                  field={f}
                  selected={selectedId === f.designerId}
                  onSelect={() => onSelect(f.designerId)}
                  onRemove={() => onRemove(f.designerId)}
                />
              </li>
            ))}
          </ul>
        </SortableContext>
      )}
    </div>
  );
}

export function FormDesigner({ value, onChange }: Props) {
  const [tab, setTab] = useState<"design" | "preview">("design");
  const [activeDrag, setActiveDrag] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const selected = value.fields.find((f) => f.designerId === selectedId) ?? null;

  const previewFields = useMemo(
    () => value.fields.filter(isInputField) as FormField[],
    [value.fields]
  );
  const [previewValues, setPreviewValues] = useState<Record<string, string>>({});

  const updateField = useCallback(
    (designerId: string, patch: Partial<DesignerField>) => {
      onChange({
        ...value,
        fields: value.fields.map((f) =>
          f.designerId === designerId ? { ...f, ...patch } : f
        ),
      });
    },
    [onChange, value]
  );

  const addField = useCallback(
    (control: DesignerControlId, beforeDesignerId?: string) => {
      const field = createDesignerField(control);
      field.key = ensureUniqueKey(value.fields, field.key, field.designerId);
      let fields = [...value.fields];
      if (beforeDesignerId) {
        const idx = fields.findIndex((f) => f.designerId === beforeDesignerId);
        fields.splice(idx >= 0 ? idx : fields.length, 0, field);
      } else {
        fields.push(field);
      }
      onChange({ ...value, fields });
      setSelectedId(field.designerId);
    },
    [onChange, value]
  );

  const handleDragStart = (e: DragStartEvent) => {
    setActiveDrag(String(e.active.id));
  };

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveDrag(null);
    const { active, over } = e;
    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    if (activeId.startsWith("palette-")) {
      const control = activeId.replace("palette-", "") as DesignerControlId;
      if (overId === "canvas-drop" || overId.startsWith("field-")) {
        const beforeId = overId.startsWith("field-")
          ? overId.replace("field-", "")
          : undefined;
        addField(control, beforeId);
      }
      return;
    }

    if (activeId.startsWith("field-") && overId.startsWith("field-")) {
      const oldIndex = value.fields.findIndex(
        (f) => `field-${f.designerId}` === activeId
      );
      const newIndex = value.fields.findIndex((f) => `field-${f.designerId}` === overId);
      if (oldIndex >= 0 && newIndex >= 0 && oldIndex !== newIndex) {
        onChange({
          ...value,
          fields: arrayMove(value.fields, oldIndex, newIndex),
        });
      }
    }
  };

  const dragLabel = activeDrag?.startsWith("palette-")
    ? DESIGNER_CONTROLS.find((c) => `palette-${c.id}` === activeDrag)?.label
    : value.fields.find((f) => `field-${f.designerId}` === activeDrag)?.label;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
        <button
          type="button"
          className={`px-3 py-1.5 text-sm rounded-lg ${tab === "design" ? "bg-[rgb(var(--wf-brand-600))] text-white" : "text-slate-600 hover:bg-slate-100"}`}
          onClick={() => setTab("design")}
        >
          Design
        </button>
        <button
          type="button"
          className={`px-3 py-1.5 text-sm rounded-lg ${tab === "preview" ? "bg-[rgb(var(--wf-brand-600))] text-white" : "text-slate-600 hover:bg-slate-100"}`}
          onClick={() => {
            setPreviewValues(buildInitialForm(previewFields));
            setTab("preview");
          }}
        >
          Preview
        </button>
      </div>

      {tab === "preview" ? (
        <div className="wf-card p-6 max-w-xl">
          {value.title && (
            <h2 className="text-lg font-semibold text-slate-900 mb-1">{value.title}</h2>
          )}
          {value.description && (
            <p className="text-sm text-slate-500 mb-4">{value.description}</p>
          )}
          <WorkflowFormRenderer
            fields={value.fields as FormField[]}
            values={previewValues}
            onChange={(key, v) => setPreviewValues((prev) => ({ ...prev, [key]: v }))}
            layout={FORM_LAYOUTS[0]}
          />
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="grid lg:grid-cols-[220px_1fr_260px] gap-4 items-start">
            <aside className="sticky top-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                Controls
              </h3>
              <div
                className="overflow-y-auto space-y-2 pr-1"
                style={{ maxHeight: "calc(100vh - 14rem)" }}
              >
                {DESIGNER_CONTROLS.map((c) => (
                  <PaletteItem key={c.id} control={c} />
                ))}
              </div>
            </aside>

            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                Form canvas
              </h3>
              <DesignerCanvas
                fields={value.fields}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onRemove={(id) => {
                  onChange({
                    ...value,
                    fields: value.fields.filter((f) => f.designerId !== id),
                  });
                  if (selectedId === id) setSelectedId(null);
                }}
              />
            </section>

            <aside className="wf-card p-4 min-h-[200px] sticky top-4 self-start overflow-y-auto" style={{ maxHeight: "calc(100vh - 14rem)" }}>
              {selected ? (
                <FieldProperties
                  field={selected}
                  fields={value.fields}
                  onUpdate={(patch) => updateField(selected.designerId, patch)}
                />
              ) : (
                <p className="text-sm text-slate-400">
                  Select a control on the canvas to edit its properties.
                </p>
              )}
            </aside>
          </div>

          <DragOverlay>
            {dragLabel ? (
              <div className="px-4 py-2 rounded-lg bg-white border shadow-lg text-sm font-medium text-slate-800">
                {dragLabel}
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
}

export function getDesignerJson(schema: FormDesignerSchema): string {
  return JSON.stringify(toPersistedSchema(schema), null, 2);
}
