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
    if (!auth.isAuthenticated()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const profile = await auth.fetchMe();
      setUser(profile);
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

  const signOut = useCallback(() => {
    auth.clearToken();
    setUser(null);
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
