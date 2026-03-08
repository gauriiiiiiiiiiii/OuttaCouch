import { Suspense } from "react";
import PageShell from "@/components/ui/PageShell";
import ResetPasswordClient from "./ResetPasswordClient";

export default function ResetPasswordPage() {
  return (
    <PageShell title="Set new password" subtitle="Secure your account again.">
      <Suspense>
        <ResetPasswordClient />
      </Suspense>
    </PageShell>
  );
}
