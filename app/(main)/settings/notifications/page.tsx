"use client";

import { useState } from "react";
import PageShell from "@/components/ui/PageShell";

export default function NotificationSettingsPage() {
  const [status, setStatus] = useState<string | null>(null);

  const enable = async () => {
    setStatus(null);
    const res = await fetch("/api/notifications/subscribe", { method: "POST" });
    setStatus(res.ok ? "Subscribed" : "Failed");
  };

  return (
    <PageShell
      title="Notifications"
      subtitle="Choose what reaches you."
      backHref="/settings"
      backLabel="Back to settings"
    >
      <div className="rounded-3xl border border-neutral-200 bg-white/90 p-6 shadow-sm">
        <div className="space-y-5">
          <p className="text-sm text-neutral-600">
            Enable notifications to receive event reminders and messages.
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            {[
              "Event reminders",
              "Host announcements",
              "Connection requests",
              "Chat messages"
            ].map((label) => (
              <label
                key={label}
                className="flex items-center justify-between rounded-2xl border border-neutral-200 bg-white/95 px-4 py-3 text-sm shadow-sm"
              >
                <span>{label}</span>
                <input type="checkbox" defaultChecked />
              </label>
            ))}
          </div>
          <button
            className="rounded-full bg-ink px-5 py-2 text-sm font-semibold text-parchment transition hover:opacity-90"
            onClick={enable}
          >
            Enable notifications
          </button>
          {status ? (
            <p className="text-sm text-neutral-600">{status}</p>
          ) : null}
        </div>
      </div>
    </PageShell>
  );
}
