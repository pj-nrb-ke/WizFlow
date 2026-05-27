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
} from "../components/icons";
import { NetworkStatusBanner } from "../components/NetworkStatusBanner";
import { UserMenu } from "../components/UserMenu";
import { useAuth } from "../context/AuthContext";
import { useAppTheme } from "../context/ThemeContext";
import { canAccessReports, canManageMasterData } from "../lib/roles";
import { THEME_META } from "../lib/themes";

const baseNav = [
  { to: "/", label: "Home", end: true, Icon: IconHome },
  { to: "/submit", label: "New request", Icon: IconPlusCircle },
  { to: "/requests", label: "My Requests", Icon: IconClipboardList },
  { to: "/inbox", label: "Inbox", Icon: IconInbox },
  { to: "/notifications", label: "Notifications", Icon: IconBell },
  { to: "/templates", label: "Templates", Icon: IconTemplates },
  { to: "/workflows", label: "Workflows", Icon: IconWorkflow },
  { to: "/form-designer", label: "Form Designer", Icon: IconForm },
  { to: "/custom-workflow", label: "Custom workflow", Icon: IconWorkflow },
  { to: "/ai", label: "AI creator", Icon: IconSparkles },
] as const;

const analyticsNav = [
  { to: "/analytics", label: "Analytics", Icon: IconChartBar },
  { to: "/reports", label: "Reports", Icon: IconClipboardList },
] as const;

const adminNav = [{ to: "/integrations", label: "Integrations", Icon: IconShield }] as const;

const tailNav = [
  { to: "/admin", label: "Admin", Icon: IconShield },
  { to: "/settings", label: "Settings", Icon: IconSettings },
] as const;

export function AppLayout() {
  const { user } = useAuth();
  const { appTheme } = useAppTheme();
  const showAnalytics = canAccessReports(user?.roles);
  const isAdmin = user?.roles.includes("company_admin");
  const showMasterData = canManageMasterData(user?.roles);
  const logoUrl = user?.company_branding?.logo_url;
  const masterDataNav = showMasterData
    ? [{ to: "/master-data", label: "Master Data", Icon: IconShield, end: false as const }]
    : [];
  const nav = [
    ...baseNav,
    ...masterDataNav,
    ...(showAnalytics ? analyticsNav : []),
    ...(isAdmin ? adminNav : []),
    ...tailNav,
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <header className="wf-header">
        <div className="wf-header-inner">
          <Link to="/" className="wf-header-brand shrink-0 flex items-center gap-2">
            {logoUrl ? (
              <img src={logoUrl} alt="" className="h-8 w-auto max-w-[120px] object-contain" />
            ) : null}
            <span>{user?.company_branding?.display_name ?? user?.company_name ?? "WizFlow"}</span>
          </Link>
          <nav className="wf-nav justify-center flex-1 min-w-0" aria-label="Main">
            {nav.map(({ to, label, Icon, ...rest }) => (
              <NavLink
                key={to}
                to={to}
                end={"end" in rest ? rest.end : false}
                aria-label={label}
                className={({ isActive }) => `wf-nav-link${isActive ? " active" : ""}`}
              >
                <Icon size={16} />
                <span className="hidden xl:inline">{label}</span>
              </NavLink>
            ))}
          </nav>
          <UserMenu />
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
