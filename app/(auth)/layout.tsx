"use client";

import { useRouter } from "next/navigation";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  return (
    <div className="min-h-screen">
      <div className="border-b border-neutral-200 bg-white/80">
        <div className="mx-auto flex w-full max-w-5xl items-center gap-4 px-6 py-4 text-sm">
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-full border border-neutral-300 px-3 py-1 text-xs font-semibold"
          >
            Back
          </button>
          <div className="text-xs font-semibold uppercase tracking-[0.3em] text-ocean">
            OUTTACOUCH
          </div>
          <div className="ml-auto" />
        </div>
      </div>
      {children}
    </div>
  );
}
