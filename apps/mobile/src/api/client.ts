const API_BASE = (process.env.EXPO_PUBLIC_API_URL || "https://api.wizflow.biz").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number
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
      const err = (await res.json()) as { detail?: string };
      detail = err.detail ?? detail;
    } catch {
      /* ignore */
    }
    throw new ApiError(detail, res.status);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export { API_BASE };

export type TokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
};

export type NotificationPreferences = {
  email: boolean;
  in_app: boolean;
  push?: boolean;
  whatsapp?: boolean;
};

export type UserProfile = {
  id: string;
  email: string;
  full_name: string;
  company_id: string | null;
  company_name: string | null;
  roles: string[];
  company_branding?: { logo_url?: string | null; brand_color?: string | null };
  notification_preferences?: NotificationPreferences;
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

export type RequestDetail = {
  id: string;
  reference_number: string | null;
  workflow_name: string;
  workflow_definition_id: string;
  status: string;
  current_step: string | null;
  current_step_name: string | null;
  submitted_at: string | null;
  amount_preview?: string | null;
  originator_name: string | null;
  request_data: Record<string, unknown>;
  needs_claim?: boolean;
  can_act?: boolean;
  can_approve?: boolean;
  is_originator?: boolean;
  step_sequence: string[];
};

export type WorkflowEvent = {
  id: string;
  event_type: string;
  event_label: string | null;
  actor_name: string | null;
  payload: Record<string, unknown>;
  created_at: string;
};

export type NotificationItem = {
  id: string;
  title: string;
  body: string;
  read: boolean;
  created_at: string;
  instance_id?: string | null;
};

export type NotificationCount = { unread: number; inbox: number };

export type RequestSummary = {
  id: string;
  reference_number: string | null;
  workflow_name: string;
  status: string;
  current_step_name: string | null;
  submitted_at: string | null;
  amount_preview?: string | null;
};

export type WorkflowDefinition = {
  id: string;
  name: string;
  version?: number;
  status: string;
  form_schema: { fields?: import("../lib/formUtils").FormField[] };
  settings?: Record<string, unknown>;
};

export type Attachment = {
  id: string;
  filename: string;
  content_type: string | null;
  size_bytes: number;
  created_at: string;
};

export type ExecutiveSummary = {
  total_requests: number;
  in_progress: number;
  overdue_count: number;
  rejection_rate: number;
  sla_compliance_pct: number;
};

export type AnomalyFinding = {
  type: string;
  severity: string;
  message: string;
  reference_number: string | null;
};

export type NarrativeOut = {
  narrative: string;
  generated_at: string;
};

export type WorkflowTemplateSummary = {
  id: string;
  name: string;
  category: string;
  description: string;
};

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

export async function apiUpload(
  path: string,
  uri: string,
  filename: string,
  mime: string,
  token?: string | null
): Promise<void> {
  const formData = new FormData();
  formData.append("file", { uri, name: filename, type: mime } as unknown as Blob);
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, { method: "POST", headers, body: formData });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const err = (await res.json()) as { detail?: string };
      detail = err.detail ?? detail;
    } catch {
      /* ignore */
    }
    throw new ApiError(detail, res.status);
  }
}

export async function extractDocument(
  uri: string,
  filename: string,
  mime: string,
  token: string,
  docType: "auto" | "receipt" | "invoice" | "cheque" = "auto"
): Promise<{
  fields: { key: string; value: string; confidence: number }[];
  message: string;
  requires_review: boolean;
}> {
  const formData = new FormData();
  formData.append("file", { uri, name: filename, type: mime } as unknown as Blob);
  formData.append("doc_type", docType);
  const res = await fetch(`${API_BASE}/api/v1/documents/extract`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  if (!res.ok) throw new ApiError("OCR failed", res.status);
  return res.json();
}
