"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { useRouter, useSearchParams } from "next/navigation";
import SectionCard from "@/components/ui/SectionCard";

const otpLength = 6;

type VerifyForm = {
  code: string;
};

export default function VerifyClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const contact = searchParams?.get("contact") || "";
  const { register, handleSubmit } = useForm<VerifyForm>();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resendStatus, setResendStatus] = useState<string | null>(null);
  const [resending, setResending] = useState(false);

  const onSubmit = async (values: VerifyForm) => {
    setLoading(true);
    setError(null);
    setResendStatus(null);
    const res = await fetch("/api/auth/verify-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contact, otp: values.code, purpose: "signup" })
    });

    setLoading(false);

    if (!res.ok) {
      setError("Invalid code.");
      return;
    }

    const data = (await res.json()) as { token?: string };
    router.push(`/signup/password?contact=${encodeURIComponent(contact)}&token=${encodeURIComponent(data.token || "")}`);
  };

  const handleResend = async () => {
    if (!contact) {
      setResendStatus("Missing contact.");
      return;
    }
    setResending(true);
    setResendStatus(null);
    const res = await fetch("/api/auth/send-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contact, type: "email", purpose: "signup" })
    });
    setResending(false);
    if (!res.ok) {
      setResendStatus("Could not resend OTP.");
      return;
    }
    setResendStatus("OTP resent.");
  };

  return (
    <SectionCard title="Verify" description="Enter the OTP we sent.">
      <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
        <input
          className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
          placeholder={`Enter ${otpLength}-digit code`}
          maxLength={otpLength}
          {...register("code", { required: true })}
        />
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {resendStatus ? (
          <p className="text-sm text-neutral-600">{resendStatus}</p>
        ) : null}
        <button
          type="submit"
          disabled={loading}
          className="rounded-full bg-ink px-5 py-2 text-sm font-semibold text-parchment"
        >
          {loading ? "Verifying..." : "Verify"}
        </button>
        {error ? (
          <button
            type="button"
            onClick={handleResend}
            disabled={resending}
            className="rounded-full border border-neutral-300 px-5 py-2 text-sm font-semibold"
          >
            {resending ? "Resending..." : "Resend OTP"}
          </button>
        ) : null}
      </form>
    </SectionCard>
  );
}
