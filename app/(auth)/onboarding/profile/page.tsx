"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import PageShell from "@/components/ui/PageShell";
import SectionCard from "@/components/ui/SectionCard";
import { StorageService } from "@/lib/services/storage";

export const dynamic = "force-dynamic";

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
  profilePhotoUrl?: string;
  preferences: string[];
};

export default function ProfileOnboardingPage() {
  const router = useRouter();
  const session = useSession();
  const update = session?.update || (() => Promise.resolve());
  const { register, handleSubmit, setValue } = useForm<ProfileForm>({
    defaultValues: { preferences: [], profilePhotoUrl: "" }
  });
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  const handlePhotoUpload = async (file?: File) => {
    if (!file) {
      return;
    }
    setUploading(true);
    setError(null);
    setStatus(null);
    const result = await StorageService.uploadImage({
      file,
      bucket: "profile-photos",
      folder: "users"
    });
    if (result.error || !result.publicUrl) {
      setError(result.error || "Image upload failed.");
      setUploading(false);
      return;
    }
    setPhotoPreview(result.publicUrl);
    setValue("profilePhotoUrl", result.publicUrl);
    setStatus("Photo uploaded.");
    setUploading(false);
  };

  const onSubmit = async (values: ProfileForm) => {
    setLoading(true);
    setError(null);
    setStatus(null);
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
    await update({ profileComplete: true });
    router.replace("/explore");
  };

  return (
    <PageShell title="Complete your profile" subtitle="Unlock all features.">
      <SectionCard title="Profile" description="Photo, name, bio, interests.">
        <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 overflow-hidden rounded-full border border-neutral-200 bg-neutral-100">
              {photoPreview ? (
                <img
                  src={photoPreview}
                  alt="Profile preview"
                  className="h-full w-full object-cover"
                />
              ) : null}
            </div>
            <label className="text-sm font-semibold">
              <span className="rounded-full border border-neutral-300 px-4 py-2">
                {uploading ? "Uploading..." : "Upload photo"}
              </span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => handlePhotoUpload(event.target.files?.[0])}
                disabled={uploading}
              />
            </label>
          </div>
          <input type="hidden" {...register("profilePhotoUrl")} />
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
          {status ? <p className="text-sm text-neutral-600">{status}</p> : null}
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
