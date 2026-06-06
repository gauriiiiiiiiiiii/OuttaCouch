"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function ChatBadge() {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let active = true;

    const load = async () => {
      const res = await fetch("/api/chat");
      if (!res.ok || !active) return;
      const data = (await res.json()) as {
        chats: { unreadCount?: number }[];
      };
      if (active) {
        const total = (data.chats ?? []).reduce(
          (sum, c) => sum + (c.unreadCount ?? 0),
          0
        );
        setUnread(total);
      }
    };

    load();
    const interval = setInterval(load, 30_000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  return (
    <Link
      href="/chat"
      className="relative flex items-center gap-1 font-semibold"
      aria-label={unread > 0 ? `Chat — ${unread} unread` : "Chat"}
    >
      Chat
      {unread > 0 ? (
        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-white">
          {unread > 9 ? "9+" : unread}
        </span>
      ) : null}
    </Link>
  );
}
