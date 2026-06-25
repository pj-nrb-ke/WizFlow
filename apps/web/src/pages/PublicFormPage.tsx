import { FormEvent, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { ApiError, getPublicForm, submitPublicForm, PublicFormSchema } from "../lib/api";

type FieldValue = string | boolean | string[];

export function PublicFormPage() {
  const { token } = useParams<{ token: string }>();
  const [form, setForm] = useState<PublicFormSchema | null>(null);
  const [loadErr, setLoadErr] = useState("");
  const [values, setValues] = useState<Record<string, FieldValue>>({});
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) return;
    getPublicForm(token)
      .then((f) => {
        setForm(f);
        const init: Record<string, FieldValue> = {};
        for (const field of (f.form_schema?.fields ?? []) as FieldDef[]) {
          if (field.type === "checkbox") init[field.key] = false;
          else if (field.type === "table") init[field.key] = [];
          else init[field.key] = "";
        }
        setValues(init);
      })
      .catch((e) =>
        setLoadErr(e instanceof ApiError ? e.detail ?? e.message : "This form link is not available.")
      );
  }, [token]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setSubmitting(true);
    setSubmitErr("");
    try {
      await submitPublicForm(token, {
        guest_name: guestName.trim(),
        guest_email: guestEmail.trim(),
        data: values,
      });
      setDone(true);
    } catch (err) {
      setSubmitErr(err instanceof ApiError ? err.detail ?? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <PageShell company={form?.company_name}>
        <div className="text-center py-8">
          <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Submitted!</h2>
          <p className="text-slate-500 text-sm">{form?.company_name ? `Thank you. ${form.company_name} will be in touch soon.` : "Thank you for your submission."}</p>
        </div>
      </PageShell>
    );
  }

  if (loadErr) {
    return (
      <PageShell>
        <div className="text-center py-10 px-4">
          <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          </div>
          <h2 className="text-lg font-semibold text-slate-900 mb-2">Link not available</h2>
          <p className="text-slate-500 text-sm">{loadErr}</p>
        </div>
      </PageShell>
    );
  }

  if (!form) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-slate-400 text-sm">Loading form…</p>
      </div>
    );
  }

  const fields = (form.form_schema?.fields ?? []) as FieldDef[];

  return (
    <PageShell company={form.company_name}>
      <h2 className="text-lg font-bold text-slate-900 mb-1">{form.workflow_name}</h2>
      {form.company_name && (
        <p className="text-sm text-slate-500 mb-6">
          Submitted to <strong>{form.company_name}</strong>
        </p>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Auto-injected identity fields */}
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 flex items-center gap-1">
            <LockIcon /> Your details
          </p>
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-700">Full Name <span className="text-red-500">*</span></label>
            <input
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              required
              maxLength={200}
              placeholder="Your full name"
              className="wf-input w-full text-sm"
              autoFocus
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-700">Email Address <span className="text-red-500">*</span></label>
            <input
              type="email"
              value={guestEmail}
              onChange={(e) => setGuestEmail(e.target.value)}
              required
              maxLength={255}
              placeholder="your@email.com"
              className="wf-input w-full text-sm"
            />
          </div>
        </div>

        {/* Form fields */}
        {fields.map((field) => (
          <FieldRenderer
            key={field.key}
            field={field}
            value={values[field.key] ?? ""}
            onChange={(v) => setValues((prev) => ({ ...prev, [field.key]: v }))}
          />
        ))}

        {/* Honeypot — hidden from humans */}
        <input
          type="text"
          name="_hp"
          tabIndex={-1}
          autoComplete="off"
          style={{ position: "absolute", left: "-9999px", opacity: 0 }}
          aria-hidden
          readOnly
        />

        {submitErr && <p className="text-sm text-red-600">{submitErr}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="wf-btn-primary w-full py-3 text-sm disabled:opacity-50"
        >
          {submitting ? "Submitting…" : "Submit"}
        </button>
      </form>
    </PageShell>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

type FieldDef = {
  key: string;
  label: string;
  type: string;
  required?: boolean;
  options?: { value: string; label: string }[];
  placeholder?: string;
  currency?: string;
};

function FieldRenderer({
  field,
  value,
  onChange,
}: {
  field: FieldDef;
  value: FieldValue;
  onChange: (v: FieldValue) => void;
}) {
  const base = "space-y-1";
  const label = (
    <label className="text-xs font-medium text-slate-700">
      {field.label}
      {field.required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
  );

  if (field.type === "textarea") {
    return (
      <div className={base}>
        {label}
        <textarea
          value={value as string}
          onChange={(e) => onChange(e.target.value)}
          required={field.required}
          placeholder={field.placeholder ?? ""}
          maxLength={5000}
          rows={3}
          className="wf-input w-full text-sm"
        />
      </div>
    );
  }

  if (field.type === "checkbox") {
    return (
      <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
        <input
          type="checkbox"
          checked={value as boolean}
          onChange={(e) => onChange(e.target.checked)}
          className="rounded"
        />
        {field.label}
        {field.required && <span className="text-red-500">*</span>}
      </label>
    );
  }

  if (field.type === "radio" || field.type === "dropdown") {
    if (field.type === "dropdown") {
      return (
        <div className={base}>
          {label}
          <select
            value={value as string}
            onChange={(e) => onChange(e.target.value)}
            required={field.required}
            className="wf-input w-full text-sm"
          >
            <option value="">Select…</option>
            {(field.options ?? []).map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      );
    }
    return (
      <div className={base}>
        {label}
        <div className="space-y-1 mt-1">
          {(field.options ?? []).map((o) => (
            <label key={o.value} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <input
                type="radio"
                name={field.key}
                value={o.value}
                checked={value === o.value}
                onChange={() => onChange(o.value)}
                required={field.required}
              />
              {o.label}
            </label>
          ))}
        </div>
      </div>
    );
  }

  const inputType =
    field.type === "email" ? "email" :
    field.type === "number" || field.type === "currency" ? "number" :
    field.type === "date" ? "date" :
    "text";

  return (
    <div className={base}>
      {label}
      <input
        type={inputType}
        value={value as string}
        onChange={(e) => onChange(e.target.value)}
        required={field.required}
        placeholder={field.placeholder ?? (field.type === "currency" ? (field.currency ?? "0.00") : "")}
        className="wf-input w-full text-sm"
      />
    </div>
  );
}

function LockIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <rect x="3" y="11" width="18" height="11" rx="2"/>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
  );
}

function PageShell({ children, company }: { children: React.ReactNode; company?: string }) {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg max-w-lg w-full overflow-hidden">
        <div className="bg-gradient-to-br from-[rgb(var(--wf-brand-600))] to-[rgb(var(--wf-brand-400))] px-8 py-6 text-white text-center">
          <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center mx-auto mb-3">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.75" strokeLinecap="round"><rect width="8" height="8" x="3" y="3" rx="2"/><path d="M7 11v4a2 2 0 0 0 2 2h4"/><rect width="8" height="8" x="13" y="13" rx="2"/></svg>
          </div>
          <span className="text-lg font-bold tracking-tight">WizFlow</span>
          {company && <p className="text-white/70 text-xs mt-1">{company}</p>}
        </div>
        <div className="px-8 py-6">{children}</div>
      </div>
    </div>
  );
}
