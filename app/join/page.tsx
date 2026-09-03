"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";

type ReferrerInfo = {
  code: string;
  fromUser: {
    id: string;
    displayName: string;
    profilePhotoUrl?: string | null;
  };
  invitedPhone: string;
};

export default function JoinPage() {
  return (
    <Suspense fallback={<Loading />}>
      <JoinContent />
    </Suspense>
  );
}

function JoinContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [referrer, setReferrer] = useState<ReferrerInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const code = searchParams?.get("ref");
    if (!code) {
      router.replace("/signup");
      return;
    }

    const track = async () => {
      try {
        const res = await fetch(`/api/referrals/${code}`);
        if (!res.ok) throw new Error((await res.json()).error ?? "Invalid link");
        const data = (await res.json()) as ReferrerInfo;
        setReferrer(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Invalid referral link");
      } finally {
        setLoading(false);
      }
    };
    track();
  }, [searchParams, router]);

  const code = searchParams?.get("ref") ?? "";
  const signupHref = `/signup?ref=${code}`;

  if (loading) return <Loading />;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-bg px-6 py-16">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-ocean">
            OUTTACOUCH
          </p>
          <h1 className="mt-3 text-3xl font-semibold text-ink">
            {error ? "Link expired" : "You're invited"}
          </h1>
        </div>

        {error ? (
          <div className="rounded-2xl border border-neutral-200 bg-white/90 p-6 text-center">
            <p className="text-sm text-neutral-600">{error}</p>
            <Link
              href="/signup"
              className="mt-4 inline-flex rounded-full bg-ink px-5 py-2 text-sm font-semibold text-parchment"
            >
              Sign up anyway
            </Link>
          </div>
        ) : referrer ? (
          <>
            <div className="rounded-2xl border border-neutral-200 bg-white/90 p-6 text-center">
              {referrer.fromUser.profilePhotoUrl ? (
                <div className="relative mx-auto mb-4 h-16 w-16 overflow-hidden rounded-full">
                  <Image
                    src={referrer.fromUser.profilePhotoUrl}
                    alt={referrer.fromUser.displayName}
                    fill
                    sizes="64px"
                    className="object-cover"
                  />
                </div>
              ) : (
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-parchment text-xl font-semibold text-ink">
                  {referrer.fromUser.displayName.charAt(0).toUpperCase()}
                </div>
              )}
              <p className="text-sm text-neutral-600">
                <span className="font-semibold text-ink">
                  {referrer.fromUser.displayName}
                </span>{" "}
                invited you to join
              </p>
              <p className="mt-1 text-sm text-neutral-500">
                You&apos;ll connect automatically when you sign up.
              </p>
            </div>

            <div className="space-y-3">
              <Link
                href={signupHref}
                className="flex w-full items-center justify-center rounded-full bg-ink px-5 py-3 text-sm font-semibold text-parchment transition hover:opacity-90"
              >
                Create an account
              </Link>
              <div className="text-center text-xs text-neutral-500">
                Already have an account?{" "}
                <Link href="/login" className="font-semibold text-ink underline">
                  Log in
                </Link>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </main>
  );
}

function Loading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg">
      <p className="text-sm text-neutral-500">Loading...</p>
    </main>
  );
}
