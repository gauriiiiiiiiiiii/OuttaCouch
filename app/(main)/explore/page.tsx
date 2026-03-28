"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import PageShell from "@/components/ui/PageShell";
import SectionCard from "@/components/ui/SectionCard";
import SwipeStack from "@/components/events/SwipeStack";
import type { EventSummary } from "@/types";

export default function ExplorePage() {
  const router = useRouter();
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [hiddenEvents, setHiddenEvents] = useState<Set<string>>(new Set());

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
      } catch {
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

  const baseEvents = events.length > 0 ? events : dummyEvents;
  const filteredEvents = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    let filtered = baseEvents;
    
    // Filter out hidden events
    filtered = filtered.filter((event) => !hiddenEvents.has(event.id));
    
    // Apply search query
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
  }, [baseEvents, query, hiddenEvents]);

  const handleSwipe = async (
    event: EventSummary,
    action: "left" | "right"
  ) => {
    if (event.id.startsWith("dummy")) {
      return;
    }

    // Log swipe action to database
    await fetch("/api/events/swipe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event_id: event.id, action })
    });

    // Handle swipe actions
    if (action === "right") {
      // Swipe right: Open event details for confirmation
      router.push(`/events/${event.id}`);
    } else if (action === "left") {
      // Swipe left: Skip/hide event from feed
      setHiddenEvents((prev) => new Set([...prev, event.id]));
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
            <SwipeStack events={filteredEvents} onSwipe={handleSwipe} />
          </div>
        )}
      </SectionCard>
    </PageShell>
  );
}
