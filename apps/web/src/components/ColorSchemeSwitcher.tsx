import { useAppTheme } from "../context/ThemeContext";

const OPTIONS = [
  { id: "system" as const, label: "System", hint: "Match OS light/dark" },
  { id: "light" as const, label: "Light", hint: "Always light" },
  { id: "dark" as const, label: "Dark", hint: "Always dark" },
];

export function ColorSchemeSwitcher() {
  const { colorScheme, setColorScheme } = useAppTheme();

  return (
    <ul className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden bg-white dark:bg-slate-800 dark:divide-slate-700 dark:border-slate-600">
      {OPTIONS.map((opt) => {
        const selected = colorScheme === opt.id;
        return (
          <li key={opt.id}>
            <button
              type="button"
              onClick={() => setColorScheme(opt.id)}
              className={`w-full px-4 py-3 text-left transition-colors ${
                selected ? "bg-[rgb(var(--wf-accent-muted))]" : "hover:bg-slate-50 dark:hover:bg-slate-700"
              }`}
            >
              <span className="block text-sm font-medium text-slate-800 dark:text-slate-100">{opt.label}</span>
              <span className="block text-xs text-slate-500 dark:text-slate-400">{opt.hint}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
