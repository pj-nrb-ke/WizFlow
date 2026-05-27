import { apiFetch, TokenResponse, UserProfile } from "./api";

const ACCESS_KEY = "wizflow_access_token";
const REFRESH_KEY = "wizflow_refresh_token";

/** Web uses HttpOnly cookies from API; localStorage only when explicitly disabled (e.g. tests). */
export const USE_AUTH_COOKIES = import.meta.env.VITE_AUTH_COOKIES !== "false";

export function getToken(): string | null {
  if (USE_AUTH_COOKIES) return null;
  return localStorage.getItem(ACCESS_KEY);
}

export function getRefreshToken(): string | null {
  if (USE_AUTH_COOKIES) return null;
  return localStorage.getItem(REFRESH_KEY);
}

export function setTokens(tokens: TokenResponse): void {
  if (USE_AUTH_COOKIES) return;
  localStorage.setItem(ACCESS_KEY, tokens.access_token);
  localStorage.setItem(REFRESH_KEY, tokens.refresh_token);
}

export function clearToken(): void {
  if (!USE_AUTH_COOKIES) {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  }
}

export function isAuthenticated(): boolean {
  return Boolean(getToken());
}

export async function login(email: string, password: string): Promise<TokenResponse> {
  const tokens = await apiFetch<TokenResponse>("/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  setTokens(tokens);
  return tokens;
}

export async function fetchMe(token?: string | null): Promise<UserProfile> {
  return apiFetch<UserProfile>("/api/v1/auth/me", {}, token ?? getToken());
}

export async function logout(): Promise<void> {
  try {
    await apiFetch<void>("/api/v1/auth/logout", { method: "POST" });
  } catch {
    /* ignore */
  }
  clearToken();
}
