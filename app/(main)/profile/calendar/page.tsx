"use client";

import { useEffect, useState } from "react";
import PageShell from "@/components/ui/PageShell";
import CalendarGrid from "@/components/profile/CalendarGrid";

type CalendarResponse = {
  attendedEvents: {
    id: string;
    title: string;
    date: string;
    category: string;
    imageUrl?: string | null;
  }[];
};

export default function CalendarPage() {
  const [data, setData] = useState<CalendarResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const res = await fetch("/api/users/me");
        if (!res.ok) {
          throw new Error("Failed");
        }
        const json = (await res.json()) as CalendarResponse;
        if (active) {
          const pendingRaw = localStorage.getItem("calendarPendingEvent");
          if (pendingRaw) {
            try {
              const pending = JSON.parse(pendingRaw) as {
                id: string;
                title: string;
                date: string;
                category: string;
                status: string;
                imageUrl?: string | null;
              };
              const exists = json.attendedEvents.some((event) => event.id === pending.id);
              if (!exists) {
                json.attendedEvents = [pending, ...json.attendedEvents];
              } else {
                localStorage.removeItem("calendarPendingEvent");
              }
            } catch {
              // ignore parse errors
            }
          }
          setData(json);
        }
      } catch {
        if (active) {
          setError("Could not load calendar.");
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

  return (
    <PageShell title="Event calendar" subtitle="Your real-world journal.">
      {loading ? (
        <div className="rounded-2xl border border-neutral-200 bg-white/80 p-6 text-sm text-neutral-600">
          Loading calendar...
        </div>
      ) : error || !data ? (
        <div className="rounded-2xl border border-neutral-200 bg-white/80 p-6 text-sm text-red-600">
          {error ?? "Calendar not found."}
        </div>
      ) : (
        <CalendarGrid events={data.attendedEvents} />
      )}
    </PageShell>
  );
}
