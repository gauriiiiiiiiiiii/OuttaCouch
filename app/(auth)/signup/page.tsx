"use client";

import { Suspense, useState } from "react";
import { useForm } from "react-hook-form";
import { useRouter, useSearchParams } from "next/navigation";
import PageShell from "@/components/ui/PageShell";
import SectionCard from "@/components/ui/SectionCard";
import Link from "next/link";

type SignupForm = {
  contact: string;
  method: "email" | "phone";
};

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const ref = searchParams?.get("ref") ?? "";
  const { register, handleSubmit, watch } = useForm<SignupForm>({
    defaultValues: { method: "email" }
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const method = watch("method") ?? "email";

  const onSubmit = async (values: SignupForm) => {
    setLoading(true);
    setError(null);
    const type = values.method;
    const res = await fetch("/api/auth/send-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contact: values.contact, type, purpose: "signup" })
    });

    setLoading(false);

    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(data?.error || "Failed to send OTP.");
      return;
    }

    const contactEncoded = encodeURIComponent(values.contact);
    const refPart = ref ? `&ref=${encodeURIComponent(ref)}` : "";
    router.push(`/signup/verify?contact=${contactEncoded}&type=${type}${refPart}`);
  };

  return (
    <SectionCard title="Send OTP" description="">
      <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
        <div className="flex flex-wrap items-center gap-3 text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
          <label className="flex items-center gap-2">
            <input type="radio" value="email" {...register("method")} />
            Email
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" value="phone" {...register("method")} />
            Phone
          </label>
        </div>
        <input
          className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
          placeholder={method === "email" ? "Email address" : "Phone number"}
          type={method === "email" ? "email" : "tel"}
          inputMode={method === "email" ? "email" : "tel"}
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
        <div className="text-sm text-neutral-600">
          Already have an account?{" "}
          <Link href="/login" className="underline">
            Log in
          </Link>
        </div>
      </form>
    </SectionCard>
  );
}

export default function SignupPage() {
  return (
    <PageShell title="Sign up" subtitle="Start with email or phone to receive an OTP.">
      <Suspense>
        <SignupForm />
      </Suspense>
    </PageShell>
  );
}
