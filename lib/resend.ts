type SendResendEmailInput = {
  to: string;
  subject: string;
  text: string;
  from?: string;
};

type SendResendEmailResult =
  | { status: "sent"; id?: string }
  | { status: "skipped"; error: string }
  | { status: "failed"; error: string };

function getResendConfig(fromOverride?: string) {
  const apiKey = process.env.RESEND_API_KEY || "";
  const from = fromOverride || process.env.RESEND_FROM || "";

  if (!apiKey || !from) {
    return null;
  }

  return { apiKey, from };
}

export async function sendResendEmail(
  input: SendResendEmailInput
): Promise<SendResendEmailResult> {
  const config = getResendConfig(input.from);
  if (!config) {
    return { status: "skipped", error: "Resend not configured" };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: config.from,
        to: input.to,
        subject: input.subject,
        text: input.text
      })
    });

    const json = (await response.json().catch(() => undefined)) as
      | { id?: string; error?: { message?: string } }
      | undefined;

    if (!response.ok) {
      const errorMessage = json?.error?.message || `HTTP ${response.status}`;
      return { status: "failed", error: errorMessage };
    }

    return { status: "sent", id: json?.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Resend request failed";
    console.error("Resend email error", message);
    return { status: "failed", error: message };
  }
}
