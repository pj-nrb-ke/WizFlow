/** Apply company accent color to CSS variables (--wf-brand-*). */
export function applyBrandColor(hex: string | null | undefined): void {
  const root = document.documentElement;
  if (!hex || !/^#[0-9A-Fa-f]{6}$/.test(hex)) {
    for (const key of ["50", "100", "200", "400", "500", "600", "700"]) {
      root.style.removeProperty(`--wf-brand-${key}`);
    }
    root.style.removeProperty("--wf-header-text");
    return;
  }
  const [r, g, b] = [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
  const mix = (pct: number) =>
    `${Math.round(r + (255 - r) * pct)} ${Math.round(g + (255 - g) * pct)} ${Math.round(b + (255 - b) * pct)}`;
  const shade = (pct: number) =>
    `${Math.round(r * (1 - pct))} ${Math.round(g * (1 - pct))} ${Math.round(b * (1 - pct))}`;
  root.style.setProperty("--wf-brand-50", mix(0.92));
  root.style.setProperty("--wf-brand-100", mix(0.85));
  root.style.setProperty("--wf-brand-200", mix(0.7));
  root.style.setProperty("--wf-brand-400", mix(0.35));
  root.style.setProperty("--wf-brand-500", `${r} ${g} ${b}`);
  root.style.setProperty("--wf-brand-600", shade(0.12));
  root.style.setProperty("--wf-brand-700", shade(0.28));
  root.style.setProperty("--wf-header-text", shade(0.12));
}
