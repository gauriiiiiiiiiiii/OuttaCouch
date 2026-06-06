"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import PageShell from "@/components/ui/PageShell";

type Ticket = {
  id: string;
  eventTitle: string;
  eventDate: string;
  quantity: number;
  amountPaid: string;
  paymentStatus: "pending" | "paid" | "refunded" | "failed";
  qrCode: string;
};

function PaymentBadge({ status }: { status: Ticket["paymentStatus"] }) {
  const styles: Record<Ticket["paymentStatus"], string> = {
    paid: "bg-green-100 text-green-700 border-green-200",
    pending: "bg-yellow-100 text-yellow-700 border-yellow-200",
    refunded: "bg-blue-100 text-blue-700 border-blue-200",
    failed: "bg-red-100 text-red-700 border-red-200"
  };
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${styles[status]}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

export default function TicketsPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
            {tickets.map((ticket) => {
              const isExpanded = expandedId === ticket.id;
              return (
                <div
                  key={ticket.id}
                  className="overflow-hidden rounded-2xl border border-neutral-200 bg-white/95 shadow-sm"
                >
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : ticket.id)}
                    className="flex w-full items-center justify-between px-4 py-4 text-left transition hover:bg-neutral-50"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{ticket.eventTitle}</span>
                        <PaymentBadge status={ticket.paymentStatus} />
                      </div>
                      <div className="text-xs text-neutral-500">
                        {new Date(ticket.eventDate).toLocaleDateString(undefined, {
                          weekday: "short",
                          year: "numeric",
                          month: "short",
                          day: "numeric"
                        })}
                      </div>
                      <div className="mt-1 text-xs text-neutral-500">
                        Qty: {ticket.quantity} · {Number(ticket.amountPaid) === 0 ? "Free" : `₹${ticket.amountPaid}`}
                      </div>
                    </div>
                    <span className="ml-4 rounded-full border border-neutral-200 px-3 py-1 text-xs font-semibold text-neutral-500">
                      {isExpanded ? "Hide QR" : "Show QR"}
                    </span>
                  </button>

                  {isExpanded ? (
                    <div className="flex flex-col items-center gap-3 border-t border-neutral-100 bg-neutral-50 px-4 py-6">
                      <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
                        <QRCodeSVG
                          value={ticket.qrCode}
                          size={192}
                          bgColor="#ffffff"
                          fgColor="#1a1a1a"
                          level="M"
                        />
                      </div>
                      <p className="text-center text-xs text-neutral-500">
                        Show this QR code at the door
                      </p>
                      <p className="font-mono text-[11px] text-neutral-400 break-all text-center">
                        {ticket.qrCode}
                      </p>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </PageShell>
  );
}
