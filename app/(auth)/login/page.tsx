import { Suspense } from "react";
import PageShell from "@/components/ui/PageShell";
import LoginClient from "@/app/(auth)/login/LoginClient";

export default function LoginPage() {
  return (
    <PageShell
      title="Log in"
      subtitle="Enter your email or phone and password to continue."
    >
      <Suspense>
        <LoginClient />
      </Suspense>
    </PageShell>
  );
}
