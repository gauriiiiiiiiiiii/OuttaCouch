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
        <p className="text-sm text-neutral-600">
          Online payment processing is not enabled. Contact the event host directly
          to arrange payment for paid events.
        </p>
      </div>
    </PageShell>
  );
}
