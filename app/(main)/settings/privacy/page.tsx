"use client";

import { useState } from "react";
import PageShell from "@/components/ui/PageShell";

export default function PrivacySettingsPage() {
  const [calendarVisibility, setCalendarVisibility] = useState("connections");
  const [profileVisibility, setProfileVisibility] = useState("public");
  const [status, setStatus] = useState<string | null>(null);

  const save = async () => {
    setStatus(null);
    const res = await fetch("/api/users/me/privacy", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ calendarVisibility, profileVisibility })
    });
    setStatus(res.ok ? "Saved" : "Failed");
  };

  return (
    <PageShell
      title="Privacy"
      subtitle="Control your visibility."
      backHref="/settings"
      backLabel="Back to settings"
    >
      <div className="rounded-2xl border border-neutral-200 bg-white/90 p-6">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold">Calendar visibility</label>
            <p className="text-xs text-neutral-500">
              Choose who sees your attendance history.
            </p>
            <select
              className="mt-2 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
              value={calendarVisibility}
              onChange={(event) => setCalendarVisibility(event.target.value)}
            >
              <option value="private">Private</option>
              <option value="connections">Connections only</option>
              <option value="public">Public</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold">Profile visibility</label>
            <p className="text-xs text-neutral-500">
              Control who can view your profile.
            </p>
            <select
              className="mt-2 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
              value={profileVisibility}
              onChange={(event) => setProfileVisibility(event.target.value)}
            >
              <option value="connections">Connections only</option>
              <option value="public">Public</option>
            </select>
          </div>
          <button
            className="rounded-full bg-ink px-5 py-2 text-sm font-semibold text-parchment"
            onClick={save}
          >
            Save privacy
          </button>
          {status ? <p className="text-sm text-neutral-600">{status}</p> : null}
        </div>
      </div>
    </PageShell>
  );
}
