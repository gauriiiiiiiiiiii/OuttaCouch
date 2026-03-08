"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { useRouter, useSearchParams } from "next/navigation";
import SectionCard from "@/components/ui/SectionCard";

type PasswordForm = {
  password: string;
  confirm: string;
};

export default function ResetPasswordClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const contact = searchParams?.get("contact") || "";
  const token = searchParams?.get("token") || "";
  const { register, handleSubmit } = useForm<PasswordForm>();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const onSubmit = async (values: PasswordForm) => {
    if (values.password !== values.confirm) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    setError(null);
    setStatus(null);
    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contact, password: values.password, token })
    });

    setLoading(false);

    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(data?.error || "Could not reset password.");
      return;
    }

    setStatus("Password updated. Redirecting to login...");
    setTimeout(() => {
      window.location.href = "/login";
    }, 600);
  };

  return (
    <SectionCard title="New password" description="Set your new password.">
      <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
        <input
          className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
          placeholder="Password"
          type="password"
          {...register("password", { required: true })}
        />
        <input
          className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
          placeholder="Confirm password"
          type="password"
          {...register("confirm", { required: true })}
        />
        {status ? <p className="text-sm text-neutral-600">{status}</p> : null}
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <button
          type="submit"
          disabled={loading}
          className="rounded-full bg-ink px-5 py-2 text-sm font-semibold text-parchment"
        >
          {loading ? "Saving..." : "Update password"}
        </button>
      </form>
    </SectionCard>
  );
}
