import Link from "next/link";
import PageShell from "@/components/ui/PageShell";

export default function HostToolsPage() {
  return (
    <PageShell title="Host tools" subtitle="Payouts and dashboards.">
      <div className="rounded-2xl border border-neutral-200 bg-white/90 p-6">
        <p className="text-sm text-neutral-600">
          Manage your hosted events and payouts.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-neutral-200 bg-white/95 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">
              Payouts
            </p>
            <p className="mt-2 text-sm text-neutral-600">
              Connect a payout method to receive earnings.
            </p>
            <button className="mt-3 rounded-full border border-neutral-300 px-4 py-2 text-xs font-semibold">
              Connect payouts
            </button>
          </div>
          <div className="rounded-2xl border border-neutral-200 bg-white/95 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">
              Dashboards
            </p>
            <p className="mt-2 text-sm text-neutral-600">
              Track attendance, revenue, and tickets.
            </p>
            <Link
              href="/events/manage"
              className="mt-3 inline-flex rounded-full bg-ink px-4 py-2 text-xs font-semibold text-parchment"
            >
              View host dashboards
            </Link>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
