"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useForm } from "react-hook-form";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import PageShell from "@/components/ui/PageShell";
import SectionCard from "@/components/ui/SectionCard";
import { StorageService } from "@/lib/services/storage";

const MapPicker = dynamic(() => import("@/components/events/MapPicker"), {
  ssr: false
});

const categories = [
  "Music",
  "Sports",
  "Art",
  "Food",
  "Networking",
  "Outdoors",
  "Comedy",
  "Workshop",
  "Fitness",
  "Gaming",
  "Other"
];

type EditEventForm = {
  title: string;
  descriptionShort?: string;
  descriptionFull?: string;
  category: string;
  eventDate: string;
  startTime: string;
  endDate?: string;
  endTime?: string;
  venueName: string;
  address: string;
  lat: number;
  lng: number;
  isFree: boolean;
  ticketPrice?: number;
  maxAttendees: number;
  coverImageUrl?: string;
};

type EditEventResponse = {
  id: string;
  title: string;
  descriptionShort?: string | null;
  descriptionFull?: string | null;
  category: string;
  eventDate: string;
  startTime: string;
  endDate?: string | null;
  endTime?: string | null;
  venueName: string;
  address: string;
  lat: number;
  lng: number;
  isFree: boolean;
  ticketPrice?: number | null;
  maxAttendees: number;
  coverImageUrl?: string | null;
};

export default function EditEventPage() {
  const params = useParams();
  const id = params?.id as string;
  const router = useRouter();
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    trigger
  } = useForm<EditEventForm>({
    defaultValues: { isFree: true, lat: 28.6139, lng: 77.209 },
    shouldUnregister: false
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [step, setStep] = useState(0);
  const isFree = watch("isFree");
  const lat = watch("lat");
  const lng = watch("lng");
  const title = watch("title");
  const category = watch("category");
  const eventDate = watch("eventDate");
  const startTime = watch("startTime");
  const endDate = watch("endDate");
  const endTime = watch("endTime");
  const venueName = watch("venueName");
  const maxAttendees = watch("maxAttendees");

  const steps = useMemo(
    () => [
      {
        title: "Overview",
        description: "Name, category, and story.",
        fields: ["title", "category", "descriptionShort", "descriptionFull"] as const
      },
      {
        title: "Schedule",
        description: "Lock in date and timing.",
        fields: ["eventDate", "startTime", "endDate", "endTime"] as const
      },
      {
        title: "Venue",
        description: "Where people should arrive.",
        fields: ["venueName", "address", "lat", "lng"] as const
      },
      {
        title: "Tickets & media",
        description: "Pricing, capacity, and visuals.",
        fields: ["isFree", "ticketPrice", "maxAttendees", "coverImageUrl"] as const
      }
    ],
    []
  );

  const totalSteps = steps.length;
  const activeStep = steps[step];

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const res = await fetch(`/api/events/${id}/edit`);
        if (!res.ok) {
          throw new Error("Failed");
        }
        const data = (await res.json()) as EditEventResponse;
        if (!active) {
          return;
        }
        setValue("title", data.title);
        setValue("descriptionShort", data.descriptionShort ?? "");
        setValue("descriptionFull", data.descriptionFull ?? "");
        setValue("category", data.category);
        setValue("eventDate", data.eventDate);
        setValue("startTime", data.startTime);
        setValue("endDate", data.endDate ?? "");
        setValue("endTime", data.endTime ?? "");
        setValue("venueName", data.venueName);
        setValue("address", data.address);
        setValue("lat", data.lat);
        setValue("lng", data.lng);
        setValue("isFree", data.isFree);
        setValue("ticketPrice", data.ticketPrice ?? undefined);
        setValue("maxAttendees", data.maxAttendees);
        setValue("coverImageUrl", data.coverImageUrl ?? undefined);
        setImagePreview(data.coverImageUrl ?? null);
      } catch {
        if (active) {
          setError("Could not load event.");
        }
      } finally {
        if (active) {
          setFetching(false);
        }
      }
    };
    if (id) {
      load();
    }
    return () => {
      active = false;
    };
  }, [id, setValue]);

  const handleImageUpload = async (file?: File) => {
    if (!file) {
      return;
    }
    setUploading(true);
    setError(null);
    const result = await StorageService.uploadImage({
      file,
      bucket: "event-images",
      folder: "covers"
    });

    if (!result.publicUrl) {
      setUploading(false);
      setError(
        result.error ||
          "Image upload failed. Create the bucket 'event-images' in Supabase Storage."
      );
      return;
    }
    setImagePreview(result.publicUrl);
    setValue("coverImageUrl", result.publicUrl, { shouldValidate: true });
    setUploading(false);
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      setError("Geolocation not supported.");
      return;
    }
    navigator.geolocation.getCurrentPosition((position) => {
      const nextLat = Number(position.coords.latitude.toFixed(6));
      const nextLng = Number(position.coords.longitude.toFixed(6));
      setValue("lat", nextLat, { shouldValidate: true });
      setValue("lng", nextLng, { shouldValidate: true });
    });
  };

  const onSubmit = async (values: EditEventForm) => {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/events/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values)
    });

    setLoading(false);

    if (!res.ok) {
      setError("Could not update event.");
      return;
    }

    router.push(`/events/manage/${id}`);
  };

  if (fetching) {
    return (
      <PageShell title="Edit event" subtitle="Update details and publish.">
        <div className="rounded-2xl border border-neutral-200 bg-white/80 p-6 text-sm text-neutral-600">
          Loading event...
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell title="Edit event" subtitle="Update details and publish.">
      <form className="space-y-6" onSubmit={handleSubmit(onSubmit)}>
        <div className="rounded-2xl border border-neutral-200 bg-white/90 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">
                Step {step + 1} of {totalSteps}
              </p>
              <h2 className="text-lg font-semibold text-ink">{activeStep.title}</h2>
              <p className="text-sm text-neutral-500">{activeStep.description}</p>
            </div>
            <div className="flex items-center gap-2">
              {steps.map((item, index) => (
                <span
                  key={item.title}
                  className={`h-2 w-10 rounded-full ${
                    index <= step ? "bg-ink" : "bg-neutral-200"
                  }`}
                />
              ))}
            </div>
          </div>
        </div>

        {step === 0 ? (
          <SectionCard title="Overview" description="Name, category, and story.">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
                  Event name *
                </label>
                <input
                  className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
                  placeholder="Event name"
                  {...register("title", { required: true })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
                  Category *
                </label>
                <select
                  className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
                  {...register("category", { required: true })}
                >
                  <option value="">Select category</option>
                  {categories.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
                  Short description *
                </label>
                <textarea
                  className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
                  placeholder="Short description"
                  rows={4}
                  {...register("descriptionShort", { required: true })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
                  Full story (optional)
                </label>
                <textarea
                  className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
                  placeholder="Full description"
                  rows={4}
                  {...register("descriptionFull")}
                />
              </div>
            </div>
          </SectionCard>
        ) : null}

        {step === 1 ? (
          <SectionCard title="Schedule" description="Lock in date and timing.">
            <div className="grid gap-4 md:grid-cols-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
                  Start date
                </label>
                <input
                  className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
                  type="date"
                  {...register("eventDate", { required: true })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
                  Start time
                </label>
                <input
                  className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
                  type="time"
                  {...register("startTime", { required: true })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
                  End date
                </label>
                <input
                  className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
                  type="date"
                  {...register("endDate")}
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
                  End time
                </label>
                <input
                  className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
                  type="time"
                  {...register("endTime")}
                />
              </div>
            </div>
          </SectionCard>
        ) : null}

        {step === 2 ? (
          <SectionCard title="Venue" description="Where people should arrive.">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
                  Venue name
                </label>
                <input
                  className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
                  placeholder="Venue name"
                  {...register("venueName", { required: true })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
                  Address
                </label>
                <input
                  className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
                  placeholder="Address"
                  {...register("address", { required: true })}
                />
              </div>
            </div>
            <input type="hidden" {...register("lat", { valueAsNumber: true })} />
            <input type="hidden" {...register("lng", { valueAsNumber: true })} />
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                className="rounded-full border border-neutral-300 px-4 py-2 text-xs font-semibold"
                onClick={useMyLocation}
              >
                Use my location
              </button>
              <span className="text-xs text-neutral-500">
                Tap the map to set the venue.
              </span>
            </div>
            <div className="mt-4">
              <MapPicker
                lat={lat}
                lng={lng}
                onChange={(nextLat, nextLng) => {
                  setValue("lat", nextLat, { shouldValidate: true });
                  setValue("lng", nextLng, { shouldValidate: true });
                }}
              />
            </div>
          </SectionCard>
        ) : null}

        {step === 3 ? (
          <div className="space-y-6">
            <SectionCard title="Tickets" description="Pricing and capacity.">
              <div className="grid gap-4 md:grid-cols-3">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" {...register("isFree")} />
                  Free event
                </label>
                <input
                  className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
                  placeholder="Ticket price"
                  type="number"
                  step="0.01"
                  disabled={isFree}
                  {...register("ticketPrice", { valueAsNumber: true })}
                />
                <input
                  className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
                  placeholder="Max attendees"
                  type="number"
                  {...register("maxAttendees", { required: true, valueAsNumber: true })}
                />
              </div>
            </SectionCard>

            <SectionCard title="Media" description="Cover image and gallery.">
              <div className="space-y-3">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) => handleImageUpload(event.target.files?.[0])}
                />
                {uploading ? (
                  <p className="text-xs text-neutral-500">Uploading...</p>
                ) : null}
                {imagePreview ? (
                  <div className="relative h-48 w-full overflow-hidden rounded-xl border border-neutral-200">
                    <Image
                      src={imagePreview}
                      alt="Cover preview"
                      fill
                      sizes="(min-width:768px) 50vw, 100vw"
                      className="object-cover"
                    />
                  </div>
                ) : null}
              </div>
            </SectionCard>

            <SectionCard title="Review" description="Quick snapshot before saving.">
              <div className="grid gap-3 text-sm text-neutral-600 md:grid-cols-2">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-neutral-400">Title</p>
                  <p className="font-semibold text-ink">{title || "Untitled"}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-neutral-400">Category</p>
                  <p className="font-semibold text-ink">{category || "Not set"}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-neutral-400">Date</p>
                  <p className="font-semibold text-ink">
                    {eventDate ? `${eventDate} ${startTime || ""}`.trim() : "Not set"}
                    {endDate ? ` → ${endDate} ${endTime || ""}`.trim() : ""}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-neutral-400">Venue</p>
                  <p className="font-semibold text-ink">{venueName || "Not set"}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-neutral-400">Capacity</p>
                  <p className="font-semibold text-ink">
                    {maxAttendees ? `${maxAttendees} guests` : "Not set"}
                  </p>
                </div>
              </div>
            </SectionCard>
          </div>
        ) : null}

        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <div className="flex flex-wrap items-center gap-3">
          {step > 0 ? (
            <button
              type="button"
              className="rounded-full border border-neutral-300 px-5 py-2 text-sm font-semibold"
              onClick={() => setStep((prev) => Math.max(0, prev - 1))}
            >
              Back
            </button>
          ) : null}
          {step < totalSteps - 1 ? (
            <button
              type="button"
              className="rounded-full bg-ink px-5 py-2 text-sm font-semibold text-parchment"
              onClick={async () => {
                const valid = await trigger(activeStep.fields);
                if (valid) {
                  setStep((prev) => Math.min(totalSteps - 1, prev + 1));
                }
              }}
            >
              Next step
            </button>
          ) : (
            <button
              type="submit"
              disabled={loading}
              className="rounded-full bg-ink px-5 py-2 text-sm font-semibold text-parchment"
            >
              {loading ? "Saving..." : "Save changes"}
            </button>
          )}
          <p className="text-xs text-neutral-500">
            {step < totalSteps - 1
              ? "Review and continue."
              : "Your updates will go live instantly."}
          </p>
        </div>
      </form>
    </PageShell>
  );
}
