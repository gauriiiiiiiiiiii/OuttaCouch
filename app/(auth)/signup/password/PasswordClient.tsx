"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import SectionCard from "@/components/ui/SectionCard";

type PasswordForm = {
  password: string;
  confirm: string;
};

export default function PasswordClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const contact = searchParams?.get("contact") || "";
  const token = searchParams?.get("token") || "";
  const { register, handleSubmit } = useForm<PasswordForm>();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (values: PasswordForm) => {
    if (values.password !== values.confirm) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    setError(null);
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contact, password: values.password, token })
    });

    setLoading(false);

    if (!res.ok) {
      setError("Could not set password.");
      return;
    }

    await signIn("credentials", {
      redirect: false,
      contact,
      password: values.password
    });

    router.push("/onboarding/location");
  };

  return (
    <SectionCard title="Create password" description="Set a secure password.">
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
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <button
          type="submit"
          disabled={loading}
          className="rounded-full bg-ink px-5 py-2 text-sm font-semibold text-parchment"
        >
          {loading ? "Saving..." : "Continue"}
        </button>
      </form>
    </SectionCard>
  );
}
