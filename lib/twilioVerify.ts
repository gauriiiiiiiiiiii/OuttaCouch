type TwilioChannel = "sms" | "whatsapp" | "email";

type TwilioVerifyResult = {
  status: "sent" | "failed" | "skipped";
  sid?: string;
  error?: string;
};

function getTwilioVerifyConfig() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID || "";
  const authToken = process.env.TWILIO_AUTH_TOKEN || "";
  const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID || "";

  if (!accountSid || !authToken || !serviceSid) {
    return null;
  }

  return { accountSid, authToken, serviceSid };
}

async function twilioRequest(
  path: string,
  body: URLSearchParams
): Promise<{ ok: boolean; text: string; json?: Record<string, unknown> }> {
  const config = getTwilioVerifyConfig();
  if (!config) {
    return { ok: false, text: "Twilio Verify not configured" };
  }

  const auth = Buffer.from(`${config.accountSid}:${config.authToken}`).toString("base64");
  const response = await fetch(`https://verify.twilio.com/v2/Services/${config.serviceSid}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: body.toString()
  });

  const text = await response.text();
  let json: Record<string, unknown> | undefined;
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : undefined;
  } catch {
    json = undefined;
  }
  return { ok: response.ok, text, json };
}

export async function startVerification(to: string, channel: TwilioChannel) {
  const config = getTwilioVerifyConfig();
  if (!config) {
    return { status: "skipped", error: "Twilio Verify not configured" } as TwilioVerifyResult;
  }

  const body = new URLSearchParams({ To: to, Channel: channel });
  const result = await twilioRequest("/Verifications", body);

  if (!result.ok) {
    return { status: "failed", error: result.text } as TwilioVerifyResult;
  }

  const sid = typeof result.json?.sid === "string" ? result.json.sid : undefined;
  return { status: "sent", sid } as TwilioVerifyResult;
}

export async function checkVerification(to: string, code: string) {
  const config = getTwilioVerifyConfig();
  if (!config) {
    return { status: "skipped", error: "Twilio Verify not configured" } as TwilioVerifyResult;
  }

  const body = new URLSearchParams({ To: to, Code: code });
  const result = await twilioRequest("/VerificationCheck", body);

  if (!result.ok) {
    return { status: "failed", error: result.text } as TwilioVerifyResult;
  }

  const status = typeof result.json?.status === "string" ? result.json.status : "";
  if (status !== "approved") {
    return {
      status: "failed",
      error: typeof result.json?.status === "string" ? result.json.status : result.text
    } as TwilioVerifyResult;
  }

  return { status: "sent" } as TwilioVerifyResult;
}
