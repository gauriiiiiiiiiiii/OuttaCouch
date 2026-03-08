"use client";

import { useEffect, useMemo, useState } from "react";
import PageShell from "@/components/ui/PageShell";
import { motion, useMotionValue, useTransform } from "framer-motion";

type Suggestion = {
  userId: string;
  name: string;
  photo?: string | null;
  sharedEventTitle: string;
  sharedEventId: string;
  sharedCount: number;
};

type Connection = {
  id: string;
  userId: string;
  name: string;
  photo?: string | null;
};

type ConnectionRequest = {
  id: string;
  userId: string;
  name: string;
  photo?: string | null;
  sharedEventId?: string | null;
  sharedEventTitle?: string | null;
  requestedAt: string;
};

export default function ConnectionsPage() {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [requests, setRequests] = useState<ConnectionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [index, setIndex] = useState(0);
  const [swipeAction, setSwipeAction] = useState<
    "left" | "right" | "up" | "down" | null
  >(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useTransform(x, [-200, 0, 200], [-12, 0, 12]);
  const likeOpacity = useTransform(x, [40, 120], [0, 1]);
  const nopeOpacity = useTransform(x, [-120, -40], [1, 0]);
  const maybeOpacity = useTransform(y, [40, 120], [0, 1]);
  const shareOpacity = useTransform(y, [-120, -40], [1, 0]);
  const threshold = 120;

  useEffect(() => {
    let active = true;
    const load = async () => {
      const [suggestionsRes, connectionsRes, requestsRes] = await Promise.all([
        fetch("/api/connections/suggestions"),
        fetch("/api/connections"),
        fetch("/api/connections/requests")
      ]);
      const suggestionsData = suggestionsRes.ok
        ? ((await suggestionsRes.json()) as { suggestions: Suggestion[] })
        : { suggestions: [] };
      const connectionsData = connectionsRes.ok
        ? ((await connectionsRes.json()) as { connections: Connection[] })
        : { connections: [] };
      const requestsData = requestsRes.ok
        ? ((await requestsRes.json()) as { requests: ConnectionRequest[] })
        : { requests: [] };

      if (active) {
        setSuggestions(suggestionsData.suggestions ?? []);
        setConnections(connectionsData.connections ?? []);
        setRequests(requestsData.requests ?? []);
        setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, []);

  const handleConnect = async (suggestion: Suggestion) => {
    await fetch(`/api/connections/request/${suggestion.userId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sharedEventId: suggestion.sharedEventId })
    });
    setSuggestions((prev) => prev.filter((item) => item.userId !== suggestion.userId));
  };

  const handleSkip = (userId: string) => {
    setSuggestions((prev) => prev.filter((item) => item.userId !== userId));
  };

  const handleAccept = async (request: ConnectionRequest) => {
    await fetch(`/api/connections/${request.id}/accept`, { method: "PUT" });
    setRequests((prev) => prev.filter((item) => item.id !== request.id));
    setConnections((prev) => [
      ...prev,
      {
        id: request.id,
        userId: request.userId,
        name: request.name,
        photo: request.photo
      }
    ]);
  };

  const handleDecline = async (request: ConnectionRequest) => {
    await fetch(`/api/connections/${request.id}/decline`, { method: "PUT" });
    setRequests((prev) => prev.filter((item) => item.id !== request.id));
  };

  const activeSuggestion = suggestions[index];
  const nextSuggestion = suggestions[index + 1];

  const handleSwipe = async (action: "left" | "right" | "up" | "down") => {
    if (!activeSuggestion) {
      return;
    }
    if (action === "right") {
      await handleConnect(activeSuggestion);
    }
    if (action === "left") {
      handleSkip(activeSuggestion.userId);
    }
    if (action === "up") {
      await handleConnect(activeSuggestion);
    }
    if (action === "down") {
      handleSkip(activeSuggestion.userId);
    }
    setSwipeAction(action);
  };

  return (
    <PageShell title="Connections" subtitle="Suggested based on shared events.">
      {loading ? (
        <div className="rounded-2xl border border-neutral-200 bg-white/80 p-6 text-sm text-neutral-600">
          Loading connections...
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-4">
            <div className="rounded-2xl border border-neutral-200 bg-white/90 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">Suggested</p>
              <p className="mt-2 text-2xl font-semibold text-ink">
                {suggestions.length}
              </p>
            </div>
            <div className="rounded-2xl border border-neutral-200 bg-white/90 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">Requests</p>
              <p className="mt-2 text-2xl font-semibold text-ink">
                {requests.length}
              </p>
            </div>
            <div className="rounded-2xl border border-neutral-200 bg-white/90 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">Connections</p>
              <p className="mt-2 text-2xl font-semibold text-ink">
                {connections.length}
              </p>
            </div>
            <div className="rounded-2xl border border-neutral-200 bg-white/90 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">
                Shared events
              </p>
              <p className="mt-2 text-2xl font-semibold text-ink">
                {suggestions.reduce((total, item) => total + item.sharedCount, 0)}
              </p>
            </div>
          </div>
          <section className="rounded-2xl border border-neutral-200 bg-white/90 p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Requests</h2>
                <p className="text-sm text-neutral-500">
                  Accept or decline connection requests.
                </p>
              </div>
            </div>
            <div className="mt-5 space-y-3">
              {requests.length === 0 ? (
                <p className="text-sm text-neutral-600">No requests right now.</p>
              ) : (
                requests.map((request) => (
                  <div
                    key={request.id}
                    className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-neutral-200 bg-white/95 p-4"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-12 rounded-full bg-neutral-200">
                        {request.photo ? (
                          <img
                            src={request.photo}
                            alt={request.name}
                            className="h-full w-full rounded-full object-cover"
                          />
                        ) : null}
                      </div>
                      <div>
                        <p className="text-sm font-semibold">{request.name}</p>
                        <p className="text-xs text-neutral-500">
                          Shared: {request.sharedEventTitle ?? "Event"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleDecline(request)}
                        className="rounded-full border border-neutral-300 px-4 py-2 text-xs font-semibold"
                      >
                        Decline
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAccept(request)}
                        className="rounded-full bg-ink px-4 py-2 text-xs font-semibold text-parchment"
                      >
                        Accept
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
          <section className="rounded-2xl border border-neutral-200 bg-white/90 p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Suggested</h2>
                <p className="text-sm text-neutral-500">
                  Swipe right to connect, left to skip.
                </p>
              </div>
            </div>
            <div className="mt-6">
              {suggestions.length === 0 ? (
                <p className="text-sm text-neutral-600">No suggestions yet.</p>
              ) : !activeSuggestion ? (
                <p className="text-sm text-neutral-600">No more suggestions.</p>
              ) : (
                <div className="relative">
                  {nextSuggestion ? (
                    <div className="pointer-events-none absolute inset-0 -z-10 scale-[0.98] rounded-2xl border border-neutral-200 bg-white/90" />
                  ) : null}
                  <motion.div
                    key={activeSuggestion.userId}
                    className="cursor-grab active:cursor-grabbing"
                    drag
                    dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
                    dragElastic={0.2}
                    style={{ x, y, rotate }}
                    animate={
                      swipeAction === "right"
                        ? { x: 600, y: 0, rotate: 18 }
                        : swipeAction === "left"
                          ? { x: -600, y: 0, rotate: -18 }
                          : swipeAction === "up"
                            ? { x: 0, y: -600, rotate: 0 }
                            : swipeAction === "down"
                              ? { x: 0, y: 600, rotate: 0 }
                              : { x: 0, y: 0, rotate: 0 }
                    }
                    transition={{ type: "spring", stiffness: 260, damping: 24 }}
                    onDragEnd={(_, info) => {
                      const { offset } = info;
                      if (offset.x > threshold) {
                        handleSwipe("right");
                        return;
                      }
                      if (offset.x < -threshold) {
                        handleSwipe("left");
                        return;
                      }
                      if (offset.y < -threshold) {
                        handleSwipe("up");
                        return;
                      }
                      if (offset.y > threshold) {
                        handleSwipe("down");
                        return;
                      }
                      x.set(0);
                      y.set(0);
                    }}
                    onAnimationComplete={() => {
                      if (swipeAction) {
                        setSwipeAction(null);
                        x.set(0);
                        y.set(0);
                        setIndex((prev) => Math.min(prev + 1, suggestions.length));
                      }
                    }}
                  >
                    <motion.div
                      className="absolute left-4 top-4 rounded-full border border-green-500 px-3 py-1 text-xs font-semibold text-green-600"
                      style={{ opacity: likeOpacity }}
                    >
                      CONNECT
                    </motion.div>
                    <motion.div
                      className="absolute right-4 top-4 rounded-full border border-red-500 px-3 py-1 text-xs font-semibold text-red-600"
                      style={{ opacity: nopeOpacity }}
                    >
                      SKIP
                    </motion.div>
                    <motion.div
                      className="absolute left-4 bottom-4 rounded-full border border-amber-500 px-3 py-1 text-xs font-semibold text-amber-600"
                      style={{ opacity: maybeOpacity }}
                    >
                      MAYBE
                    </motion.div>
                    <motion.div
                      className="absolute right-4 bottom-4 rounded-full border border-sky-500 px-3 py-1 text-xs font-semibold text-sky-600"
                      style={{ opacity: shareOpacity }}
                    >
                      SHARE
                    </motion.div>
                    <div className="rounded-2xl border border-neutral-200 bg-white/95 p-6 shadow-sm">
                      <div className="flex items-center gap-4">
                        <div className="h-16 w-16 rounded-full bg-neutral-200">
                          {activeSuggestion.photo ? (
                            <img
                              src={activeSuggestion.photo}
                              alt={activeSuggestion.name}
                              className="h-full w-full rounded-full object-cover"
                            />
                          ) : null}
                        </div>
                        <div>
                          <div className="text-lg font-semibold">
                            {activeSuggestion.name}
                          </div>
                          <div className="text-sm text-neutral-500">
                            Shared: {activeSuggestion.sharedEventTitle}
                          </div>
                        </div>
                      </div>
                      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-neutral-500">
                        <span className="rounded-full border border-neutral-200 px-3 py-1">
                          {activeSuggestion.sharedCount} shared events
                        </span>
                        <span className="rounded-full border border-neutral-200 px-3 py-1">
                          Swipe to decide
                        </span>
                      </div>
                    </div>
                  </motion.div>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                    <button
                      className="rounded-full border border-neutral-300 px-4 py-2 text-xs font-semibold"
                      onClick={() => handleSwipe("left")}
                    >
                      Skip
                    </button>
                    <button
                      className="rounded-full border border-neutral-300 px-4 py-2 text-xs font-semibold"
                      onClick={() => handleSwipe("down")}
                    >
                      Maybe
                    </button>
                    <button
                      className="rounded-full border border-neutral-300 px-4 py-2 text-xs font-semibold"
                      onClick={() => handleSwipe("up")}
                    >
                      Share
                    </button>
                    <button
                      className="rounded-full bg-ink px-4 py-2 text-xs font-semibold text-parchment"
                      onClick={() => handleSwipe("right")}
                    >
                      Connect
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>
          <section className="rounded-2xl border border-neutral-200 bg-white/90 p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">My connections</h2>
                <p className="text-sm text-neutral-500">
                  Start a chat or plan your next hang.
                </p>
              </div>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {connections.length === 0 ? (
                <p className="text-sm text-neutral-600">No connections yet.</p>
              ) : (
                connections.map((connection) => (
                  <div
                    key={connection.id}
                    className="flex items-center justify-between rounded-xl border border-neutral-200 bg-white/95 px-4 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-neutral-200">
                        {connection.photo ? (
                          <img
                            src={connection.photo}
                            alt={connection.name}
                            className="h-full w-full rounded-full object-cover"
                          />
                        ) : null}
                      </div>
                      <div className="font-semibold">{connection.name}</div>
                    </div>
                    <span className="text-xs text-neutral-500">Connected</span>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      )}
    </PageShell>
  );
}
