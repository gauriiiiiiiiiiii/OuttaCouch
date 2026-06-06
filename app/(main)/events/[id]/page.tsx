"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
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
  isCommitted: boolean;
  goingList?: { name: string; photo?: string | null }[];
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
          if (data.isCommitted) setCommitStatus("committed");
        }
      } catch {
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
      } catch {
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

  const [copyStatus, setCopyStatus] = useState<"idle" | "copied">("idle");

  const handleShare = async () => {
    if (!event) return;
    const url = `${window.location.origin}/events/${event.id}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: event.title, url });
      } else {
        await navigator.clipboard.writeText(url);
        setCopyStatus("copied");
        setTimeout(() => setCopyStatus("idle"), 2000);
      }
    } catch {
      // user cancelled share
    }
  };

  const handleCancelAttendance = async () => {
    if (!event) return;
    setCommitStatus("cancelling");
    try {
      const res = await fetch(`/api/events/${id}/commit`, { method: "DELETE" });
      if (res.ok) {
        setCommitStatus(null);
      } else {
        setCommitStatus("committed");
      }
    } catch {
      setCommitStatus("committed");
    }
  };

  const handleCommit = async () => {
    if (!event) return;

    // Paid events are handled offline — just surface a contact-host message
    if (!event.isFree) {
      setCommitStatus("contact-host");
      return;
    }

    // Prevent duplicate submissions
    if (commitStatus === "committed" || commitStatus === "Already added") {
      return;
    }

    setCommitStatus("submitting");
    try {
      const res = await fetch(`/api/events/${id}/commit`, { method: "POST" });
      const data = (await res.json()) as { status?: string; error?: string };

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
        setCommitStatus("committed");
      } else if (data.status === "already-committed") {
        setCommitStatus("Already added");
      } else {
        setCommitStatus(data.error === "Event full" ? "Event full" : "failed");
      }
    } catch {
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
            <div className="relative h-64 w-full">
              <Image
                src={event.coverImageUrl}
                alt={event.title}
                fill
                sizes="(min-width:1024px) 66vw, 100vw"
                className="object-cover"
              />
            </div>
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
                        <div className="relative h-40 w-full">
                          <Image
                            src={image.imageUrl}
                            alt={event.title}
                            fill
                            sizes="(min-width:1024px) 33vw, (min-width:640px) 50vw, 100vw"
                            className="object-cover"
                          />
                        </div>
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
                  <Link
                    href={`/users/${event.host.id}`}
                    className="relative h-12 w-12 overflow-hidden rounded-full bg-neutral-200"
                    aria-label={`View ${event.host.name}`}
                  >
                    {event.host.photo ? (
                      <Image
                        src={event.host.photo}
                        alt={event.host.name}
                        fill
                        sizes="48px"
                        className="object-cover"
                      />
                    ) : null}
                  </Link>
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
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleShare}
                  className="rounded-full border border-neutral-300 px-4 py-2 text-xs font-semibold"
                >
                  {copyStatus === "copied" ? "Link copied!" : "Share event"}
                </button>
              </div>
              <div id="tickets" className="rounded-2xl border border-neutral-200 bg-white/95 p-6 shadow-sm">
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
                  <button
                    type="button"
                    onClick={handleCommit}
                    disabled={
                      commitStatus === "committed" ||
                      commitStatus === "submitting" ||
                      commitStatus === "contact-host"
                    }
                    className="rounded-full bg-ink px-5 py-2 text-sm font-semibold text-parchment disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {commitStatus === "submitting"
                      ? "Confirming..."
                      : commitStatus === "committed"
                        ? "✓ Confirmed"
                        : commitStatus === "contact-host"
                          ? "Contact host to register"
                          : "Accept"}
                  </button>
                  {commitStatus && commitStatus !== "contact-host" && commitStatus !== "committed" ? (
                    <span className="text-sm text-neutral-500">{commitStatus}</span>
                  ) : null}
                </div>
                {commitStatus === "committed" && event.isFree ? (
                  <button
                    type="button"
                    onClick={handleCancelAttendance}
                    className="mt-2 text-xs text-neutral-500 underline hover:text-red-600"
                  >
                    Cancel attendance
                  </button>
                ) : null}
                {!event.isFree ? (
                  <p className="mt-2 text-xs text-neutral-500">
                    Paid event — arrange payment with the host directly.
                  </p>
                ) : null}
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
              {event.goingList && event.goingList.length > 0 ? (
                <div className="rounded-2xl border border-neutral-200 bg-white/90 p-6">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-neutral-500">
                    Going ({event.attendeeCount})
                  </h3>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {event.goingList.map((attendee, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white/95 px-2 py-1"
                        title={attendee.name}
                      >
                        <div className="relative h-5 w-5 overflow-hidden rounded-full bg-neutral-200 flex-shrink-0">
                          {attendee.photo ? (
                            <Image
                              src={attendee.photo}
                              alt={attendee.name}
                              fill
                              sizes="20px"
                              className="object-cover"
                            />
                          ) : null}
                        </div>
                        <span className="max-w-[80px] truncate text-[11px] font-medium">
                          {attendee.name}
                        </span>
                      </div>
                    ))}
                    {event.attendeeCount > 10 ? (
                      <span className="rounded-full border border-neutral-200 bg-white/95 px-2 py-1 text-[11px] text-neutral-500">
                        +{event.attendeeCount - 10} more
                      </span>
                    ) : null}
                  </div>
                </div>
              ) : null}
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
