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
} from "../components/icons";
import { UserMenu } from "../components/UserMenu";
import { useAuth } from "../context/AuthContext";
import { useAppTheme } from "../context/ThemeContext";
import { THEME_META } from "../lib/themes";

const nav = [
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
  { to: "/admin", label: "Admin", Icon: IconShield },
  { to: "/settings", label: "Settings", Icon: IconSettings },
] as const;

export function AppLayout() {
  const { user } = useAuth();
  const { appTheme } = useAppTheme();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="wf-header">
        <div className="wf-header-inner">
          <Link to="/" className="wf-header-brand shrink-0">
            WizFlow
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
      <main className="flex-1 w-full mx-auto px-4 py-8 wf-shell">
        <Outlet />
      </main>
      <footer className="border-t border-slate-200/80 py-4 px-4 text-center text-xs text-slate-400">
        {THEME_META[appTheme].label} interface · {user?.company_name ?? "WizFlow"}
      </footer>
    </div>
  );
}
