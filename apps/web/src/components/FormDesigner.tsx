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
  MASTER_DATA_CATEGORIES,
  type DesignerControlId,
  type DesignerField,
  type FormDesignerSchema,
  createDesignerField,
  ensureUniqueKey,
  isInputField,
  toPersistedSchema,
} from "../lib/formDesigner";
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

  function setOptions(options: FormFieldOption[]) {
    onUpdate({ options });
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

      {hasOptions && !isMasterDropdown && (
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
          <div className="grid lg:grid-cols-[220px_1fr_260px] gap-4">
            <aside>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                Controls
              </h3>
              <p className="text-xs text-slate-400 mb-3">
                Drag onto the form canvas (powered by{" "}
                <a
                  href="https://dndkit.com"
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  @dnd-kit
                </a>
                )
              </p>
              <div className="space-y-2">
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

            <aside className="wf-card p-4 min-h-[200px]">
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
