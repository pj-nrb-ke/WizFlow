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

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
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
  const res = await fetch(`${API_BASE}${path}`, { method: "POST", headers, body: form });
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

export type UserProfile = {
  id: string;
  email: string;
  full_name: string;
  company_id: string | null;
  company_name: string | null;
  roles: string[];
};

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

export type FormField = {
  key: string;
  type: string;
  label: string;
  required?: boolean;
  placeholder?: string;
  options?: FormFieldOption[];
  /** Static text for type `label`. */
  content?: string;
  /** Caption for type `button`. */
  buttonText?: string;
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

export type UserPreferences = {
  email_enabled: boolean;
  in_app_enabled: boolean;
};

export type CompanyBranding = {
  logo_url: string | null;
  brand_color: string | null;
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
  const res = await fetch(`${API_BASE}${path}`, { headers });
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

export function listMyRequests(
  params?: { q?: string; status?: string },
  token?: string | null
) {
  const search = new URLSearchParams();
  if (params?.q?.trim()) search.set("q", params.q.trim());
  if (params?.status) search.set("status", params.status);
  const qs = search.toString();
  return apiFetch<RequestSummary[]>(`/api/v1/requests${qs ? `?${qs}` : ""}`, {}, token);
}

export function getSetupStatus(token?: string | null) {
  return apiFetch<SetupStatus>("/api/v1/admin/setup-status", {}, token);
}

export function getWorkflowHealthCheck(workflowId: string, token?: string | null) {
  return apiFetch<WorkflowHealthCheck>(`/api/v1/workflows/${workflowId}/health-check`, {}, token);
}

export function listWorkflowTemplates(token?: string | null) {
  return apiFetch<WorkflowTemplate[]>("/api/v1/templates", {}, token);
}

export function getUserPreferences(token?: string | null) {
  return apiFetch<UserPreferences>("/api/v1/users/me/preferences", {}, token);
}

export function patchUserPreferences(
  body: Partial<UserPreferences>,
  token?: string | null
) {
  return apiFetch<UserPreferences>(
    "/api/v1/users/me/preferences",
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

