import type { ReactNode } from "react";

type PageHeaderProps = {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  help?: ReactNode;
};

export function PageHeader({ title, subtitle, actions, help }: PageHeaderProps) {
  return (
    <div className="wf-page-header">
      <div className="wf-page-header-text">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="wf-page-title">{title}</h1>
          {help}
        </div>
        {subtitle && <p className="wf-page-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="wf-page-header-actions">{actions}</div>}
    </div>
  );
}
