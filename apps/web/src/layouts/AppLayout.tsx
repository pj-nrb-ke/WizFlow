import { ComponentType } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
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
  IconHelp,
} from "../components/icons";
import { NetworkStatusBanner } from "../components/NetworkStatusBanner";
import { UserMenu } from "../components/UserMenu";
import { useAuth } from "../context/AuthContext";
import { useAppTheme } from "../context/ThemeContext";
import { canAccessReports, canManageMasterData } from "../lib/roles";
import { THEME_META } from "../lib/themes";

type IconComponent = ComponentType<{ size?: number }>;
type NavItem = { to: string; label: string; end?: boolean; Icon: IconComponent };

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
    <div className="wf-app-shell">
      {/* ─── Top header ─── */}
      <header className="wf-header">
        <div className="wf-header-inner">
          <Link to="/" className="wf-header-brand shrink-0 flex items-center gap-2.5">
            {logoUrl ? (
              <img src={logoUrl} alt="" className="h-8 w-auto max-w-[120px] object-contain" />
            ) : (
              <img src="/mark.svg" alt="" className="h-7 w-7" />
            )}
            <span>{brandName}</span>
          </Link>
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

      {/* ─── Body: sidebar + content ─── */}
      <div className="wf-body">
        {/* Sidebar */}
        <aside className="wf-sidebar">
          <nav className="wf-sidebar-nav" aria-label="Main navigation">
            {/* Core */}
            <div className="wf-sidebar-section">
              {primaryNav.map(({ to, label, end, Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={({ isActive }) => `wf-sidebar-link${isActive ? " active" : ""}`}
                >
                  <Icon size={16} />
                  <span>{label}</span>
                </NavLink>
              ))}
            </div>

            {/* Build */}
            <div className="wf-sidebar-section">
              <p className="wf-sidebar-label">Build</p>
              {buildItems.map(({ to, label, Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) => `wf-sidebar-link${isActive ? " active" : ""}`}
                >
                  <Icon size={16} />
                  <span>{label}</span>
                </NavLink>
              ))}
            </div>

            {/* Insights */}
            {insightItems.length > 0 && (
              <div className="wf-sidebar-section">
                <p className="wf-sidebar-label">Insights</p>
                {insightItems.map(({ to, label, Icon }) => (
                  <NavLink
                    key={to}
                    to={to}
                    className={({ isActive }) => `wf-sidebar-link${isActive ? " active" : ""}`}
                  >
                    <Icon size={16} />
                    <span>{label}</span>
                  </NavLink>
                ))}
              </div>
            )}

            {/* Manage */}
            {manageItems.length > 0 && (
              <div className="wf-sidebar-section">
                <p className="wf-sidebar-label">Manage</p>
                {manageItems.map(({ to, label, Icon }) => (
                  <NavLink
                    key={to}
                    to={to}
                    className={({ isActive }) => `wf-sidebar-link${isActive ? " active" : ""}`}
                  >
                    <Icon size={16} />
                    <span>{label}</span>
                  </NavLink>
                ))}
              </div>
            )}

            {/* Help */}
            <div className="wf-sidebar-section">
              <NavLink
                to="/help"
                className={({ isActive }) => `wf-sidebar-link${isActive ? " active" : ""}`}
              >
                <IconHelp size={16} />
                <span>Help</span>
              </NavLink>
            </div>
          </nav>
        </aside>

        {/* Main content */}
        <div className="wf-content-wrap">
          <main className="wf-content">
            <Outlet />
          </main>
          <footer className="wf-footer">
            {THEME_META[appTheme].label} · {user?.company_name ?? "WizFlow"}
          </footer>
        </div>
      </div>
    </div>
  );
}
