import { ComponentType, useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import {
  IconClipboardList,
  IconHome,
  IconInbox,
  IconPlusCircle,
  IconShield,
  IconSettings,
  IconSparkles,
  IconWorkflow,
  IconForm,
  IconTemplates,
  IconBell,
  IconChartBar,
} from "../components/icons";
import { NetworkStatusBanner } from "../components/NetworkStatusBanner";
import { UserMenu } from "../components/UserMenu";
import { useAuth } from "../context/AuthContext";
import { useAppTheme } from "../context/ThemeContext";
import { canAccessReports, canManageMasterData } from "../lib/roles";
import { THEME_META } from "../lib/themes";

type IconComponent = ComponentType<{ size?: number }>;
type NavItem = { to: string; label: string; end?: boolean; Icon: IconComponent };

function Chevron() {
  return (
    <svg
      className="wf-nav2-chevron"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function NavGroup({ label, Icon, items }: { label: string; Icon: IconComponent; items: NavItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const active = items.some((it) =>
    it.end ? location.pathname === it.to : location.pathname.startsWith(it.to)
  );

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (items.length === 0) return null;

  return (
    <div className="wf-nav2-group" ref={ref}>
      <button
        type="button"
        className={`wf-nav2-trigger${active ? " active" : ""}`}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon size={16} />
        <span>{label}</span>
        <Chevron />
      </button>
      {open && (
        <div className="wf-dropdown" role="menu">
          {items.map(({ to, label, Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              role="menuitem"
              className={({ isActive }) => `wf-dropdown-item${isActive ? " active" : ""}`}
            >
              <Icon size={16} />
              <span>{label}</span>
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}

export function AppLayout() {
  const { user } = useAuth();
  const { appTheme } = useAppTheme();
  const showAnalytics = canAccessReports(user?.roles);
  const isAdmin = user?.roles.includes("company_admin");
  const showMasterData = canManageMasterData(user?.roles);
  const logoUrl = user?.company_branding?.logo_url;
  const brandName = user?.company_branding?.display_name ?? user?.company_name ?? "WizFlow";

  const primaryNav: NavItem[] = [
    { to: "/", label: "Home", end: true, Icon: IconHome },
    { to: "/submit", label: "New request", Icon: IconPlusCircle },
    { to: "/requests", label: "My requests", Icon: IconClipboardList },
    { to: "/inbox", label: "Inbox", Icon: IconInbox },
  ];

  const buildItems: NavItem[] = [
    { to: "/workflows", label: "Workflows", Icon: IconWorkflow },
    { to: "/ai", label: "AI creator", Icon: IconSparkles },
    { to: "/form-designer", label: "Form designer", Icon: IconForm },
    { to: "/custom-workflow", label: "Custom workflow", Icon: IconWorkflow },
    { to: "/templates", label: "Templates", Icon: IconTemplates },
  ];

  const insightItems: NavItem[] = showAnalytics
    ? [
        { to: "/analytics", label: "Analytics", Icon: IconChartBar },
        { to: "/reports", label: "Reports", Icon: IconClipboardList },
      ]
    : [];

  const manageItems: NavItem[] = [
    ...(showMasterData ? [{ to: "/master-data", label: "Master data", Icon: IconShield }] : []),
    ...(isAdmin
      ? [
          { to: "/integrations", label: "Integrations", Icon: IconShield },
          { to: "/admin", label: "Admin", Icon: IconShield },
        ]
      : []),
    { to: "/settings", label: "Settings", Icon: IconSettings },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <header className="wf-header">
        <div className="wf-header-inner">
          <Link to="/" className="wf-header-brand shrink-0 flex items-center gap-2">
            {logoUrl ? (
              <img src={logoUrl} alt="" className="h-8 w-auto max-w-[120px] object-contain" />
            ) : (
              <img src="/mark.svg" alt="" className="h-7 w-7" />
            )}
            <span>{brandName}</span>
          </Link>

          <nav className="wf-nav2 flex-1 min-w-0" aria-label="Main">
            {primaryNav.map(({ to, label, end, Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) => `wf-nav2-link${isActive ? " active" : ""}`}
              >
                <Icon size={16} />
                <span>{label}</span>
              </NavLink>
            ))}
            <NavGroup label="Build" Icon={IconWorkflow} items={buildItems} />
            <NavGroup label="Insights" Icon={IconChartBar} items={insightItems} />
            <NavGroup label="Manage" Icon={IconSettings} items={manageItems} />
          </nav>

          <div className="flex items-center gap-1 shrink-0">
            <NavLink
              to="/notifications"
              className={({ isActive }) => `wf-iconbtn${isActive ? " active" : ""}`}
              aria-label="Notifications"
            >
              <IconBell size={18} />
            </NavLink>
            <UserMenu />
          </div>
        </div>
      </header>
      <NetworkStatusBanner />
      <main className="flex-1 w-full mx-auto px-4 py-8 wf-shell">
        <Outlet />
      </main>
      <footer className="border-t border-slate-200/80 py-4 px-4 text-center text-xs text-slate-400">
        {THEME_META[appTheme].label} interface · {user?.company_name ?? "WizFlow"}
      </footer>
    </div>
  );
}
