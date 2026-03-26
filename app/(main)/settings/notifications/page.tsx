"use client";

import { useEffect, useState } from "react";
import PageShell from "@/components/ui/PageShell";

export default function NotificationSettingsPage() {
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [remindersEnabled, setRemindersEnabled] = useState(true);
  const [recommendationsEnabled, setRecommendationsEnabled] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const res = await fetch("/api/users/me");
        const data = res.ok
          ? ((await res.json()) as {
              user?: { remindersEnabled?: boolean; recommendationsEnabled?: boolean };
            })
          : null;
        if (active && data?.user) {
          setRemindersEnabled(data.user.remindersEnabled ?? true);
          setRecommendationsEnabled(data.user.recommendationsEnabled ?? true);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };
    load();
    return () => {
      active = false;
    };
  }, []);

  const enable = async () => {
    setStatus(null);
    const res = await fetch("/api/users/me", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        remindersEnabled,
        recommendationsEnabled
      })
    });
    setStatus(res.ok ? "Saved" : "Failed");
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
            <label className="flex items-center justify-between rounded-2xl border border-neutral-200 bg-white/95 px-4 py-3 text-sm shadow-sm">
              <span>Event reminders</span>
              <input
                type="checkbox"
                checked={remindersEnabled}
                onChange={(event) => setRemindersEnabled(event.target.checked)}
                disabled={loading}
              />
            </label>
            <label className="flex items-center justify-between rounded-2xl border border-neutral-200 bg-white/95 px-4 py-3 text-sm shadow-sm">
              <span>Recommendations</span>
              <input
                type="checkbox"
                checked={recommendationsEnabled}
                onChange={(event) => setRecommendationsEnabled(event.target.checked)}
                disabled={loading}
              />
            </label>
          </div>
          <button
            className="rounded-full bg-ink px-5 py-2 text-sm font-semibold text-parchment transition hover:opacity-90"
            onClick={enable}
          >
            Save settings
          </button>
          {status ? (
            <p className="text-sm text-neutral-600">{status}</p>
          ) : null}
        </div>
      </div>
    </PageShell>
  );
}
