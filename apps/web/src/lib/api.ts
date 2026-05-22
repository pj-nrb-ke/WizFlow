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
  form_schema: Record<string, unknown>;
  steps: Record<string, unknown>[];
  routing_rules: Record<string, unknown>[];
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type SimulationResult = {
  steps_traversed: string[];
  final_status: string;
  routing_applied: string[];
};

export type Department = { id: string; name: string; code: string | null; created_at: string };
export type UserRow = { id: string; email: string; full_name: string; is_active: boolean; roles: string[] };
