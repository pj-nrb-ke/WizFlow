import { useCallback, useEffect, useState } from "react";
import { ThemeScope } from "../context/ThemeContext";
import { ApprovalActions } from "../components/ApprovalActions";
import { HelpTip } from "../components/HelpTip";
import { CardSkeleton } from "../components/LoadingSkeleton";
import { PageHeader } from "../components/PageHeader";
import { RequestMetaBar } from "../components/RequestMetaBar";
import { WorkflowFormRenderer } from "../components/WorkflowFormRenderer";
import { formatDateTimeShort } from "../lib/datetime";
import {
  ApiError,
  apiDownload,
  apiFetch,
  FormField,
  InboxItem,
  listInbox,
  RequestDetail,
  WorkflowSummary,
} from "../lib/api";
import { getToken } from "../lib/auth";
import { getFormFields } from "../lib/formValidation";
import { isRequestOverdue } from "../lib/sla";
import {
  APP_THEMES,
  filterRequestData,
  FORM_LAYOUTS,
  type AppTheme,
  type FormLayout,
} from "../lib/themes";

export function InboxPage() {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [workflowFilter, setWorkflowFilter] = useState("");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [department, setDepartment] = useState("");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [priority, setPriority] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<RequestDetail | null>(null);
  const [fields, setFields] = useState<FormField[]>([]);
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [acting, setActing] = useState(false);
  const [loading, setLoading] = useState(true);

  const uiTheme = APP_THEMES.includes((detail?.ui_theme ?? "") as AppTheme)
    ? (detail!.ui_theme as AppTheme)
    : "corporate";
  const formLayout = FORM_LAYOUTS.includes((detail?.form_layout ?? "") as FormLayout)
    ? (detail!.form_layout as FormLayout)
    : "stacked";

  const inboxParams = useCallback(
    () => ({
      q: search.trim() || undefined,
      workflow_id: workflowFilter || undefined,
      from: dateFrom ? `${dateFrom}T00:00:00` : undefined,
      to: dateTo ? `${dateTo}T23:59:59` : undefined,
      min_amount: minAmount ? Number(minAmount) : undefined,
      max_amount: maxAmount ? Number(maxAmount) : undefined,
      department: department.trim() || undefined,
      overdue_only: overdueOnly,
      priority: priority || undefined,
    }),
    [search, workflowFilter, dateFrom, dateTo, minAmount, maxAmount, department, overdueOnly, priority]
  );

  const loadInbox = useCallback(() => {
    return listInbox({ ...inboxParams(), limit: 100 }, getToken()).then((data) => {
      setItems(data);
      return data;
    });
  }, [inboxParams]);

  useEffect(() => {
    setLoading(true);
    loadInbox()
      .then((data) => {
        if (data.length > 0 && !selectedId) void openItem(data[0].request_id);
      })
      .catch((e) => setError(e instanceof ApiError ? e.detail ?? e.message : "Failed"))
      .finally(() => setLoading(false));
    apiFetch<WorkflowSummary[]>("/api/v1/workflows", {}, getToken())
      .then(setWorkflows)
      .catch(() => {});
  }, [loadInbox]);

  const filteredItems = items;

  async function claimTask(requestId: string) {
    setError("");
    const d = await apiFetch<RequestDetail>(
      `/api/v1/requests/${requestId}/claim`,
      { method: "POST" },
      getToken()
    );
    setDetail(d);
    await loadInbox();
  }

  async function openItem(requestId: string) {
    setSelectedId(requestId);
    setMsg("");
    setError("");
    let d = await apiFetch<RequestDetail>(`/api/v1/requests/${requestId}`, {}, getToken());
    if (d.needs_claim) {
      try {
        d = await apiFetch<RequestDetail>(
          `/api/v1/requests/${requestId}/claim`,
          { method: "POST" },
          getToken()
        );
        await loadInbox();
      } catch (e) {
        setError(e instanceof ApiError ? e.detail ?? e.message : "Could not claim task");
      }
    }
    setDetail(d);
    const defn = await apiFetch<{ form_schema?: { fields?: FormField[] } }>(
      `/api/v1/workflows/${d.workflow_definition_id}`,
      {},
      getToken()
    ).catch(() => ({ form_schema: { fields: [] } }));
    setFields(getFormFields(defn.form_schema));
  }

  function actionSuccessLabel(action: "approve" | "reject" | "return"): string {
    if (action === "approve") return "approved";
    if (action === "reject") return "rejected";
    return "returned";
  }

  async function act(action: "approve" | "reject" | "return") {
    if (!selectedId || acting) return;
    const actedRef = detail?.reference_number;
    const actedName = detail?.workflow_name;
    setError("");
    setActing(true);
    try {
      await apiFetch(
        `/api/v1/requests/${selectedId}/${action}`,
        { method: "POST", body: JSON.stringify({ comment }) },
        getToken()
      );
      setMsg(
        `Request ${actionSuccessLabel(action)} successfully${actedRef ? ` (${actedRef})` : actedName ? ` (${actedName})` : ""}.`
      );
      setComment("");
      const remaining = await loadInbox();
      setDetail(null);
      const next = remaining;
      if (next.length > 0) {
        await openItem(next[0].request_id);
      } else {
        setSelectedId(null);
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.detail ?? e.message : "Action failed");
    } finally {
      setActing(false);
    }
  }

  function exportQuery() {
    const p = inboxParams();
    const q = new URLSearchParams();
    if (p.q) q.set("q", p.q);
    if (p.workflow_id) q.set("workflow_id", p.workflow_id);
    if (p.priority) q.set("priority", p.priority);
    const qs = q.toString();
    return qs ? `?${qs}` : "";
  }

  async function exportCsv() {
    await apiDownload(`/api/v1/inbox/export.csv${exportQuery()}`, "inbox.csv", getToken());
  }

  async function exportXlsx() {
    await apiDownload(`/api/v1/inbox/export.xlsx${exportQuery()}`, "inbox.xlsx", getToken());
  }

  const visibleData = detail ? filterRequestData(detail.request_data) : {};
  const overdueCount = items.filter((i) =>
    isRequestOverdue(i.submitted_at, null, "in_progress")
  ).length;
  const claimCount = items.filter((i) => i.needs_claim).length;
  const oldest = items.reduce<InboxItem | null>((acc, i) => {
    if (!i.submitted_at) return acc;
    if (!acc || (acc.submitted_at && new Date(i.submitted_at) < new Date(acc.submitted_at)))
      return i;
    return acc;
  }, null);

  return (
    <div>
      <PageHeader
        title="Approval inbox"
        subtitle={!loading ? `${filteredItems.length} pending` : undefined}
        help={
          <HelpTip text="Review items waiting for your approval. Filter by workflow or search by reference; overdue highlights items past the SLA window." />
        }
        actions={
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() =>
                exportCsv().catch((e) =>
                  setError(e instanceof ApiError ? e.detail ?? e.message : "Export failed")
                )
              }
              className="px-3 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50"
            >
              CSV
            </button>
            <button
              type="button"
              onClick={() =>
                exportXlsx().catch((e) =>
                  setError(e instanceof ApiError ? e.detail ?? e.message : "Export failed")
                )
              }
              className="px-3 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50"
            >
              Excel
            </button>
          </div>
        }
      />

      <div className="flex flex-col gap-3 mb-4 p-3 wf-card">
        <div className="flex flex-col lg:flex-row flex-wrap gap-3">
          <select
            value={workflowFilter}
            onChange={(e) => setWorkflowFilter(e.target.value)}
            className="wf-input max-w-xs"
            aria-label="Filter by workflow"
          >
            <option value="">All workflows</option>
            {workflows.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void loadInbox()}
            placeholder="Search reference, originator, approver…"
            className="wf-input flex-1 min-w-[12rem]"
            aria-label="Search inbox"
          />
          <button type="button" onClick={() => void loadInbox()} className="wf-btn-secondary text-sm px-3">
            Apply filters
          </button>
        </div>
        <div className="flex flex-wrap gap-3">
          <label className="text-xs text-slate-600">
            From
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="wf-input block mt-0.5"
            />
          </label>
          <label className="text-xs text-slate-600">
            To
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="wf-input block mt-0.5"
            />
          </label>
          <label className="text-xs text-slate-600">
            Min amount
            <input
              type="number"
              value={minAmount}
              onChange={(e) => setMinAmount(e.target.value)}
              className="wf-input block mt-0.5 w-28"
            />
          </label>
          <label className="text-xs text-slate-600">
            Max amount
            <input
              type="number"
              value={maxAmount}
              onChange={(e) => setMaxAmount(e.target.value)}
              className="wf-input block mt-0.5 w-28"
            />
          </label>
          <label className="text-xs text-slate-600 flex-1 min-w-[8rem]">
            Department
            <input
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="wf-input block mt-0.5 w-full max-w-xs"
            />
          </label>
          <label className="text-xs text-slate-600">
            Priority
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="wf-input block mt-0.5"
            >
              <option value="">All</option>
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer shrink-0 self-end pb-1">
            <input
              type="checkbox"
              checked={overdueOnly}
              onChange={(e) => setOverdueOnly(e.target.checked)}
              className="rounded border-slate-300"
            />
            Overdue only
          </label>
        </div>
      </div>

      {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
      {msg && <p className="text-sm text-green-700 mb-2">{msg}</p>}

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-3 gap-6 min-w-0">
        <div
          className="md:col-span-1 lg:col-span-1 wf-card divide-y min-w-0 max-h-[70vh] overflow-y-auto order-1"
          data-testid="inbox-list"
          data-inbox-count={loading ? "" : String(filteredItems.length)}
        >
          {loading ? (
            <div className="p-4 space-y-3">
              <CardSkeleton />
              <CardSkeleton />
            </div>
          ) : filteredItems.length === 0 ? (
            <p className="p-4 text-sm text-slate-500">
              {items.length === 0
                ? "No pending approvals."
                : "No items match your filters."}
            </p>
          ) : (
            filteredItems.map((item) => {
              const overdue = isRequestOverdue(item.submitted_at, null, "in_progress");
              return (
                <button
                  key={item.request_id}
                  type="button"
                  data-testid="inbox-list-item"
                  onClick={() => openItem(item.request_id)}
                  className={`w-full text-left p-4 hover:bg-slate-50/80 ${
                    selectedId === item.request_id ? "bg-[rgb(var(--wf-accent-muted))]" : ""
                  }`}
                >
                  {item.reference_number && (
                    <p className="font-mono text-xs font-semibold text-[rgb(var(--wf-brand-700))]">
                      {item.reference_number}
                    </p>
                  )}
                  <p className="font-medium">{item.workflow_name}</p>
                  <p className="text-xs text-slate-500">
                    {item.originator_name} · {item.step_name}
                  </p>
                  {item.submitted_at && (
                    <p className="text-[10px] text-slate-400">
                      {formatDateTimeShort(item.submitted_at)}
                    </p>
                  )}
                  {item.amount_preview && (
                    <p className="text-xs text-slate-600 font-medium">Amount: {item.amount_preview}</p>
                  )}
                  <div className="flex flex-wrap gap-1 mt-1">
                    {item.needs_claim && (
                      <span className="text-[10px] font-medium text-amber-700 bg-amber-50 px-1.5 rounded">
                        Claim to assign
                      </span>
                    )}
                    {overdue && (
                      <span className="text-[10px] font-semibold uppercase text-red-700 bg-red-50 px-1.5 rounded">
                        Overdue
                      </span>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>

        <div className="md:col-span-2 lg:col-span-2 min-w-0 order-2">
          {detail ? (
            <ThemeScope theme={uiTheme}>
              <div className="wf-card p-4 space-y-4">
                <RequestMetaBar
                  referenceNumber={detail.reference_number}
                  workflowName={detail.workflow_name}
                  submittedAt={detail.submitted_at}
                  createdAt={detail.created_at}
                />
                {fields.length > 0 ? (
                  <WorkflowFormRenderer
                    fields={fields}
                    values={Object.fromEntries(
                      Object.entries(visibleData).map(([k, v]) => [k, String(v)])
                    )}
                    onChange={() => {}}
                    layout={formLayout}
                    readOnly
                  />
                ) : (
                  <dl className="text-sm grid grid-cols-2 gap-2">
                    {Object.entries(visibleData).map(([k, v]) => (
                      <div key={k}>
                        <dt className="text-slate-500 capitalize">{k.replace(/_/g, " ")}</dt>
                        <dd>{String(v)}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Comment (optional)"
                  className="wf-input"
                  rows={2}
                />
                {(detail.can_approve || detail.needs_claim) && (
                  <ApprovalActions
                    needsClaim={!!detail.needs_claim}
                    canApprove={!!detail.can_approve}
                    busy={acting}
                    onClaim={() => selectedId && claimTask(selectedId)}
                    onApprove={() => act("approve")}
                    onReject={() => act("reject")}
                    showReturn={!detail.is_originator}
                    onReturn={() => act("return")}
                    requestId={detail.id}
                  />
                )}
              </div>
            </ThemeScope>
          ) : items.length === 0 && msg ? (
            <div className="wf-card p-8 text-center space-y-2">
              <p className="text-lg font-medium text-slate-800">Inbox cleared</p>
              <p className="text-sm text-slate-600">{msg}</p>
              <p className="text-sm text-slate-500">No more items need your approval right now.</p>
            </div>
          ) : items.length === 0 ? (
            <div className="wf-card p-8 text-center space-y-2">
              <p className="text-lg font-medium text-slate-800">All caught up</p>
              <p className="text-sm text-slate-500">No pending approvals in your inbox.</p>
            </div>
          ) : (
            <div className="wf-card p-6">
              <h2 className="text-base font-semibold text-slate-800">Inbox overview</h2>
              <p className="mt-0.5 text-sm text-slate-500">
                Pick a request on the left to review and act — or start with the highlights below.
              </p>
              <div className="mt-4 grid grid-cols-3 gap-3">
                <div className="rounded-xl bg-[rgb(var(--wf-accent-muted))] p-4">
                  <p className="text-2xl font-semibold text-[rgb(var(--wf-brand-700))]">
                    {items.length}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">Pending approvals</p>
                </div>
                <div className="rounded-xl bg-red-50 p-4">
                  <p className="text-2xl font-semibold text-red-700">{overdueCount}</p>
                  <p className="mt-0.5 text-xs text-slate-500">Overdue</p>
                </div>
                <div className="rounded-xl bg-amber-50 p-4">
                  <p className="text-2xl font-semibold text-amber-700">{claimCount}</p>
                  <p className="mt-0.5 text-xs text-slate-500">Awaiting claim</p>
                </div>
              </div>
              {oldest && (
                <button
                  type="button"
                  onClick={() => void openItem(oldest.request_id)}
                  className="mt-4 flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 p-4 text-left hover:border-slate-300 hover:bg-slate-50"
                >
                  <div className="min-w-0">
                    <p className="text-xs text-slate-400">Longest waiting</p>
                    <p className="truncate font-medium text-slate-800">{oldest.workflow_name}</p>
                    <p className="text-xs text-slate-500">
                      {oldest.originator_name} · {oldest.step_name}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-medium text-[rgb(var(--wf-brand-700))]">
                    Review →
                  </span>
                </button>
              )}
              <div className="mt-4 rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
                Tip: filter by workflow, amount, department, or overdue items above. Acting on a
                request automatically opens the next one, so you can clear your inbox in a flow.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
