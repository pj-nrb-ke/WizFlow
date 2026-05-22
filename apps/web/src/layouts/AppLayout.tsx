import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { AppThemeSwitcher } from "../components/ThemeSwitcher";
import { useAuth } from "../context/AuthContext";
import { useAppTheme } from "../context/ThemeContext";
import { THEME_META } from "../lib/themes";

const nav = [
  { to: "/", label: "Home", end: true },
  { to: "/submit", label: "New request" },
  { to: "/requests", label: "My Requests" },
  { to: "/inbox", label: "Inbox" },
  { to: "/workflows", label: "Workflows" },
  { to: "/ai", label: "AI creator" },
  { to: "/admin", label: "Admin" },
];

export function AppLayout() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { appTheme } = useAppTheme();

  function logout() {
    signOut();
    navigate("/login");
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="wf-header">
        <div className="wf-header-inner">
          <Link to="/" className="wf-header-brand shrink-0">
            WizFlow
          </Link>
          <nav className="wf-nav justify-center flex-1">
            {nav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => `wf-nav-link${isActive ? " active" : ""}`}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="text-right shrink-0 flex flex-col items-end gap-1">
            <AppThemeSwitcher compact />
            <p className="text-xs wf-header-user truncate max-w-[150px]">{user?.email}</p>
            <button type="button" onClick={logout} className="text-xs wf-header-user hover:underline">
              Log out
            </button>
          </div>
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
