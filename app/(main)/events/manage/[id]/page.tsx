"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import PageShell from "@/components/ui/PageShell";
import { StorageService } from "@/lib/services/storage";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid
} from "recharts";

type Attendee = {
  id: string;
  name: string;
  status: string;
  ticketId?: string | null;
};

type HostEvent = {
  id: string;
  title: string;
  date: string;
  attendeeCount: number;
  attendees: Attendee[];
  revenueTotal: number;
  analytics?: {
    attendeeSeries: { date: string; count: number }[];
    revenueSeries: { date: string; total: number }[];
  };
};

type EventImage = {
  id: string;
  imageUrl: string;
  isCover: boolean;
  orderIndex: number;
};

export default function HostDashboardPage() {
  const params = useParams();
  const id = params?.id as string;
  const [event, setEvent] = useState<HostEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [images, setImages] = useState<EventImage[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const res = await fetch(`/api/events/${id}`);
      const data = res.ok ? ((await res.json()) as HostEvent) : null;
      if (active) {
        setEvent(data);
        setLoading(false);
      }
    };
    if (id) {
      load();
    }
    return () => {
      active = false;
    };
  }, [id]);

  const loadImages = async () => {
    const res = await fetch(`/api/events/${id}/images`);
    const data = res.ok
      ? ((await res.json()) as { images: EventImage[] })
      : { images: [] };
    setImages(data.images ?? []);
  };

  useEffect(() => {
    if (id) {
      loadImages();
    }
  }, [id]);

  const handleGalleryUpload = async (files?: FileList | null) => {
    if (!files || files.length === 0) {
      return;
    }
    setUploading(true);
    setUploadStatus(null);

    for (const file of Array.from(files)) {
      const result = await StorageService.uploadImage({
        file,
        bucket: "event-images",
        folder: `events/${id}`
      });
      if (!result.publicUrl) {
        setUploadStatus(result.error || "Gallery upload failed.");
        continue;
      }
      await fetch(`/api/events/${id}/images`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: result.publicUrl })
      });
    }

    await loadImages();
    setUploading(false);
  };

  const handleSetCover = async (imageId: string) => {
    await fetch(`/api/events/${id}/images`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageId, isCover: true })
    });
    await loadImages();
  };

  const handleReorder = async (imageId: string, direction: "up" | "down") => {
    await fetch(`/api/events/${id}/images`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageId, direction })
    });
    await loadImages();
  };

  const handleDelete = async (imageId: string) => {
    await fetch(`/api/events/${id}/images`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageId })
    });
    await loadImages();
  };

  const handleCopyLink = async () => {
    if (!event) {
      return;
    }
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/events/${event.id}`);
      setActionStatus("Link copied.");
    } catch (err) {
      setActionStatus("Could not copy link.");
    }
  };

  const handleDownloadAttendees = () => {
    if (!event) {
      return;
    }
    const header = "Name,Status";
    const rows = event.attendees.map((attendee) =>
      `${attendee.name.replace(/,/g, " ")},${attendee.status}`
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${event.title.replace(/\s+/g, "-").toLowerCase()}-attendees.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setActionStatus("Attendee list downloaded.");
  };

  return (
    <PageShell title="Host dashboard" subtitle="Manage attendees and revenue.">
      {loading ? (
        <div className="rounded-2xl border border-neutral-200 bg-white/80 p-6 text-sm text-neutral-600">
          Loading dashboard...
        </div>
      ) : !event ? (
        <div className="rounded-2xl border border-neutral-200 bg-white/80 p-6 text-sm text-red-600">
          Event not found.
        </div>
      ) : (
        <div className="space-y-6">
          <section className="rounded-2xl border border-neutral-200 bg-white/90 p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">{event.title}</h2>
                <p className="text-sm text-neutral-600">{event.date}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/events/manage/${event.id}/scanner`}
                  className="rounded-full border border-neutral-300 px-4 py-2 text-xs font-semibold"
                >
                  Open scanner
                </Link>
                <Link
                  href={`/events/${event.id}`}
                  className="rounded-full bg-ink px-4 py-2 text-xs font-semibold text-parchment"
                >
                  View event
                </Link>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleCopyLink}
                className="rounded-full border border-neutral-300 px-4 py-2 text-xs font-semibold"
              >
                Copy event link
              </button>
              <button
                type="button"
                onClick={handleDownloadAttendees}
                className="rounded-full border border-neutral-300 px-4 py-2 text-xs font-semibold"
              >
                Download attendees
              </button>
              {actionStatus ? (
                <span className="text-xs text-neutral-500">{actionStatus}</span>
              ) : null}
            </div>
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-neutral-200 bg-white/95 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">Attendees</p>
                <p className="mt-2 text-2xl font-semibold text-ink">
                  {event.attendeeCount}
                </p>
              </div>
              <div className="rounded-2xl border border-neutral-200 bg-white/95 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">Revenue</p>
                <p className="mt-2 text-2xl font-semibold text-ink">
                  ₹{event.revenueTotal.toFixed(2)}
                </p>
              </div>
              <div className="rounded-2xl border border-neutral-200 bg-white/95 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">Tickets scanned</p>
                <p className="mt-2 text-2xl font-semibold text-ink">
                  {event.attendees.filter((attendee) => attendee.status === "attended").length}
                </p>
              </div>
            </div>
          </section>
          <section className="rounded-2xl border border-neutral-200 bg-white/90 p-6">
            <h3 className="text-base font-semibold">Attendees</h3>
            <div className="mt-4 space-y-2">
              {event.attendees.length === 0 ? (
                <p className="text-sm text-neutral-600">No attendees yet.</p>
              ) : (
                event.attendees.map((attendee) => (
                  <div
                    key={attendee.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-neutral-200 bg-white/95 px-4 py-3 text-sm"
                  >
                    <span className="font-semibold">{attendee.name}</span>
                    <span className="rounded-full border border-neutral-200 px-3 py-1 text-xs text-neutral-500">
                      {attendee.status}
                    </span>
                  </div>
                ))
              )}
            </div>
          </section>
          <section className="rounded-2xl border border-neutral-200 bg-white/90 p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold">Event gallery</h3>
                <p className="text-sm text-neutral-500">
                  Upload photos to showcase the event vibe.
                </p>
              </div>
              <label className="rounded-full border border-neutral-300 px-4 py-2 text-xs font-semibold">
                <span>{uploading ? "Uploading..." : "Upload photos"}</span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(event) => handleGalleryUpload(event.target.files)}
                  disabled={uploading}
                />
              </label>
            </div>
            {uploadStatus ? (
              <p className="mt-2 text-sm text-neutral-600">{uploadStatus}</p>
            ) : null}
            {images.length === 0 ? (
              <p className="mt-4 text-sm text-neutral-600">No gallery images yet.</p>
            ) : (
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {images.map((image) => (
                  <div
                    key={image.id}
                    className="overflow-hidden rounded-xl border border-neutral-200 bg-white/95"
                  >
                    <img
                      src={image.imageUrl}
                      alt={event.title}
                      className="h-40 w-full object-cover"
                    />
                    <div className="flex flex-wrap items-center gap-2 p-3 text-xs">
                      <button
                        className="rounded-full border border-neutral-300 px-3 py-1 font-semibold"
                        onClick={() => handleSetCover(image.id)}
                      >
                        Set cover
                      </button>
                      <button
                        className="rounded-full border border-neutral-300 px-3 py-1"
                        onClick={() => handleReorder(image.id, "up")}
                      >
                        Move up
                      </button>
                      <button
                        className="rounded-full border border-neutral-300 px-3 py-1"
                        onClick={() => handleReorder(image.id, "down")}
                      >
                        Move down
                      </button>
                      <button
                        className="rounded-full border border-red-300 px-3 py-1 text-red-600"
                        onClick={() => handleDelete(image.id)}
                      >
                        Delete
                      </button>
                      {image.isCover ? (
                        <span className="rounded-full border border-neutral-200 px-2 py-1 text-[11px] text-neutral-500">
                          Cover
                        </span>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
          <section className="rounded-2xl border border-neutral-200 bg-white/90 p-6">
            <h3 className="text-base font-semibold">Analytics</h3>
            <div className="mt-4 grid gap-6 md:grid-cols-2">
              <div className="h-56 rounded-2xl border border-neutral-200 bg-white/95 p-4">
                <div className="text-xs uppercase tracking-[0.2em] text-neutral-500">
                  Commits over time
                </div>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={event.analytics?.attendeeSeries ?? []}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Line type="monotone" dataKey="count" stroke="#2e6f95" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="h-56 rounded-2xl border border-neutral-200 bg-white/95 p-4">
                <div className="text-xs uppercase tracking-[0.2em] text-neutral-500">
                  Revenue over time
                </div>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={event.analytics?.revenueSeries ?? []}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Line type="monotone" dataKey="total" stroke="#ff6b35" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>
        </div>
      )}
    </PageShell>
  );
}
