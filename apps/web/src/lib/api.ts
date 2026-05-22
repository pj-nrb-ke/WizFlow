const API_BASE = import.meta.env.VITE_API_URL || "";

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

export type FormField = {
  key: string;
  type: string;
  label: string;
  required?: boolean;
  placeholder?: string;
};

export type SimulationResult = {
  steps_traversed: string[];
  final_status: string;
  routing_applied: string[];
};

export type RequestSummary = {
  id: string;
  workflow_name: string;
  status: string;
  current_step: string | null;
  current_step_name: string | null;
  submitted_at: string | null;
};

export type RequestDetail = RequestSummary & {
  workflow_definition_id: string;
  originator_user_id: string | null;
  originator_name: string | null;
  request_data: Record<string, unknown>;
  assignees: { user_id: string; full_name: string; email?: string }[];
  step_sequence: string[];
  ui_theme?: string;
  form_layout?: string;
  created_at: string;
  updated_at: string;
};

export type InboxItem = {
  request_id: string;
  workflow_name: string;
  step_name: string;
  step_id: string;
  submitted_at: string | null;
  originator_name: string;
  amount_preview: string | null;
};

export type WorkflowEvent = {
  id: string;
  event_type: string;
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
};

export type Department = { id: string; name: string; code: string | null; created_at: string };
export type UserRow = { id: string; email: string; full_name: string; is_active: boolean; roles: string[] };
