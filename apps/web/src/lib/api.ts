export const API_BASE = import.meta.env.VITE_API_URL || "";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public detail?: string
  ) {
    super(message);
  }
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  token?: string | null
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    credentials: "include",
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const err = await res.json();
      detail = err.detail ?? detail;
    } catch {
      /* ignore */
    }
    throw new ApiError(detail, res.status, detail);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export async function apiUpload<T>(
  path: string,
  file: File,
  token?: string | null
): Promise<T> {
  const form = new FormData();
  form.append("file", file);
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers,
    body: form,
    credentials: "include",
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const err = await res.json();
      detail = err.detail ?? detail;
    } catch {
      /* ignore */
    }
    throw new ApiError(detail, res.status, detail);
  }
  return res.json() as Promise<T>;
}

export type NotificationPreferences = {
  email: boolean;
  in_app: boolean;
  push: boolean;
  whatsapp: boolean;
};

export type CompanyBranding = {
  logo_url: string | null;
  brand_color: string | null;
  display_name?: string | null;
};

export type UserProfile = {
  id: string;
  email: string;
  full_name: string;
  company_id: string | null;
  company_name: string | null;
  roles: string[];
  notification_preferences?: NotificationPreferences;
  company_branding?: CompanyBranding;
  two_factor_enabled?: boolean;
};

export type TwoFactorStatus = { enabled: boolean };

export type TwoFactorSetup = { secret: string; otpauth_uri: string };

export function get2faStatus(token?: string | null) {
  return apiFetch<TwoFactorStatus>("/api/v1/auth/2fa/status", {}, token);
}

export function setup2fa(token?: string | null) {
  return apiFetch<TwoFactorSetup>("/api/v1/auth/2fa/setup", { method: "POST" }, token);
}

export function enable2fa(code: string, token?: string | null) {
  return apiFetch<TwoFactorStatus>(
    "/api/v1/auth/2fa/enable",
    { method: "POST", body: JSON.stringify({ code }) },
    token
  );
}

export function disable2fa(code: string, token?: string | null) {
  return apiFetch<TwoFactorStatus>(
    "/api/v1/auth/2fa/disable",
    { method: "POST", body: JSON.stringify({ code }) },
    token
  );
}

export type TokenResponse = {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
};

export type WorkflowSummary = {
  id: string;
  name: string;
  version: number;
  status: string;
};

export type WorkflowDefinition = WorkflowSummary & {
  company_id: string;
  family_id: string;
  form_schema: { fields?: FormField[] };
  steps: Record<string, unknown>[];
  routing_rules: Record<string, unknown>[];
  settings: Record<string, unknown>;
  ai_generated?: boolean;
  ai_prompt?: string | null;
  created_at: string;
  updated_at: string;
};

export type WorkflowPreview = {
  id: string;
  name: string;
  version: number;
  status: string;
  ai_generated: boolean;
  form_fields: FormField[];
  steps: { order: number; id: string; name: string; assignee_type?: string; assignee_value?: string }[];
  routing_rules: Record<string, unknown>[];
  settings: Record<string, unknown>;
  gaps: string[];
  ready_to_publish: boolean;
};

export type PublishPreview = {
  change_summary: string;
  current: Record<string, unknown>;
  previous: Record<string, unknown> | null;
};

export type WorkflowVersion = {
  id: string;
  version: number;
  change_summary: string | null;
  published_at: string;
  workflow_definition_id: string | null;
};

export type PublishRequest = {
  confirm_preview: boolean;
  test_completed: boolean;
  change_summary_note?: string;
};

export type AiDraftResponse = {
  draft: Record<string, unknown>;
  explanation: string;
  gaps: string[];
  source: string;
};

export type FormFieldOption = { value: string; label: string };

export type TableColumn = {
  key: string;
  label: string;
  type: "text" | "checkbox" | "number" | "date" | "row_label";
};

export type FormFieldOptionSource = {
  type: "static" | "master_data" | "org_users" | "api_url";
  category?: string;
  /** For type `api_url` — JSON array of {value, label} */
  apiUrl?: string;
};

export type Branch = { id: string; name: string; code: string | null; created_at: string };

export type FormField = {
  key: string;
  type: string;
  label: string;
  required?: boolean;
  placeholder?: string;
  options?: FormFieldOption[];
  optionSource?: FormFieldOptionSource;
  visibleTo?: string[];
  editableBy?: string[];
  /** Static text for type `label` or `section`. */
  content?: string;
  /** Caption for type `button`. */
  buttonText?: string;
  /** For type `calculated` — e.g. `{amount} * 0.15` */
  formula?: string;
  /** For type `attachment` */
  attachmentCategory?: string;
  /** For type `table` — column definitions */
  tableColumns?: TableColumn[];
  /** For type `table` — fixed row labels (one per row); omit for dynamic rows */
  tableRowLabels?: string[];
};

export type MasterDataEntry = {
  id: string;
  category: string;
  code: string;
  label: string;
  meta: Record<string, unknown>;
  is_active: boolean;
};

export type RequestDraft = {
  id: string;
  workflow_definition_id: string;
  workflow_name: string;
  data: Record<string, unknown>;
  updated_at: string;
};

export type SavedReportView = {
  id: string;
  name: string;
  report_type: string;
  filters: Record<string, unknown>;
  created_at: string;
};

export type Delegation = {
  id: string;
  user_id: string;
  delegate_user_id: string;
  delegate_name: string;
  starts_at: string;
  ends_at: string;
  is_active: boolean;
};

export type WizardQuestion = {
  id: string;
  prompt: string;
  type: string;
  default?: string;
};

export type WizardQuestionsOut = {
  questions: WizardQuestion[];
  initial_hint: string;
};

export type ComplianceOut = {
  total_open: number;
  missing_documents: number;
  overdue_without_action: number;
  returned_without_resubmit: number;
  policy_gaps: { type: string; reference_number?: string | null; workflow_name?: string; message: string }[];
  generated_at: string;
};

export type CompanySettings = {
  data_retention_days?: number | null;
};

export type SimulationResult = {
  steps_traversed: string[];
  final_status: string;
  routing_applied: string[];
};

export type RequestSummary = {
  id: string;
  reference_number: string | null;
  workflow_name: string;
  status: string;
  current_step: string | null;
  current_step_name: string | null;
  submitted_at: string | null;
  amount_preview?: string | null;
  sla_hours?: number | null;
};

export type RequestDetail = RequestSummary & {
  workflow_definition_id: string;
  originator_user_id: string | null;
  originator_name: string | null;
  request_data: Record<string, unknown>;
  assignees: { user_id: string; full_name: string; email?: string }[];
  assignment_mode?: string | null;
  needs_claim?: boolean;
  can_act?: boolean;
  can_approve?: boolean;
  is_originator?: boolean;
  step_sequence: string[];
  ui_theme?: string;
  form_layout?: string;
  created_at: string;
  updated_at: string;
};

export type InboxItem = {
  request_id: string;
  reference_number: string | null;
  workflow_name: string;
  step_name: string;
  step_id: string;
  submitted_at: string | null;
  originator_name: string;
  amount_preview: string | null;
  needs_claim?: boolean;
};

export type NotificationCount = { unread: number; inbox: number };

export type OrgUser = { id: string; email: string; full_name: string };

export type UserGroupMember = { user_id: string; full_name: string; email: string };

export type UserGroup = {
  id: string;
  name: string;
  member_count: number;
  members: UserGroupMember[];
  created_at: string;
};

export type OrgDirectory = { users: OrgUser[]; groups: UserGroup[] };

export type ApproverChainItem = { type: "user" | "group"; id: string; label?: string };

export type InitiatorConfig = {
  everyone: boolean;
  user_ids: string[];
  group_ids: string[];
};

export type NameCheck = { name: string; available: boolean };

export type PublicApprovalView = {
  reference_number: string | null;
  workflow_name: string;
  step_name: string;
  originator_name: string;
  submitted_at: string | null;
  request_preview: Record<string, unknown>;
  can_approve: boolean;
  can_reject: boolean;
};

export type WorkflowEvent = {
  id: string;
  event_type: string;
  event_label?: string | null;
  actor_user_id: string | null;
  actor_name: string | null;
  payload: Record<string, unknown>;
  created_at: string;
};

export type Notification = {
  id: string;
  title: string;
  body: string;
  read: boolean;
  created_at: string;
  instance_id?: string | null;
  notification_type?: string | null;
};

/** @deprecated Use NotificationPreferences from auth/me */
export type UserPreferences = {
  email_enabled: boolean;
  in_app_enabled: boolean;
};

export type SetupStatus = {
  organization_complete: boolean;
  users_complete: boolean;
  groups_complete: boolean;
  workflows_complete: boolean;
  templates_used?: boolean;
  overall_percent?: number;
};

export type WorkflowHealthIssue = {
  severity: "error" | "warning" | string;
  message: string;
  step_id?: string | null;
};

export type WorkflowHealthCheck = {
  ok: boolean;
  issues: WorkflowHealthIssue[];
  warnings?: string[];
};

export type WorkflowTemplate = {
  id: string;
  name: string;
  description: string;
  category?: string | null;
};

/** Download a file from the API with Bearer auth. */
export async function apiDownload(
  path: string,
  filename: string,
  token?: string | null
): Promise<void> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, { headers, credentials: "include" });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const err = await res.json();
      detail = err.detail ?? detail;
    } catch {
      /* ignore */
    }
    throw new ApiError(detail, res.status, detail);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export type RequestListParams = {
  q?: string;
  status?: string;
  workflow_id?: string;
  from?: string;
  to?: string;
  min_amount?: number;
  max_amount?: number;
  department?: string;
  limit?: number;
  offset?: number;
};

function requestListQuery(params?: RequestListParams): string {
  const search = new URLSearchParams();
  if (params?.q?.trim()) search.set("q", params.q.trim());
  if (params?.status) search.set("status", params.status);
  if (params?.workflow_id) search.set("workflow_id", params.workflow_id);
  if (params?.from) search.set("from", params.from);
  if (params?.to) search.set("to", params.to);
  if (params?.min_amount != null) search.set("min_amount", String(params.min_amount));
  if (params?.max_amount != null) search.set("max_amount", String(params.max_amount));
  if (params?.department?.trim()) search.set("department", params.department.trim());
  if (params?.limit != null) search.set("limit", String(params.limit));
  if (params?.offset != null) search.set("offset", String(params.offset));
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

export function listMyRequests(params?: RequestListParams, token?: string | null) {
  return apiFetch<RequestSummary[]>(`/api/v1/requests${requestListQuery(params)}`, {}, token);
}

export type InboxListParams = {
  q?: string;
  workflow_id?: string;
  from?: string;
  to?: string;
  min_amount?: number;
  max_amount?: number;
  department?: string;
  overdue_only?: boolean;
  priority?: string;
  limit?: number;
  offset?: number;
};

function inboxListQuery(params?: InboxListParams): string {
  const search = new URLSearchParams();
  if (params?.q?.trim()) search.set("q", params.q.trim());
  if (params?.workflow_id) search.set("workflow_id", params.workflow_id);
  if (params?.from) search.set("from", params.from);
  if (params?.to) search.set("to", params.to);
  if (params?.min_amount != null) search.set("min_amount", String(params.min_amount));
  if (params?.max_amount != null) search.set("max_amount", String(params.max_amount));
  if (params?.department?.trim()) search.set("department", params.department.trim());
  if (params?.overdue_only) search.set("overdue_only", "true");
  if (params?.priority?.trim()) search.set("priority", params.priority.trim());
  if (params?.limit != null) search.set("limit", String(params.limit));
  if (params?.offset != null) search.set("offset", String(params.offset));
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

export function listInbox(params?: InboxListParams, token?: string | null) {
  return apiFetch<InboxItem[]>(`/api/v1/inbox${inboxListQuery(params)}`, {}, token);
}

type SetupStatusRaw = {
  steps: Record<string, boolean>;
  complete: boolean;
  percent: number;
};

export async function getSetupStatus(token?: string | null): Promise<SetupStatus> {
  const raw = await apiFetch<SetupStatusRaw>("/api/v1/admin/setup-status", {}, token);
  const s = raw.steps ?? {};
  return {
    organization_complete: Boolean(s.departments),
    users_complete: Boolean(s.users),
    groups_complete: Boolean(s.groups),
    workflows_complete: Boolean(s.published_workflow ?? s.workflows),
    overall_percent: raw.percent,
  };
}

export function getWorkflowHealthCheck(workflowId: string, token?: string | null) {
  return apiFetch<WorkflowHealthCheck>(`/api/v1/workflows/${workflowId}/health-check`, {}, token);
}

export function listWorkflowTemplates(token?: string | null) {
  return apiFetch<WorkflowTemplate[]>("/api/v1/templates", {}, token);
}

export function patchNotificationPreferences(
  body: Partial<NotificationPreferences>,
  token?: string | null
) {
  return apiFetch<NotificationPreferences>(
    "/api/v1/users/me/preferences",
    { method: "PATCH", body: JSON.stringify(body) },
    token
  );
}

export function listMasterDataCategories(token?: string | null) {
  return apiFetch<{ categories: string[] }>("/api/v1/master-data/categories", {}, token);
}

export function listMasterData(category?: string, token?: string | null) {
  const qs = category ? `?category=${encodeURIComponent(category)}` : "";
  return apiFetch<MasterDataEntry[]>(`/api/v1/master-data${qs}`, {}, token);
}

export function createMasterDataEntry(
  body: { category: string; code: string; label: string; meta?: Record<string, unknown> },
  token?: string | null
) {
  return apiFetch<MasterDataEntry>(
    "/api/v1/master-data",
    { method: "POST", body: JSON.stringify(body) },
    token
  );
}

export function updateMasterDataEntry(
  id: string,
  body: { label?: string; meta?: Record<string, unknown>; is_active?: boolean },
  token?: string | null
) {
  return apiFetch<MasterDataEntry>(
    `/api/v1/master-data/${id}`,
    { method: "PATCH", body: JSON.stringify(body) },
    token
  );
}

export function deleteMasterDataEntry(id: string, token?: string | null) {
  return apiFetch<void>(`/api/v1/master-data/${id}`, { method: "DELETE" }, token);
}

export function listRequestDrafts(token?: string | null) {
  return apiFetch<RequestDraft[]>("/api/v1/drafts", {}, token);
}

export function deleteRequestDraft(id: string, token?: string | null) {
  return apiFetch<void>(`/api/v1/drafts/${id}`, { method: "DELETE" }, token);
}

export function postWizardQuestions(description: string, token?: string | null) {
  return apiFetch<WizardQuestionsOut>(
    "/api/v1/ai/workflow/wizard/questions",
    { method: "POST", body: JSON.stringify({ description }) },
    token
  );
}

export function postWizardFinalize(
  description: string,
  answers: Record<string, string>,
  token?: string | null
) {
  return apiFetch<AiDraftResponse>(
    "/api/v1/ai/workflow/wizard/finalize",
    { method: "POST", body: JSON.stringify({ description, answers }) },
    token
  );
}

export function tuneWorkflow(workflowId: string, instruction: string, token?: string | null) {
  return apiFetch<{ explanation: string; workflow_id: string }>(
    `/api/v1/workflows/${workflowId}/tune`,
    { method: "POST", body: JSON.stringify({ instruction }) },
    token
  );
}

export function getCompliance(params?: AnalyticsFilterParams, token?: string | null) {
  return apiFetch<ComplianceOut>(
    `/api/v1/analytics/compliance${analyticsQuery(params)}`,
    {},
    token
  );
}

export function listSavedReportViews(reportType?: string, token?: string | null) {
  const qs = reportType ? `?report_type=${encodeURIComponent(reportType)}` : "";
  return apiFetch<SavedReportView[]>(`/api/v1/saved-views${qs}`, {}, token);
}

export function createSavedReportView(
  body: { name: string; report_type: string; filters: Record<string, unknown> },
  token?: string | null
) {
  return apiFetch<SavedReportView>(
    "/api/v1/saved-views",
    { method: "POST", body: JSON.stringify(body) },
    token
  );
}

export function deleteSavedReportView(id: string, token?: string | null) {
  return apiFetch<void>(`/api/v1/saved-views/${id}`, { method: "DELETE" }, token);
}

export function listDelegations(token?: string | null) {
  return apiFetch<Delegation[]>("/api/v1/delegations", {}, token);
}

export function createDelegation(
  body: { delegate_user_id: string; starts_at: string; ends_at: string },
  token?: string | null
) {
  return apiFetch<Delegation>(
    "/api/v1/delegations",
    { method: "POST", body: JSON.stringify(body) },
    token
  );
}

export function revokeDelegation(id: string, token?: string | null) {
  return apiFetch<void>(`/api/v1/delegations/${id}`, { method: "DELETE" }, token);
}

export function getCompanySettings(token?: string | null) {
  return apiFetch<CompanySettings>("/api/v1/admin/company/settings", {}, token);
}

export function patchCompanySettings(body: CompanySettings, token?: string | null) {
  return apiFetch<CompanySettings>(
    "/api/v1/admin/company/settings",
    { method: "PATCH", body: JSON.stringify(body) },
    token
  );
}

export function getCompanyBranding(token?: string | null) {
  return apiFetch<CompanyBranding>("/api/v1/admin/company/branding", {}, token);
}

export function patchCompanyBranding(body: Partial<CompanyBranding>, token?: string | null) {
  return apiFetch<CompanyBranding>(
    "/api/v1/admin/company/branding",
    { method: "PATCH", body: JSON.stringify(body) },
    token
  );
}

export function markNotificationRead(notificationId: string, token?: string | null) {
  return apiFetch<void>(
    `/api/v1/notifications/${notificationId}/read`,
    { method: "POST" },
    token
  );
}

export type MisActionRow = {
  reference_number: string | null;
  workflow_name: string;
  request_status: string;
  event_type: string;
  event_label: string;
  action_at: string;
  actor_name: string | null;
  step_id: string | null;
  comment: string | null;
};

export type Department = { id: string; name: string; code: string | null; created_at: string };
export type UserRow = { id: string; email: string; full_name: string; is_active: boolean; roles: string[] };

/** Shared query params for analytics endpoints. */
export type AnalyticsFilterParams = {
  from?: string;
  to?: string;
  workflow_id?: string;
};

export type ExecutiveSummary = {
  total_requests: number;
  in_progress: number;
  approved: number;
  rejected: number;
  returned: number;
  overdue_count: number;
  avg_cycle_hours: number | null;
  rejection_rate: number;
  sla_compliance_pct: number;
};

export type WorkflowPerformanceRow = {
  workflow_id: string;
  workflow_name: string;
  total_count: number;
  in_progress: number;
  approved: number;
  rejected: number;
  returned: number;
  overdue_count: number;
  avg_cycle_hours: number | null;
  rejection_rate: number;
};

export type UserPerformanceRow = {
  user_id: string;
  full_name: string;
  email?: string | null;
  approvals_count: number;
  rejections_count: number;
  avg_response_hours: number | null;
  pending_inbox: number;
};

export type BottleneckStepRow = {
  step_id: string;
  step_name: string;
  workflow_name: string;
  avg_hours: number;
  event_count: number;
};

export type BottleneckApproverRow = {
  user_id: string;
  full_name: string;
  avg_response_hours: number;
  action_count: number;
};

export type BottlenecksSummary = {
  slowest_steps: BottleneckStepRow[];
  slowest_approvers: BottleneckApproverRow[];
};

export type FinancialSummary = {
  approved_total: number;
  rejected_total: number;
  in_progress_total: number;
  pending_total: number;
  currency?: string | null;
};

export type ExceptionsSummary = {
  rejected_count: number;
  returned_count: number;
  overdue_count: number;
};

export type TrendPoint = {
  date: string;
  count: number;
};

export type TrendsSummary = {
  points: TrendPoint[];
};

export type DepartmentPerformanceRow = {
  department: string;
  total_count: number;
  approved: number;
  overdue_count: number;
  avg_cycle_hours: number | null;
};

function analyticsQuery(params?: AnalyticsFilterParams): string {
  const search = new URLSearchParams();
  if (params?.from) search.set("from", params.from);
  if (params?.to) search.set("to", params.to);
  if (params?.workflow_id) search.set("workflow_id", params.workflow_id);
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

export function getExecutiveSummary(params?: AnalyticsFilterParams, token?: string | null) {
  return apiFetch<ExecutiveSummary>(
    `/api/v1/analytics/executive${analyticsQuery(params)}`,
    {},
    token
  );
}

export function getWorkflowPerformance(params?: AnalyticsFilterParams, token?: string | null) {
  return apiFetch<WorkflowPerformanceRow[]>(
    `/api/v1/analytics/workflows${analyticsQuery(params)}`,
    {},
    token
  );
}

export function getUserPerformance(params?: AnalyticsFilterParams, token?: string | null) {
  return apiFetch<UserPerformanceRow[]>(
    `/api/v1/analytics/users${analyticsQuery(params)}`,
    {},
    token
  );
}

export function getBottlenecks(params?: AnalyticsFilterParams, token?: string | null) {
  return apiFetch<BottlenecksSummary>(
    `/api/v1/analytics/bottlenecks${analyticsQuery(params)}`,
    {},
    token
  );
}

export function getFinancialSummary(params?: AnalyticsFilterParams, token?: string | null) {
  return apiFetch<FinancialSummary>(
    `/api/v1/analytics/financial${analyticsQuery(params)}`,
    {},
    token
  );
}

export function getExceptionsSummary(params?: AnalyticsFilterParams, token?: string | null) {
  return apiFetch<ExceptionsSummary>(
    `/api/v1/analytics/exceptions${analyticsQuery(params)}`,
    {},
    token
  );
}

export function getAnalyticsTrends(params?: AnalyticsFilterParams, token?: string | null) {
  return apiFetch<TrendsSummary>(
    `/api/v1/analytics/trends${analyticsQuery(params)}`,
    {},
    token
  );
}

export function getDepartmentPerformance(params?: AnalyticsFilterParams, token?: string | null) {
  return apiFetch<DepartmentPerformanceRow[]>(
    `/api/v1/analytics/departments${analyticsQuery(params)}`,
    {},
    token
  );
}

export type WorkloadRow = {
  user_id: string;
  full_name: string;
  pending_count: number;
  approvals_in_period: number;
  avg_response_hours: number | null;
};

export type WorkloadHistoryRow = {
  week_start: string;
  user_id: string;
  full_name: string;
  actions_count: number;
};

export type JourneyEdge = {
  from_step: string;
  to_step: string;
  avg_hours: number;
  sample_count: number;
};

export type HeatmapCell = { day_of_week: number; hour: number; count: number };

export type ScorecardRow = {
  entity_type: string;
  entity_id: string;
  entity_name: string;
  metric_key: string;
  actual_value: number;
  target_value: number;
  score_pct: number;
  grade: string;
};

export type KpiTarget = {
  id: string;
  metric_key: string;
  label: string;
  target_value: number;
  unit: string;
};

export type ReportSubscription = {
  id: string;
  name: string;
  report_type: string;
  frequency: string;
  filters: Record<string, unknown>;
  is_active: boolean;
  last_sent_at: string | null;
  created_at: string;
};

export type WorkflowSchedule = {
  id: string;
  workflow_definition_id: string;
  name: string;
  frequency: string;
  initiator_user_id: string | null;
  default_data: Record<string, unknown>;
  is_active: boolean;
  last_run_at: string | null;
  created_at: string;
};

export function getWorkload(params?: AnalyticsFilterParams, token?: string | null) {
  return apiFetch<{ users: WorkloadRow[] }>(`/api/v1/analytics/workload${analyticsQuery(params)}`, {}, token);
}

export function getWorkloadHistory(params?: AnalyticsFilterParams, token?: string | null) {
  return apiFetch<{ weeks: WorkloadHistoryRow[] }>(
    `/api/v1/analytics/workload/history${analyticsQuery(params)}`,
    {},
    token
  );
}

export function getJourneyAnalytics(params?: AnalyticsFilterParams, token?: string | null) {
  return apiFetch<{ edges: JourneyEdge[] }>(`/api/v1/analytics/journey${analyticsQuery(params)}`, {}, token);
}

export function getApprovalHeatmap(params?: AnalyticsFilterParams, token?: string | null) {
  return apiFetch<{ cells: HeatmapCell[] }>(`/api/v1/analytics/heatmap${analyticsQuery(params)}`, {}, token);
}

export function getScorecards(params?: AnalyticsFilterParams, token?: string | null) {
  return apiFetch<{ rows: ScorecardRow[] }>(`/api/v1/analytics/scorecards${analyticsQuery(params)}`, {}, token);
}

export function listKpiTargets(token?: string | null) {
  return apiFetch<KpiTarget[]>("/api/v1/kpi-targets", {}, token);
}

export function createKpiTarget(
  body: { metric_key: string; label: string; target_value: number; unit?: string },
  token?: string | null
) {
  return apiFetch<KpiTarget>("/api/v1/kpi-targets", { method: "POST", body: JSON.stringify(body) }, token);
}

export function listReportSubscriptions(token?: string | null) {
  return apiFetch<ReportSubscription[]>("/api/v1/report-subscriptions", {}, token);
}

export function createReportSubscription(
  body: { name: string; report_type?: string; frequency?: string; filters?: Record<string, unknown> },
  token?: string | null
) {
  return apiFetch<ReportSubscription>(
    "/api/v1/report-subscriptions",
    { method: "POST", body: JSON.stringify(body) },
    token
  );
}

export function deleteReportSubscription(id: string, token?: string | null) {
  return apiFetch<void>(`/api/v1/report-subscriptions/${id}`, { method: "DELETE" }, token);
}

export function listWorkflowSchedules(token?: string | null) {
  return apiFetch<WorkflowSchedule[]>("/api/v1/workflow-schedules", {}, token);
}

export function createWorkflowSchedule(
  body: {
    workflow_definition_id: string;
    name: string;
    frequency?: string;
    default_data?: Record<string, unknown>;
  },
  token?: string | null
) {
  return apiFetch<WorkflowSchedule>(
    "/api/v1/workflow-schedules",
    { method: "POST", body: JSON.stringify(body) },
    token
  );
}

/** Clone a workflow into a new draft copy. */
export function cloneWorkflow(id: string, token?: string | null) {
  return apiFetch<WorkflowDefinition>(
    `/api/v1/workflows/${id}/clone`,
    { method: "POST" },
    token
  );
}

/** Delete a draft workflow permanently. */
export function deleteWorkflow(id: string, token?: string | null) {
  return apiFetch<void>(
    `/api/v1/workflows/${id}`,
    { method: "DELETE" },
    token
  );
}

// ── Invitations ──────────────────────────────────────────────────────────────

export type InviteOut = {
  id: string;
  email: string;
  role_slugs: string[];
  invited_by_name: string;
  expires_at: string;
  created_at: string;
  status: "pending" | "accepted" | "expired" | "revoked";
};

export function listInvites(token?: string | null) {
  return apiFetch<InviteOut[]>("/api/v1/admin/invitations", {}, token);
}

export function sendInvite(email: string, role_slugs: string[], token?: string | null) {
  return apiFetch<InviteOut>(
    "/api/v1/admin/invitations",
    { method: "POST", body: JSON.stringify({ email, role_slugs }) },
    token
  );
}

export function resendInvite(inviteId: string, token?: string | null) {
  return apiFetch<InviteOut>(
    `/api/v1/admin/invitations/${inviteId}/resend`,
    { method: "POST" },
    token
  );
}

export function revokeInvite(inviteId: string, token?: string | null) {
  return apiFetch<void>(
    `/api/v1/admin/invitations/${inviteId}`,
    { method: "DELETE" },
    token
  );
}

export type WebhookDelivery = {
  id: string;
  event_type: string;
  status_code: number | null;
  success: boolean;
  error_message: string | null;
  created_at: string;
};

/** Send a test delivery to a webhook and return the delivery result. */
export function testWebhook(id: string, token?: string | null) {
  return apiFetch<WebhookDelivery>(
    `/api/v1/admin/integrations/webhooks/${id}/test`,
    { method: "POST" },
    token
  );
}

export function runAutomation(token?: string | null) {
  return apiFetch<{
    sla_warnings: number;
    sla_breaches: number;
    escalations: number;
    reports_sent: number;
    schedules_run: number;
  }>("/api/v1/automation/run", { method: "POST" }, token);
}

// ── Public forms & guest submissions ────────────────────────────────────────

export type PublicFormSchema = {
  workflow_id: string;
  workflow_name: string;
  company_name: string;
  form_schema: Record<string, unknown>;
  settings: Record<string, unknown>;
};

export type PublicLinkOut = {
  id: string;
  url: string;
  created_at: string;
  expires_at: string | null;
  revoked: boolean;
};

export type GuestSubOut = {
  id: string;
  guest_name: string;
  guest_email: string;
  status: "pending" | "accepted" | "rejected";
  submitted_at: string;
  review_note: string | null;
};

export type GuestSubDetail = GuestSubOut & {
  data: Record<string, unknown>;
  ip_address: string | null;
  reviewed_at: string | null;
};

export function getPublicForm(token: string) {
  return apiFetch<PublicFormSchema>(`/api/v1/public/forms/${token}`);
}

export function submitPublicForm(
  token: string,
  body: { guest_name: string; guest_email: string; data: Record<string, unknown>; honeypot?: string }
) {
  return apiFetch<{ id: string; message: string }>(`/api/v1/public/forms/${token}/submit`, {
    method: "POST",
    body: JSON.stringify({ honeypot: "", ...body }),
  });
}

export function getPublicLink(workflowId: string, token?: string | null) {
  return apiFetch<PublicLinkOut | null>(`/api/v1/workflows/${workflowId}/public-link`, {}, token);
}

export function createPublicLink(workflowId: string, token?: string | null) {
  return apiFetch<PublicLinkOut>(`/api/v1/workflows/${workflowId}/public-link`, { method: "POST" }, token);
}

export function revokePublicLink(workflowId: string, token?: string | null) {
  return apiFetch<void>(`/api/v1/workflows/${workflowId}/public-link`, { method: "DELETE" }, token);
}

export function listGuestSubmissions(workflowId: string, token?: string | null) {
  return apiFetch<GuestSubOut[]>(`/api/v1/workflows/${workflowId}/guest-submissions`, {}, token);
}

export function getGuestSubmission(workflowId: string, subId: string, token?: string | null) {
  return apiFetch<GuestSubDetail>(`/api/v1/workflows/${workflowId}/guest-submissions/${subId}`, {}, token);
}

export function acceptGuestSubmission(workflowId: string, subId: string, token?: string | null) {
  return apiFetch<{ message: string; user_id: string }>(
    `/api/v1/workflows/${workflowId}/guest-submissions/${subId}/accept`,
    { method: "POST" },
    token
  );
}

export function rejectGuestSubmission(
  workflowId: string,
  subId: string,
  reason: string,
  token?: string | null
) {
  return apiFetch<{ message: string }>(
    `/api/v1/workflows/${workflowId}/guest-submissions/${subId}/reject`,
    { method: "POST", body: JSON.stringify({ reason }) },
    token
  );
}

