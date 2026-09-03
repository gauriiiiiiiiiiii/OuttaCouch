import { beforeEach, describe, expect, it, vi } from "vitest";
import { ctx, makeRequest, readJson } from "../helpers/http";
import type { PrismaMock } from "../helpers/prismaMock";

vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock } = await import("../helpers/prismaMock");
  return { prisma: createPrismaMock() };
});
vi.mock("next-auth/jwt", () => import("../helpers/auth").then((m) => m.jwtModuleMock));
vi.mock("next-auth/next", () => import("../helpers/auth").then((m) => m.nextAuthNextModuleMock));
vi.mock("@/lib/twilioSms", () => ({ sendInvitationMessage: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { sendInvitationMessage } from "@/lib/twilioSms";
import { generateReferralCode } from "@/lib/referralCode";
import { authAs, sessionAs } from "../helpers/auth";
import { GET as referralStats } from "@/app/api/referrals/route";
import { GET as trackReferral, POST as redeemReferral } from "@/app/api/referrals/[code]/route";
import { POST as share } from "@/app/api/referrals/share/route";
import { GET as listContacts, POST as importContacts } from "@/app/api/contacts/route";
import { GET as syncedContacts, POST as syncContacts } from "@/app/api/contacts/sync/route";

const db = prisma as unknown as PrismaMock;
const sendInvite = vi.mocked(sendInvitationMessage);

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("generateReferralCode", () => {
  it("produces 8-char upper-case alphanumerics with no obvious repeats", () => {
    const codes = new Set(Array.from({ length: 500 }, () => generateReferralCode()));
    for (const code of codes) expect(code).toMatch(/^[A-Z0-9]{8}$/);
    expect(codes.size).toBe(500);
  });
});

describe("GET /api/referrals", () => {
  it("requires a session", async () => {
    sessionAs(null);
    expect((await referralStats()).status).toBe(401);
  });

  it("aggregates invitation and link stats", async () => {
    sessionAs("me");
    db.referralLink.findMany.mockResolvedValue([{ clicks: 3, registrations: 1 }, { clicks: 2, registrations: 0 }]);
    db.contactInvitation.findMany.mockResolvedValue([
      { id: "i1", toPhone: "+911", status: "registered", channel: "sms", clickedAt: new Date(), registeredUser: { id: "x", displayName: "X" } },
      { id: "i2", toPhone: "+912", status: "clicked", channel: "sms", clickedAt: new Date(), registeredUser: null },
      { id: "i3", toPhone: "+913", status: "sent", channel: "whatsapp", clickedAt: null, registeredUser: null }
    ]);
    const { body } = await readJson<{ stats: Record<string, number> }>(await referralStats());
    expect(body.stats).toEqual({ totalInvitations: 3, clicked: 2, registered: 1, totalClicks: 5, totalRegistrations: 1 });
  });

  it("returns 500 on a database failure", async () => {
    sessionAs("me");
    db.referralLink.findMany.mockRejectedValue(new Error("down"));
    expect((await referralStats()).status).toBe(500);
  });
});

describe("GET /api/referrals/:code", () => {
  const invitation = (status: string) => ({
    id: "i1",
    fromUserId: "referrer",
    toPhone: "+919876543210",
    status,
    fromUser: { id: "referrer", displayName: "Ref", profilePhotoUrl: null }
  });

  it("404s for unknown codes and 400s for redeemed ones", async () => {
    db.contactInvitation.findUnique.mockResolvedValueOnce(null);
    expect((await trackReferral(makeRequest("/api/referrals/abc"), ctx({ code: "abc" }))).status).toBe(404);
    db.contactInvitation.findUnique.mockResolvedValueOnce(invitation("registered"));
    expect((await trackReferral(makeRequest("/api/referrals/abc"), ctx({ code: "abc" }))).status).toBe(400);
  });

  it("records the first click (case-insensitively) and returns the referrer", async () => {
    db.contactInvitation.findUnique.mockResolvedValue(invitation("sent"));
    db.contactInvitation.update.mockResolvedValue({});
    db.referralLink.updateMany.mockResolvedValue({ count: 1 });
    const { status, body } = await readJson(await trackReferral(makeRequest("/api/referrals/abcd1234"), ctx({ code: "abcd1234" })));
    expect(status).toBe(200);
    expect(body).toMatchObject({ code: "ABCD1234", invitedPhone: "+919876543210", fromUser: { id: "referrer", displayName: "Ref" } });
    expect(db.contactInvitation.update).toHaveBeenCalledWith({
      where: { referralCode: "ABCD1234" },
      data: { status: "clicked", clickedAt: expect.any(Date) }
    });
    expect(db.referralLink.updateMany).toHaveBeenCalledWith({ where: { code: "ABCD1234", fromUserId: "referrer" }, data: { clicks: { increment: 1 } } });
  });

  it("does not double-count repeat clicks", async () => {
    db.contactInvitation.findUnique.mockResolvedValue(invitation("clicked"));
    await trackReferral(makeRequest("/api/referrals/ABCD1234"), ctx({ code: "ABCD1234" }));
    expect(db.contactInvitation.update).not.toHaveBeenCalled();
    expect(db.referralLink.updateMany).not.toHaveBeenCalled();
  });

  it("returns 500 on a database failure", async () => {
    db.contactInvitation.findUnique.mockRejectedValue(new Error("down"));
    expect((await trackReferral(makeRequest("/api/referrals/ABCD1234"), ctx({ code: "ABCD1234" }))).status).toBe(500);
  });
});

describe("POST /api/referrals/:code (redeem as the signed-in user)", () => {
  const invitation = (overrides: Record<string, unknown> = {}) => ({
    id: "i1",
    fromUserId: "referrer",
    toPhone: "+911",
    status: "clicked",
    referralCode: "ABCD1234",
    ...overrides
  });

  beforeEach(() => {
    db.contactInvitation.update.mockResolvedValue({});
    db.contactImport.update.mockResolvedValue({});
    db.connection.create.mockResolvedValue({});
    db.notification.create.mockResolvedValue({});
    db.referralLink.updateMany.mockResolvedValue({ count: 1 });
  });

  it("requires auth and ignores any user id in the body", async () => {
    authAs(null);
    const res = await redeemReferral(makeRequest("/api/referrals/ABCD1234", { body: { newUserId: "victim" } }), ctx({ code: "ABCD1234" }));
    expect(res.status).toBe(401);
    expect(db.contactInvitation.findUnique).not.toHaveBeenCalled();
  });

  it("404s unknown codes, 409s redeemed ones and 400s self-redemption", async () => {
    authAs("me");
    db.contactInvitation.findUnique.mockResolvedValueOnce(null);
    expect((await redeemReferral(makeRequest("/api/referrals/X", { method: "POST" }), ctx({ code: "X" }))).status).toBe(404);
    db.contactInvitation.findUnique.mockResolvedValueOnce(invitation({ status: "registered" }));
    expect((await redeemReferral(makeRequest("/api/referrals/X", { method: "POST" }), ctx({ code: "X" }))).status).toBe(409);
    db.contactInvitation.findUnique.mockResolvedValueOnce(invitation({ fromUserId: "me" }));
    expect((await redeemReferral(makeRequest("/api/referrals/X", { method: "POST" }), ctx({ code: "X" }))).status).toBe(400);
    expect(db.contactInvitation.update).not.toHaveBeenCalled();
  });

  it("links the invitation to the caller, connects both users and notifies them", async () => {
    authAs("me");
    db.contactInvitation.findUnique.mockResolvedValue(invitation());
    db.contactImport.findFirst.mockResolvedValue({ id: "ci-1" });
    db.connection.findFirst.mockResolvedValue(null);

    const { status, body } = await readJson(
      await redeemReferral(makeRequest("/api/referrals/abcd1234", { body: { newUserId: "victim" } }), ctx({ code: "abcd1234" }))
    );
    expect(status).toBe(200);
    expect(body).toEqual({ message: "Registration completed", connection: { created: true } });
    expect(db.contactInvitation.update).toHaveBeenCalledWith({
      where: { referralCode: "ABCD1234" },
      data: { status: "registered", registeredUserId: "me" }
    });
    expect(db.contactImport.update).toHaveBeenCalledWith({
      where: { id: "ci-1" },
      data: { status: "registered", registeredUserId: "me", registeredAt: expect.any(Date) }
    });
    expect(db.connection.create).toHaveBeenCalledWith({
      data: { user1Id: "referrer", user2Id: "me", status: "accepted", acceptedAt: expect.any(Date) }
    });
    expect(db.notification.create).toHaveBeenCalledTimes(2);
    expect(db.notification.create).toHaveBeenCalledWith({ data: expect.objectContaining({ userId: "me", title: "Connected!" }) });
    expect(db.referralLink.updateMany).toHaveBeenCalledWith({ where: { code: "ABCD1234", fromUserId: "referrer" }, data: { registrations: { increment: 1 } } });
  });

  it("does not touch an already-accepted connection", async () => {
    authAs("me");
    db.contactInvitation.findUnique.mockResolvedValue(invitation());
    db.contactImport.findFirst.mockResolvedValue(null);
    db.connection.findFirst.mockResolvedValue({ id: "existing", status: "accepted" });
    const { body } = await readJson(await redeemReferral(makeRequest("/api/referrals/ABCD1234", { method: "POST" }), ctx({ code: "ABCD1234" })));
    expect(body).toEqual({ message: "Registration completed", connection: { created: false } });
    expect(db.connection.create).not.toHaveBeenCalled();
    expect(db.connection.update).not.toHaveBeenCalled();
    expect(db.notification.create).not.toHaveBeenCalled();
  });

  it("re-activates a removed or declined connection instead of leaving it dormant", async () => {
    authAs("me");
    db.contactInvitation.findUnique.mockResolvedValue(invitation());
    db.contactImport.findFirst.mockResolvedValue(null);
    db.connection.findFirst.mockResolvedValue({ id: "dormant", status: "removed" });
    db.connection.update.mockResolvedValue({});
    const { body } = await readJson(await redeemReferral(makeRequest("/api/referrals/ABCD1234", { method: "POST" }), ctx({ code: "ABCD1234" })));
    expect(body).toEqual({ message: "Registration completed", connection: { created: true } });
    expect(db.connection.update).toHaveBeenCalledWith({ where: { id: "dormant" }, data: { status: "accepted", acceptedAt: expect.any(Date) } });
    expect(db.connection.create).not.toHaveBeenCalled();
    expect(db.notification.create).toHaveBeenCalledTimes(2);
  });

  it("returns 500 on a database failure", async () => {
    authAs("me");
    db.contactInvitation.findUnique.mockRejectedValue(new Error("down"));
    expect((await redeemReferral(makeRequest("/api/referrals/X", { method: "POST" }), ctx({ code: "X" }))).status).toBe(500);
  });
});

describe("POST /api/referrals/share", () => {
  beforeEach(() => {
    sessionAs("me");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://outta.test");
    db.user.findUnique.mockResolvedValue({ displayName: "Priya" });
    db.contactInvitation.findFirst.mockResolvedValue(null);
    db.referralLink.findFirst.mockResolvedValue(null);
    db.contactInvitation.create.mockImplementation(async ({ data }: { data: unknown }) => ({ id: "inv-1", ...(data as object) }));
    db.referralLink.create.mockResolvedValue({});
    db.contactImport.updateMany.mockResolvedValue({ count: 1 });
    sendInvite.mockResolvedValue({ status: "sent", sid: "SM1" });
  });

  it("requires a session and at least one phone or contact id", async () => {
    sessionAs(null);
    expect((await share(makeRequest("/api/referrals/share", { body: { phones: ["+911"] } }))).status).toBe(401);
    sessionAs("me");
    expect((await share(makeRequest("/api/referrals/share", { body: {} }))).status).toBe(400);
    db.user.findUnique.mockResolvedValueOnce(null);
    expect((await share(makeRequest("/api/referrals/share", { body: { phones: ["+919876543210"] } }))).status).toBe(404);
  });

  it("normalises phones, drops garbage and 400s when nothing valid remains", async () => {
    const { status, body } = await readJson(await share(makeRequest("/api/referrals/share", { body: { phones: ["abc", "not@phone.com", "12"] } })));
    expect(status).toBe(400);
    expect(body.error).toBe("No valid phone numbers to invite");
  });

  it("creates an invitation + link per new phone, sends the join link and marks contacts invited", async () => {
    db.contactImport.findMany.mockResolvedValue([{ phone: "+919999999999" }]);
    const { status, body } = await readJson<{ invitations: Array<Record<string, unknown>> }>(
      await share(makeRequest("/api/referrals/share", { body: { phones: ["98765 43210", "+919876543210"], contactIds: ["ci-1"], channel: "whatsapp" } }))
    );
    expect(status).toBe(200);
    expect(body.invitations).toHaveLength(2);
    expect(body.invitations.map((i) => i.phone)).toEqual(["+919876543210", "+919999999999"]);
    for (const inv of body.invitations) {
      expect(inv.status).toBe("sent");
      expect(inv.referralCode).toMatch(/^[A-Z0-9]{8}$/);
    }

    expect(db.contactImport.findMany).toHaveBeenCalledWith({ where: { id: { in: ["ci-1"] }, userId: "me" }, select: { phone: true } });
    expect(db.contactInvitation.create).toHaveBeenCalledTimes(2);
    expect(db.contactInvitation.create.mock.calls[0][0].data).toMatchObject({ fromUserId: "me", toPhone: "+919876543210", channel: "whatsapp", sentAt: expect.any(Date) });
    expect(db.referralLink.create).toHaveBeenCalledWith({ data: { code: body.invitations[0].referralCode, fromUserId: "me", type: "contact" } });
    expect(sendInvite).toHaveBeenCalledWith("+919876543210", `https://outta.test/join?ref=${body.invitations[0].referralCode}`, "whatsapp", "Priya");
    expect(db.contactImport.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["ci-1"] }, userId: "me" },
      data: { invitedAt: expect.any(Date), status: "invited" }
    });
  });

  it("reuses an existing invitation instead of re-sending", async () => {
    db.contactInvitation.findFirst.mockResolvedValue({ id: "old", referralCode: "OLDCODE1" });
    const { body } = await readJson<{ invitations: Array<Record<string, unknown>> }>(await share(makeRequest("/api/referrals/share", { body: { phones: ["+919876543210"] } })));
    expect(body.invitations).toEqual([{ id: "old", phone: "+919876543210", referralCode: "OLDCODE1", status: "already-invited" }]);
    expect(db.contactInvitation.create).not.toHaveBeenCalled();
    expect(sendInvite).not.toHaveBeenCalled();
  });

  it("regenerates the code on a collision and defaults the channel to sms", async () => {
    db.referralLink.findFirst.mockResolvedValueOnce({ code: "TAKEN" }).mockResolvedValueOnce(null);
    await share(makeRequest("/api/referrals/share", { body: { phones: ["+919876543210"], channel: "carrier-pigeon" } }));
    expect(db.referralLink.findFirst).toHaveBeenCalledTimes(2);
    expect(sendInvite).toHaveBeenCalledWith(expect.any(String), expect.any(String), "sms", "Priya");
  });

  it("returns 500 on a database failure", async () => {
    db.contactInvitation.findFirst.mockRejectedValue(new Error("down"));
    expect((await share(makeRequest("/api/referrals/share", { body: { phones: ["+919876543210"] } }))).status).toBe(500);
  });
});

describe("/api/contacts (manual import)", () => {
  beforeEach(() => authAs("me"));

  it("requires auth", async () => {
    authAs(null);
    expect((await importContacts(makeRequest("/api/contacts", { body: { contacts: [{ phone: "1" }] } }))).status).toBe(401);
    expect((await listContacts(makeRequest("/api/contacts"))).status).toBe(401);
  });

  it("validates the payload", async () => {
    expect((await importContacts(makeRequest("/api/contacts", { body: { contacts: [] } }))).status).toBe(400);
    expect((await importContacts(makeRequest("/api/contacts", { body: { contacts: "x" } }))).status).toBe(400);
    const tooMany = Array.from({ length: 501 }, (_, i) => ({ phone: `98765${String(i).padStart(5, "0")}` }));
    const { status, body } = await readJson(await importContacts(makeRequest("/api/contacts", { body: { contacts: tooMany } })));
    expect(status).toBe(400);
    expect(body.error).toBe("Maximum 500 contacts allowed");
  });

  it("normalises, skips invalid and already-imported numbers, and batch-inserts the rest", async () => {
    db.contactImport.findUnique.mockImplementation(async ({ where }: { where: { userId_phone: { phone: string } } }) =>
      where.userId_phone.phone === "+919999999999" ? { id: "dup" } : null
    );
    db.contactImport.createMany.mockResolvedValue({ count: 1 });
    const { body } = await readJson(
      await importContacts(makeRequest("/api/contacts", { body: { contacts: [{ name: "A", phone: "98765 43210" }, { name: "B", phone: "9999999999" }, { phone: "abc" }] } }))
    );
    expect(body).toMatchObject({ imported: 1, duplicates: 1, invalid: 1, total: 3 });
    expect(db.contactImport.createMany).toHaveBeenCalledWith({
      data: [{ userId: "me", phone: "+919876543210", name: "A", status: "pending" }],
      skipDuplicates: true
    });
  });

  it("lists contacts with status counts", async () => {
    db.contactImport.findMany.mockResolvedValue([{ status: "pending" }, { status: "invited" }, { status: "registered" }, { status: "registered" }]);
    const { body } = await readJson<{ stats: Record<string, number> }>(await listContacts(makeRequest("/api/contacts")));
    expect(body.stats).toEqual({ total: 4, pending: 1, invited: 1, registered: 2 });
  });

  it("returns 500 on database failures", async () => {
    db.contactImport.findMany.mockRejectedValue(new Error("down"));
    expect((await listContacts(makeRequest("/api/contacts"))).status).toBe(500);
    db.contactImport.findUnique.mockRejectedValue(new Error("down"));
    expect((await importContacts(makeRequest("/api/contacts", { body: { contacts: [{ phone: "9876543210" }] } }))).status).toBe(500);
  });
});

describe("/api/contacts/sync (device sync)", () => {
  beforeEach(() => {
    sessionAs("me");
    db.contactImport.deleteMany.mockResolvedValue({ count: 0 });
    db.contactImport.create.mockImplementation(async ({ data }: { data: unknown }) => ({ id: "ci", ...(data as object) }));
    db.connection.findFirst.mockResolvedValue(null);
    db.connection.create.mockResolvedValue({});
    db.notification.create.mockResolvedValue({});
  });

  it("requires a session and a contacts array", async () => {
    sessionAs(null);
    expect((await syncContacts(makeRequest("/api/contacts/sync", { body: { contacts: [] } }))).status).toBe(401);
    expect((await syncedContacts()).status).toBe(401);
    sessionAs("me");
    expect((await syncContacts(makeRequest("/api/contacts/sync", { body: { contacts: [] } }))).status).toBe(400);
  });

  it("replaces the import set, flags registered users and auto-connects them", async () => {
    db.user.findFirst.mockImplementation(async ({ where }: { where: { phone: string } }) =>
      where.phone === "+919876543210" ? { id: "friend", displayName: "Friend", isDeactivated: false } : null
    );
    const { body } = await readJson<Record<string, unknown>>(
      await syncContacts(makeRequest("/api/contacts/sync", { body: { contacts: [{ name: "F", phone: "9876543210" }, { name: "N", phone: "9111111111" }, { name: "Bad", phone: "x" }] } }))
    );
    expect(db.contactImport.deleteMany).toHaveBeenCalledWith({ where: { userId: "me" } });
    expect(body).toMatchObject({ syncedCount: 2, errorCount: 1 });
    expect(body.errors).toEqual([{ contact: "Bad", error: "Invalid phone format" }]);
    expect(db.contactImport.create).toHaveBeenCalledWith({
      data: { userId: "me", name: "F", phone: "+919876543210", status: "registered", registeredUserId: "friend" }
    });
    expect(db.contactImport.create).toHaveBeenCalledWith({
      data: { userId: "me", name: "N", phone: "+919111111111", status: "pending", registeredUserId: null }
    });
    expect(db.connection.create).toHaveBeenCalledWith({
      data: { user1Id: "me", user2Id: "friend", status: "accepted", acceptedAt: expect.any(Date) }
    });
    expect(db.notification.create).toHaveBeenCalledTimes(2);
  });

  it("does not connect deactivated users or duplicate an existing connection", async () => {
    db.user.findFirst.mockResolvedValueOnce({ id: "gone", displayName: "Gone", isDeactivated: true }).mockResolvedValueOnce({ id: "friend", displayName: "F", isDeactivated: false });
    db.connection.findFirst.mockResolvedValue({ id: "existing" });
    await syncContacts(makeRequest("/api/contacts/sync", { body: { contacts: [{ name: "G", phone: "9876543210" }, { name: "F", phone: "9111111111" }] } }));
    expect(db.connection.create).not.toHaveBeenCalled();
  });

  it("captures per-contact failures without aborting the sync", async () => {
    db.user.findFirst.mockResolvedValue(null);
    db.contactImport.create.mockRejectedValueOnce(new Error("unique violation")).mockResolvedValueOnce({ id: "ok" });
    const { status, body } = await readJson<Record<string, unknown>>(
      await syncContacts(makeRequest("/api/contacts/sync", { body: { contacts: [{ name: "A", phone: "9876543210" }, { name: "B", phone: "9111111111" }] } }))
    );
    expect(status).toBe(200);
    expect(body).toMatchObject({ syncedCount: 1, errorCount: 1 });
    expect(body.errors).toEqual([{ contact: "A", error: "unique violation" }]);
  });

  it("returns 500 when the initial purge fails", async () => {
    db.contactImport.deleteMany.mockRejectedValue(new Error("down"));
    expect((await syncContacts(makeRequest("/api/contacts/sync", { body: { contacts: [{ name: "A", phone: "9876543210" }] } }))).status).toBe(500);
  });

  it("GET returns synced contacts with stats", async () => {
    db.contactImport.findMany.mockResolvedValue([{ status: "registered" }, { status: "pending" }]);
    const { body } = await readJson<{ stats: Record<string, number> }>(await syncedContacts());
    expect(db.contactImport.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "me" }, orderBy: { name: "asc" } }));
    expect(body.stats).toEqual({ total: 2, registered: 1, invited: 0, pending: 1 });
  });
});
