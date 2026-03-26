"use client";

import { useState } from "react";
import PageShell from "@/components/ui/PageShell";

export default function PrivacySettingsPage() {
  const [profileVisibility, setProfileVisibility] = useState("public");
  const [status, setStatus] = useState<string | null>(null);

  const save = async () => {
    setStatus(null);
    const res = await fetch("/api/users/me/privacy", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileVisibility })
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
      <div className="rounded-3xl border border-neutral-200 bg-white/90 p-6 shadow-sm">
        <div className="space-y-5">
          <div className="rounded-2xl border border-neutral-200 bg-white/95 p-4 text-sm text-neutral-600">
            Calendar visibility now lives on your profile page.
          </div>
          <div>
            <label className="block text-sm font-semibold">Profile visibility</label>
            <p className="text-xs text-neutral-500">
              Control who can view your profile.
            </p>
            <select
              className="mt-3 w-full rounded-2xl border border-neutral-200 bg-white/95 px-4 py-3 text-sm shadow-sm"
              value={profileVisibility}
              onChange={(event) => setProfileVisibility(event.target.value)}
            >
              <option value="connections">Connections only</option>
              <option value="public">Public</option>
            </select>
          </div>
          <button
            className="rounded-full bg-ink px-5 py-2 text-sm font-semibold text-parchment transition hover:opacity-90"
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
