import { Suspense } from "react";
import PageShell from "@/components/ui/PageShell";
import VerifyClient from "@/app/(auth)/signup/verify/VerifyClient";

export default function VerifyPage() {
  return (
    <PageShell title="Verify OTP" subtitle="Enter the 6-digit code.">
      <Suspense>
        <VerifyClient />
      </Suspense>
    </PageShell>
  );
}
