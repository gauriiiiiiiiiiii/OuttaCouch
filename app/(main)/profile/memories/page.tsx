"use client";

import { useEffect, useState } from "react";
import PageShell from "@/components/ui/PageShell";
import MemoriesGrid from "@/components/profile/MemoriesGrid";
import { StorageService } from "@/lib/services/storage";

type MemoriesResponse = {
  attendedEvents: {
    id: string;
    title: string;
    date: string;
    category: string;
    status: string;
    imageUrl?: string | null;
  }[];
};

type MemoryRecord = {
  id: string;
  imageUrl: string;
  caption?: string | null;
  createdAt: string;
  event: {
    id: string;
    title: string;
    date: string;
    category: string;
  } | null;
};

export default function MemoriesPage() {
  const [data, setData] = useState<MemoriesResponse | null>(null);
  const [memories, setMemories] = useState<MemoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [eventId, setEventId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const [profileRes, memoriesRes] = await Promise.all([
          fetch("/api/users/me"),
          fetch("/api/memories")
        ]);
        if (!profileRes.ok) {
          throw new Error("Failed");
        }
        const json = (await profileRes.json()) as MemoriesResponse;
        const memoriesJson = memoriesRes.ok
          ? ((await memoriesRes.json()) as { memories: MemoryRecord[] })
          : { memories: [] };
        if (active) {
          setData(json);
          setMemories(memoriesJson.memories ?? []);
        }
      } catch (err) {
        if (active) {
          setError("Could not load memories.");
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

  const handleMemoryUpload = async (file?: File) => {
    if (!file) {
      return;
    }
    setUploading(true);
    setUploadStatus(null);

    const result = await StorageService.uploadImage({
      file,
      bucket: "memories",
      folder: "uploads"
    });

    if (!result.publicUrl) {
      setUploading(false);
      setUploadStatus(
        result.error || "Upload failed. Create the bucket 'memories' in Supabase Storage."
      );
      return;
    }

    const res = await fetch("/api/memories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imageUrl: result.publicUrl,
        caption: caption.trim() || undefined,
        eventId: eventId || undefined
      })
    });

    if (!res.ok) {
      setUploadStatus("Failed to save memory.");
    } else {
      const refreshed = await fetch("/api/memories");
      const refreshedData = refreshed.ok
        ? ((await refreshed.json()) as { memories: MemoryRecord[] })
        : { memories: [] };
      setMemories(refreshedData.memories ?? []);
      setCaption("");
      setEventId(null);
    }

    setUploading(false);
  };

  return (
    <PageShell title="Memories" subtitle="Photos from your events.">
      {loading ? (
        <div className="rounded-2xl border border-neutral-200 bg-white/80 p-6 text-sm text-neutral-600">
          Loading memories...
        </div>
      ) : error || !data ? (
        <div className="rounded-2xl border border-neutral-200 bg-white/80 p-6 text-sm text-red-600">
          {error ?? "Memories not found."}
        </div>
      ) : (
        <div className="space-y-6">
          <div className="rounded-2xl border border-neutral-200 bg-white/90 p-6">
            <h2 className="text-lg font-semibold">Upload memory</h2>
            <p className="text-sm text-neutral-500">
              Add photos from events you attended.
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <input
                className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
                placeholder="Add a caption"
                value={caption}
                onChange={(event) => setCaption(event.target.value)}
              />
              <select
                className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
                value={eventId ?? ""}
                onChange={(event) => setEventId(event.target.value || null)}
              >
                <option value="">Select event (optional)</option>
                {data.attendedEvents.map((event) => (
                  <option key={event.id} value={event.id}>
                    {event.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <label className="rounded-full border border-neutral-300 px-4 py-2 text-xs font-semibold">
                <span>{uploading ? "Uploading..." : "Choose photo"}</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => handleMemoryUpload(event.target.files?.[0])}
                  disabled={uploading}
                />
              </label>
              {uploadStatus ? (
                <span className="text-xs text-neutral-500">{uploadStatus}</span>
              ) : null}
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-[0.2em] text-ocean">
              Your uploads
            </h3>
            <MemoriesGrid
              items={memories.map((memory) => ({
                id: memory.id,
                title: memory.event?.title ?? "Memory",
                date: memory.createdAt,
                category: memory.event?.category ?? "Other",
                imageUrl: memory.imageUrl,
                caption: memory.caption,
                eventTitle: memory.event?.title ?? null
              }))}
            />
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-[0.2em] text-ocean">
              From your events
            </h3>
            <MemoriesGrid
              items={data.attendedEvents.map((event) => ({
                id: event.id,
                title: event.title,
                date: event.date,
                category: event.category,
                status: event.status,
                imageUrl: event.imageUrl ?? null
              }))}
            />
          </div>
        </div>
      )}
    </PageShell>
  );
}
