"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import PageShell from "@/components/ui/PageShell";

export default function ScannerPage() {
  const params = useParams();
  const id = params?.id as string;
  const [qrCode, setQrCode] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  const validateQr = async () => {
    setStatus(null);
    const res = await fetch("/api/tickets/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ qr_code: qrCode, event_id: id })
    });

    if (res.ok) {
      setStatus("validated");
    } else {
      setStatus("failed");
    }
  };

  return (
    <PageShell title="QR scanner" subtitle="Validate attendee tickets.">
      <div className="rounded-2xl border border-neutral-200 bg-white/90 p-6">
        <div className="space-y-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">
              Scan mode
            </p>
            <p className="text-sm text-neutral-600">
              Paste or scan the attendee QR code to validate entry.
            </p>
          </div>
          <input
            className="w-full rounded-full border border-neutral-200 px-4 py-2 text-sm"
            placeholder="Paste QR code"
            value={qrCode}
            onChange={(event) => setQrCode(event.target.value)}
          />
          <div className="flex flex-wrap items-center gap-3">
            <button
              className="rounded-full bg-ink px-5 py-2 text-sm font-semibold text-parchment"
              onClick={validateQr}
            >
              Validate
            </button>
            {status ? (
              <span className="rounded-full border border-neutral-200 px-3 py-1 text-xs text-neutral-600">
                {status}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </PageShell>
  );
}
