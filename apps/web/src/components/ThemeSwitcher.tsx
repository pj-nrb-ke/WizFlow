import { APP_THEMES, THEME_META, type AppTheme } from "../lib/themes";
import { useAppTheme } from "../context/ThemeContext";

const THEME_FONTS: Record<AppTheme, string> = {
  corporate: "Inter, sans-serif",
  executive: '"DM Serif Display", serif',
  operations: '"JetBrains Mono", monospace',
  people: "Nunito, sans-serif",
  finance: '"IBM Plex Sans", sans-serif',
};

export function AppThemeSwitcher({ compact }: { compact?: boolean }) {
  const { appTheme, setAppTheme } = useAppTheme();

  if (compact) {
    return (
      <select
        value={appTheme}
        onChange={(e) => setAppTheme(e.target.value as AppTheme)}
        className="wf-input text-xs py-1 max-w-[130px]"
        title="Interface theme"
        aria-label="Interface theme"
      >
        {APP_THEMES.map((id) => (
          <option key={id} value={id}>
            {THEME_META[id].label}
          </option>
        ))}
      </select>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
      {APP_THEMES.map((id) => (
        <button
          key={id}
          type="button"
          data-active={appTheme === id}
          onClick={() => setAppTheme(id)}
          className="wf-theme-picker-card"
          style={
            appTheme === id
              ? { borderColor: THEME_META[id].swatch }
              : undefined
          }
        >
          <div
            className="wf-theme-picker-sample"
            style={{ fontFamily: THEME_FONTS[id], color: THEME_META[id].swatch }}
          >
            {THEME_META[id].sample}
          </div>
          <p className="font-semibold text-sm text-slate-800">{THEME_META[id].label}</p>
          <p className="text-[10px] text-slate-500 leading-tight mt-0.5">{THEME_META[id].tagline}</p>
        </button>
      ))}
    </div>
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
            fontFamily: THEME_FONTS[id],
          }}
        >
          <span
            className="w-5 h-5 rounded-full shrink-0 flex items-center justify-center text-white text-[10px] font-bold"
            style={{ backgroundColor: THEME_META[id].swatch }}
          >
            {THEME_META[id].sample.slice(0, 1)}
          </span>
          {THEME_META[id].label}
        </button>
      ))}
    </div>
  );
}
