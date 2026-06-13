import { FormEvent, useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { HelpTip } from "../components/HelpTip";
import { PageHeader } from "../components/PageHeader";
import { useAuth } from "../context/AuthContext";
import { ApiError, apiFetch, testWebhook, type UserRow, type WebhookDelivery } from "../lib/api";
import { getToken } from "../lib/auth";
import { formatDateTime } from "../lib/datetime";

type ApiKeyRow = {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  service_user_id: string;
  is_active: boolean;
  created_at: string;
};

type WebhookRow = {
  id: string;
  name: string;
  url: string;
  events: string[];
  is_active: boolean;
  created_at: string;
};

type SecurityLogRow = {
  id: string;
  action: string;
  actor_user_id: string | null;
  resource_type: string | null;
  ip_address: string | null;
  created_at: string;
};

const KeyIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="7.5" cy="15.5" r="4.5" />
    <path d="M10.7 12.3 21 2m-4 0 3 3-3 3" />
  </svg>
);

const HookIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M18 6a3 3 0 1 0-4 2.83V14a2 2 0 0 1-4 0" />
    <circle cx="6" cy="18" r="3" />
    <path d="M9 18h4a2 2 0 0 0 2-2v-1" />
  </svg>
);

const WEBHOOK_EVENTS = [
  "request.submitted",
  "step.approved",
  "step.rejected",
  "request.returned",
  "workflow.completed",
  "file.uploaded",
];

export function IntegrationsPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [webhooks, setHooks] = useState<WebhookRow[]>([]);
  const [logs, setLogs] = useState<SecurityLogRow[]>([]);
  const [keyName, setKeyName] = useState("");
  const [keyUserId, setKeyUserId] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);
  const [hookName, setHookName] = useState("");
  const [hookUrl, setHookUrl] = useState("");
  const [hookSecret, setHookSecret] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [hookResults, setHookResults] = useState<Record<string, WebhookDelivery>>({});
  const [testingHookId, setTestingHookId] = useState<string | null>(null);

  const isAdmin = user?.roles.includes("company_admin");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const token = getToken();
      const [u, k, w, l] = await Promise.all([
        apiFetch<UserRow[]>("/api/v1/admin/users", {}, token),
        apiFetch<ApiKeyRow[]>("/api/v1/admin/integrations/api-keys", {}, token),
        apiFetch<WebhookRow[]>("/api/v1/admin/integrations/webhooks", {}, token),
        apiFetch<SecurityLogRow[]>("/api/v1/admin/integrations/security-logs?limit=50", {}, token),
      ]);
      setUsers(u);
      setKeys(k);
      setHooks(w);
      setLogs(l);
      if (!keyUserId && u[0]) setKeyUserId(u[0].id);
    } catch (e) {
      setError(e instanceof ApiError ? e.detail ?? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [keyUserId]);

  useEffect(() => {
    if (isAdmin) void load();
  }, [isAdmin, load]);

  async function createKey(e: FormEvent) {
    e.preventDefault();
    try {
      const res = await apiFetch<{ api_key: string }>(
        "/api/v1/admin/integrations/api-keys",
        {
          method: "POST",
          body: JSON.stringify({
            name: keyName,
            service_user_id: keyUserId,
            scopes: ["requests:read", "requests:write"],
          }),
        },
        getToken()
      );
      setNewKey(res.api_key);
      setKeyName("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.detail ?? err.message : "Create failed");
    }
  }

  async function createHook(e: FormEvent) {
    e.preventDefault();
    try {
      const res = await apiFetch<{ signing_secret: string }>(
        "/api/v1/admin/integrations/webhooks",
        {
          method: "POST",
          body: JSON.stringify({
            name: hookName,
            url: hookUrl,
            events: ["request.submitted", "workflow.completed"],
          }),
        },
        getToken()
      );
      setHookSecret(res.signing_secret);
      setHookName("");
      setHookUrl("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.detail ?? err.message : "Webhook failed");
    }
  }

  async function sendTest(id: string) {
    setError("");
    setTestingHookId(id);
    try {
      const delivery = await testWebhook(id, getToken());
      setHookResults((prev) => ({ ...prev, [id]: delivery }));
    } catch (err) {
      setError(err instanceof ApiError ? err.detail ?? err.message : "Test failed");
    } finally {
      setTestingHookId(null);
    }
  }

  if (!isAdmin) return <Navigate to="/" replace />;

  return (
    <div className="wf-analytics-page">
      <PageHeader
        title="Integrations"
        subtitle="API keys, webhooks, and security audit — ERP connectors deferred."
        help={
          <HelpTip>
            Use API keys for external systems. Webhooks receive signed JSON when requests move through
            approval. Copy secrets once; they are not shown again.
          </HelpTip>
        }
      />

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
      {loading && <p className="text-sm text-slate-500">Loading…</p>}

      <section className="wf-panel mb-8">
        <h2 className="text-lg font-semibold mb-2">Public API keys</h2>
        <p className="text-sm text-slate-600 mb-4">
          Header: <code className="text-xs bg-slate-100 px-1 rounded">X-API-Key</code> · Base:{" "}
          <code className="text-xs bg-slate-100 px-1 rounded">/api/v1/external/requests</code>
        </p>
        {newKey && (
          <div className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm">
            <strong>Copy now:</strong> <code className="break-all">{newKey}</code>
          </div>
        )}
        <form onSubmit={createKey} className="grid gap-3 sm:grid-cols-3 mb-4">
          <input
            className="wf-input"
            placeholder="Key name"
            value={keyName}
            onChange={(e) => setKeyName(e.target.value)}
            required
          />
          <select
            className="wf-input"
            value={keyUserId}
            onChange={(e) => setKeyUserId(e.target.value)}
          >
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name} ({u.email})
              </option>
            ))}
          </select>
          <button type="submit" className="wf-btn-primary text-sm">
            Create API key
          </button>
        </form>
        <table className="wf-data-table w-full text-sm">
          <thead>
            <tr>
              <th>Name</th>
              <th>Prefix</th>
              <th>Scopes</th>
              <th>Last used</th>
            </tr>
          </thead>
          <tbody>
            {keys.length === 0 ? (
              <tr>
                <td colSpan={4} className="wf-data-table-empty">
                  <div className="flex flex-col items-center py-6 text-center">
                    <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[rgb(var(--wf-accent-muted))] text-[rgb(var(--wf-brand-600))]">
                      <KeyIcon />
                    </div>
                    <p className="mt-3 font-semibold text-slate-800">No API keys yet</p>
                    <p className="mt-1 max-w-md text-sm text-slate-500">
                      API keys let external systems read and create requests on your behalf. Name a
                      key and pick a service account above to issue one.
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              keys.map((k) => (
                <tr key={k.id}>
                  <td>{k.name}</td>
                  <td>
                    <code>{k.key_prefix}…</code>
                  </td>
                  <td>{k.scopes.join(", ")}</td>
                  <td>{k.created_at ? formatDateTime(k.created_at) : "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      <section className="wf-panel mb-8">
        <h2 className="text-lg font-semibold mb-2">Webhooks</h2>
        {hookSecret && (
          <div className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm">
            <strong>Signing secret:</strong> <code className="break-all">{hookSecret}</code>
          </div>
        )}
        <form onSubmit={createHook} className="grid gap-3 sm:grid-cols-3 mb-4">
          <input
            className="wf-input"
            placeholder="Webhook name"
            value={hookName}
            onChange={(e) => setHookName(e.target.value)}
            required
          />
          <input
            className="wf-input sm:col-span-1"
            placeholder="https://your-server/hooks/wizflow"
            value={hookUrl}
            onChange={(e) => setHookUrl(e.target.value)}
            required
          />
          <button type="submit" className="wf-btn-primary text-sm">
            Add webhook
          </button>
        </form>
        <p className="text-xs text-slate-500 mb-2">Events: {WEBHOOK_EVENTS.join(", ")}</p>
        {webhooks.length === 0 ? (
          <div className="rounded-lg border border-[rgb(var(--wf-card-border))] bg-slate-50/60 p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--wf-accent-muted))] text-[rgb(var(--wf-brand-600))]">
                <HookIcon />
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-slate-800">No webhooks yet</p>
                <p className="mt-1 text-sm text-slate-500">
                  Webhooks push a signed JSON event to your server whenever a request moves through
                  approval — so you can sync WizFlow with an ERP, ledger, or chat tool in real time.
                  Add a name and an HTTPS endpoint above to start receiving them.
                </p>
                <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Example payload
                </p>
                <pre className="mt-1 overflow-x-auto rounded-md bg-slate-900 p-3 text-[11px] leading-relaxed text-slate-100">
{`{
  "event": "request.submitted",
  "request": { "reference": "PCH-1042", "status": "in_progress" },
  "at": "2026-06-13T09:30:00Z"
}`}
                </pre>
              </div>
            </div>
          </div>
        ) : (
          <ul className="text-sm space-y-2">
            {webhooks.map((w) => {
              const result = hookResults[w.id];
              return (
                <li key={w.id} className="border-b border-slate-100 pb-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <strong>{w.name}</strong> → {w.url}
                      <span className="text-slate-500 ml-2">({w.events.join(", ")})</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {result &&
                        (result.success ? (
                          <span className="text-xs font-medium text-green-700">
                            Delivered ({result.status_code ?? "200"})
                          </span>
                        ) : (
                          <span className="text-xs font-medium text-red-600">
                            Failed ({result.status_code ?? result.error_message ?? "error"})
                          </span>
                        ))}
                      <button
                        type="button"
                        onClick={() => void sendTest(w.id)}
                        disabled={testingHookId === w.id}
                        className="text-xs px-3 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50"
                      >
                        {testingHookId === w.id ? "Sending…" : "Send test"}
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="wf-panel">
        <h2 className="text-lg font-semibold mb-2">Security audit log</h2>
        <table className="wf-data-table w-full text-sm">
          <thead>
            <tr>
              <th>Time</th>
              <th>Action</th>
              <th>IP</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id}>
                <td>{formatDateTime(l.created_at)}</td>
                <td>{l.action}</td>
                <td>{l.ip_address ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
