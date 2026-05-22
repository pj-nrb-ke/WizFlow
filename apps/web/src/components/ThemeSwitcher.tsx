import { APP_THEMES, THEME_META, type AppTheme } from "../lib/themes";
import { useAppTheme } from "../context/ThemeContext";

export function AppThemeSwitcher() {
  const { appTheme, setAppTheme } = useAppTheme();

  return (
    <select
      value={appTheme}
      onChange={(e) => setAppTheme(e.target.value as AppTheme)}
      className="text-xs border border-slate-200 rounded-md px-2 py-1 bg-white text-slate-600 max-w-[120px]"
      title="App shell theme"
      aria-label="App theme"
    >
      {APP_THEMES.map((id) => (
        <option key={id} value={id}>
          {THEME_META[id].label}
        </option>
      ))}
    </select>
  );
}

export function ThemeSwatches({
  value,
  onChange,
}: {
  value: AppTheme;
  onChange: (t: AppTheme) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {APP_THEMES.map((id) => (
        <button
          key={id}
          type="button"
          title={THEME_META[id].description}
          onClick={() => onChange(id)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs transition-all ${
            value === id
              ? "border-slate-800 ring-2 ring-offset-1 ring-slate-400"
              : "border-slate-200 hover:border-slate-400"
          }`}
        >
          <span
            className="w-4 h-4 rounded-full shrink-0"
            style={{ backgroundColor: THEME_META[id].swatch }}
          />
          {THEME_META[id].label}
        </button>
      ))}
    </div>
  );
}
