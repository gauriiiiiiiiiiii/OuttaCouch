"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import PageShell from "@/components/ui/PageShell";
import { navigateToProfile } from "@/lib/navigateToProfile";

type ChatItem = {
  connectionId: string;
  userId: string;
  name: string;
  lastMessage: string;
  photo?: string | null;
  lastAt?: string | null;
};

type ConnectionItem = {
  id: string;
  userId: string;
  name: string;
  photo?: string | null;
};

export default function ChatListPage() {
  const router = useRouter();
  const [chats, setChats] = useState<ChatItem[]>([]);
  const [connections, setConnections] = useState<ConnectionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let active = true;
    const load = async () => {
      const [chatsRes, connectionsRes] = await Promise.all([
        fetch("/api/chat"),
        fetch("/api/connections")
      ]);
      const chatData = chatsRes.ok
        ? ((await chatsRes.json()) as { chats: ChatItem[] })
        : { chats: [] };
      const connectionsData = connectionsRes.ok
        ? ((await connectionsRes.json()) as { connections: ConnectionItem[] })
        : { connections: [] };
      if (active) {
        setChats(chatData.chats ?? []);
        setConnections(connectionsData.connections ?? []);
        setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, []);

  const chatMap = useMemo(() => {
    return new Map(chats.map((chat) => [chat.connectionId, chat]));
  }, [chats]);

  const handleConnectionClick = (connectionId: string) => {
    router.push(`/chat/${connectionId}`);
  };


  return (
    <PageShell title="Chat" subtitle="Conversations with connections.">
      <div className="rounded-2xl border border-neutral-200 bg-white/90 p-6">
        <div className="mb-6">
          <h2 className="text-lg font-semibold">Connections</h2>
          <p className="text-sm text-neutral-500">Start a new conversation.</p>
          {connections.length === 0 ? (
            <p className="mt-3 text-sm text-neutral-600">No connections yet.</p>
          ) : (
            <div className="mt-3 flex gap-3 overflow-x-auto pb-2">
              {connections.map((connection) => {
                const hasChat = chatMap.has(connection.id);
                return (
                  <button
                    key={connection.id}
                    type="button"
                    onClick={() => handleConnectionClick(connection.id)}
                    className="flex w-28 flex-shrink-0 flex-col items-center gap-2 rounded-2xl border border-neutral-200 bg-white/95 px-3 py-3 text-center transition hover:border-neutral-300 hover:shadow-sm"
                  >
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        navigateToProfile(router, connection.userId);
                      }}
                      className="relative h-12 w-12 rounded-full bg-neutral-200 overflow-hidden"
                      aria-label={`View ${connection.name}`}
                    >
                      {connection.photo ? (
                          <Image
                            src={connection.photo}
                            alt={connection.name}
                            fill
                            sizes="48px"
                            className="rounded-full object-cover"
                          />
                      ) : null}
                    </button>
                    <div className="text-xs font-semibold text-neutral-800">
                      {connection.name}
                    </div>
                    <div className="text-[11px] text-neutral-500">
                      {hasChat ? "Open chat" : "Start a conversation"}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
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
                <button
                  type="button"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    navigateToProfile(router, chat.userId);
                  }}
                  className="relative h-12 w-12 rounded-full bg-neutral-200 overflow-hidden"
                  aria-label={`View ${chat.name}`}
                >
                  {chat.photo ? (
                    <Image
                      src={chat.photo}
                      alt={chat.name}
                      fill
                      sizes="48px"
                      className="rounded-full object-cover"
                    />
                  ) : null}
                </button>
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
