"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import SwipeStack from "@/components/events/SwipeStack";
import type { EventSummary } from "@/types";

export default function SwipeModePage() {
  const router = useRouter();
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [hiddenEvents, setHiddenEvents] = useState<Set<string>>(new Set());

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const res = await fetch("/api/events");
        if (!res.ok) return;
        const data = (await res.json()) as { events: EventSummary[] };
        if (active) setEvents(data.events ?? []);
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => { active = false; };
  }, []);

  const filteredEvents = useMemo(
    () => events.filter((e) => !hiddenEvents.has(e.id)),
    [events, hiddenEvents]
  );

  const handleSwipe = async (event: EventSummary, action: "left" | "right") => {
    await fetch("/api/events/swipe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event_id: event.id, action })
    });
    if (action === "right") {
      router.push(`/events/${event.id}#tickets`);
    } else {
      setHiddenEvents((prev) => new Set([...prev, event.id]));
    }
  };

  return (
    <div className="flex min-h-dvh flex-col bg-parchment">
      <header className="flex items-center gap-3 px-4 py-3">
        <Link
          href="/explore"
          className="rounded-full border border-neutral-300 px-3 py-1.5 text-xs font-semibold"
        >
          ← Back
        </Link>
        <span className="text-sm font-semibold text-ink">Swipe mode</span>
      </header>
      <main className="flex flex-1 flex-col items-center justify-center px-4 pb-8">
        {loading ? (
          <p className="text-sm text-neutral-600">Loading events...</p>
        ) : filteredEvents.length === 0 ? (
          <div className="rounded-2xl border border-neutral-200 bg-white/90 p-8 text-center text-sm text-neutral-600">
            <p className="font-semibold">All caught up!</p>
            <p className="mt-1">No more events to swipe through right now.</p>
            <Link
              href="/events/new"
              className="mt-4 inline-block rounded-full bg-ink px-5 py-2 text-xs font-semibold text-parchment"
            >
              Host your own
            </Link>
          </div>
        ) : (
          <div className="w-full max-w-sm">
            <SwipeStack events={filteredEvents} onSwipe={handleSwipe} />
          </div>
        )}
      </main>
    </div>
  );
}
