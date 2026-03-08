"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import PageShell from "@/components/ui/PageShell";
import SectionCard from "@/components/ui/SectionCard";

type LocationForm = {
  city: string;
  lat: number;
  lng: number;
};

export default function LocationOnboardingPage() {
  const router = useRouter();
  const { register, handleSubmit } = useForm<LocationForm>();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (values: LocationForm) => {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/users/me/location", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values)
    });

    setLoading(false);

    if (!res.ok) {
      setError("Could not save location.");
      return;
    }

    router.push("/onboarding/profile");
  };

  return (
    <PageShell title="Set your location" subtitle="Used for event discovery.">
      <SectionCard title="Location" description="Geolocation or manual search.">
        <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
          <input
            className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
            placeholder="City"
            {...register("city", { required: true })}
          />
          <div className="grid gap-3 md:grid-cols-2">
            <input
              className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
              placeholder="Latitude"
              type="number"
              step="0.000001"
              {...register("lat", { required: true, valueAsNumber: true })}
            />
            <input
              className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
              placeholder="Longitude"
              type="number"
              step="0.000001"
              {...register("lng", { required: true, valueAsNumber: true })}
            />
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <button
            type="submit"
            disabled={loading}
            className="rounded-full bg-ink px-5 py-2 text-sm font-semibold text-parchment"
          >
            {loading ? "Saving..." : "Save location"}
          </button>
        </form>
      </SectionCard>
    </PageShell>
  );
}
