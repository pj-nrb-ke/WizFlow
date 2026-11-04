import { useMemo, useState } from "react";
import { ApiError, apiFetch, WorkflowDefinition } from "../lib/api";
import { getToken } from "../lib/auth";

// Catalog of WizGate operations exposed for point-and-click setup. Header-level
// (single-value) ops only — line-based ops (journals, orders) need a table field
// and are a follow-up. `op` is the real WizGate operation; `key` disambiguates
// entries that share an op but differ by a fixed TransactionCode.
type OpField = { k: string; req?: boolean; fixed?: string };
type OpDef = { key: string; op: string; group: string; label: string; fields: OpField[] };

const MASTER_FIELDS: OpField[] = [
  { k: "Code", req: true }, { k: "Name", req: true }, { k: "Email" },
  { k: "TaxNumber" }, { k: "TaxCode" }, { k: "CreditLimit" }, { k: "AccountTerms" },
];
const TXN = (code?: string): OpField[] => [
  { k: "Account", req: true }, { k: "Reference", req: true }, { k: "Amount", req: true },
  { k: "Description" }, { k: "TxDate" }, { k: "TaxCode" },
  code ? { k: "TransactionCode", fixed: code } : { k: "TransactionCode", req: true },
];

const CATALOG: OpDef[] = [
  { key: "customer.save", op: "customer.save", group: "Masters", label: "Customer master", fields: MASTER_FIELDS },
  { key: "supplier.save", op: "supplier.save", group: "Masters", label: "Supplier master", fields: MASTER_FIELDS },
  { key: "glaccount.save", op: "glaccount.save", group: "Masters", label: "GL account",
    fields: [{ k: "Code", req: true }, { k: "Description", req: true }, { k: "AccountType", req: true }] },
  { key: "ar.invoice", op: "customertransaction.post", group: "Accounts receivable", label: "Customer invoice", fields: TXN("IN") },
  { key: "ar.creditnote", op: "customertransaction.post", group: "Accounts receivable", label: "Customer credit note", fields: TXN("CN") },
  { key: "ar.receipt", op: "customertransaction.post", group: "Accounts receivable", label: "Customer receipt", fields: TXN() },
  { key: "ap.invoice", op: "suppliertransaction.post", group: "Accounts payable", label: "Supplier invoice", fields: TXN("IN") },
  { key: "ap.creditnote", op: "suppliertransaction.post", group: "Accounts payable", label: "Supplier credit note", fields: TXN("CN") },
  { key: "ap.payment", op: "suppliertransaction.post", group: "Accounts payable", label: "Supplier payment", fields: TXN() },
];

const GROUPS = ["Masters", "Accounts receivable", "Accounts payable"];

type Bind = { mode: "field" | "fixed" | "skip"; field?: string; value?: string };

function autoField(payloadKey: string, fieldKeys: string[]): string | undefined {
  const k = payloadKey.toLowerCase();
  return (
    fieldKeys.find((f) => f.toLowerCase() === k) ||
    fieldKeys.find((f) => f.toLowerCase().includes(k)) ||
    (k === "account" ? fieldKeys.find((f) => /account|supplier|customer|vendor/.test(f.toLowerCase())) : undefined) ||
    (k === "amount" ? fieldKeys.find((f) => f.toLowerCase().includes("amount") || f.toLowerCase().includes("total")) : undefined) ||
    (k === "reference" ? fieldKeys.find((f) => f.toLowerCase().includes("ref")) : undefined)
  );
}

function defaultBinds(op: OpDef, fieldKeys: string[]): Record<string, Bind> {
  const out: Record<string, Bind> = {};
  for (const f of op.fields) {
    if (f.fixed !== undefined) out[f.k] = { mode: "fixed", value: f.fixed };
    else {
      const m = autoField(f.k, fieldKeys);
      out[f.k] = m ? { mode: "field", field: m } : { mode: f.req ? "field" : "skip" };
    }
  }
  return out;
}

export function WizGateStepPanel({
  workflow,
  onSaved,
}: {
  workflow: WorkflowDefinition;
  onSaved: (openId: string) => void;
}) {
  const fieldKeys = useMemo(() => {
    const fields = ((workflow.form_schema as { fields?: { key: string }[] } | undefined)?.fields ?? []) as { key: string }[];
    return fields.map((f) => f.key).filter(Boolean);
  }, [workflow.form_schema]);

  const existing = useMemo(
    () => ((workflow.steps as { type?: string; operation?: string }[] | undefined) ?? []).find((s) => s?.type === "wizgate"),
    [workflow.steps]
  );

  const [open, setOpen] = useState(false);
  const [opKey, setOpKey] = useState<string>(CATALOG[6].key); // default: supplier invoice
  const [binds, setBinds] = useState<Record<string, Bind>>(() => defaultBinds(CATALOG[6], fieldKeys));
  const [company, setCompany] = useState("");
  const [validate, setValidate] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const op = useMemo(() => CATALOG.find((o) => o.key === opKey) ?? CATALOG[0], [opKey]);

  function pickOp(key: string) {
    setOpKey(key);
    const next = CATALOG.find((o) => o.key === key)!;
    setBinds(defaultBinds(next, fieldKeys));
    setMsg("");
    setErr("");
  }

  function setBind(k: string, patch: Partial<Bind>) {
    setBinds((prev) => ({ ...prev, [k]: { ...prev[k], ...patch } }));
  }

  async function save() {
    setErr("");
    setMsg("");
    const mapping: Record<string, string> = {};
    const staticVals: Record<string, string> = {};
    for (const f of op.fields) {
      const b = binds[f.k] ?? { mode: "skip" };
      if (b.mode === "fixed") {
        if (f.req && !(b.value ?? "").trim()) return setErr(`Set a value for ${f.k}.`);
        if ((b.value ?? "").trim()) staticVals[f.k] = b.value!.trim();
      } else if (b.mode === "field") {
        if (!b.field) {
          if (f.req) return setErr(`Map a field to ${f.k}.`);
          continue;
        }
        mapping[f.k] = b.field;
      } else if (f.req) {
        return setErr(`${f.k} is required — map a field or set a value.`);
      }
    }

    setSaving(true);
    try {
      const token = getToken();
      // Edit a draft: a published workflow gets a fresh draft version first.
      let draft = workflow;
      if (workflow.status !== "draft") {
        draft = await apiFetch<WorkflowDefinition>(
          `/api/v1/workflows/${workflow.id}/new-version`,
          { method: "POST" },
          token
        );
      }
      const steps = (((draft.steps as Record<string, unknown>[] | undefined) ?? []).filter(
        (s) => (s as { type?: string }).type !== "wizgate"
      ) as Record<string, unknown>[]).concat([
        {
          id: "step_wizgate",
          name: `Post to accounting (${op.label})`,
          type: "wizgate",
          operation: op.op,
          mapping,
          static: staticVals,
          validate,
          ...(company.trim() ? { company: company.trim() } : {}),
        },
      ]);
      await apiFetch<WorkflowDefinition>(
        `/api/v1/workflows/${draft.id}`,
        { method: "PATCH", body: JSON.stringify({ steps }) },
        token
      );
      setMsg(`Saved to draft v${draft.version}. Open it below to test and publish — it posts after final approval.`);
      onSaved(draft.id);
    } catch (e) {
      setErr(e instanceof ApiError ? e.detail ?? e.message : "Could not save the accounting step.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="wf-panel mt-6">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold text-slate-800">Accounting push (WizGate)</h3>
        <button
          type="button"
          className="text-sm wf-link"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? "Close" : existing ? "Reconfigure" : "Configure"}
        </button>
      </div>
      <p className="text-sm text-slate-500 mt-1">
        {existing
          ? `Posts "${existing.operation}" to the accounting system after final approval.`
          : "Add a step that posts this request into Sage after it is fully approved. Set the connection under Admin → Integrations."}
      </p>

      {open && (
        <div className="mt-4 space-y-4">
          {fieldKeys.length === 0 && (
            <p className="text-sm text-amber-700">This workflow has no form fields yet — add fields first so they can be mapped.</p>
          )}

          <div>
            <label className="text-sm text-slate-700">Transaction</label>
            <select className="wf-input mt-1 w-full" value={opKey} onChange={(e) => pickOp(e.target.value)}>
              {GROUPS.map((g) => (
                <optgroup key={g} label={g}>
                  {CATALOG.filter((o) => o.group === g).map((o) => (
                    <option key={o.key} value={o.key}>
                      {o.label} · {o.op}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          <div className="border border-slate-200 rounded-lg p-3">
            <p className="text-xs text-slate-500 mb-2">Map each payload field to a form field, or set a fixed value.</p>
            <div className="space-y-2">
              {op.fields.map((f) => {
                const b = binds[f.k] ?? { mode: "skip" };
                return (
                  <div key={f.k} className="grid grid-cols-1 sm:grid-cols-[minmax(0,10rem)_1fr] items-center gap-2">
                    <code className="text-xs text-slate-700">
                      {f.k}
                      {f.req && <span className="text-red-500 ml-0.5">*</span>}
                    </code>
                    <div className="flex items-center gap-2">
                      <select
                        className="wf-input text-sm flex-1"
                        value={b.mode === "field" ? `field:${b.field ?? ""}` : b.mode}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === "fixed") setBind(f.k, { mode: "fixed", value: f.fixed ?? "" });
                          else if (v === "skip") setBind(f.k, { mode: "skip" });
                          else setBind(f.k, { mode: "field", field: v.slice("field:".length) });
                        }}
                      >
                        {!f.req && <option value="skip">— skip —</option>}
                        {fieldKeys.map((fk) => (
                          <option key={fk} value={`field:${fk}`}>
                            {fk}
                          </option>
                        ))}
                        <option value="fixed">— fixed value —</option>
                      </select>
                      {b.mode === "fixed" && (
                        <input
                          className="wf-input text-sm w-28"
                          placeholder="value"
                          value={b.value ?? ""}
                          onChange={(e) => setBind(f.k, { value: e.target.value })}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-sm text-slate-700">
              Company override <span className="text-slate-400">(optional)</span>
              <input
                className="wf-input mt-1 w-full"
                placeholder="defaults to the connection"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700 sm:mt-6">
              <input type="checkbox" checked={validate} onChange={(e) => setValidate(e.target.checked)} />
              Validate with a dry-run before posting
            </label>
          </div>

          {err && <p className="text-sm text-red-600">{err}</p>}
          {msg && <p className="text-sm text-green-700">{msg}</p>}

          <div className="flex items-center gap-2">
            <button type="button" className="wf-btn-primary text-sm" disabled={saving} onClick={() => void save()}>
              {saving ? "Saving…" : "Save accounting step"}
            </button>
            <span className="text-xs text-slate-500">Idempotency key = the request reference (posts once, safe on retry).</span>
          </div>
        </div>
      )}
    </section>
  );
}
