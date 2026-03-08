import { Suspense } from "react";
import PageShell from "@/components/ui/PageShell";
import PasswordClient from "@/app/(auth)/signup/password/PasswordClient";

export default function SetPasswordPage() {
  return (
    <PageShell title="Set password" subtitle="Secure your account.">
      <Suspense>
        <PasswordClient />
      </Suspense>
    </PageShell>
  );
}
