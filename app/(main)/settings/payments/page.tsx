import PageShell from "@/components/ui/PageShell";

export default function PaymentSettingsPage() {
  return (
    <PageShell
      title="Payments"
      subtitle="Billing and methods."
      backHref="/settings"
      backLabel="Back to settings"
    >
      <div className="rounded-3xl border border-neutral-200 bg-white/90 p-6 shadow-sm">
        <div className="space-y-5">
          <p className="text-sm text-neutral-600">
            Store a card to speed up checkout and host payouts.
          </p>
          <div className="rounded-2xl border border-dashed border-neutral-300 bg-white/95 p-4 text-sm text-neutral-500">
            No payment methods yet.
          </div>
          <button className="rounded-full bg-ink px-5 py-2 text-sm font-semibold text-parchment transition hover:opacity-90">
            Add payment method
          </button>
        </div>
      </div>
    </PageShell>
  );
}
