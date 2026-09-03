import { beforeEach, describe, expect, it, vi } from "vitest";

const sendMail = vi.fn();
const createTransport = vi.fn(() => ({ sendMail }));

vi.mock("nodemailer", () => ({
  default: { createTransport: (...args: unknown[]) => createTransport(...(args as [])) }
}));

import { sendEmail } from "@/lib/sendEmail";
import { sendNotificationEmail } from "@/lib/notifications";

const payload = { to: "a@b.com", subject: "Hi", text: "Body" };

describe("sendEmail", () => {
  beforeEach(() => {
    vi.stubEnv("EMAIL_USER", "me@gmail.com");
    vi.stubEnv("EMAIL_PASS", "app-password");
    vi.stubEnv("EMAIL_FROM", "OuttaCouch <me@gmail.com>");
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("EMAIL_ALLOW_SELF_SIGNED", "false");
    sendMail.mockResolvedValue({ messageId: "x" });
  });

  it("is skipped when SMTP credentials are missing", async () => {
    vi.stubEnv("EMAIL_USER", "");
    await expect(sendEmail(payload)).resolves.toEqual({ status: "skipped" });
    expect(createTransport).not.toHaveBeenCalled();
  });

  it("sends via the gmail transport with the configured from address", async () => {
    await expect(sendEmail(payload)).resolves.toEqual({ status: "sent" });
    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        service: "gmail",
        auth: { user: "me@gmail.com", pass: "app-password" }
      })
    );
    expect(sendMail).toHaveBeenCalledWith({
      from: "OuttaCouch <me@gmail.com>",
      to: "a@b.com",
      subject: "Hi",
      text: "Body"
    });
  });

  it("derives a from address from EMAIL_USER when EMAIL_FROM is unset", async () => {
    vi.stubEnv("EMAIL_FROM", "");
    await sendEmail(payload);
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ from: "OuttaCouch <me@gmail.com>" }));
  });

  it("relaxes TLS outside production", async () => {
    await sendEmail(payload);
    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ tls: { rejectUnauthorized: false } })
    );
  });

  it("keeps strict TLS in production unless explicitly allowed", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await sendEmail(payload);
    expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({ tls: undefined }));

    createTransport.mockClear();
    vi.stubEnv("EMAIL_ALLOW_SELF_SIGNED", "true");
    await sendEmail(payload);
    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ tls: { rejectUnauthorized: false } })
    );
  });

  it("reports transport failures without throwing", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    sendMail.mockRejectedValueOnce(new Error("535 auth failed"));
    await expect(sendEmail(payload)).resolves.toEqual({ status: "failed", error: "535 auth failed" });
    expect(spy).toHaveBeenCalled();
  });

  it("normalises non-Error rejections", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    sendMail.mockRejectedValueOnce("boom");
    await expect(sendEmail(payload)).resolves.toEqual({ status: "failed", error: "Email send failed" });
  });
});

describe("sendNotificationEmail", () => {
  it("delegates to sendEmail unchanged", async () => {
    vi.stubEnv("EMAIL_USER", "me@gmail.com");
    vi.stubEnv("EMAIL_PASS", "pw");
    sendMail.mockResolvedValue({});
    await expect(sendNotificationEmail(payload)).resolves.toEqual({ status: "sent" });
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: "a@b.com", subject: "Hi" }));
  });
});
