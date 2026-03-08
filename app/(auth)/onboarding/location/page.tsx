"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import PageShell from "@/components/ui/PageShell";
import SectionCard from "@/components/ui/SectionCard";

type LocationForm = {
  city: string;
  lat?: number;
  lng?: number;
};

type GeoResult = {
  lat: number;
  lng: number;
  city?: string;
};

export default function LocationOnboardingPage() {
  const router = useRouter();
  const { register, handleSubmit, setValue, watch } = useForm<LocationForm>();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [searching, setSearching] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const resolveCity = (address?: Record<string, string>) => {
    if (!address) {
      return "";
    }
    return (
      address.city ||
      address.town ||
      address.village ||
      address.county ||
      address.state ||
      ""
    );
  };

  const reverseGeocode = async (lat: number, lng: number) => {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`;
    const res = await fetch(url);
    if (!res.ok) {
      return "";
    }
    const data = (await res.json()) as { address?: Record<string, string> };
    return resolveCity(data.address);
  };

  const geocodeCity = async (city: string): Promise<GeoResult | null> => {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(city)}`;
    const res = await fetch(url);
    if (!res.ok) {
      return null;
    }
    const data = (await res.json()) as Array<{ lat: string; lon: string; display_name?: string }>;
    if (!data.length) {
      return null;
    }
    return {
      lat: Number(data[0].lat),
      lng: Number(data[0].lon),
      city
    };
  };

  const handleDetectLocation = async () => {
    if (!navigator.geolocation) {
      setError("Geolocation not supported.");
      return;
    }
    setLocating(true);
    setError(null);
    setStatus(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setValue("lat", Number(lat));
        setValue("lng", Number(lng));
        const city = await reverseGeocode(lat, lng);
        if (city) {
          setValue("city", city);
        }
        setStatus("Location detected.");
        setLocating(false);
      },
      () => {
        setError("Could not access your location.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const handleSearchCity = async () => {
    const city = watch("city")?.trim();
    if (!city) {
      setError("Enter a city to search.");
      return;
    }
    setSearching(true);
    setError(null);
    setStatus(null);
    const result = await geocodeCity(city);
    if (!result) {
      setError("City not found.");
      setSearching(false);
      return;
    }
    setValue("lat", result.lat);
    setValue("lng", result.lng);
    setStatus("Location set from city search.");
    setSearching(false);
  };

  const onSubmit = async (values: LocationForm) => {
    setLoading(true);
    setError(null);
    setStatus(null);

    let payload = { ...values };
    if (!payload.lat || !payload.lng) {
      if (!payload.city) {
        setError("Please use location or search a city.");
        setLoading(false);
        return;
      }
      const resolved = await geocodeCity(payload.city);
      if (!resolved) {
        setError("City not found.");
        setLoading(false);
        return;
      }
      payload = { ...payload, lat: resolved.lat, lng: resolved.lng };
    }

    const res = await fetch("/api/users/me/location", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
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
            placeholder="City (optional)"
            {...register("city")}
          />
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleDetectLocation}
              disabled={locating}
              className="rounded-full border border-neutral-300 px-4 py-2 text-sm font-semibold"
            >
              {locating ? "Detecting..." : "Use my location"}
            </button>
            <button
              type="button"
              onClick={handleSearchCity}
              disabled={searching}
              className="rounded-full border border-neutral-300 px-4 py-2 text-sm font-semibold"
            >
              {searching ? "Searching..." : "Search city"}
            </button>
          </div>
          <input type="hidden" {...register("lat", { valueAsNumber: true })} />
          <input type="hidden" {...register("lng", { valueAsNumber: true })} />
          {status ? <p className="text-sm text-neutral-600">{status}</p> : null}
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
