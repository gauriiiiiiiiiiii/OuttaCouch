"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import PageShell from "@/components/ui/PageShell";
import { loadStripe } from "@stripe/stripe-js";
import {
  CardElement,
  Elements,
  useElements,
  useStripe
} from "@stripe/react-stripe-js";

type EventData = {
  id: string;
  title: string;
  ticketPrice: string | null;
  isFree: boolean;
};

type IntentResponse = {
  client_secret: string | null;
  payment_intent_id: string;
};

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || ""
);

function CheckoutForm({ event, quantity }: { event: EventData; quantity: number }) {
  const router = useRouter();
  const stripe = useStripe();
  const elements = useElements();
  const [status, setStatus] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  const handlePurchase = async () => {
    if (!stripe || !elements) {
      setStatus("Stripe not ready.");
      return;
    }
    setProcessing(true);
    setStatus(null);

    const intent = await fetch("/api/tickets/create-intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId: event.id, quantity })
    });

    if (!intent.ok) {
      setStatus("Failed to start payment.");
      setProcessing(false);
      return;
    }

    const intentData = (await intent.json()) as IntentResponse;
    if (!intentData.client_secret) {
      setStatus("Missing payment intent.");
      setProcessing(false);
      return;
    }

    const card = elements.getElement(CardElement);
    if (!card) {
      setStatus("Payment form not ready.");
      setProcessing(false);
      return;
    }

    const result = await stripe.confirmCardPayment(intentData.client_secret, {
      payment_method: { card }
    });

    if (result.error) {
      setStatus(result.error.message || "Payment failed.");
      setProcessing(false);
      return;
    }

    if (result.paymentIntent?.status !== "succeeded") {
      setStatus("Payment not completed.");
      setProcessing(false);
      return;
    }

    const confirm = await fetch("/api/tickets/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventId: event.id,
        quantity,
        paymentIntentId: result.paymentIntent.id
      })
    });

    if (!confirm.ok) {
      setStatus("Payment confirmed but ticket creation failed.");
      setProcessing(false);
      return;
    }

    setStatus("Ticket confirmed.");
    setProcessing(false);
    router.push("/profile/tickets");
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">
          Payment details
        </p>
      </div>
      <div className="rounded-2xl border border-neutral-200 bg-white/95 p-4">
        <CardElement options={{ hidePostalCode: true }} />
      </div>
      <button
        className="rounded-full bg-ink px-5 py-2 text-sm font-semibold text-parchment"
        onClick={handlePurchase}
        disabled={processing}
      >
        {processing ? "Processing..." : "Confirm purchase"}
      </button>
      {status ? <p className="text-sm text-neutral-600">{status}</p> : null}
    </div>
  );
}

export default function TicketPurchasePage() {
  const params = useParams();
  const id = params?.id as string;
  const [event, setEvent] = useState<EventData | null>(null);
  const [quantity, setQuantity] = useState(1);

  useEffect(() => {
    const load = async () => {
      const res = await fetch(`/api/events/${id}`);
      const data = res.ok ? ((await res.json()) as EventData) : null;
      setEvent(data);
    };
    if (id) {
      load();
    }
  }, [id]);

  const price = Number(event?.ticketPrice ?? 0);
  const total = price * quantity;
  const stripeReady = useMemo(
    () => Boolean(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY),
    []
  );

  return (
    <PageShell title="Get ticket" subtitle="Secure your spot.">
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="rounded-2xl border border-neutral-200 bg-white/90 p-6">
          {!event ? (
            <p className="text-sm text-neutral-600">Loading...</p>
          ) : event.isFree ? (
            <p className="text-sm text-neutral-600">This event is free.</p>
          ) : (
            <div className="space-y-4">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">
                  Checkout
                </p>
                <div className="text-lg font-semibold">{event.title}</div>
              </div>
              <div className="flex items-center gap-3">
                <label className="text-sm">Quantity</label>
                <input
                  type="number"
                  min={1}
                  max={4}
                  value={quantity}
                  onChange={(event) => setQuantity(Number(event.target.value))}
                  className="w-20 rounded-lg border border-neutral-200 px-3 py-2 text-sm"
                />
              </div>
              {stripeReady ? (
                <Elements stripe={stripePromise}>
                  <CheckoutForm event={event} quantity={quantity} />
                </Elements>
              ) : (
                <p className="text-sm text-neutral-600">
                  Stripe is not configured. Set NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY.
                </p>
              )}
            </div>
          )}
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white/95 p-6">
          <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">
            Order summary
          </p>
          <div className="mt-3 space-y-2 text-sm text-neutral-600">
            <div className="flex items-center justify-between">
              <span>Price</span>
              <span>₹{price.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Quantity</span>
              <span>{quantity}</span>
            </div>
            <div className="flex items-center justify-between font-semibold text-ink">
              <span>Total</span>
              <span>₹{total.toFixed(2)}</span>
            </div>
          </div>
          <p className="mt-4 text-xs text-neutral-500">
            Payments are processed via Stripe. Webhooks finalize ticket issuance.
          </p>
        </div>
      </div>
    </PageShell>
  );
}
