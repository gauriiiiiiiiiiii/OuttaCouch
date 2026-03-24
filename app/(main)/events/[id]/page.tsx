"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import dynamic from "next/dynamic";
import PageShell from "@/components/ui/PageShell";
import type { EventSummary } from "@/types";

const EventMap = dynamic(() => import("@/components/events/EventMap"), {
  ssr: false
});

type EventDetail = {
  id: string;
  title: string;
  description: string;
  category: string;
  date: string;
  time: string;
  startTime?: string | null;
  endTime?: string | null;
  eventDate?: string | null;
  venueName: string;
  address: string;
  lat?: number | null;
  lng?: number | null;
  coverImageUrl: string;
  images: { id: string; imageUrl: string; isCover: boolean; orderIndex: number }[];
  isFree: boolean;
  ticketPrice: string | null;
  host: { id: string; name: string; photo?: string | null };
  attendeeCount: number;
};

export default function EventDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [commitStatus, setCommitStatus] = useState<string | null>(null);
  const [similarEvents, setSimilarEvents] = useState<EventSummary[]>([]);
  const [distanceKm, setDistanceKm] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const res = await fetch(`/api/events/${id}`);
        if (!res.ok) {
          throw new Error("Failed");
        }
        const data = (await res.json()) as EventDetail;
        if (active) {
          setEvent(data);
        }
      } catch (err) {
        if (active) {
          setError("Could not load event.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };
    if (id) {
      load();
    }
    return () => {
      active = false;
    };
  }, [id]);

  useEffect(() => {
    if (!event?.category) {
      return;
    }
    let active = true;
    const loadSimilar = async () => {
      try {
        const res = await fetch("/api/events");
        if (!res.ok) {
          return;
        }
        const data = (await res.json()) as { events: EventSummary[] };
        if (!active) {
          return;
        }
        const filtered = (data.events ?? []).filter(
          (item) => item.category === event.category && item.id !== event.id
        );
        setSimilarEvents(filtered.slice(0, 3));
      } catch (err) {
        if (active) {
          setSimilarEvents([]);
        }
      }
    };
    loadSimilar();
    return () => {
      active = false;
    };
  }, [event?.category, event?.id]);

  useEffect(() => {
    if (!event || event.lat === null || event.lng === null) {
      setDistanceKm(null);
      return;
    }
    const toRad = (value: number) => (value * Math.PI) / 180;
    const calcDistance = (lat1: number, lng1: number, lat2: number, lng2: number) => {
      const r = 6371;
      const dLat = toRad(lat2 - lat1);
      const dLng = toRad(lng2 - lng1);
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) *
          Math.cos(toRad(lat2)) *
          Math.sin(dLng / 2) *
          Math.sin(dLng / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return r * c;
    };

    const setFromCoords = (lat: number, lng: number) => {
      const km = calcDistance(lat, lng, Number(event.lat), Number(event.lng));
      setDistanceKm(Number(km.toFixed(1)));
    };

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setFromCoords(pos.coords.latitude, pos.coords.longitude);
        },
        async () => {
          const res = await fetch("/api/users/me");
          const data = res.ok
            ? ((await res.json()) as { user?: { lat?: number | null; lng?: number | null } })
            : null;
          if (data?.user?.lat && data?.user?.lng) {
            setFromCoords(Number(data.user.lat), Number(data.user.lng));
          }
        },
        { enableHighAccuracy: false, timeout: 4000 }
      );
    }
  }, [event]);

  const startDateTime = event?.startTime ? new Date(event.startTime) : null;
  const endDateTime = event?.endTime ? new Date(event.endTime) : null;

  const mapEvents = useMemo(() => {
    if (!event) {
      return [];
    }
    return [
      {
        id: event.id,
        title: event.title,
        location: event.venueName,
        lat: event.lat,
        lng: event.lng
      }
    ];
  }, [event]);

  const handleCommit = async () => {
    setCommitStatus(null);
    const res = await fetch(`/api/events/${id}/commit`, { method: "POST" });
    if (res.ok) {
      const data = (await res.json()) as { status?: string; error?: string };
      setCommitStatus(data.status ?? "committed");
      if (data.status === "committed" && event?.eventDate) {
        const pending = {
          id: event.id,
          title: event.title,
          date: event.eventDate,
          category: event.category,
          status: "committed",
          imageUrl: event.coverImageUrl
        };
        localStorage.setItem("calendarPendingEvent", JSON.stringify(pending));
      }
    } else {
      setCommitStatus("failed");
    }
  };

  return (
    <PageShell title="Event detail" subtitle="Event details.">
      {loading ? (
        <div className="rounded-2xl border border-neutral-200 bg-white/80 p-6 text-sm text-neutral-600">
          Loading event...
        </div>
      ) : error || !event ? (
        <div className="rounded-2xl border border-neutral-200 bg-white/80 p-6 text-sm text-red-600">
          {error ?? "Event not found."}
        </div>
      ) : (
        <div className="space-y-6">
          <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white/90">
            <img
              src={event.coverImageUrl}
              alt={event.title}
              className="h-64 w-full object-cover"
            />
          </div>
          <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
            <div className="space-y-6">
              <div className="rounded-2xl border border-neutral-200 bg-white/90 p-6">
                <div className="text-xs uppercase tracking-[0.2em] text-ocean">
                  {event.category}
                </div>
                <h1 className="mt-2 text-2xl font-semibold">{event.title}</h1>
                <p className="mt-2 text-sm text-neutral-700">
                  {event.date} · {event.time}
                </p>
                <p className="text-sm text-neutral-600">
                  {event.address}
                </p>
                <div className="mt-3 grid gap-2 text-sm text-neutral-600 sm:grid-cols-2">
                  <div>
                    <span className="font-semibold text-ink">Start</span>
                    <div>
                      {startDateTime
                        ? startDateTime.toLocaleString()
                        : `${event.date} ${event.time}`}
                    </div>
                  </div>
                  <div>
                    <span className="font-semibold text-ink">End</span>
                    <div>
                      {endDateTime
                        ? endDateTime.toLocaleString()
                        : "TBD"}
                    </div>
                  </div>
                </div>
                {distanceKm !== null ? (
                  <p className="mt-2 text-sm text-neutral-600">
                    {distanceKm} km away from your location
                  </p>
                ) : null}
                <p className="mt-4 text-sm text-neutral-700">
                  {event.description}
                </p>
              </div>
              {event.images.length > 0 ? (
                <div className="rounded-2xl border border-neutral-200 bg-white/90 p-6">
                  <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-neutral-500">
                    Gallery
                  </h2>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {event.images.map((image) => (
                      <div
                        key={image.id}
                        className="overflow-hidden rounded-xl border border-neutral-200"
                      >
                        <img
                          src={image.imageUrl}
                          alt={event.title}
                          className="h-40 w-full object-cover"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              {Number.isFinite(event.lat) && Number.isFinite(event.lng) ? (
                <div className="rounded-2xl border border-neutral-200 bg-white/90 p-6">
                  <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-neutral-500">
                    Location map
                  </h2>
                  <div className="mt-4">
                    <EventMap events={mapEvents} zoom={13} heightClassName="h-64" />
                  </div>
                </div>
              ) : null}
              <div className="rounded-2xl border border-neutral-200 bg-white/90 p-6">
                <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-neutral-500">
                  Host
                </h2>
                <div className="mt-4 flex items-center gap-4">
                  <div className="h-12 w-12 overflow-hidden rounded-full bg-neutral-200">
                    {event.host.photo ? (
                      <img
                        src={event.host.photo}
                        alt={event.host.name}
                        className="h-full w-full object-cover"
                      />
                    ) : null}
                  </div>
                  <div>
                    <p className="font-semibold">{event.host.name}</p>
                    <p className="text-sm text-neutral-600">
                      {event.attendeeCount} going
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <div className="space-y-4">
              <div className="rounded-2xl border border-neutral-200 bg-white/95 p-6 shadow-sm">
                <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-neutral-500">
                  Tickets
                </h3>
                <p className="mt-3 text-2xl font-semibold text-ink">
                  {event.isFree ? "Free" : `${event.ticketPrice ?? ""}`}
                </p>
                <p className="text-sm text-neutral-500">
                  Secure your spot before it fills up.
                </p>
                <div className="mt-4 flex items-center gap-3">
                  {event.isFree ? (
                    <button
                      type="button"
                      onClick={handleCommit}
                      className="rounded-full bg-ink px-5 py-2 text-sm font-semibold text-parchment"
                    >
                      Attend event
                    </button>
                  ) : (
                    <a
                      href={`/events/${event.id}/ticket`}
                      className="rounded-full bg-ink px-5 py-2 text-sm font-semibold text-parchment"
                    >
                      Get ticket
                    </a>
                  )}
                  {commitStatus ? (
                    <span className="text-sm text-neutral-600">
                      {commitStatus}
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="rounded-2xl border border-neutral-200 bg-white/90 p-6">
                <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-neutral-500">
                  Details
                </h3>
                <ul className="mt-3 space-y-2 text-sm text-neutral-600">
                  <li>Doors: {event.time}</li>
                  <li>Venue: {event.venueName}</li>
                  <li>Address: {event.address}</li>
                </ul>
              </div>
              <div className="rounded-2xl border border-neutral-200 bg-white/90 p-6">
                <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-neutral-500">
                  Similar events
                </h3>
                {similarEvents.length === 0 ? (
                  <p className="mt-3 text-sm text-neutral-600">
                    No similar events right now.
                  </p>
                ) : (
                  <div className="mt-4 space-y-3">
                    {similarEvents.map((item) => (
                      <div
                        key={item.id}
                        className="rounded-xl border border-neutral-200 bg-white/95 p-3"
                      >
                        <div className="text-xs uppercase tracking-[0.2em] text-ocean">
                          {item.category}
                        </div>
                        <p className="mt-1 text-sm font-semibold text-ink">
                          {item.title}
                        </p>
                        <p className="text-xs text-neutral-500">
                          {item.date} · {item.location}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}
