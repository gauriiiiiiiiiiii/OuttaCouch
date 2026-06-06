"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";

export default function NotificationBell() {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const res = await fetch("/api/notifications");
      if (!res.ok || !active) return;
      const data = (await res.json()) as {
        notifications: { readAt: string | null }[];
      };
      if (active) {
        setUnread(data.notifications.filter((n) => !n.readAt).length);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, []);

  return (
    <Link
      href="/notifications"
      className="relative flex items-center justify-center rounded-lg p-2 hover:bg-parchment"
      aria-label={unread > 0 ? `${unread} unread notifications` : "Notifications"}
    >
      <Bell size={18} strokeWidth={1.75} />
      {unread > 0 ? (
        <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-white">
          {unread > 9 ? "9+" : unread}
        </span>
      ) : null}
    </Link>
  );
}
