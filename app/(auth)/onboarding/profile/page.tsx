"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import PageShell from "@/components/ui/PageShell";
import SectionCard from "@/components/ui/SectionCard";

const preferenceOptions = [
  "Music",
  "Sports",
  "Art",
  "Food",
  "Networking",
  "Outdoors",
  "Comedy",
  "Workshop",
  "Fitness",
  "Gaming"
];

type ProfileForm = {
  displayName: string;
  bio?: string;
  preferences: string[];
};

export default function ProfileOnboardingPage() {
  const router = useRouter();
  const { register, handleSubmit } = useForm<ProfileForm>({
    defaultValues: { preferences: [] }
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (values: ProfileForm) => {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/users/me", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...values,
        profileComplete: true
      })
    });

    setLoading(false);

    if (!res.ok) {
      setError("Could not save profile.");
      return;
    }

    router.push("/explore");
  };

  return (
    <PageShell title="Complete your profile" subtitle="Unlock all features.">
      <SectionCard title="Profile" description="Photo, name, bio, interests.">
        <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
          <input
            className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
            placeholder="Display name"
            {...register("displayName", { required: true })}
          />
          <textarea
            className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
            placeholder="Short bio"
            rows={3}
            {...register("bio")}
          />
          <div className="grid gap-2 md:grid-cols-2">
            {preferenceOptions.map((option) => (
              <label key={option} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  value={option}
                  {...register("preferences")}
                />
                {option}
              </label>
            ))}
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <button
            type="submit"
            disabled={loading}
            className="rounded-full bg-ink px-5 py-2 text-sm font-semibold text-parchment"
          >
            {loading ? "Saving..." : "Finish profile"}
          </button>
        </form>
      </SectionCard>
    </PageShell>
  );
}
