import Link from "next/link";
import PageShell from "@/components/ui/PageShell";

export default function HostToolsPage() {
  return (
    <PageShell
      title="Host tools"
      subtitle="Payouts and dashboards."
      backHref="/settings"
      backLabel="Back to settings"
    >
      <div className="rounded-3xl border border-neutral-200 bg-white/90 p-6 shadow-sm">
        <p className="text-sm text-neutral-600">
          Manage your hosted events and payouts.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-neutral-200 bg-white/95 p-4 shadow-sm">
            <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">
              Payouts
            </p>
            <p className="mt-2 text-sm text-neutral-600">
              Connect a payout method to receive earnings.
            </p>
            <button className="mt-3 rounded-full border border-neutral-300 px-4 py-2 text-xs font-semibold transition hover:border-neutral-400">
              Connect payouts
            </button>
          </div>
          <div className="rounded-2xl border border-neutral-200 bg-white/95 p-4 shadow-sm">
            <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">
              Dashboards
            </p>
            <p className="mt-2 text-sm text-neutral-600">
              Track attendance, revenue, and tickets.
            </p>
            <Link
              href="/events/manage"
              className="mt-3 inline-flex rounded-full bg-ink px-4 py-2 text-xs font-semibold text-parchment transition hover:opacity-90"
            >
              View host dashboards
            </Link>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
