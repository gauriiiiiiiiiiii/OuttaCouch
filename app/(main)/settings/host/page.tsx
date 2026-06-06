import Link from "next/link";
import PageShell from "@/components/ui/PageShell";

export default function HostToolsPage() {
  return (
    <PageShell
      title="Host tools"
      subtitle="Manage your events."
      backHref="/settings"
      backLabel="Back to settings"
    >
      <div className="rounded-3xl border border-neutral-200 bg-white/90 p-6 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-neutral-200 bg-white/95 p-4 shadow-sm">
            <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">Dashboards</p>
            <p className="mt-2 text-sm text-neutral-600">
              Track attendance and validate tickets at the door.
            </p>
            <Link
              href="/events/manage"
              className="mt-3 inline-flex rounded-full bg-ink px-4 py-2 text-xs font-semibold text-parchment transition hover:opacity-90"
            >
              View hosted events
            </Link>
          </div>
          <div className="rounded-2xl border border-neutral-200 bg-white/95 p-4 shadow-sm">
            <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">New event</p>
            <p className="mt-2 text-sm text-neutral-600">
              Create a new event and start collecting attendees.
            </p>
            <Link
              href="/events/new"
              className="mt-3 inline-flex rounded-full border border-neutral-300 px-4 py-2 text-xs font-semibold transition hover:border-neutral-400"
            >
              Create event
            </Link>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
