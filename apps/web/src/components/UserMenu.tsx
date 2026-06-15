import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { apiFetch, NotificationCount } from "../lib/api";
import { getToken } from "../lib/auth";
import { IconChevronDown, IconLogOut, IconSettings, IconUser } from "./icons";

export function UserMenu() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [counts, setCounts] = useState<NotificationCount>({ unread: 0, inbox: 0 });
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    function refresh() {
      apiFetch<NotificationCount>("/api/v1/notifications/unread-count", {}, token)
        .then(setCounts)
        .catch(() => {});
    }
    refresh();
    const id = window.setInterval(refresh, 45000);
    return () => window.clearInterval(id);
  }, [user?.id]);

  function logout() {
    setOpen(false);
    signOut();
    navigate("/login", { replace: true });
  }

  const badge = counts.unread + counts.inbox;

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
        className="wf-header-user wf-user-trigger flex items-center gap-2 rounded-full pl-1 pr-2 py-1 border border-transparent hover:border-[rgb(var(--wf-card-border))] hover:bg-[rgb(var(--wf-accent-muted))] transition-colors"
        aria-expanded={open}
        aria-haspopup="true"
        aria-label="User menu"
      >
        <span className="relative wf-user-avatar flex items-center justify-center w-11 h-11 rounded-full bg-[rgb(var(--wf-brand-600))] text-white shrink-0">
          <IconUser size={24} strokeWidth={2} className="text-white" />
          {badge > 0 && (
            <span
              className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold leading-none"
              aria-label={`${badge} notifications`}
            >
              {badge > 99 ? "99+" : badge}
            </span>
          )}
        </span>
        <span className="hidden sm:flex flex-col items-start text-left max-w-[150px]">
          <span className="text-sm font-semibold text-slate-800 truncate w-full">
            {user?.full_name ?? "User"}
          </span>
          <span className="text-xs text-slate-500 truncate w-full">{user?.email}</span>
        </span>
        <IconChevronDown size={16} className="text-slate-400 hidden sm:block" />
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
              {badge > 0 && (
                <p className="text-xs text-red-600 mt-0.5">
                  {counts.inbox > 0 && `${counts.inbox} inbox`}
                  {counts.inbox > 0 && counts.unread > 0 && " · "}
                  {counts.unread > 0 && `${counts.unread} unread`}
                </p>
              )}
            </div>
          </div>
          {counts.inbox > 0 && (
            <Link
              to="/inbox"
              onClick={() => setOpen(false)}
              className="flex items-center justify-between px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              Inbox
              <span className="text-xs bg-red-100 text-red-700 px-1.5 rounded-full">{counts.inbox}</span>
            </Link>
          )}
          <Link
            to="/notifications"
            onClick={() => setOpen(false)}
            className="flex items-center justify-between px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Notifications
            {counts.unread > 0 && (
              <span className="text-xs bg-red-100 text-red-700 px-1.5 rounded-full">{counts.unread}</span>
            )}
          </Link>
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
