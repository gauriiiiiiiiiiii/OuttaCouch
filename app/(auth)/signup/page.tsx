"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import PageShell from "@/components/ui/PageShell";
import SectionCard from "@/components/ui/SectionCard";

type SignupForm = {
  contact: string;
};

export default function SignupPage() {
  const router = useRouter();
  const { register, handleSubmit } = useForm<SignupForm>();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (values: SignupForm) => {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/auth/send-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contact: values.contact, type: "email", purpose: "signup" })
    });

    setLoading(false);

    if (!res.ok) {
      setError("Failed to send OTP.");
      return;
    }

    const contactEncoded = encodeURIComponent(values.contact);
    router.push(`/signup/verify?contact=${contactEncoded}`);
  };

  return (
    <PageShell
      title="Sign up"
      subtitle="Start with email or phone to receive an OTP."
    >
      <SectionCard title="Send OTP" description="">
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
            {loading ? "Sending..." : "Send OTP"}
          </button>
        </form>
      </SectionCard>
    </PageShell>
  );
}
