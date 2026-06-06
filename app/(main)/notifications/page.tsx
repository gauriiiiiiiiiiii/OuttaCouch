"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import PageShell from "@/components/ui/PageShell";

type Notification = {
  id: string;
  title: string;
  body: string;
  link?: string | null;
  readAt: string | null;
  createdAt: string;
};

export default function NotificationsPage() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState(false);

  const load = async () => {
    const res = await fetch("/api/notifications");
    if (!res.ok) return;
    const data = (await res.json()) as { notifications: Notification[] };
    setNotifications(data.notifications ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const markAllRead = async () => {
    setMarking(true);
    await fetch("/api/notifications/read-all", { method: "PUT" });
    setNotifications((prev) => prev.map((n) => ({ ...n, readAt: new Date().toISOString() })));
    setMarking(false);
  };

  const markOneRead = async (id: string) => {
    await fetch(`/api/notifications/${id}/read`, { method: "PUT" });
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n))
    );
  };

  const handleClick = async (n: Notification) => {
    if (!n.readAt) await markOneRead(n.id);
    if (n.link) router.push(n.link);
  };

  const unreadCount = notifications.filter((n) => !n.readAt).length;

  return (
    <PageShell
      title="Notifications"
      subtitle="Stay up to date with your events and connections."
    >
      <div className="rounded-2xl border border-neutral-200 bg-white/90 p-6">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">
              {unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
            </h2>
            <p className="text-sm text-neutral-500">
              {notifications.length} total notification{notifications.length !== 1 ? "s" : ""}
            </p>
          </div>
          {unreadCount > 0 ? (
            <button
              type="button"
              onClick={markAllRead}
              disabled={marking}
              className="rounded-full border border-neutral-300 px-4 py-2 text-xs font-semibold transition hover:border-neutral-400 disabled:opacity-50"
            >
              {marking ? "Marking..." : "Mark all read"}
            </button>
          ) : null}
        </div>

        {loading ? (
          <p className="text-sm text-neutral-600">Loading...</p>
        ) : notifications.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500">
            No notifications yet. Commit to an event to get started.
          </div>
        ) : (
          <div className="space-y-2">
            {notifications.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => handleClick(n)}
                className={`w-full rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-sm ${
                  n.readAt
                    ? "border-neutral-200 bg-white/80"
                    : "border-ocean/20 bg-ocean/5"
                }`}
              >
                <div className="flex items-start gap-3">
                  {!n.readAt ? (
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" />
                  ) : (
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-neutral-200" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-ink">{n.title}</p>
                    <p className="mt-0.5 text-sm text-neutral-600">{n.body}</p>
                    <p className="mt-1 text-xs text-neutral-400">
                      {new Date(n.createdAt).toLocaleString()}
                    </p>
                  </div>
                  {n.link ? (
                    <span className="shrink-0 text-xs text-neutral-400">→</span>
                  ) : null}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </PageShell>
  );
}
