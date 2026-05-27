import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { ApiError, UserProfile } from "../lib/api";
import * as auth from "../lib/auth";
import { applyBrandColor } from "../lib/brandColor";

type AuthContextValue = {
  user: UserProfile | null;
  loading: boolean;
  refreshUser: () => Promise<void>;
  signOut: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    if (!auth.USE_AUTH_COOKIES && !auth.isAuthenticated()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const profile = await auth.fetchMe();
      setUser(profile);
      applyBrandColor(profile.company_branding?.brand_color);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        auth.clearToken();
      }
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  useEffect(() => {
    const onOnline = () => {
      setLoading(true);
      void refreshUser();
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [refreshUser]);

  const signOut = useCallback(async () => {
    await auth.logout();
    setUser(null);
    applyBrandColor(null);
    setLoading(false);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, refreshUser, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
