"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import PageShell from "@/components/ui/PageShell";

type HostEvent = {
  id: string;
  title: string;
  date: string;
  attendeeCount: number;
};

export default function HostEventsPage() {
  const [events, setEvents] = useState<HostEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const res = await fetch("/api/events/host");
      const data = res.ok
        ? ((await res.json()) as { events: HostEvent[] })
        : { events: [] };
      if (active) {
        setEvents(data.events ?? []);
        setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, []);

  return (
    <PageShell title="Host events" subtitle="Your hosted events.">
      <div className="rounded-2xl border border-neutral-200 bg-white/80 p-6">
        {loading ? (
          <p className="text-sm text-neutral-600">Loading events...</p>
        ) : events.length === 0 ? (
          <p className="text-sm text-neutral-600">No hosted events yet.</p>
        ) : (
          <div className="space-y-3">
            {events.map((event) => (
              <Link
                key={event.id}
                href={`/events/manage/${event.id}`}
                className="block rounded-xl border border-neutral-200 px-4 py-3"
              >
                <div className="font-semibold">{event.title}</div>
                <div className="text-xs text-neutral-500">
                  {event.date} · {event.attendeeCount} attending
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </PageShell>
  );
}
