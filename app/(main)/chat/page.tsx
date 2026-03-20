"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import PageShell from "@/components/ui/PageShell";

type ChatItem = {
  connectionId: string;
  name: string;
  lastMessage: string;
  photo?: string | null;
  lastAt?: string | null;
};

export default function ChatListPage() {
  const [chats, setChats] = useState<ChatItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let active = true;
    const load = async () => {
      const res = await fetch("/api/chat");
      const data = res.ok
        ? ((await res.json()) as { chats: ChatItem[] })
        : { chats: [] };
      if (active) {
        setChats(data.chats ?? []);
        setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, []);


  return (
    <PageShell title="Chat" subtitle="Conversations with connections.">
      <div className="rounded-2xl border border-neutral-200 bg-white/90 p-6">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Messages</h2>
            <p className="text-sm text-neutral-500">
              Keep the momentum going after the event.
            </p>
          </div>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="w-full rounded-full border border-neutral-200 px-4 py-2 text-sm md:w-64"
            placeholder="Search chats"
          />
        </div>
        {loading ? (
          <p className="text-sm text-neutral-600">Loading chats...</p>
        ) : chats.length === 0 ? (
          <p className="text-sm text-neutral-600">No conversations yet.</p>
        ) : (
          <div className="space-y-3">
            {chats
              .filter((chat) =>
                chat.name.toLowerCase().includes(query.trim().toLowerCase())
              )
              .map((chat) => (
              <Link
                key={chat.connectionId}
                href={`/chat/${chat.connectionId}`}
                className="flex items-center gap-3 rounded-2xl border border-neutral-200 bg-white/95 px-4 py-3 shadow-sm transition hover:-translate-y-0.5 hover:border-neutral-300"
              >
                <div className="h-12 w-12 rounded-full bg-neutral-200">
                  {chat.photo ? (
                    <img
                      src={chat.photo}
                      alt={chat.name}
                      className="h-full w-full rounded-full object-cover"
                    />
                  ) : null}
                </div>
                <div className="flex-1">
                  <div className="font-semibold">{chat.name}</div>
                  <div className="text-xs text-neutral-500">
                    {chat.lastMessage || "Say hello"}
                  </div>
                </div>
                <div className="text-xs text-neutral-400">
                  {chat.lastAt ? new Date(chat.lastAt).toLocaleDateString() : ""}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </PageShell>
  );
}
