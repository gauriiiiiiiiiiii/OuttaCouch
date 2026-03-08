"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useRouter, useSearchParams } from "next/navigation";
import SectionCard from "@/components/ui/SectionCard";

const otpLength = 6;
const resendCooldownSeconds = 30;

type VerifyForm = {
  code: string;
};

export default function ResetVerifyClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const contact = searchParams?.get("contact") || "";
  const { register, handleSubmit } = useForm<VerifyForm>();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [otpStatus, setOtpStatus] = useState<string | null>(null);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) {
      return;
    }
    const timer = setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const onSubmit = async (values: VerifyForm) => {
    setLoading(true);
    setError(null);
    setOtpStatus(null);
    const res = await fetch("/api/auth/verify-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contact, otp: values.code, purpose: "reset" })
    });

    setLoading(false);

    if (!res.ok) {
      setError("Invalid code.");
      return;
    }

    const data = (await res.json()) as { token?: string };
    router.push(
      `/reset/password?contact=${encodeURIComponent(contact)}&token=${encodeURIComponent(
        data.token || ""
      )}`
    );
  };

  const handleResend = async () => {
    if (!contact) {
      setOtpStatus("Missing contact.");
      return;
    }
    if (cooldown > 0) {
      setOtpStatus(`Please wait ${cooldown}s to resend.`);
      return;
    }
    setSendingOtp(true);
    setOtpStatus(null);
    const res = await fetch("/api/auth/send-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contact, type: "email", purpose: "reset" })
    });
    setSendingOtp(false);
    if (!res.ok) {
      setOtpStatus("Could not resend OTP.");
      return;
    }
    setOtpStatus("OTP resent.");
    setCooldown(resendCooldownSeconds);
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
        {otpStatus ? <p className="text-sm text-neutral-600">{otpStatus}</p> : null}
        <button
          type="submit"
          disabled={loading}
          className="rounded-full bg-ink px-5 py-2 text-sm font-semibold text-parchment"
        >
          {loading ? "Verifying..." : "Verify"}
        </button>
        <button
          type="button"
          onClick={handleResend}
          disabled={sendingOtp || cooldown > 0}
          className="rounded-full border border-neutral-300 px-5 py-2 text-sm font-semibold"
        >
          {sendingOtp
            ? "Sending..."
            : cooldown > 0
              ? `Resend in ${cooldown}s`
              : "Resend OTP"}
        </button>
      </form>
    </SectionCard>
  );
}
