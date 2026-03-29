"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import PageShell from "@/components/ui/PageShell";
import { io, type Socket } from "socket.io-client";

type Message = {
  id: string;
  content: string;
  senderId: string;
  sentAt: string;
  readAt?: string | null;
};

export default function ChatThreadPage() {
  const params = useParams();
  const id = params?.id as string;
  const [messages, setMessages] = useState<Message[]>([]);
  const [content, setContent] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const lastSentMessageId = useMemo(() => {
    if (!userId) {
      return null;
    }
    const lastMessage = [...messages].reverse().find((message) => message.senderId === userId);
    return lastMessage?.id ?? null;
  }, [messages, userId]);

  const loadMessages = useCallback(async () => {
    const res = await fetch(`/api/chat/${id}`);
    const data = res.ok ? ((await res.json()) as { messages: Message[] }) : { messages: [] };
    setMessages(data.messages ?? []);
  }, [id]);

  const markRead = useCallback(async () => {
    if (!id) {
      return;
    }
    await fetch(`/api/chat/${id}/read`, { method: "PUT" });
  }, [id]);

  useEffect(() => {
    if (id) {
      loadMessages();
      markRead();
    }
  }, [id, loadMessages, markRead]);

  useEffect(() => {
    if (!id) {
      return;
    }
    fetch("/api/socketio");
    const socket = io({ path: "/api/socketio" });
    socketRef.current = socket;
    socket.emit("join", id);
    socket.on("message", (message: Message) => {
      setMessages((prev) => [...prev, message]);
      if (userId && message.senderId !== userId) {
        markRead();
      }
    });
    socket.on("typing", (payload: { userId?: string; isTyping?: boolean }) => {
      if (!payload?.userId || payload.userId === userId) {
        return;
      }
      setIsTyping(Boolean(payload.isTyping));
    });
    socket.on("read", () => {
      loadMessages();
    });
    return () => {
      socket.disconnect();
    };
  }, [id, userId, loadMessages, markRead]);

  useEffect(() => {
    const loadUser = async () => {
      const res = await fetch("/api/users/me");
      const data = res.ok ? ((await res.json()) as { user: { id: string } }) : null;
      setUserId(data?.user?.id ?? null);
    };
    loadUser();
  }, []);

  const sendMessage = async () => {
    if (!content.trim()) {
      return;
    }
    await fetch(`/api/chat/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content })
    });
    setContent("");
    if (socketRef.current && userId) {
      socketRef.current.emit("typing", {
        roomId: id,
        userId,
        isTyping: false
      });
    }
  };

  const handleTyping = (nextValue: string) => {
    setContent(nextValue);
    if (!socketRef.current || !userId) {
      return;
    }
    socketRef.current.emit("typing", { roomId: id, userId, isTyping: true });
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    typingTimeoutRef.current = setTimeout(() => {
      socketRef.current?.emit("typing", { roomId: id, userId, isTyping: false });
    }, 1500);
  };

  return (
    <PageShell title="Conversation" subtitle="Messages with connections.">
      <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white/90">
        <div className="flex items-center justify-between border-b border-neutral-200 bg-white/95 px-6 py-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">
              Direct message
            </p>
            <h2 className="text-lg font-semibold">Conversation</h2>
          </div>
          <Link
            href="/chat"
            className="rounded-full border border-neutral-300 px-4 py-2 text-xs font-semibold"
          >
            Back to chats
          </Link>
        </div>
        <div className="space-y-2 px-6 py-5">
        <div className="space-y-2">
          {messages.length === 0 ? (
            <p className="text-sm text-neutral-600">No messages yet.</p>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${
                  userId && message.senderId === userId
                    ? "justify-end"
                    : "justify-start"
                }`}
              >
                  <div className="max-w-[70%] space-y-1">
                    <div
                      className={`rounded-2xl px-4 py-2 text-sm ${
                        userId && message.senderId === userId
                          ? "bg-ink text-parchment"
                          : "bg-parchment text-ink"
                      }`}
                    >
                      {message.content}
                    </div>
                    <p
                      className={`text-[11px] ${
                        userId && message.senderId === userId
                          ? "text-right text-neutral-400"
                          : "text-left text-neutral-500"
                      }`}
                    >
                      {new Date(message.sentAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit"
                      })}
                      {userId &&
                      message.senderId === userId &&
                      message.id === lastSentMessageId &&
                      message.readAt
                        ? " · Seen"
                        : ""}
                    </p>
                  </div>
              </div>
            ))
          )}
        </div>
        {isTyping ? (
          <p className="text-xs text-neutral-500">Typing...</p>
        ) : null}
        </div>
        <div className="border-t border-neutral-200 bg-white/95 px-6 py-4">
          <div className="flex gap-2">
            <input
              className="flex-1 rounded-full border border-neutral-200 px-4 py-2 text-sm"
              placeholder="Type a message"
              value={content}
              onChange={(event) => handleTyping(event.target.value)}
            />
            <button
              className="rounded-full bg-ink px-5 py-2 text-sm font-semibold text-parchment"
              onClick={sendMessage}
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
