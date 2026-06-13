import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { apiFetch, type TokenResponse, type UserProfile } from "../api/client";
import { clearTokens, getAccessToken, getRefreshToken, saveTokens } from "./storage";
import { registerPushToken } from "../notifications/push";
import { isBiometricEnabled, requireBiometric } from "../lib/biometrics";
import { AppState } from "react-native";

type AuthState = {
  user: UserProfile | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string, code?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshProfile = useCallback(async () => {
    const t = await getAccessToken();
    if (!t) {
      setUser(null);
      setToken(null);
      return;
    }
    const me = await apiFetch<UserProfile>("/api/v1/auth/me", {}, t);
    setUser(me);
    setToken(t);
    await registerPushToken(t);
  }, []);

  useEffect(() => {
    refreshProfile()
      .catch(() => {
        setUser(null);
        setToken(null);
      })
      .finally(() => setLoading(false));
  }, [refreshProfile]);

  const login = useCallback(
    async (email: string, password: string, code?: string) => {
      const res = await apiFetch<TokenResponse>("/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
          ...(code ? { code } : {}),
        }),
      });
      await saveTokens(res.access_token, res.refresh_token);
      setToken(res.access_token);
      const me = await apiFetch<UserProfile>("/api/v1/auth/me", {}, res.access_token);
      setUser(me);
      await registerPushToken(res.access_token);
    },
    []
  );

  const logout = useCallback(async () => {
    await clearTokens();
    setUser(null);
    setToken(null);
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener("change", async (state) => {
      if (state !== "active" || !user) return;
      const enabled = await isBiometricEnabled();
      if (!enabled) return;
      const ok = await requireBiometric();
      if (!ok) await logout();
    });
    return () => sub.remove();
  }, [user, logout]);

  const value = useMemo(
    () => ({ user, token, loading, login, logout, refreshProfile }),
    [user, token, loading, login, logout, refreshProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}
