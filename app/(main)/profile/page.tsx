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
};

type ConnectionList = {
  id: string;
  userId: string;
  name: string;
  photo?: string | null;
}[];

export default function ProfilePage() {
  const router = useRouter();
  const [data, setData] = useState<ProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connections, setConnections] = useState<ConnectionList>([]);
  const [openSection, setOpenSection] = useState<"attended" | "hosted" | "connections" | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const [profileRes, connectionsRes] = await Promise.all([
          fetch("/api/users/me"),
          fetch("/api/connections")
        ]);

        if (!profileRes.ok) {
          throw new Error("Failed");
        }
        const json = (await profileRes.json()) as ProfileResponse;

        const connectionsData = connectionsRes.ok
          ? ((await connectionsRes.json()) as { connections: ConnectionList })
          : { connections: [] as ConnectionList };

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
          setConnections(connectionsData.connections ?? []);
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
            onAttendedClick={() => setOpenSection((prev) => (prev === "attended" ? null : "attended"))}
            onHostedClick={() => setOpenSection((prev) => (prev === "hosted" ? null : "hosted"))}
            onConnectionsClick={() => setOpenSection((prev) => (prev === "connections" ? null : "connections"))}
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
          <div className="space-y-6">
            <CalendarGrid
              events={data.privateCalendar}
              onEventSelect={(event) => router.push(`/events/${event.id}`)}
            />

            {openSection ? (
              <div className="space-y-4">
                {(["attended", "hosted", "connections"] as const).map((section) => {
                  const isOpen = openSection === section;

                  if (!isOpen) return null;

                  if (section === "attended") {
                    const attended = data.privateCalendar.filter((event) => event.status !== "hosted");
                    return (
                      <div key={section} className="rounded-3xl border border-neutral-200 bg-white/90 p-5 shadow-sm">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-neutral-500">
                            Attended
                          </h3>
                        </div>
                        <div className="mt-4 space-y-3">
                          {attended.length === 0 ? (
                            <p className="text-sm text-neutral-600">No attended events yet.</p>
                          ) : (
                            attended.map((event) => (
                              <button
                                key={event.id}
                                type="button"
                                onClick={() => router.push(`/events/${event.id}`)}
                                className="flex w-full items-center justify-between rounded-2xl border border-neutral-200 bg-white/95 px-4 py-3 text-left transition hover:-translate-y-0.5 hover:shadow-sm"
                              >
                                <div>
                                  <p className="text-sm font-semibold text-ink">{event.title}</p>
                                  <p className="text-xs text-neutral-500">{new Date(event.date).toLocaleString()}</p>
                                </div>
                                <span className="text-xs font-semibold text-neutral-500">View</span>
                              </button>
                            ))
                          )}
                        </div>
                      </div>
                    );
                  }

                  if (section === "hosted") {
                    const hosted = data.privateCalendar.filter((event) => event.status === "hosted");
                    return (
                      <div key={section} className="rounded-3xl border border-neutral-200 bg-white/90 p-5 shadow-sm">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-neutral-500">
                            Hosted
                          </h3>
                        </div>
                        <div className="mt-4 space-y-3">
                          {hosted.length === 0 ? (
                            <p className="text-sm text-neutral-600">No hosted events yet.</p>
                          ) : (
                            hosted.map((event) => (
                              <div
                                key={event.id}
                                className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-neutral-200 bg-white/95 px-4 py-3"
                              >
                                <div>
                                  <p className="text-sm font-semibold text-ink">{event.title}</p>
                                  <p className="text-xs text-neutral-500">{new Date(event.date).toLocaleString()}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => router.push(`/events/manage/${event.id}/edit`)}
                                    className="rounded-full border border-neutral-300 px-3 py-1 text-xs font-semibold"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => router.push(`/events/${event.id}`)}
                                    className="rounded-full bg-ink px-3 py-1 text-xs font-semibold text-parchment"
                                  >
                                    View
                                  </button>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    );
                  }

                  const connList = connections;
                  return (
                    <div key={section} className="rounded-3xl border border-neutral-200 bg-white/90 p-5 shadow-sm">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-neutral-500">
                          Connections
                        </h3>
                      </div>
                      <div className="mt-4 space-y-3">
                        {connList.length === 0 ? (
                          <p className="text-sm text-neutral-600">No connections yet.</p>
                        ) : (
                          connList.map((connection) => (
                            <button
                              key={connection.id}
                              type="button"
                              onClick={() => router.push(`/users/${connection.userId}`)}
                              className="flex w-full items-center justify-between rounded-2xl border border-neutral-200 bg-white/95 px-4 py-3 text-left transition hover:-translate-y-0.5 hover:shadow-sm"
                            >
                              <div>
                                <p className="text-sm font-semibold text-ink">{connection.name}</p>
                                <p className="text-xs text-neutral-500">Connection</p>
                              </div>
                              <span className="text-xs font-semibold text-neutral-500">View</span>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </PageShell>
  );
}
