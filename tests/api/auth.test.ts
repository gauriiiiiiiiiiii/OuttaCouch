import bcrypt from "bcryptjs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeRequest, readJson } from "../helpers/http";
import type { PrismaMock } from "../helpers/prismaMock";

vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock } = await import("../helpers/prismaMock");
  return { prisma: createPrismaMock() };
});
vi.mock("@/lib/sendEmail", () => ({ sendEmail: vi.fn() }));
vi.mock("@/lib/twilioVerify", () => ({ startVerification: vi.fn(), checkVerification: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/sendEmail";
import { checkVerification, startVerification } from "@/lib/twilioVerify";
import { POST as sendOtp } from "@/app/api/auth/send-otp/route";
import { POST as verifyOtp } from "@/app/api/auth/verify-otp/route";
import { POST as register } from "@/app/api/auth/register/route";
import { POST as resetPassword } from "@/app/api/auth/reset-password/route";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";

const db = prisma as unknown as PrismaMock;
const sendEmailMock = vi.mocked(sendEmail);
const startVerificationMock = vi.mocked(startVerification);
const checkVerificationMock = vi.mocked(checkVerification);

let ipCounter = 0;
const uniqueIp = () => `10.0.${Math.floor(ipCounter / 250)}.${(ipCounter++ % 250) + 1}`;

const post = (handler: (req: Request) => Promise<Response>, path: string, body: unknown, headers: Record<string, string> = {}) =>
  handler(makeRequest(path, { body, headers: { "x-forwarded-for": uniqueIp(), ...headers } }));

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

// ---------------------------------------------------------------------------
// POST /api/auth/send-otp
// ---------------------------------------------------------------------------
describe("POST /api/auth/send-otp", () => {
  beforeEach(() => {
    db.otpToken.findFirst.mockResolvedValue(null);
    db.otpToken.create.mockResolvedValue({ id: "otp-1" });
  });

  it("rejects cross-origin browser requests", async () => {
    const res = await post(sendOtp, "/api/auth/send-otp", { contact: "a@b.com" }, { origin: "https://evil.example" });
    expect(res.status).toBe(403);
  });

  it("rate limits to 5 sends per IP per window", async () => {
    sendEmailMock.mockResolvedValue({ status: "sent" });
    const ip = uniqueIp();
    for (let i = 0; i < 5; i += 1) {
      const res = await sendOtp(
        makeRequest("/api/auth/send-otp", { body: { contact: `u${i}@b.com` }, headers: { "x-forwarded-for": ip } })
      );
      expect(res.status).toBe(200);
    }
    const blocked = await sendOtp(
      makeRequest("/api/auth/send-otp", { body: { contact: "u9@b.com" }, headers: { "x-forwarded-for": ip } })
    );
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).toMatch(/^\d+$/);
  });

  it("requires a contact", async () => {
    const { status, body } = await readJson(await post(sendOtp, "/api/auth/send-otp", { contact: "   " }));
    expect(status).toBe(400);
    expect(body.error).toBe("Contact required");
  });

  it("rejects a phone number when type=email and vice-versa", async () => {
    const a = await readJson(await post(sendOtp, "/api/auth/send-otp", { contact: "9876543210", type: "email" }));
    expect(a).toMatchObject({ status: 400, body: { error: "Email required" } });
    const b = await readJson(await post(sendOtp, "/api/auth/send-otp", { contact: "a@b.com", type: "phone" }));
    expect(b).toMatchObject({ status: 400, body: { error: "Phone number required" } });
  });

  it("enforces a 30s resend cooldown per contact", async () => {
    db.otpToken.findFirst.mockResolvedValue({ createdAt: new Date(Date.now() - 10_000) });
    const { status, body } = await readJson(await post(sendOtp, "/api/auth/send-otp", { contact: "a@b.com" }));
    expect(status).toBe(429);
    expect(body.error).toMatch(/wait/i);
    expect(db.otpToken.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { contact: "a@b.com", purpose: "signup", usedAt: null } })
    );
  });

  it("allows a resend once the cooldown has elapsed", async () => {
    db.otpToken.findFirst.mockResolvedValue({ createdAt: new Date(Date.now() - 31_000) });
    sendEmailMock.mockResolvedValue({ status: "sent" });
    const res = await post(sendOtp, "/api/auth/send-otp", { contact: "a@b.com" });
    expect(res.status).toBe(200);
  });

  it("returns 503 when email is not configured and 502 when sending fails", async () => {
    sendEmailMock.mockResolvedValueOnce({ status: "skipped" });
    expect((await post(sendOtp, "/api/auth/send-otp", { contact: "a@b.com" })).status).toBe(503);
    sendEmailMock.mockResolvedValueOnce({ status: "failed", error: "smtp down" });
    const { status, body } = await readJson(await post(sendOtp, "/api/auth/send-otp", { contact: "a@b.com" }));
    expect(status).toBe(502);
    expect(body.error).toBe("smtp down");
  });

  it("emails a 6-digit code and stores only its bcrypt hash with a 5-minute expiry", async () => {
    sendEmailMock.mockResolvedValue({ status: "sent" });
    const before = Date.now();
    const { status, body } = await readJson(
      await post(sendOtp, "/api/auth/send-otp", { contact: " Person@Example.COM ", purpose: "reset" })
    );
    expect(status).toBe(200);
    expect(body).toEqual({ status: "sent" });

    const email = sendEmailMock.mock.calls[0][0];
    expect(email.to).toBe("person@example.com");
    const code = /code is (\d{6})\./.exec(email.text)?.[1];
    expect(code).toBeDefined();

    const created = db.otpToken.create.mock.calls[0][0].data;
    expect(created.contact).toBe("person@example.com");
    expect(created.purpose).toBe("reset");
    expect(created.codeHash).not.toBe(code);
    expect(await bcrypt.compare(code!, created.codeHash)).toBe(true);
    // 5 minutes from when the route stamped it; allow for slow (instrumented) runs.
    const ttl = created.expiresAt.getTime() - before;
    expect(ttl).toBeGreaterThan(4.9 * 60_000);
    expect(ttl).toBeLessThanOrEqual(5 * 60_000 + 10_000);
  });

  it("returns 502 when the OTP row cannot be stored", async () => {
    sendEmailMock.mockResolvedValue({ status: "sent" });
    db.otpToken.create.mockRejectedValue(new Error("db down"));
    const { status, body } = await readJson(await post(sendOtp, "/api/auth/send-otp", { contact: "a@b.com" }));
    expect(status).toBe(502);
    expect(body.error).toBe("Database unavailable");
  });

  it("infers the phone channel, starts a Twilio SMS verification and stores the sid", async () => {
    startVerificationMock.mockResolvedValue({ status: "sent", sid: "VE1" });
    const { status } = await readJson(await post(sendOtp, "/api/auth/send-otp", { contact: "98765 43210" }));
    expect(status).toBe(200);
    expect(startVerificationMock).toHaveBeenCalledWith("+919876543210", "sms");
    expect(db.otpToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ contact: "+919876543210", codeHash: "", verificationSid: "VE1" })
    });
  });

  it("falls back to WhatsApp when SMS fails", async () => {
    startVerificationMock
      .mockResolvedValueOnce({ status: "failed", error: "sms blocked" })
      .mockResolvedValueOnce({ status: "sent", sid: "VE2" });
    const res = await post(sendOtp, "/api/auth/send-otp", { contact: "+919876543210" });
    expect(res.status).toBe(200);
    expect(startVerificationMock).toHaveBeenNthCalledWith(2, "+919876543210", "whatsapp");
    expect(db.otpToken.create).toHaveBeenCalledWith({ data: expect.objectContaining({ verificationSid: "VE2" }) });
  });

  it("returns 502 with the Twilio error when both channels fail", async () => {
    startVerificationMock.mockResolvedValue({ status: "failed", error: "unreachable" });
    const { status, body } = await readJson(await post(sendOtp, "/api/auth/send-otp", { contact: "+919876543210" }));
    expect(status).toBe(502);
    expect(body.error).toBe("unreachable");
    expect(db.otpToken.create).not.toHaveBeenCalled();
  });

  it("reports Twilio as unconfigured when both channels are skipped", async () => {
    startVerificationMock.mockResolvedValue({ status: "skipped" });
    const { body } = await readJson(await post(sendOtp, "/api/auth/send-otp", { contact: "+919876543210" }));
    expect(body.error).toBe("Twilio Verify not configured");
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/verify-otp
// ---------------------------------------------------------------------------
describe("POST /api/auth/verify-otp", () => {
  const future = () => new Date(Date.now() + 60_000);

  it("rejects cross-origin requests and missing fields", async () => {
    expect(
      (await post(verifyOtp, "/api/auth/verify-otp", { contact: "a@b.com", otp: "1" }, { origin: "https://x.y" })).status
    ).toBe(403);
    const { status, body } = await readJson(await post(verifyOtp, "/api/auth/verify-otp", { contact: "a@b.com" }));
    expect(status).toBe(400);
    expect(body.error).toBe("Contact and OTP required");
  });

  it("returns OTP expired when no live token exists or the token is past expiry", async () => {
    db.otpToken.findFirst.mockResolvedValueOnce(null);
    expect((await readJson(await post(verifyOtp, "/api/auth/verify-otp", { contact: "a@b.com", otp: "1" }))).body.error).toBe(
      "OTP expired"
    );
    db.otpToken.findFirst.mockResolvedValueOnce({ id: "t", attempts: 0, expiresAt: new Date(Date.now() - 1), codeHash: "x" });
    expect((await readJson(await post(verifyOtp, "/api/auth/verify-otp", { contact: "a@b.com", otp: "1" }))).body.error).toBe(
      "OTP expired"
    );
  });

  it("locks the token after 5 attempts", async () => {
    db.otpToken.findFirst.mockResolvedValue({ id: "t", attempts: 5, expiresAt: future(), codeHash: "x" });
    const res = await post(verifyOtp, "/api/auth/verify-otp", { contact: "a@b.com", otp: "111111" });
    expect(res.status).toBe(429);
  });

  it("rejects a token with neither a code hash nor a Twilio sid", async () => {
    db.otpToken.findFirst.mockResolvedValue({ id: "t", attempts: 0, expiresAt: future(), codeHash: "", verificationSid: null });
    const { status, body } = await readJson(await post(verifyOtp, "/api/auth/verify-otp", { contact: "a@b.com", otp: "1" }));
    expect(status).toBe(400);
    expect(body.error).toBe("OTP not available");
  });

  it("increments attempts on a wrong email code and burns the token on the 5th miss", async () => {
    const codeHash = await bcrypt.hash("123456", 4);
    db.otpToken.findFirst.mockResolvedValue({ id: "t", attempts: 4, expiresAt: future(), codeHash, verificationSid: null });
    db.otpToken.update.mockResolvedValue({});
    const { status, body } = await readJson(await post(verifyOtp, "/api/auth/verify-otp", { contact: "a@b.com", otp: "000000" }));
    expect(status).toBe(400);
    expect(body.error).toBe("Invalid OTP");
    expect(db.otpToken.update).toHaveBeenCalledWith({
      where: { id: "t" },
      data: { attempts: 5, usedAt: expect.any(Date) }
    });
  });

  it("does not burn the token on an early miss", async () => {
    const codeHash = await bcrypt.hash("123456", 4);
    db.otpToken.findFirst.mockResolvedValue({ id: "t", attempts: 0, expiresAt: future(), codeHash, verificationSid: null });
    db.otpToken.update.mockResolvedValue({});
    await post(verifyOtp, "/api/auth/verify-otp", { contact: "a@b.com", otp: "000000" });
    expect(db.otpToken.update).toHaveBeenCalledWith({ where: { id: "t" }, data: { attempts: 1, usedAt: undefined } });
  });

  it("verifies a correct email code and returns the token id", async () => {
    const codeHash = await bcrypt.hash("123456", 4);
    db.otpToken.findFirst.mockResolvedValue({ id: "t", attempts: 0, expiresAt: future(), codeHash, verificationSid: null });
    db.otpToken.update.mockResolvedValue({ id: "t" });
    const { status, body } = await readJson(
      await post(verifyOtp, "/api/auth/verify-otp", { contact: "a@b.com", otp: " 123456 " })
    );
    expect(status).toBe(200);
    expect(body).toEqual({ status: "verified", token: "t" });
    expect(db.otpToken.update).toHaveBeenCalledWith({ where: { id: "t" }, data: { verifiedAt: expect.any(Date) } });
  });

  it("delegates phone codes to Twilio Verify", async () => {
    db.otpToken.findFirst.mockResolvedValue({ id: "p", attempts: 0, expiresAt: future(), codeHash: "", verificationSid: "VE1" });
    db.otpToken.update.mockResolvedValue({ id: "p" });

    checkVerificationMock.mockResolvedValueOnce({ status: "skipped", error: "Twilio Verify not configured" });
    expect((await post(verifyOtp, "/api/auth/verify-otp", { contact: "+919876543210", otp: "1" })).status).toBe(503);

    checkVerificationMock.mockResolvedValueOnce({ status: "failed", error: "pending" });
    const bad = await readJson(await post(verifyOtp, "/api/auth/verify-otp", { contact: "+919876543210", otp: "1" }));
    expect(bad.status).toBe(400);
    expect(db.otpToken.update).toHaveBeenLastCalledWith({ where: { id: "p" }, data: { attempts: 1, usedAt: undefined } });

    checkVerificationMock.mockResolvedValueOnce({ status: "sent" });
    const good = await readJson(await post(verifyOtp, "/api/auth/verify-otp", { contact: "+919876543210", otp: "123456" }));
    expect(good.body).toEqual({ status: "verified", token: "p" });
    expect(checkVerificationMock).toHaveBeenLastCalledWith("+919876543210", "123456");
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/register
// ---------------------------------------------------------------------------
describe("POST /api/auth/register", () => {
  const verifiedToken = (contact: string) => ({
    id: "tok",
    contact,
    verifiedAt: new Date(),
    expiresAt: new Date(Date.now() + 60_000),
    usedAt: null
  });

  beforeEach(() => {
    db.user.findFirst.mockResolvedValue(null);
    db.user.create.mockResolvedValue({ id: "new-user" });
    db.otpToken.update.mockResolvedValue({});
  });

  it("rejects cross-origin requests", async () => {
    const res = await post(register, "/api/auth/register", { contact: "a@b.com", password: "longpass1", token: "t" }, { origin: "https://x.y" });
    expect(res.status).toBe(403);
  });

  it("rate limits to 5 registrations per IP", async () => {
    // The limiter runs before token validation, so an unknown token keeps the
    // test fast (no bcrypt) while still exercising the counter.
    db.otpToken.findUnique.mockResolvedValue(null);
    const ip = uniqueIp();
    for (let i = 0; i < 5; i += 1) {
      await register(makeRequest("/api/auth/register", { body: { contact: "a@b.com", password: "longpass1", token: "tok" }, headers: { "x-forwarded-for": ip } }));
    }
    const res = await register(makeRequest("/api/auth/register", { body: { contact: "a@b.com", password: "longpass1", token: "tok" }, headers: { "x-forwarded-for": ip } }));
    expect(res.status).toBe(429);
  });

  it("requires contact, password and token", async () => {
    const { status, body } = await readJson(await post(register, "/api/auth/register", { contact: "a@b.com", password: "longpass1" }));
    expect(status).toBe(400);
    expect(body.error).toBe("Missing fields");
  });

  it("rejects weak passwords before touching the OTP token", async () => {
    const { status, body } = await readJson(await post(register, "/api/auth/register", { contact: "a@b.com", password: "short", token: "tok" }));
    expect(status).toBe(400);
    expect(body.error).toMatch(/at least 8/);
    expect(db.otpToken.findUnique).not.toHaveBeenCalled();
  });

  it("rejects an unknown, mismatched or unverified token", async () => {
    db.otpToken.findUnique.mockResolvedValueOnce(null);
    expect((await readJson(await post(register, "/api/auth/register", { contact: "a@b.com", password: "longpass1", token: "x" }))).body.error).toBe("OTP not verified");
    db.otpToken.findUnique.mockResolvedValueOnce(verifiedToken("other@b.com"));
    expect((await readJson(await post(register, "/api/auth/register", { contact: "a@b.com", password: "longpass1", token: "x" }))).body.error).toBe("OTP not verified");
    db.otpToken.findUnique.mockResolvedValueOnce({ ...verifiedToken("a@b.com"), verifiedAt: null });
    expect((await readJson(await post(register, "/api/auth/register", { contact: "a@b.com", password: "longpass1", token: "x" }))).body.error).toBe("OTP not verified");
  });

  it("rejects expired and already-used tokens", async () => {
    db.otpToken.findUnique.mockResolvedValueOnce({ ...verifiedToken("a@b.com"), expiresAt: new Date(Date.now() - 1) });
    expect((await readJson(await post(register, "/api/auth/register", { contact: "a@b.com", password: "longpass1", token: "x" }))).body.error).toBe("OTP expired");
    db.otpToken.findUnique.mockResolvedValueOnce({ ...verifiedToken("a@b.com"), usedAt: new Date() });
    expect((await readJson(await post(register, "/api/auth/register", { contact: "a@b.com", password: "longpass1", token: "x" }))).body.error).toBe("OTP already used");
  });

  it("refuses to create a duplicate account", async () => {
    db.otpToken.findUnique.mockResolvedValue(verifiedToken("a@b.com"));
    db.user.findFirst.mockResolvedValue({ id: "existing" });
    const { status, body } = await readJson(await post(register, "/api/auth/register", { contact: "a@b.com", password: "longpass1", token: "tok" }));
    expect(status).toBe(400);
    expect(body.error).toBe("User already exists");
    expect(db.user.create).not.toHaveBeenCalled();
  });

  it("creates an email user with a hashed password and consumes the token", async () => {
    db.otpToken.findUnique.mockResolvedValue(verifiedToken("a@b.com"));
    const { status, body } = await readJson(await post(register, "/api/auth/register", { contact: "A@B.com", password: "s3cret!!", token: "tok" }));
    expect(status).toBe(200);
    expect(body).toEqual({ status: "registered" });

    const data = db.user.create.mock.calls[0][0].data;
    expect(data.email).toBe("a@b.com");
    expect(data.phone).toBeNull();
    expect(data.profileComplete).toBe(false);
    expect(data.passwordHash).not.toBe("s3cret!!");
    expect(await bcrypt.compare("s3cret!!", data.passwordHash)).toBe(true);
    expect(db.otpToken.update).toHaveBeenCalledWith({
      where: { id: "tok" },
      data: { usedAt: expect.any(Date), userId: "new-user" }
    });
  });

  it("creates a phone user when the contact is a phone number", async () => {
    db.otpToken.findUnique.mockResolvedValue(verifiedToken("+919876543210"));
    await post(register, "/api/auth/register", { contact: "9876543210", password: "longpass1", token: "tok" });
    const data = db.user.create.mock.calls[0][0].data;
    expect(data.phone).toBe("+919876543210");
    expect(data.email).toBeNull();
  });

  describe("referral completion", () => {
    beforeEach(() => {
      db.otpToken.findUnique.mockResolvedValue(verifiedToken("a@b.com"));
      db.contactInvitation.update.mockResolvedValue({});
      db.contactImport.update.mockResolvedValue({});
      db.connection.create.mockResolvedValue({});
      db.notification.createMany.mockResolvedValue({ count: 2 });
      db.referralLink.updateMany.mockResolvedValue({ count: 1 });
    });

    it("marks the invitation registered, auto-connects both users and notifies them", async () => {
      db.contactInvitation.findUnique.mockResolvedValue({ referralCode: "ABCD1234", status: "clicked", fromUserId: "referrer", toPhone: "+911" });
      db.contactImport.findFirst.mockResolvedValue({ id: "ci-1" });
      db.connection.findFirst.mockResolvedValue(null);

      const res = await post(register, "/api/auth/register", { contact: "a@b.com", password: "longpass1", token: "tok", ref: "abcd1234" });
      expect(res.status).toBe(200);
      expect(db.contactInvitation.findUnique).toHaveBeenCalledWith({ where: { referralCode: "ABCD1234" } });
      expect(db.contactInvitation.update).toHaveBeenCalledWith({
        where: { referralCode: "ABCD1234" },
        data: { status: "registered", registeredUserId: "new-user" }
      });
      expect(db.contactImport.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "ci-1" }, data: expect.objectContaining({ status: "registered", registeredUserId: "new-user" }) })
      );
      expect(db.connection.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ user1Id: "referrer", user2Id: "new-user", status: "accepted" })
      });
      expect(db.notification.createMany).toHaveBeenCalledTimes(1);
      expect(db.referralLink.updateMany).toHaveBeenCalledWith({
        where: { code: "ABCD1234", fromUserId: "referrer" },
        data: { registrations: { increment: 1 } }
      });
    });

    it("does not duplicate an existing connection", async () => {
      db.contactInvitation.findUnique.mockResolvedValue({ referralCode: "X", status: "sent", fromUserId: "referrer", toPhone: "+911" });
      db.contactImport.findFirst.mockResolvedValue(null);
      db.connection.findFirst.mockResolvedValue({ id: "already" });
      await post(register, "/api/auth/register", { contact: "a@b.com", password: "longpass1", token: "tok", ref: "X" });
      expect(db.connection.create).not.toHaveBeenCalled();
      expect(db.notification.createMany).not.toHaveBeenCalled();
    });

    it("ignores an invitation that was already redeemed", async () => {
      db.contactInvitation.findUnique.mockResolvedValue({ referralCode: "X", status: "registered", fromUserId: "r" });
      await post(register, "/api/auth/register", { contact: "a@b.com", password: "longpass1", token: "tok", ref: "X" });
      expect(db.contactInvitation.update).not.toHaveBeenCalled();
      expect(db.connection.create).not.toHaveBeenCalled();
    });

    it("never lets a referral failure block registration", async () => {
      db.contactInvitation.findUnique.mockRejectedValue(new Error("referral db down"));
      const { status, body } = await readJson(await post(register, "/api/auth/register", { contact: "a@b.com", password: "longpass1", token: "tok", ref: "X" }));
      expect(status).toBe(200);
      expect(body).toEqual({ status: "registered" });
    });
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/reset-password
// ---------------------------------------------------------------------------
describe("POST /api/auth/reset-password", () => {
  const verifiedToken = (contact: string) => ({
    id: "rt",
    contact,
    verifiedAt: new Date(),
    expiresAt: new Date(Date.now() + 60_000),
    usedAt: null
  });

  it("rejects cross-origin requests", async () => {
    const res = await post(resetPassword, "/api/auth/reset-password", { contact: "a@b.com", password: "xxxxxxxx", token: "t" }, { origin: "https://x.y" });
    expect(res.status).toBe(403);
  });

  it("rate limits to 5 resets per IP", async () => {
    db.otpToken.findUnique.mockResolvedValue(null);
    const ip = uniqueIp();
    for (let i = 0; i < 5; i += 1) {
      await resetPassword(makeRequest("/api/auth/reset-password", { body: { contact: "a@b.com", password: "xxxxxxxx", token: "t" }, headers: { "x-forwarded-for": ip } }));
    }
    const res = await resetPassword(makeRequest("/api/auth/reset-password", { body: { contact: "a@b.com", password: "xxxxxxxx", token: "t" }, headers: { "x-forwarded-for": ip } }));
    expect(res.status).toBe(429);
  });

  it("rejects weak passwords", async () => {
    const { status, body } = await readJson(await post(resetPassword, "/api/auth/reset-password", { contact: "a@b.com", password: "1234567", token: "t" }));
    expect(status).toBe(400);
    expect(body.error).toMatch(/at least 8/);
    expect(db.otpToken.findUnique).not.toHaveBeenCalled();
  });

  it("validates fields and token state", async () => {
    expect((await post(resetPassword, "/api/auth/reset-password", { contact: "a@b.com", password: "xxxxxxxx" })).status).toBe(400);
    db.otpToken.findUnique.mockResolvedValueOnce(null);
    expect((await readJson(await post(resetPassword, "/api/auth/reset-password", { contact: "a@b.com", password: "xxxxxxxx", token: "t" }))).body.error).toBe("OTP not verified");
    db.otpToken.findUnique.mockResolvedValueOnce({ ...verifiedToken("a@b.com"), expiresAt: new Date(0) });
    expect((await readJson(await post(resetPassword, "/api/auth/reset-password", { contact: "a@b.com", password: "xxxxxxxx", token: "t" }))).body.error).toBe("OTP expired");
    db.otpToken.findUnique.mockResolvedValueOnce({ ...verifiedToken("a@b.com"), usedAt: new Date() });
    expect((await readJson(await post(resetPassword, "/api/auth/reset-password", { contact: "a@b.com", password: "xxxxxxxx", token: "t" }))).body.error).toBe("OTP already used");
  });

  it("returns 404 when no account matches the verified contact", async () => {
    db.otpToken.findUnique.mockResolvedValue(verifiedToken("a@b.com"));
    db.user.findFirst.mockResolvedValue(null);
    const res = await post(resetPassword, "/api/auth/reset-password", { contact: "a@b.com", password: "xxxxxxxx", token: "rt" });
    expect(res.status).toBe(404);
  });

  it("replaces the password hash and consumes the token", async () => {
    db.otpToken.findUnique.mockResolvedValue(verifiedToken("a@b.com"));
    db.user.findFirst.mockResolvedValue({ id: "u1" });
    db.user.update.mockResolvedValue({});
    db.otpToken.update.mockResolvedValue({});
    const { status, body } = await readJson(await post(resetPassword, "/api/auth/reset-password", { contact: "a@b.com", password: "newpassword", token: "rt" }));
    expect(status).toBe(200);
    expect(body).toEqual({ status: "reset" });
    const hash = db.user.update.mock.calls[0][0].data.passwordHash;
    expect(await bcrypt.compare("newpassword", hash)).toBe(true);
    expect(db.otpToken.update).toHaveBeenCalledWith({ where: { id: "rt" }, data: { usedAt: expect.any(Date) } });
  });
});

// ---------------------------------------------------------------------------
// NextAuth options: authorize() + callbacks
// ---------------------------------------------------------------------------
describe("authOptions", () => {
  type Authorize = (credentials: Record<string, string> | undefined, req: { headers?: Record<string, string> }) => Promise<Record<string, unknown> | null>;
  const provider = authOptions.providers[0] as unknown as { authorize?: Authorize; options?: { authorize?: Authorize } };
  const authorize = (provider.options?.authorize ?? provider.authorize) as Authorize;
  const reqFrom = () => ({ headers: { "x-forwarded-for": uniqueIp() } });

  it("uses the JWT session strategy", () => {
    expect(authOptions.session?.strategy).toBe("jwt");
  });

  it("authorize() rejects missing credentials without touching the database", async () => {
    expect(await authorize({ contact: "", password: "x" }, reqFrom())).toBeNull();
    expect(await authorize({ contact: "a@b.com", password: "" }, reqFrom())).toBeNull();
    expect(await authorize(undefined, reqFrom())).toBeNull();
    expect(db.user.findFirst).not.toHaveBeenCalled();
  });

  it("authorize() rate limits login attempts per IP", async () => {
    db.user.findFirst.mockResolvedValue(null);
    const req = reqFrom();
    for (let i = 0; i < 10; i += 1) await authorize({ contact: "a@b.com", password: "x" }, req);
    await expect(authorize({ contact: "a@b.com", password: "x" }, req)).rejects.toThrow(/Too many login attempts/);
  });

  it("authorize() rejects unknown, deactivated and wrong-password users", async () => {
    const hash = await bcrypt.hash("right", 4);
    db.user.findFirst.mockResolvedValueOnce(null);
    expect(await authorize({ contact: "a@b.com", password: "right" }, reqFrom())).toBeNull();
    db.user.findFirst.mockResolvedValueOnce({ id: "u", passwordHash: hash, isDeactivated: true });
    expect(await authorize({ contact: "a@b.com", password: "right" }, reqFrom())).toBeNull();
    db.user.findFirst.mockResolvedValueOnce({ id: "u", passwordHash: hash, isDeactivated: false });
    expect(await authorize({ contact: "a@b.com", password: "wrong" }, reqFrom())).toBeNull();
  });

  it("authorize() returns the session user with profile claims on success", async () => {
    const hash = await bcrypt.hash("right", 4);
    db.user.findFirst.mockResolvedValue({
      id: "u",
      passwordHash: hash,
      isDeactivated: false,
      profileComplete: true,
      displayName: null,
      email: null,
      phone: "+919876543210"
    });
    const user = await authorize({ contact: "98765 43210", password: "right" }, reqFrom());
    expect(user).toEqual({ id: "u", name: "+919876543210", email: undefined, profileComplete: true, isDeactivated: false });
    expect(db.user.findFirst).toHaveBeenCalledWith({
      where: { OR: [{ email: "+919876543210" }, { phone: "+919876543210" }] }
    });
  });

  it("jwt callback copies claims from the user on sign-in without a DB read", async () => {
    const jwt = authOptions.callbacks!.jwt!;
    const token = await jwt({
      token: { sub: "old" },
      user: { id: "u1", profileComplete: false, isDeactivated: false } as never,
      account: null
    } as never);
    expect(token).toMatchObject({ sub: "u1", profileComplete: false, isDeactivated: false });
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });

  it("jwt callback re-reads the database on refresh and ignores client-supplied claims on update()", async () => {
    const jwt = authOptions.callbacks!.jwt!;
    db.user.findUnique.mockResolvedValue({ profileComplete: false, isDeactivated: false });
    const token = await jwt({
      token: { sub: "u1", profileComplete: false },
      trigger: "update",
      session: { profileComplete: true, isDeactivated: false },
      account: null
    } as never);
    expect(token.profileComplete).toBe(false);
    expect(db.user.findUnique).toHaveBeenCalledWith({
      where: { id: "u1" },
      select: { profileComplete: true, isDeactivated: true }
    });
  });

  it("jwt callback keeps existing claims when the user row is gone", async () => {
    const jwt = authOptions.callbacks!.jwt!;
    db.user.findUnique.mockResolvedValue(null);
    const token = await jwt({ token: { sub: "u1", profileComplete: true }, account: null } as never);
    expect(token.profileComplete).toBe(true);
  });

  it("session callback projects token claims onto session.user", async () => {
    const session = authOptions.callbacks!.session!;
    const result = await session({
      session: { user: { name: "x" }, expires: "" },
      token: { sub: "u1", profileComplete: true, isDeactivated: false }
    } as never);
    expect(result.user).toMatchObject({ id: "u1", profileComplete: true, isDeactivated: false });
  });

  it("session callback defaults missing claims to false", async () => {
    const session = authOptions.callbacks!.session!;
    const result = await session({ session: { user: {}, expires: "" }, token: {} } as never);
    expect(result.user).toMatchObject({ id: "", profileComplete: false, isDeactivated: false });
  });
});
