"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import PageShell from "@/components/ui/PageShell";

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
  stats: {
    eventsHosted: number;
    connections: number;
  };
  hostedEvents: HostedEvent[];
};

export default function PublicProfilePage() {
  const params = useParams();
  const id = params?.id as string;
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
              <div className="h-20 w-20 overflow-hidden rounded-full bg-neutral-200">
                {profile.user.profilePhotoUrl ? (
                  <img
                    src={profile.user.profilePhotoUrl}
                    alt={profile.user.displayName ?? "User"}
                    className="h-full w-full object-cover"
                  />
                ) : null}
              </div>
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
                    <div className="h-32 w-full bg-neutral-200">
                      <img
                        src={event.coverImageUrl}
                        alt={event.title}
                        className="h-full w-full object-cover"
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
        </div>
      )}
    </PageShell>
  );
}
