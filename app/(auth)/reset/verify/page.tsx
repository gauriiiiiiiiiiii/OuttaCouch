import { Suspense } from "react";
import PageShell from "@/components/ui/PageShell";
import ResetVerifyClient from "./ResetVerifyClient";

export default function ResetVerifyPage() {
  return (
    <PageShell title="Verify reset OTP" subtitle="Enter the 6-digit code.">
      <Suspense>
        <ResetVerifyClient />
      </Suspense>
    </PageShell>
  );
}
