"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import SectionCard from "@/components/ui/SectionCard";

type LoginForm = {
  contact: string;
  password: string;
};

export default function LoginClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams?.get("next") || "/explore";
  const { register, handleSubmit } = useForm<LoginForm>();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (values: LoginForm) => {
    setLoading(true);
    setError(null);
    const result = await signIn("credentials", {
      redirect: false,
      contact: values.contact,
      password: values.password
    });

    setLoading(false);

    if (result?.error) {
      setError("Invalid credentials.");
      return;
    }

    router.push(nextPath);
  };

  return (
    <SectionCard title="Log in">
      <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
        <input
          className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
          placeholder="Email or phone"
          {...register("contact", { required: true })}
        />
        <input
          className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
          placeholder="Password"
          type="password"
          {...register("password", { required: true })}
        />
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <button
          type="submit"
          disabled={loading}
          className="rounded-full bg-ink px-5 py-2 text-sm font-semibold text-parchment"
        >
          {loading ? "Signing in..." : "Log in"}
        </button>
      </form>
    </SectionCard>
  );
}
