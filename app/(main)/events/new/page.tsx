"use client";

import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
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

type CreateEventForm = {
  title: string;
  descriptionShort?: string;
  descriptionFull?: string;
  category: string;
  eventDate: string;
  startTime: string;
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

export default function CreateEventPage() {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    trigger
  } = useForm<CreateEventForm>({
    defaultValues: { isFree: true, lat: 28.6139, lng: 77.209 },
    shouldUnregister: false
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
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
        fields: ["eventDate", "startTime", "endTime"] as const
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

  const onSubmit = async (values: CreateEventForm) => {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values)
    });

    setLoading(false);

    if (!res.ok) {
      setError("Could not create event.");
      return;
    }

    const data = (await res.json()) as { id?: string };
    router.push(data.id ? `/events/${data.id}` : "/explore");
  };

  return (
    <PageShell title="Create event" subtitle="Plan the vibe and publish fast.">
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
                  Event name
                </label>
                <input
                  className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
                  placeholder="Event name"
                  {...register("title", { required: true })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
                  Category
                </label>
                <select
                  className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
                  {...register("category", { required: true })}
                >
                  <option value="">Select category</option>
                  {categories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
                  Short description
                </label>
                <textarea
                  className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
                  placeholder="Short description"
                  rows={4}
                  {...register("descriptionShort")}
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
                  Full story
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
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
                  Date
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
                  <img
                    src={imagePreview}
                    alt="Cover preview"
                    className="h-48 w-full rounded-xl border border-neutral-200 object-cover"
                  />
                ) : null}
              </div>
            </SectionCard>

            <SectionCard title="Review" description="Quick snapshot before publishing.">
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
                const valid = await trigger(activeStep.fields as any);
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
              {loading ? "Creating..." : "Publish event"}
            </button>
          )}
          <p className="text-xs text-neutral-500">
            {step < totalSteps - 1
              ? "Save your progress and continue."
              : "Your event will go live instantly."}
          </p>
        </div>
      </form>
    </PageShell>
  );
}
