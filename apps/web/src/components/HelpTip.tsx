import { useId, useState, type ReactNode } from "react";

type HelpTipProps = {
  /** Inline help next to a page title (most pages). */
  text?: string;
  /** Collapsible panel title (e.g. templates page). */
  title?: string;
  children?: ReactNode;
};

/** Contextual help — inline “?” tooltip or expandable panel. */
export function HelpTip({ text, title = "Tip", children }: HelpTipProps) {
  if (text) {
    return <InlineHelpTip text={text} />;
  }

  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <div className="wf-card-accent text-sm mb-6">
      <button
        type="button"
        className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left font-medium text-slate-800"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        <span>{title}</span>
        <span className="text-slate-400 text-xs" aria-hidden>
          {open ? "Hide" : "Show"}
        </span>
      </button>
      {open && children && (
        <div
          id={panelId}
          className="px-4 pb-4 text-slate-600 leading-relaxed border-t border-slate-200/60 pt-3"
        >
          {children}
        </div>
      )}
    </div>
  );
}

function InlineHelpTip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const tipId = useId();

  return (
    <span className="relative inline-flex align-middle">
      <button
        type="button"
        className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 text-[10px] font-bold text-slate-500 hover:bg-slate-100 hover:text-slate-700"
        aria-expanded={open}
        aria-describedby={open ? tipId : undefined}
        aria-label="Help"
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setOpen(false)}
      >
        ?
      </button>
      {open && (
        <span
          id={tipId}
          role="tooltip"
          className="absolute left-1/2 top-full z-20 mt-2 w-64 -translate-x-1/2 rounded-lg border border-slate-200 bg-white p-3 text-xs font-normal text-slate-600 shadow-lg leading-relaxed"
        >
          {text}
        </span>
      )}
    </span>
  );
}
