"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import PageShell from "@/components/ui/PageShell";
import ProfileHeader from "@/components/profile/ProfileHeader";
import CalendarGrid from "@/components/profile/CalendarGrid";

type ProfileResponse = {
  user: {
    displayName?: string | null;
    email?: string | null;
    phone?: string | null;
    bio?: string | null;
    city?: string | null;
    profilePhotoUrl?: string | null;
  };
  stats: {
    eventsHosted: number;
    eventsAttended: number;
    connections: number;
  };
  attendedEvents: {
    id: string;
    title: string;
    date: string;
    category: string;
    status: string;
  }[];
};

export default function ProfilePage() {
  const router = useRouter();
  const [data, setData] = useState<ProfileResponse | null>(null);
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
        const json = (await res.json()) as ProfileResponse;
        if (active) {
          setData(json);
        }
      } catch (err) {
        if (active) {
          setError("Could not load profile.");
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
    <PageShell title="Your profile" subtitle="Calendar-first identity.">
      {loading ? (
        <div className="rounded-2xl border border-neutral-200 bg-white/80 p-6 text-sm text-neutral-600">
          Loading profile...
        </div>
      ) : error || !data ? (
        <div className="rounded-2xl border border-neutral-200 bg-white/80 p-6 text-sm text-red-600">
          {error ?? "Profile not found."}
        </div>
      ) : (
        <div className="space-y-6">
          <ProfileHeader
            name={
              data.user.displayName ??
              data.user.email ??
              data.user.phone ??
              "User"
            }
            bio={data.user.bio}
            city={data.user.city}
            photo={data.user.profilePhotoUrl}
            stats={data.stats}
            onSettingsClick={() => router.push("/settings")}
          />
          <div className="grid gap-3 md:grid-cols-3">
            <button
              className="rounded-2xl border border-neutral-200 bg-white/90 px-4 py-3 text-left text-sm font-semibold shadow-sm"
              onClick={() => router.push("/profile/edit")}
            >
              Edit profile
              <p className="mt-1 text-xs text-neutral-500">
                Update your photo, bio, and interests.
              </p>
            </button>
            <button
              className="rounded-2xl border border-neutral-200 bg-white/90 px-4 py-3 text-left text-sm font-semibold shadow-sm"
              onClick={() => router.push("/profile/memories")}
            >
              Memories
              <p className="mt-1 text-xs text-neutral-500">
                Relive your best moments.
              </p>
            </button>
            <button
              className="rounded-2xl border border-neutral-200 bg-white/90 px-4 py-3 text-left text-sm font-semibold shadow-sm"
              onClick={() => router.push("/profile/calendar")}
            >
              Calendar
              <p className="mt-1 text-xs text-neutral-500">
                See your event cadence.
              </p>
            </button>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-[0.2em] text-ocean">
              Calendar
            </h3>
            <CalendarGrid events={data.attendedEvents} />
          </div>
        </div>
      )}
    </PageShell>
  );
}
