"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import PageShell from "@/components/ui/PageShell";
import SectionCard from "@/components/ui/SectionCard";
import SwipeStack from "@/components/events/SwipeStack";
import type { EventSummary } from "@/types";

export default function ExplorePage() {
  const router = useRouter();
  const [categoryFilter, setCategoryFilter] = useState("");
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [hiddenEvents, setHiddenEvents] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const res = await fetch("/api/events?page=1");
        if (!res.ok) throw new Error("Failed to load events");
        const data = (await res.json()) as { events: EventSummary[]; hasMore: boolean };
        if (active) {
          setEvents(data.events || []);
          setHasMore(data.hasMore ?? false);
          setPage(1);
        }
      } catch {
        if (active) setError("Could not load events.");
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, []);

  const dummyEvents: EventSummary[] = [
    {
      id: "dummy-1",
      title: "Sunset Rooftop Jam",
      category: "Music",
      date: "Mar 18, 2026",
      location: "Skyline Terrace",
      lat: 28.6323,
      lng: 77.2196,
      imageUrl:
        "https://images.unsplash.com/photo-1506157786151-b8491531f063?auto=format&fit=crop&w=1200&q=80"
    },
    {
      id: "dummy-2",
      title: "Midnight Food Crawl",
      category: "Food",
      date: "Mar 21, 2026",
      location: "Old Market District",
      lat: 28.6505,
      lng: 77.2345,
      imageUrl:
        "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=1200&q=80"
    },
    {
      id: "dummy-3",
      title: "Morning Trail Sprint",
      category: "Outdoors",
      date: "Mar 24, 2026",
      location: "Riverbend Park",
      lat: 28.6122,
      lng: 77.2414,
      imageUrl:
        "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=80"
    }
  ];

  const baseEvents = events.length > 0 ? events : dummyEvents;
  const categories = useMemo(() => {
    const cats = Array.from(new Set(events.map((e) => e.category).filter(Boolean)));
    return cats.sort();
  }, [events]);

  const filteredEvents = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    let filtered = baseEvents.filter((event) => !hiddenEvents.has(event.id));
    if (categoryFilter) {
      filtered = filtered.filter((event) => event.category === categoryFilter);
    }
    if (trimmed) {
      filtered = filtered.filter((event) =>
        [event.title, event.category, event.location]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(trimmed)
      );
    }
    return filtered;
  }, [baseEvents, query, hiddenEvents, categoryFilter]);

  const handleSwipe = async (
    event: EventSummary,
    action: "left" | "right"
  ) => {
    if (event.id.startsWith("dummy")) {
      if (action === "left") {
        setHiddenEvents((prev) => new Set([...prev, event.id]));
      }
      if (action === "right") {
        router.push(`/events/${event.id}`);
      }
      return;
    }

    await fetch("/api/events/swipe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event_id: event.id, action })
    });

    if (action === "right") {
      // Commit intent flows into event details for acceptance/payment
      router.push(`/events/${event.id}#tickets`);
    } else {
      // Skip hides the event locally
      setHiddenEvents((prev) => new Set([...prev, event.id]));
    }
  };

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const res = await fetch(`/api/events?page=${nextPage}`);
      if (res.ok) {
        const data = (await res.json()) as { events: EventSummary[]; hasMore: boolean };
        setEvents((prev) => {
          const ids = new Set(prev.map((e) => e.id));
          const fresh = (data.events ?? []).filter((e) => !ids.has(e.id));
          return [...prev, ...fresh];
        });
        setHasMore(data.hasMore ?? false);
        setPage(nextPage);
      }
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <PageShell
      title="Explore events"
      subtitle="Swipe or browse events near you."
    >
      <SectionCard
        title="Explore"
        description="Swipe to decide."
      >
        {loading ? (
          <p className="text-sm text-neutral-600">Loading events...</p>
        ) : error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : (
          <div className="space-y-4">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="w-full rounded-full border border-neutral-200 px-4 py-2 text-sm"
              placeholder="Search events by name, category, or location"
            />
            {categories.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setCategoryFilter("")}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                    !categoryFilter
                      ? "border-ink bg-ink text-parchment"
                      : "border-neutral-300 text-neutral-600 hover:border-neutral-400"
                  }`}
                >
                  All
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategoryFilter(cat === categoryFilter ? "" : cat)}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                      categoryFilter === cat
                        ? "border-ocean bg-ocean/10 text-ocean"
                        : "border-neutral-300 text-neutral-600 hover:border-neutral-400"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            ) : null}
            {events.length === 0 && !loading && !query && (
              <div className="rounded-2xl border border-ocean/20 bg-ocean/5 p-4 text-sm">
                <p className="font-semibold text-ink">Welcome to OuttaCouch!</p>
                <p className="mt-1 text-neutral-600">
                  No events near you yet — here are some examples to explore. Once hosts
                  create events in your area, they&apos;ll show up here ranked by distance and
                  your interests.
                </p>
                <button
                  type="button"
                  onClick={() => router.push("/events/new")}
                  className="mt-3 rounded-full bg-ink px-4 py-1.5 text-xs font-semibold text-parchment"
                >
                  Host your own event
                </button>
              </div>
            )}
            {filteredEvents.length === 0 ? (
              <div className="rounded-2xl border border-neutral-200 bg-white/80 p-6 text-center text-sm text-neutral-600">
                No events match your search.
              </div>
            ) : (
              <SwipeStack events={filteredEvents} onSwipe={handleSwipe} />
            )}
            {hasMore && !query ? (
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="mt-2 w-full rounded-full border border-neutral-300 py-2 text-xs font-semibold text-neutral-600 hover:bg-neutral-50 disabled:opacity-50"
              >
                {loadingMore ? "Loading..." : "Load more events"}
              </button>
            ) : null}
          </div>
        )}
      </SectionCard>
    </PageShell>
  );
}
