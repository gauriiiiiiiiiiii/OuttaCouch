import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkVerification, startVerification } from "@/lib/twilioVerify";
import { sendInvitationMessage, sendSmsMessage, sendWhatsAppMessage } from "@/lib/twilioSms";

const fetchMock = vi.fn();

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 400) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function lastCall() {
  const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
  return { url, init, body: new URLSearchParams(init.body as string), headers: init.headers as Record<string, string> };
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubEnv("TWILIO_ACCOUNT_SID", "ACxxx");
  vi.stubEnv("TWILIO_AUTH_TOKEN", "tok");
  vi.stubEnv("TWILIO_VERIFY_SERVICE_SID", "VAyyy");
  vi.stubEnv("TWILIO_PHONE_NUMBER", "+15550000000");
  vi.stubEnv("TWILIO_WHATSAPP_NUMBER", "+15551111111");
});

describe("twilioVerify.startVerification", () => {
  it("is skipped when not configured", async () => {
    vi.stubEnv("TWILIO_VERIFY_SERVICE_SID", "");
    await expect(startVerification("+919876543210", "sms")).resolves.toEqual({
      status: "skipped",
      error: "Twilio Verify not configured"
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts To/Channel to the Verify service with basic auth and returns the sid", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ sid: "VE123", status: "pending" }));
    await expect(startVerification("+919876543210", "sms")).resolves.toEqual({ status: "sent", sid: "VE123" });
    const { url, init, body, headers } = lastCall();
    expect(url).toBe("https://verify.twilio.com/v2/Services/VAyyy/Verifications");
    expect(init.method).toBe("POST");
    expect(headers.Authorization).toBe(`Basic ${Buffer.from("ACxxx:tok").toString("base64")}`);
    expect(body.get("To")).toBe("+919876543210");
    expect(body.get("Channel")).toBe("sms");
  });

  it("returns failed with the response text on a non-2xx", async () => {
    fetchMock.mockResolvedValueOnce(new Response("Invalid parameter", { status: 400 }));
    await expect(startVerification("+1", "sms")).resolves.toEqual({ status: "failed", error: "Invalid parameter" });
  });

  it("returns failed when fetch throws", async () => {
    fetchMock.mockRejectedValueOnce(new Error("network down"));
    await expect(startVerification("+1", "whatsapp")).resolves.toEqual({ status: "failed", error: "network down" });
  });

  it("tolerates a non-JSON 2xx body", async () => {
    fetchMock.mockResolvedValueOnce(new Response("ok-but-not-json", { status: 200 }));
    await expect(startVerification("+1", "sms")).resolves.toEqual({ status: "sent", sid: undefined });
  });
});

describe("twilioVerify.checkVerification", () => {
  it("is skipped when not configured", async () => {
    vi.stubEnv("TWILIO_ACCOUNT_SID", "");
    await expect(checkVerification("+1", "123456")).resolves.toMatchObject({ status: "skipped" });
  });

  it("succeeds only when Twilio reports approved", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ status: "approved" }));
    await expect(checkVerification("+919876543210", "123456")).resolves.toEqual({ status: "sent" });
    const { url, body } = lastCall();
    expect(url).toBe("https://verify.twilio.com/v2/Services/VAyyy/VerificationCheck");
    expect(body.get("To")).toBe("+919876543210");
    expect(body.get("Code")).toBe("123456");
  });

  it("fails with the Twilio status when the code is wrong", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ status: "pending" }));
    await expect(checkVerification("+1", "000000")).resolves.toEqual({ status: "failed", error: "pending" });
  });

  it("fails on a non-2xx response", async () => {
    fetchMock.mockResolvedValueOnce(new Response("expired", { status: 404 }));
    await expect(checkVerification("+1", "000000")).resolves.toEqual({ status: "failed", error: "expired" });
  });
});

describe("twilioSms", () => {
  it("sendSmsMessage fails fast when the sender number is missing", async () => {
    vi.stubEnv("TWILIO_PHONE_NUMBER", "");
    await expect(sendSmsMessage("+1", "hi")).resolves.toEqual({
      status: "failed",
      error: "Twilio phone number not configured"
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sendSmsMessage fails when account credentials are missing", async () => {
    vi.stubEnv("TWILIO_AUTH_TOKEN", "");
    await expect(sendSmsMessage("+1", "hi")).resolves.toEqual({ status: "failed", error: "Twilio not configured" });
  });

  it("sendSmsMessage posts to the Messages endpoint and returns the sid", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ sid: "SM1" }));
    await expect(sendSmsMessage("+919876543210", "hello")).resolves.toEqual({ status: "sent", sid: "SM1" });
    const { url, body } = lastCall();
    expect(url).toBe("https://api.twilio.com/2010-04-01/Accounts/ACxxx/Messages.json");
    expect(body.get("From")).toBe("+15550000000");
    expect(body.get("To")).toBe("+919876543210");
    expect(body.get("Body")).toBe("hello");
  });

  it("sendSmsMessage surfaces the Twilio error message", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ code: 21211, message: "Invalid 'To'" }, false));
    await expect(sendSmsMessage("+1", "x")).resolves.toEqual({ status: "failed", error: "Invalid 'To'" });
  });

  it("sendSmsMessage falls back to a generic error when Twilio omits a message", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, false));
    await expect(sendSmsMessage("+1", "x")).resolves.toEqual({ status: "failed", error: "Twilio API error" });
  });

  it("sendWhatsAppMessage adds the whatsapp: prefix exactly once", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ sid: "WA1" }));
    await sendWhatsAppMessage("+919876543210", "hey");
    expect(lastCall().body.get("To")).toBe("whatsapp:+919876543210");
    expect(lastCall().body.get("From")).toBe("whatsapp:+15551111111");

    await sendWhatsAppMessage("whatsapp:+919876543210", "hey");
    expect(lastCall().body.get("To")).toBe("whatsapp:+919876543210");
  });

  it("sendWhatsAppMessage fails when the WhatsApp sender is missing", async () => {
    vi.stubEnv("TWILIO_WHATSAPP_NUMBER", "");
    await expect(sendWhatsAppMessage("+1", "x")).resolves.toMatchObject({ status: "failed" });
  });

  it("sendInvitationMessage names the sender and embeds the join link", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ sid: "SM2" }));
    await sendInvitationMessage("+1", "https://app/join?ref=ABC", "sms", "Priya");
    const text = lastCall().body.get("Body") ?? "";
    expect(text).toContain("Priya invited you to OuttaCouch");
    expect(text).toContain("https://app/join?ref=ABC");
    expect(lastCall().body.get("To")).toBe("+1");
  });

  it("sendInvitationMessage uses a generic greeting without a sender and routes WhatsApp", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ sid: "WA2" }));
    await sendInvitationMessage("+1", "https://app/join?ref=ABC", "whatsapp");
    expect(lastCall().body.get("Body")).toContain("You're invited to OuttaCouch");
    expect(lastCall().body.get("To")).toBe("whatsapp:+1");
  });
});
