import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { APP_THEMES, type AppTheme } from "../lib/themes";

const STORAGE_KEY = "wizflow-app-theme";

type ThemeContextValue = {
  appTheme: AppTheme;
  setAppTheme: (t: AppTheme) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [appTheme, setAppThemeState] = useState<AppTheme>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && APP_THEMES.includes(stored as AppTheme)) return stored as AppTheme;
    return "corporate";
  });

  const setAppTheme = useCallback((t: AppTheme) => {
    setAppThemeState(t);
    localStorage.setItem(STORAGE_KEY, t);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", appTheme);
  }, [appTheme]);

  return (
    <ThemeContext.Provider value={{ appTheme, setAppTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useAppTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useAppTheme must be used within ThemeProvider");
  return ctx;
}

/** Scoped theme for workflow forms (overrides app shell visually inside wrapper). */
export function ThemeScope({
  theme,
  layout,
  children,
  className = "",
}: {
  theme: AppTheme;
  layout?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div data-theme={theme} data-form-layout={layout} className={className}>
      {children}
    </div>
  );
}
