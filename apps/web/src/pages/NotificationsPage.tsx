import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { HelpTip } from "../components/HelpTip";
import { ApiError, apiFetch, markNotificationRead, Notification } from "../lib/api";
import { formatDateTimeShort } from "../lib/datetime";
import { getToken } from "../lib/auth";

function inferNotificationType(n: Notification): string {
  if (n.notification_type) return n.notification_type;
  const t = n.title.toLowerCase();
  if (t.includes("approved")) return "Approved";
  if (t.includes("reject")) return "Rejected";
  if (t.includes("return")) return "Returned";
  if (t.includes("submit") || t.includes("new request")) return "Submitted";
  if (t.includes("inbox") || t.includes("approval") || t.includes("pending")) return "Approval";
  return "Updates";
}

export function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch<Notification[]>("/api/v1/notifications", {}, getToken());
      setNotifications(data);
    } catch (e) {
      setError(e instanceof ApiError ? e.detail ?? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(
    () => (unreadOnly ? notifications.filter((n) => !n.read) : notifications),
    [notifications, unreadOnly]
  );

  const grouped = useMemo(() => {
    const map = new Map<string, Notification[]>();
    for (const n of visible) {
      const type = inferNotificationType(n);
      const list = map.get(type) ?? [];
      list.push(n);
      map.set(type, list);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [visible]);

  async function markRead(id: string) {
    try {
      await markNotificationRead(id, getToken());
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      );
    } catch (e) {
      setError(e instanceof ApiError ? e.detail ?? e.message : "Could not mark read");
    }
  }

  async function markAllRead() {
    const unread = notifications.filter((n) => !n.read);
    await Promise.all(unread.map((n) => markNotificationRead(n.id, getToken()).catch(() => {})));
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="max-w-3xl">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <h1 className="wf-page-title">Notifications</h1>
          <HelpTip text="Stay informed about approvals, returns, and outcomes. Mark items read to clear your badge; open linked requests for full detail." />
        </div>
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={() => markAllRead().catch(() => {})}
            className="text-sm wf-link font-medium"
          >
            Mark all read
          </button>
        )}
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-600 mb-4 cursor-pointer">
        <input
          type="checkbox"
          checked={unreadOnly}
          onChange={(e) => setUnreadOnly(e.target.checked)}
          className="rounded border-slate-300"
        />
        Unread only
        {unreadCount > 0 && (
          <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full">
            {unreadCount}
          </span>
        )}
      </label>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      {loading ? (
        <p className="text-slate-500 text-sm">Loading…</p>
      ) : visible.length === 0 ? (
        <div className="wf-card p-8 text-center">
          <p className="font-medium text-slate-800">
            {unreadOnly ? "No unread notifications" : "No notifications yet"}
          </p>
          <p className="text-sm text-slate-500 mt-1">
            {unreadOnly
              ? "You are up to date."
              : "Activity on your requests and inbox will appear here."}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(([type, items]) => (
            <section key={type}>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                {type}
              </h2>
              <div className="wf-card divide-y">
                {items.map((n) => (
                  <div
                    key={n.id}
                    className={`p-4 flex gap-3 ${!n.read ? "bg-[rgb(var(--wf-accent-muted))]/30" : ""}`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm ${!n.read ? "font-semibold text-slate-900" : "text-slate-800"}`}>
                        {n.title}
                      </p>
                      {n.body && <p className="text-sm text-slate-600 mt-0.5">{n.body}</p>}
                      <p className="text-[10px] text-slate-400 mt-1">
                        {formatDateTimeShort(n.created_at)}
                      </p>
                      {n.instance_id && (
                        <Link
                          to={`/requests/${n.instance_id}`}
                          className="text-xs wf-link font-medium mt-2 inline-block"
                        >
                          View request →
                        </Link>
                      )}
                    </div>
                    {!n.read && (
                      <button
                        type="button"
                        onClick={() => markRead(n.id)}
                        className="text-xs text-slate-500 hover:text-slate-800 shrink-0 h-fit"
                      >
                        Mark read
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
