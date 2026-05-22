import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { IconChevronDown, IconLogOut, IconSettings, IconUser } from "./icons";

export function UserMenu() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function logout() {
    setOpen(false);
    signOut();
    navigate("/login", { replace: true });
  }

  const initials =
    user?.full_name
      ?.split(" ")
      .map((n) => n[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?";

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="wf-user-trigger flex items-center gap-2 rounded-full pl-1 pr-2 py-1 border border-transparent hover:border-[rgb(var(--wf-card-border))] hover:bg-[rgb(var(--wf-accent-muted))] transition-colors"
        aria-expanded={open}
        aria-haspopup="true"
        aria-label="User menu"
      >
        <span className="wf-user-avatar flex items-center justify-center w-9 h-9 rounded-full bg-[rgb(var(--wf-brand-600))] text-white shrink-0">
          <IconUser size={20} strokeWidth={2} className="text-white" />
        </span>
        <span className="hidden sm:flex flex-col items-start text-left max-w-[120px]">
          <span className="text-xs font-semibold text-slate-800 truncate w-full">
            {user?.full_name ?? "User"}
          </span>
          <span className="text-[10px] text-slate-500 truncate w-full">{user?.email}</span>
        </span>
        <IconChevronDown size={14} className="text-slate-400 hidden sm:block" />
      </button>

      {open && (
        <div className="wf-user-menu absolute right-0 top-full mt-2 w-52 wf-card py-1 z-50 shadow-lg">
          <div className="px-3 py-2 border-b border-slate-100 flex items-center gap-3">
            <span className="flex items-center justify-center w-10 h-10 rounded-full bg-[rgb(var(--wf-accent-muted))] text-[rgb(var(--wf-brand-700))] font-bold text-sm">
              {initials}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-800 truncate">{user?.full_name}</p>
              <p className="text-xs text-slate-500 truncate">{user?.email}</p>
            </div>
          </div>
          <Link
            to="/settings"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            <IconSettings size={16} />
            Settings
          </Link>
          <button
            type="button"
            onClick={logout}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 text-left border-t border-slate-100"
          >
            <IconLogOut size={16} />
            Log out
          </button>
        </div>
      )}
    </div>
  );
}
