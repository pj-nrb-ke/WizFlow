import { Link, Outlet, useNavigate } from "react-router-dom";
import { AppThemeSwitcher } from "../components/ThemeSwitcher";
import { useAuth } from "../context/AuthContext";

const nav = [
  { to: "/", label: "Dashboard" },
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

  function logout() {
    signOut();
    navigate("/login");
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="wf-header shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <Link to="/" className="text-xl font-semibold wf-header-brand shrink-0">
            WizFlow
          </Link>
          <nav className="flex flex-wrap gap-3 text-sm justify-center">
            {nav.map((item) => (
              <Link key={item.to} to={item.to} className="wf-nav-link">
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="text-right shrink-0 flex flex-col items-end gap-1">
            <AppThemeSwitcher />
            <p className="text-xs text-slate-500 truncate max-w-[140px]">{user?.email}</p>
            <button type="button" onClick={logout} className="text-sm text-slate-500 hover:text-slate-800">
              Log out
            </button>
          </div>
        </div>
      </header>
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
