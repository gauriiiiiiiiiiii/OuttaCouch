"use client";

import { useEffect, useState } from "react";
import PageShell from "@/components/ui/PageShell";

type Ticket = {
  id: string;
  eventTitle: string;
  eventDate: string;
  quantity: number;
  amountPaid: string;
  qrCode: string;
};

export default function TicketsPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const res = await fetch("/api/tickets/me");
      const data = res.ok ? ((await res.json()) as { tickets: Ticket[] }) : { tickets: [] };
      if (active) {
        setTickets(data.tickets ?? []);
        setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, []);

  return (
    <PageShell title="My tickets" subtitle="QR codes and receipts.">
      <div className="rounded-2xl border border-neutral-200 bg-white/90 p-6">
        {loading ? (
          <p className="text-sm text-neutral-600">Loading tickets...</p>
        ) : tickets.length === 0 ? (
          <p className="text-sm text-neutral-600">No tickets yet.</p>
        ) : (
          <div className="space-y-4">
            {tickets.map((ticket) => (
              <div
                key={ticket.id}
                className="rounded-2xl border border-neutral-200 bg-white/95 px-4 py-4 shadow-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold">{ticket.eventTitle}</div>
                    <div className="text-xs text-neutral-500">
                      {new Date(ticket.eventDate).toLocaleDateString()}
                    </div>
                    <div className="text-xs text-neutral-500">
                      Qty: {ticket.quantity} · Paid: ₹{ticket.amountPaid}
                    </div>
                  </div>
                  <span className="rounded-full border border-neutral-200 px-3 py-1 text-xs text-neutral-600">
                    QR: {ticket.qrCode}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </PageShell>
  );
}
