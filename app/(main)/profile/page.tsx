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
  privateCalendar: {
    id: string;
    title: string;
    date: string;
    category: string;
    status: string;
    imageUrl?: string | null;
  }[];
  publicCalendar: {
    id: string;
    title: string;
    date: string;
    category: string;
    status: string;
    imageUrl?: string | null;
  }[];
};

export default function ProfilePage() {
  const router = useRouter();
  const [data, setData] = useState<ProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [calendarView, setCalendarView] = useState<"private" | "public">("private");

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
              const exists = json.privateCalendar.some((event) => event.id === pending.id);
              if (!exists) {
                json.privateCalendar = [pending, ...json.privateCalendar];
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
        <div className="space-y-8">
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
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
              Quick actions
            </p>
            <div className="grid gap-3 md:grid-cols-3">
            <button
              className="group rounded-2xl border border-neutral-200 bg-white/90 px-4 py-4 text-left text-sm font-semibold shadow-sm transition-all hover:-translate-y-0.5 hover:border-neutral-300 hover:shadow-md"
              onClick={() => router.push("/profile/edit")}
            >
              Edit profile
              <p className="mt-1 text-xs text-neutral-500 group-hover:text-neutral-700">
                Update your photo, bio, and interests.
              </p>
            </button>
            <button
              className="group rounded-2xl border border-neutral-200 bg-white/90 px-4 py-4 text-left text-sm font-semibold shadow-sm transition-all hover:-translate-y-0.5 hover:border-neutral-300 hover:shadow-md"
              onClick={() => router.push("/profile/memories")}
            >
              Memories
              <p className="mt-1 text-xs text-neutral-500 group-hover:text-neutral-700">
                Relive your best moments.
              </p>
            </button>
            <button
              className="group rounded-2xl border border-neutral-200 bg-white/90 px-4 py-4 text-left text-sm font-semibold shadow-sm transition-all hover:-translate-y-0.5 hover:border-neutral-300 hover:shadow-md"
              onClick={() => router.push("/events/manage")}
            >
              Hosted events
              <p className="mt-1 text-xs text-neutral-500 group-hover:text-neutral-700">
                Edit, delete, or update your events.
              </p>
            </button>
            </div>
          </div>
          <div>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-ocean">
                  Calendar
                </h3>
                <span className="text-xs text-neutral-500">
                  {calendarView === "private"
                    ? "Only you can see this calendar."
                    : "Visible to your connections."}
                </span>
              </div>
              <div className="flex items-center gap-2 rounded-full border border-neutral-200 bg-white/80 p-1 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setCalendarView("private")}
                  className={`rounded-full px-3 py-1 transition ${
                    calendarView === "private"
                      ? "bg-ink text-parchment"
                      : "text-neutral-500"
                  }`}
                >
                  Private
                </button>
                <button
                  type="button"
                  onClick={() => setCalendarView("public")}
                  className={`rounded-full px-3 py-1 transition ${
                    calendarView === "public"
                      ? "bg-ink text-parchment"
                      : "text-neutral-500"
                  }`}
                >
                  Public
                </button>
              </div>
            </div>
            <CalendarGrid
              events={
                calendarView === "private"
                  ? data.privateCalendar
                  : data.publicCalendar
              }
            />
          </div>
        </div>
      )}
    </PageShell>
  );
}
