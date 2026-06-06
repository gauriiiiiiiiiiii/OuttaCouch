"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import PageShell from "@/components/ui/PageShell";

type Contact = {
  id: string;
  name: string | null;
  phone: string;
  status: "pending" | "invited" | "registered";
  invitedAt: string | null;
  registeredUser?: {
    id: string;
    displayName: string | null;
    profilePhotoUrl: string | null;
  } | null;
};

type Stats = {
  total: number;
  registered: number;
  invited: number;
  pending: number;
};

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [inviting, setInviting] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<"all" | "pending" | "invited" | "registered">("all");
  const [syncError, setSyncError] = useState<string | null>(null);

  const fetchContacts = useCallback(async () => {
    const res = await fetch("/api/contacts/sync");
    if (!res.ok) return;
    const data = (await res.json()) as { contacts: Contact[]; stats: Stats };
    setContacts(data.contacts ?? []);
    setStats(data.stats ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  const syncContacts = async () => {
    setSyncError(null);
    if (!("contacts" in navigator)) {
      setSyncError("Contact picker not supported in this browser.");
      return;
    }
    setSyncing(true);
    try {
      const props = await (navigator as any).contacts.select(["name", "tel"], {
        multiple: true
      });
      const mapped = (props as any[]).flatMap((entry: any) =>
        (entry.tel ?? []).map((tel: string) => ({
          name: entry.name?.[0] ?? "Unknown",
          phone: tel
        }))
      );
      if (mapped.length === 0) {
        setSyncError("No contacts selected.");
        setSyncing(false);
        return;
      }
      const res = await fetch("/api/contacts/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contacts: mapped })
      });
      if (!res.ok) {
        setSyncError("Sync failed. Try again.");
      } else {
        await fetchContacts();
      }
    } catch {
      setSyncError("Could not access contacts.");
    } finally {
      setSyncing(false);
    }
  };

  const inviteContact = async (contact: Contact) => {
    setInviting((prev) => new Set([...prev, contact.id]));
    try {
      await fetch("/api/referrals/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactIds: [contact.id], channel: "sms" })
      });
      setContacts((prev) =>
        prev.map((c) =>
          c.id === contact.id
            ? { ...c, status: "invited", invitedAt: new Date().toISOString() }
            : c
        )
      );
      setStats((prev) =>
        prev
          ? { ...prev, invited: prev.invited + 1, pending: prev.pending - 1 }
          : prev
      );
    } finally {
      setInviting((prev) => {
        const next = new Set(prev);
        next.delete(contact.id);
        return next;
      });
    }
  };

  const visible = contacts.filter(
    (c) => filter === "all" || c.status === filter
  );

  const statusLabel: Record<Contact["status"], string> = {
    registered: "On Outtacouch",
    invited: "Invited",
    pending: "Not yet invited"
  };

  const statusDot: Record<Contact["status"], string> = {
    registered: "bg-ocean",
    invited: "bg-accent",
    pending: "bg-neutral-300"
  };

  return (
    <PageShell
      title="Contacts"
      subtitle="Sync your phone contacts and invite friends."
      backHref="/settings"
      backLabel="Back to settings"
    >
      <div className="space-y-6">
        {/* Stats */}
        {stats ? (
          <div className="grid grid-cols-3 gap-3">
            {(
              [
                { label: "On app", value: stats.registered, key: "registered" },
                { label: "Invited", value: stats.invited, key: "invited" },
                { label: "Pending", value: stats.pending, key: "pending" }
              ] as const
            ).map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() =>
                  setFilter((prev) => (prev === item.key ? "all" : item.key))
                }
                className={`rounded-2xl border p-4 text-center transition ${
                  filter === item.key
                    ? "border-ocean bg-ocean/5"
                    : "border-neutral-200 bg-white/90 hover:border-neutral-300"
                }`}
              >
                <p className="text-2xl font-semibold text-ink">{item.value}</p>
                <p className="text-xs text-neutral-500">{item.label}</p>
              </button>
            ))}
          </div>
        ) : null}

        {/* Sync button */}
        <div className="rounded-2xl border border-neutral-200 bg-white/90 p-5">
          <p className="text-sm text-neutral-600">
            Sync your phone contacts to see who is already on Outtacouch and
            invite those who are not.
          </p>
          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              onClick={syncContacts}
              disabled={syncing}
              className="rounded-full bg-ink px-5 py-2 text-sm font-semibold text-parchment transition hover:opacity-90 disabled:opacity-50"
            >
              {syncing ? "Syncing..." : contacts.length > 0 ? "Re-sync contacts" : "Sync contacts"}
            </button>
            {syncError ? (
              <p className="text-sm text-red-600">{syncError}</p>
            ) : null}
          </div>
          {!("contacts" in navigator) ? (
            <p className="mt-2 text-xs text-neutral-500">
              Contact syncing requires a supported mobile browser (Chrome on Android,
              Safari on iOS 16+).
            </p>
          ) : null}
        </div>

        {/* Contact list */}
        <div className="rounded-2xl border border-neutral-200 bg-white/90 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-neutral-500">
              {filter === "all" ? "All contacts" : statusLabel[filter]}
              {visible.length > 0 ? ` · ${visible.length}` : ""}
            </h2>
            {filter !== "all" ? (
              <button
                type="button"
                onClick={() => setFilter("all")}
                className="text-xs text-neutral-500 underline"
              >
                Show all
              </button>
            ) : null}
          </div>

          {loading ? (
            <p className="text-sm text-neutral-600">Loading...</p>
          ) : visible.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500">
              {contacts.length === 0
                ? "No contacts synced yet. Tap Sync contacts to get started."
                : "No contacts in this category."}
            </div>
          ) : (
            <div className="space-y-2">
              {visible.map((contact) => (
                <div
                  key={contact.id}
                  className="flex items-center gap-3 rounded-2xl border border-neutral-200 bg-white/95 px-4 py-3"
                >
                  {contact.registeredUser?.profilePhotoUrl ? (
                    <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full bg-neutral-200">
                      <Image
                        src={contact.registeredUser.profilePhotoUrl}
                        alt={contact.name ?? "Contact"}
                        fill
                        sizes="40px"
                        className="object-cover"
                      />
                    </div>
                  ) : (
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-sm font-semibold text-neutral-600">
                      {(contact.name ?? "?").charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-semibold text-ink">
                      {contact.registeredUser?.displayName ?? contact.name ?? "Unknown"}
                    </p>
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${statusDot[contact.status]}`}
                      />
                      <p className="text-xs text-neutral-500">
                        {statusLabel[contact.status]}
                      </p>
                    </div>
                  </div>
                  {contact.status === "pending" ? (
                    <button
                      type="button"
                      onClick={() => inviteContact(contact)}
                      disabled={inviting.has(contact.id)}
                      className="shrink-0 rounded-full bg-ink px-4 py-1.5 text-xs font-semibold text-parchment transition hover:opacity-90 disabled:opacity-50"
                    >
                      {inviting.has(contact.id) ? "Sending..." : "Invite"}
                    </button>
                  ) : contact.status === "invited" ? (
                    <span className="shrink-0 text-xs text-neutral-400">Sent</span>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </PageShell>
  );
}
