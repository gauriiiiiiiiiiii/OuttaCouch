"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import PageShell from "@/components/ui/PageShell";
import CalendarGrid from "@/components/profile/CalendarGrid";
import { navigateToProfile } from "@/lib/navigateToProfile";

type HostedEvent = {
  id: string;
  title: string;
  date: string;
  venueName: string;
  coverImageUrl: string;
  isFree: boolean;
  ticketPrice: string | null;
};

type PublicProfile = {
  user: {
    id: string;
    displayName: string | null;
    bio: string | null;
    profilePhotoUrl: string | null;
    city: string | null;
    preferences: string[];
    profileVisibility: "private" | "connections" | "public";
    isVerifiedHost: boolean;
  };
  isSelf?: boolean;
  connectionStatus: "accepted" | "pending" | "none";
  connectionId: string | null;
  stats: {
    eventsHosted: number;
    connections: number;
  };
  hostedEvents: HostedEvent[];
  timelineEvents?: {
    id: string;
    title: string;
    date: string;
    category: string;
    venueName?: string | null;
    location?: string | null;
    status: string;
    imageUrl?: string | null;
  }[];
  publicCalendar?: {
    id: string;
    title: string;
    date: string;
    category: string;
    status: string;
    location?: string | null;
  }[];
};

export default function PublicProfilePage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<
    "accepted" | "pending" | "none"
  >("none");
  const [connectionId, setConnectionId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const res = await fetch(`/api/users/${id}`);
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(data.error ?? "Profile not available");
        }
        const data = (await res.json()) as PublicProfile;
        if (active) {
          setProfile(data);
          setConnectionStatus(data.connectionStatus ?? "none");
          setConnectionId(data.connectionId ?? null);
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "Profile not available");
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

  const timelineEvents = useMemo(() => {
    return profile?.timelineEvents ?? [];
  }, [profile?.timelineEvents]);

  const handleConnect = async () => {
    if (!profile || connecting || connectionStatus !== "none") {
      return;
    }
    setConnecting(true);
    try {
      const res = await fetch(`/api/connections/request/${profile.user.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      });
      const data = (await res.json()) as { status?: string; id?: string };
      if (res.ok && data.status) {
        setConnectionStatus(data.status as "pending" | "accepted");
        setConnectionId(data.id ?? null);
      }
    } finally {
      setConnecting(false);
    }
  };

  const handleMessage = () => {
    if (connectionId) {
      router.push(`/chat/${connectionId}`);
    }
  };

  return (
    <PageShell title="User profile" subtitle="See shared event identity.">
      {loading ? (
        <div className="rounded-2xl border border-neutral-200 bg-white/80 p-6 text-sm text-neutral-600">
          Loading profile...
        </div>
      ) : error || !profile ? (
        <div className="rounded-2xl border border-neutral-200 bg-white/80 p-6 text-sm text-red-600">
          {error ?? "Profile not available."}
        </div>
      ) : (
        <div className="space-y-6">
          <div className="rounded-2xl border border-neutral-200 bg-white/90 p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={() => navigateToProfile(router, profile.user.id)}
                className="relative h-20 w-20 overflow-hidden rounded-full bg-neutral-200"
                aria-label={`View ${profile.user.displayName ?? "User"}`}
              >
                {profile.user.profilePhotoUrl ? (
                  <Image
                    src={profile.user.profilePhotoUrl}
                    alt={profile.user.displayName ?? "User"}
                    fill
                    sizes="80px"
                    className="object-cover"
                  />
                ) : null}
              </button>
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-semibold">
                    {profile.user.displayName ?? "User"}
                  </h1>
                  {profile.user.isVerifiedHost ? (
                    <span className="rounded-full bg-ink px-2 py-1 text-xs font-semibold text-parchment">
                      Verified host
                    </span>
                  ) : null}
                </div>
                <p className="text-sm text-neutral-500">
                  {profile.user.city ?? ""}
                </p>
                {profile.user.bio ? (
                  <p className="mt-3 text-sm text-neutral-700">
                    {profile.user.bio}
                  </p>
                ) : null}
              </div>
              {!profile.isSelf ? (
                <div className="flex items-center gap-2">
                  {connectionStatus === "accepted" ? (
                    <button
                      type="button"
                      onClick={handleMessage}
                      className="rounded-full bg-ink px-4 py-2 text-xs font-semibold text-parchment"
                    >
                      Message
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleConnect}
                      disabled={connecting || connectionStatus === "pending"}
                      className="rounded-full border border-neutral-300 px-4 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {connectionStatus === "pending" ? "Requested" : "Connect"}
                    </button>
                  )}
                </div>
              ) : null}
            </div>
            <div className="mt-6 flex flex-wrap gap-2">
              {profile.user.preferences.length > 0 ? (
                profile.user.preferences.map((preference) => (
                  <span
                    key={preference}
                    className="rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs text-neutral-600"
                  >
                    {preference}
                  </span>
                ))
              ) : (
                <span className="text-xs text-neutral-500">No interests shared.</span>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-neutral-200 bg-white/90 p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-neutral-500">
                Activity timeline
              </h2>
              <span className="text-xs text-neutral-400">
                {timelineEvents.length} events
              </span>
            </div>
            {timelineEvents.length === 0 ? (
              <p className="mt-4 text-sm text-neutral-600">No recent activity.</p>
            ) : (
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {timelineEvents.map((event) => (
                  <button
                    key={event.id}
                    type="button"
                    onClick={() => router.push(`/events/${event.id}`)}
                    className="flex items-center gap-3 rounded-2xl border border-neutral-200 bg-white/95 p-4 text-left transition hover:-translate-y-0.5 hover:border-neutral-300"
                  >
                    <div className="relative h-14 w-14 overflow-hidden rounded-xl bg-neutral-200">
                      {event.imageUrl ? (
                        <Image
                          src={event.imageUrl}
                          alt={event.title}
                          fill
                          sizes="56px"
                          className="object-cover"
                        />
                      ) : null}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-ink">{event.title}</p>
                      <p className="text-xs text-neutral-500">
                        {new Date(event.date).toLocaleDateString()} · {event.category}
                      </p>
                      {event.location ? (
                        <p className="text-xs text-neutral-500">{event.location}</p>
                      ) : null}
                    </div>
                    <span className="rounded-full border border-neutral-200 px-3 py-1 text-[11px] text-neutral-500">
                      {event.status}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-neutral-200 bg-white/90 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">
                Hosted events
              </p>
              <p className="mt-2 text-2xl font-semibold text-ink">
                {profile.stats.eventsHosted}
              </p>
            </div>
            <div className="rounded-2xl border border-neutral-200 bg-white/90 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">
                Connections
              </p>
              <p className="mt-2 text-2xl font-semibold text-ink">
                {profile.stats.connections}
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-neutral-200 bg-white/90 p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-neutral-500">
                Upcoming events
              </h2>
              <span className="text-xs text-neutral-400">
                {profile.hostedEvents.length} listed
              </span>
            </div>
            {profile.hostedEvents.length === 0 ? (
              <p className="mt-4 text-sm text-neutral-600">
                No upcoming events listed.
              </p>
            ) : (
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {profile.hostedEvents.map((event) => (
                  <a
                    key={event.id}
                    href={`/events/${event.id}`}
                    className="group overflow-hidden rounded-2xl border border-neutral-200 bg-white/95 transition hover:-translate-y-0.5 hover:border-neutral-300"
                  >
                    <div className="relative h-32 w-full bg-neutral-200">
                      <Image
                        src={event.coverImageUrl}
                        alt={event.title}
                        fill
                        sizes="(min-width:1024px) 33vw, (min-width:640px) 50vw, 100vw"
                        className="object-cover"
                      />
                    </div>
                    <div className="p-4">
                      <p className="text-sm font-semibold text-ink">
                        {event.title}
                      </p>
                      <p className="text-xs text-neutral-500">
                        {new Date(event.date).toLocaleDateString()} · {event.venueName}
                      </p>
                      <p className="mt-2 text-xs text-neutral-600">
                        {event.isFree ? "Free" : event.ticketPrice ?? ""}
                      </p>
                    </div>
                  </a>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-neutral-200 bg-white/90 p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-neutral-500">
                Public calendar
              </h2>
              <span className="text-xs text-neutral-400">
                {profile.publicCalendar?.length ?? 0} events
              </span>
            </div>
            <div className="mt-4">
              <CalendarGrid
                events={profile.publicCalendar ?? []}
                title="Public events"
                onEventSelect={(event) => router.push(`/events/${event.id}`)}
              />
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}
