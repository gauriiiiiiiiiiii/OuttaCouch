"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import PageShell from "@/components/ui/PageShell";
import SectionCard from "@/components/ui/SectionCard";
import SwipeStack from "@/components/events/SwipeStack";
import type { EventSummary } from "@/types";

const EventMap = dynamic(() => import("@/components/events/EventMap"), {
  ssr: false
});

export default function ExplorePage() {
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"swipe" | "map">("swipe");

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const res = await fetch("/api/events");
        if (!res.ok) {
          throw new Error("Failed to load events");
        }
        const data = (await res.json()) as { events: EventSummary[] };
        if (active) {
          setEvents(data.events || []);
        }
      } catch (err) {
        if (active) {
          setError("Could not load events.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
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

  const swipeEvents = events.length > 0 ? events : dummyEvents;
  const mapEvents = useMemo(() => (events.length > 0 ? events : dummyEvents), [events]);

  const handleSwipe = async (
    event: EventSummary,
    action: "left" | "right" | "up" | "down"
  ) => {
    if (event.id.startsWith("dummy")) {
      return;
    }
    await fetch("/api/events/swipe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event_id: event.id, action })
    });
  };

  return (
    <PageShell
      title="Explore events"
      subtitle="Swipe or browse events near you."
    >
      <SectionCard
        title="Explore"
        description="Swipe to decide or browse on the map."
      >
        {loading ? (
          <p className="text-sm text-neutral-600">Loading events...</p>
        ) : error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setView("swipe")}
                className={`rounded-full px-4 py-2 text-xs font-semibold ${
                  view === "swipe"
                    ? "bg-ink text-parchment"
                    : "border border-neutral-300 text-neutral-700"
                }`}
              >
                Swipe
              </button>
              <button
                type="button"
                onClick={() => setView("map")}
                className={`rounded-full px-4 py-2 text-xs font-semibold ${
                  view === "map"
                    ? "bg-ink text-parchment"
                    : "border border-neutral-300 text-neutral-700"
                }`}
              >
                Map view
              </button>
            </div>
            {view === "swipe" ? (
              <div className="space-y-4">
                <div className="rounded-2xl border border-neutral-200 bg-white/95 p-4 text-sm text-neutral-600">
                  Your deck is tuned to your interests, location, and recent activity.
                </div>
                <SwipeStack events={swipeEvents} onSwipe={handleSwipe} />
              </div>
            ) : (
              <div className="space-y-4">
                <EventMap
                  events={mapEvents.map((event) => ({
                    id: event.id,
                    title: event.title,
                    location: event.location,
                    lat: event.lat,
                    lng: event.lng
                  }))}
                />
                <div className="grid gap-3 md:grid-cols-2">
                  {mapEvents.slice(0, 4).map((event) => (
                    <div
                      key={event.id}
                      className="rounded-2xl border border-neutral-200 bg-white/95 p-4"
                    >
                      <div className="text-xs uppercase tracking-[0.2em] text-ocean">
                        {event.category}
                      </div>
                      <h3 className="mt-2 text-base font-semibold text-ink">
                        {event.title}
                      </h3>
                      <p className="text-sm text-neutral-600">
                        {event.date} · {event.location}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </SectionCard>
    </PageShell>
  );
}
