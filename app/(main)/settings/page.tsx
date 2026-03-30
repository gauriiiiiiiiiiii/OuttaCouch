"use client";

import Link from "next/link";
import { useState } from "react";
import { signOut } from "next-auth/react";
import PageShell from "@/components/ui/PageShell";

const sections = [
  {
    title: "Account",
    links: [
      { href: "/profile/edit", label: "Edit profile" },
      { href: "/settings/privacy", label: "Privacy" }
    ]
  },
  {
    title: "Notifications",
    links: [{ href: "/settings/notifications", label: "Notification settings" }]
  },
  {
    title: "Payments",
    links: [{ href: "/settings/payments", label: "Payment methods" }]
  },
  {
    title: "Host tools",
    links: [{ href: "/settings/host", label: "Host dashboard" }]
  }
];

export default function SettingsPage() {
  const [deactivating, setDeactivating] = useState(false);

  const handleDeactivate = async () => {
    const confirmed = window.confirm(
      "Delete your account? This removes your email/phone so you can sign up again."
    );
    if (!confirmed) {
      return;
    }
    setDeactivating(true);
    const res = await fetch("/api/users/me", { method: "DELETE" });
    setDeactivating(false);
    if (res.ok) {
      await signOut({ callbackUrl: "/" });
    }
  };

  return (
    <PageShell
      title="Settings"
      subtitle="Manage account and privacy."
      backHref="/profile"
      backLabel="Back to profile"
    >
      <div className="space-y-8">
        <div className="rounded-3xl border border-neutral-200 bg-white/90 p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
            Account hub
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-ink">Your control center</h2>
          <p className="mt-2 text-sm text-neutral-600">
            Keep your privacy, payments, and hosting tools in sync.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {sections.map((section) => (
            <div
              key={section.title}
              className="rounded-3xl border border-neutral-200 bg-white/90 p-6 shadow-sm"
            >
              <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-ocean">
                {section.title}
              </h2>
              <div className="mt-4 space-y-2">
                {section.links.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="flex items-center justify-between rounded-2xl border border-neutral-200 bg-white/95 px-4 py-3 text-sm font-semibold transition-all hover:-translate-y-0.5 hover:border-neutral-300 hover:shadow-md"
                  >
                    <span>{link.label}</span>
                    <span className="text-xs text-neutral-400">→</span>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="rounded-3xl border border-neutral-200 bg-white/90 p-6 shadow-sm">
          <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-red-500">
            Delete account
          </h2>
          <p className="mt-2 text-sm text-neutral-600">
            This removes your email and phone so you can create a new account later.
          </p>
          <button
            type="button"
            onClick={handleDeactivate}
            disabled={deactivating}
            className="mt-4 rounded-full border border-red-300 px-5 py-2 text-sm font-semibold text-red-600 transition hover:border-red-400"
          >
            {deactivating ? "Deleting..." : "Delete account"}
          </button>
        </div>
        <button
          className="rounded-full border border-neutral-300 px-5 py-2 text-sm font-semibold transition hover:border-neutral-400"
          onClick={() => signOut({ callbackUrl: "/" })}
        >
          Log out
        </button>
      </div>
    </PageShell>
  );
}
