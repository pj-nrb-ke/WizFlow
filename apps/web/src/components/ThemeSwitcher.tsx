import { APP_THEMES, THEME_META, type AppTheme } from "../lib/themes";
import { useAppTheme } from "../context/ThemeContext";

export function AppThemeSwitcher() {
  const { appTheme, setAppTheme } = useAppTheme();

  return (
    <ul className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden bg-white">
      {APP_THEMES.map((id) => {
        const selected = appTheme === id;
        return (
          <li key={id}>
            <button
              type="button"
              onClick={() => setAppTheme(id)}
              className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                selected ? "bg-[rgb(var(--wf-accent-muted))]" : "hover:bg-slate-50"
              }`}
            >
              <span
                className="w-3 h-3 rounded-full shrink-0 ring-2 ring-offset-2"
                style={{
                  backgroundColor: THEME_META[id].swatch,
                  boxShadow: selected
                    ? `0 0 0 2px ${THEME_META[id].swatch}`
                    : undefined,
                }}
                aria-hidden
              />
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-medium text-slate-800">
                  {THEME_META[id].label}
                </span>
                <span className="block text-xs text-slate-500 truncate">
                  {THEME_META[id].description}
                </span>
              </span>
              {selected && (
                <span className="text-xs font-medium text-[rgb(var(--wf-brand-600))] shrink-0">
                  Active
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
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
          className={`flex items-center gap-2 px-3 py-1.5 border text-xs transition-all ${
            value === id
              ? "ring-2 ring-offset-1 font-semibold"
              : "opacity-80 hover:opacity-100"
          }`}
          style={{
            borderRadius: "var(--wf-radius)",
            borderColor: value === id ? THEME_META[id].swatch : "rgb(var(--wf-card-border))",
          }}
        >
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{ backgroundColor: THEME_META[id].swatch }}
          />
          {THEME_META[id].label}
        </button>
      ))}
    </div>
  );
}
