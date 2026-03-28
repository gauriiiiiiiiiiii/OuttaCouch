"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import PageShell from "@/components/ui/PageShell";
import SectionCard from "@/components/ui/SectionCard";
import { StorageService } from "@/lib/services/storage";

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

export default function EditProfilePage() {
  const { register, handleSubmit, reset, setValue } = useForm<ProfileForm>({
    defaultValues: { preferences: [] }
  });
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const res = await fetch("/api/users/me");
        if (!res.ok) {
          throw new Error("Failed");
        }
        const json = (await res.json()) as {
          user: {
            displayName?: string | null;
            bio?: string | null;
            profilePhotoUrl?: string | null;
            preferences?: string[] | null;
          };
        };
        if (active) {
          reset({
            displayName: json.user.displayName ?? "",
            bio: json.user.bio ?? "",
            profilePhotoUrl: json.user.profilePhotoUrl ?? "",
            preferences: json.user.preferences ?? []
          });
          setPhotoPreview(json.user.profilePhotoUrl ?? null);
        }
      } catch {
        if (active) {
          setStatus("Could not load profile.");
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
  }, [reset]);

  const onSubmit = async (values: ProfileForm) => {
    setStatus(null);
    const res = await fetch("/api/users/me", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values)
    });

    setStatus(res.ok ? "Saved." : "Save failed.");
  };

  const handlePhotoUpload = async (file?: File) => {
    if (!file) {
      return;
    }
    setUploading(true);
    setStatus(null);
    const result = await StorageService.uploadImage({
      file,
      bucket: "profile-photos",
      folder: "users"
    });
    if (!result.publicUrl) {
      setUploading(false);
      setStatus(
        result.error ||
          "Upload failed. Create the bucket 'profile-photos' in Supabase Storage."
      );
      return;
    }
    setPhotoPreview(result.publicUrl);
    setValue("profilePhotoUrl", result.publicUrl || "", {
      shouldValidate: true,
      shouldDirty: true
    });
    setUploading(false);
  };

  return (
    <PageShell title="Edit profile" subtitle="Update your identity.">
      <div className="space-y-6">
        <SectionCard
          title="Profile"
          description="Edit your public presence and interests."
        >
          <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
            <input
              className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
              placeholder="Display name"
              {...register("displayName", { required: true })}
              disabled={loading}
            />
            <textarea
              className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
              placeholder="Short bio"
              rows={3}
              {...register("bio")}
              disabled={loading}
            />
            <div className="space-y-2">
              <input
                type="file"
                accept="image/*"
                onChange={(event) => handlePhotoUpload(event.target.files?.[0])}
                disabled={loading || uploading}
              />
              {uploading ? (
                <p className="text-xs text-neutral-500">Uploading...</p>
              ) : null}
              {photoPreview ? (
                <img
                  src={photoPreview}
                  alt="Profile preview"
                  className="h-24 w-24 rounded-full border border-neutral-200 object-cover"
                />
              ) : null}
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
                Interests
              </p>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {preferenceOptions.map((option) => (
                  <label key={option} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      value={option}
                      {...register("preferences")}
                      disabled={loading}
                    />
                    {option}
                  </label>
                ))}
              </div>
            </div>
            {status ? <p className="text-sm text-neutral-600">{status}</p> : null}
            <button
              className="inline-flex items-center justify-center rounded-full bg-ink px-5 py-2 text-sm font-semibold text-white"
              type="submit"
              disabled={loading}
            >
              Save changes
            </button>
          </form>
        </SectionCard>
      </div>
    </PageShell>
  );
}
