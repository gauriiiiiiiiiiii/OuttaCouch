"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import PageShell from "@/components/ui/PageShell";
import SectionCard from "@/components/ui/SectionCard";
import Link from "next/link";

type ResetForm = {
  contact: string;
};

export default function ResetPage() {
  const router = useRouter();
  const { register, handleSubmit } = useForm<ResetForm>();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (values: ResetForm) => {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/auth/send-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contact: values.contact, type: "email", purpose: "reset" })
    });

    setLoading(false);

    if (!res.ok) {
      setError("Failed to send reset OTP.");
      return;
    }

    router.push(`/reset/verify?contact=${encodeURIComponent(values.contact)}`);
  };

  return (
    <PageShell title="Reset password" subtitle="We will email you a reset code.">
      <SectionCard title="Request reset">
        <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
          <input
            className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
            placeholder="Email address"
            type="email"
            {...register("contact", { required: true })}
          />
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <button
            type="submit"
            disabled={loading}
            className="rounded-full bg-ink px-5 py-2 text-sm font-semibold text-parchment"
          >
            {loading ? "Sending..." : "Send reset OTP"}
          </button>
          <div className="text-sm text-neutral-600">
            Remembered your password?{" "}
            <Link href="/login" className="underline">
              Log in
            </Link>
          </div>
        </form>
      </SectionCard>
    </PageShell>
  );
}
