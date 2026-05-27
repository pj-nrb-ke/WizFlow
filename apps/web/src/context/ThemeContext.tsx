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

type ColorScheme = "light" | "dark" | "system";

type ThemeContextValue = {
  appTheme: AppTheme;
  setAppTheme: (t: AppTheme) => void;
  colorScheme: ColorScheme;
  setColorScheme: (scheme: ColorScheme) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const SCHEME_KEY = "wizflow-color-scheme";

function resolveScheme(scheme: ColorScheme): "light" | "dark" {
  if (scheme === "system" && typeof window !== "undefined") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return scheme === "dark" ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [appTheme, setAppThemeState] = useState<AppTheme>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && APP_THEMES.includes(stored as AppTheme)) return stored as AppTheme;
    return "corporate";
  });
  const [colorScheme, setColorSchemeState] = useState<ColorScheme>(() => {
    const s = localStorage.getItem(SCHEME_KEY);
    if (s === "dark" || s === "light" || s === "system") return s;
    return "system";
  });

  const setAppTheme = useCallback((t: AppTheme) => {
    setAppThemeState(t);
    localStorage.setItem(STORAGE_KEY, t);
  }, []);

  const setColorScheme = useCallback((scheme: ColorScheme) => {
    setColorSchemeState(scheme);
    localStorage.setItem(SCHEME_KEY, scheme);
  }, []);

  useEffect(() => {
    const resolved = resolveScheme(colorScheme);
    document.documentElement.setAttribute("data-theme", appTheme);
    document.documentElement.setAttribute("data-color-scheme", resolved);
    document.body.setAttribute("data-theme", appTheme);
    document.body.classList.toggle("dark", resolved === "dark");
  }, [appTheme, colorScheme]);

  useEffect(() => {
    if (colorScheme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setColorSchemeState("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [colorScheme]);

  return (
    <ThemeContext.Provider value={{ appTheme, setAppTheme, colorScheme, setColorScheme }}>
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
