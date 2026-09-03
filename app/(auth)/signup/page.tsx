import { Suspense } from "react";
import PageShell from "@/components/ui/PageShell";
import SignupClient from "@/app/(auth)/signup/SignupClient";

// useSearchParams() (the ?ref= referral code) must sit under a Suspense
// boundary or Next refuses to prerender the page.
export default function SignupPage() {
  return (
    <PageShell
      title="Sign up"
      subtitle="Start with email or phone to receive an OTP."
    >
      <Suspense>
        <SignupClient />
      </Suspense>
    </PageShell>
  );
}
