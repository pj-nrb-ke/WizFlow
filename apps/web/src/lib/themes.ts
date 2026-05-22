/** Predefined app themes and form layout presets (P5.1). */

export const APP_THEMES = [
  "corporate",
  "executive",
  "operations",
  "people",
  "finance",
] as const;

export type AppTheme = (typeof APP_THEMES)[number];

export const FORM_LAYOUTS = [
  "stacked",
  "sectioned",
  "two-column",
  "highlight-amount",
] as const;

export type FormLayout = (typeof FORM_LAYOUTS)[number];

export type UiSettings = {
  ui_theme: AppTheme;
  form_layout: FormLayout;
};

export const THEME_META: Record<
  AppTheme,
  { label: string; description: string; swatch: string }
> = {
  corporate: {
    label: "Corporate",
    description: "Classic blue — default professional look",
    swatch: "#1d4ed8",
  },
  executive: {
    label: "Executive",
    description: "Dark header, refined neutrals",
    swatch: "#1e293b",
  },
  operations: {
    label: "Operations",
    description: "Teal accent, crisp and operational",
    swatch: "#0d9488",
  },
  people: {
    label: "People (HR)",
    description: "Warm tones for HR and leave workflows",
    swatch: "#c2410c",
  },
  finance: {
    label: "Finance",
    description: "Indigo accent, numbers-first layout",
    swatch: "#4338ca",
  },
};

export const LAYOUT_META: Record<FormLayout, { label: string; description: string }> = {
  stacked: { label: "Stacked", description: "Single column, standard spacing" },
  sectioned: {
    label: "Sectioned",
    description: "Fields grouped in titled sections",
  },
  "two-column": {
    label: "Two column",
    description: "Wider form with two columns on desktop",
  },
  "highlight-amount": {
    label: "Highlight amount",
    description: "Large amount field for expense workflows",
  },
};

const DEFAULT_UI: UiSettings = { ui_theme: "corporate", form_layout: "stacked" };

export function parseUiSettings(settings?: Record<string, unknown> | null): UiSettings {
  if (!settings) return { ...DEFAULT_UI };
  const theme = settings.ui_theme as string;
  const layout = settings.form_layout as string;
  return {
    ui_theme: APP_THEMES.includes(theme as AppTheme) ? (theme as AppTheme) : "corporate",
    form_layout: FORM_LAYOUTS.includes(layout as FormLayout)
      ? (layout as FormLayout)
      : "stacked",
  };
}

/** Suggest theme/layout from workflow name (seed + AI). */
export function suggestUiForWorkflow(name: string): UiSettings {
  const n = name.toLowerCase();
  if (n.includes("leave") || n.includes("training") || n.includes("overtime")) {
    return { ui_theme: "people", form_layout: "sectioned" };
  }
  if (
    n.includes("petty") ||
    n.includes("purchase") ||
    n.includes("travel") ||
    n.includes("expense") ||
    n.includes("invoice") ||
    n.includes("vendor") ||
    n.includes("contract")
  ) {
    return {
      ui_theme: "finance",
      form_layout: n.includes("petty") || n.includes("travel") ? "highlight-amount" : "sectioned",
    };
  }
  if (n.includes("it ") || n.includes("access") || n.includes("equipment")) {
    return { ui_theme: "operations", form_layout: "two-column" };
  }
  if (n.includes("draft") || n.includes("facilities") || n.includes("office")) {
    return { ui_theme: "corporate", form_layout: "stacked" };
  }
  return { ui_theme: "executive", form_layout: "stacked" };
}

export const WIZFLOW_UI_KEY = "__wizflow_ui";

export function filterRequestData(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (k === WIZFLOW_UI_KEY || k.startsWith("__")) continue;
    out[k] = v;
  }
  return out;
}
