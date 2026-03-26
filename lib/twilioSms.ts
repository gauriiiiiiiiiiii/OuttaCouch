/**
 * Twilio SMS & WhatsApp Messaging
 * For sending promotional messages, invitations, etc.
 */

type TwilioChannel = "sms" | "whatsapp";

async function twilioSmsRequest(
  endpoint: string,
  body: URLSearchParams
): Promise<{ sid?: string; error?: string }> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    return { error: "Twilio not configured" };
  }

  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}${endpoint}`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: body.toString()
    });

    const data = (await res.json()) as { sid?: string; code?: number; message?: string };

    if (!res.ok) {
      return { error: data.message || "Twilio API error" };
    }

    return { sid: data.sid };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

export async function sendSmsMessage(
  to: string,
  message: string
): Promise<{ status: "sent" | "failed"; sid?: string; error?: string }> {
  const from = process.env.TWILIO_PHONE_NUMBER;

  if (!from) {
    return { status: "failed", error: "Twilio phone number not configured" };
  }

  const body = new URLSearchParams({
    From: from,
    To: to,
    Body: message
  });

  const result = await twilioSmsRequest("/Messages.json", body);

  if (result.error) {
    return { status: "failed", error: result.error };
  }

  return { status: "sent", sid: result.sid };
}

export async function sendWhatsAppMessage(
  to: string,
  message: string
): Promise<{ status: "sent" | "failed"; sid?: string; error?: string }> {
  const from = process.env.TWILIO_WHATSAPP_NUMBER;

  if (!from) {
    return { status: "failed", error: "Twilio WhatsApp number not configured" };
  }

  // WhatsApp messages require format: whatsapp:+CCXXXXXXXXXX
  const whatsappTo = to.startsWith("whatsapp:") ? to : `whatsapp:${to}`;
  const whatsappFrom = from.startsWith("whatsapp:") ? from : `whatsapp:${from}`;

  const body = new URLSearchParams({
    From: whatsappFrom,
    To: whatsappTo,
    Body: message
  });

  const result = await twilioSmsRequest("/Messages.json", body);

  if (result.error) {
    return { status: "failed", error: result.error };
  }

  return { status: "sent", sid: result.sid };
}

export async function sendInvitationMessage(
  to: string,
  referralLink: string,
  channel: "sms" | "whatsapp",
  senderName?: string
): Promise<{ status: "sent" | "failed"; sid?: string; error?: string }> {
  const appName = "OuttaCouch";
  const senderPart = senderName ? `${senderName} invited you to` : "You're invited to";

  const message = `${senderPart} ${appName}! 🎉\n\nJoin me and discover amazing events.\n\nRegister here: ${referralLink}`;

  if (channel === "whatsapp") {
    return sendWhatsAppMessage(to, message);
  }

  return sendSmsMessage(to, message);
}
