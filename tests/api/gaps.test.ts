/**
 * Branch-coverage sweep for the API layer: every path the main suites left
 * unexercised (distance scoring, fallbacks, secondary failure modes).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ctx, makeRequest, readJson } from "../helpers/http";
import type { PrismaMock } from "../helpers/prismaMock";

vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock } = await import("../helpers/prismaMock");
  return { prisma: createPrismaMock() };
});
vi.mock("next-auth/jwt", () => import("../helpers/auth").then((m) => m.jwtModuleMock));
vi.mock("next-auth/next", () => import("../helpers/auth").then((m) => m.nextAuthNextModuleMock));
vi.mock("@/lib/sendEmail", () => ({ sendEmail: vi.fn() }));
vi.mock("@/lib/twilioVerify", () => ({ startVerification: vi.fn(), checkVerification: vi.fn() }));
// Plain array (not a vi.fn) because NextAuth() runs at module import time,
// before `clearMocks` would wipe a mock's call history.
const nextAuth = vi.hoisted(() => ({ handler: vi.fn(), factoryArgs: [] as unknown[][] }));
vi.mock("next-auth", () => ({
  default: (...args: unknown[]) => {
    nextAuth.factoryArgs.push(args);
    return nextAuth.handler;
  }
}));

import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { startVerification } from "@/lib/twilioVerify";
import { authAs, sessionAs } from "../helpers/auth";
import { GET as discover } from "@/app/api/connections/discover/route";
import { GET as suggestions } from "@/app/api/connections/suggestions/route";
import { GET as userMemories } from "@/app/api/memories/user/[userId]/route";
import { POST as sendOtp } from "@/app/api/auth/send-otp/route";
import { PUT as updatePrivacy } from "@/app/api/users/me/privacy/route";
import { PUT as updateMe } from "@/app/api/users/me/route";
import { GET as syncedContacts, POST as syncContacts } from "@/app/api/contacts/sync/route";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";
import { GET as nextAuthGet, POST as nextAuthPost } from "@/app/api/auth/[...nextauth]/route";
import { POST as addImage, PUT as updateImage } from "@/app/api/events/[id]/images/route";
import { POST as verifyOtp } from "@/app/api/auth/verify-otp/route";
import { GET as eventDetail } from "@/app/api/events/[id]/route";
import { POST as commit } from "@/app/api/events/[id]/commit/route";
import { POST as createEvent } from "@/app/api/events/route";

const db = prisma as unknown as PrismaMock;

let ipCounter = 0;
const uniqueIp = () => `10.9.${Math.floor(ipCounter / 250)}.${(ipCounter++ % 250) + 1}`;

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("NextAuth route", () => {
  it("builds one handler from authOptions and exports it for GET and POST", () => {
    expect(nextAuth.factoryArgs).toEqual([[authOptions]]);
    expect(nextAuthGet).toBe(nextAuth.handler);
    expect(nextAuthPost).toBe(nextAuth.handler);
  });
});

describe("authOptions.authorize name fallback", () => {
  type Authorize = (c: Record<string, string>, r: { headers: Record<string, string> }) => Promise<Record<string, unknown> | null>;
  const provider = authOptions.providers[0] as unknown as { options?: { authorize?: Authorize }; authorize?: Authorize };
  const authorize = (provider.options?.authorize ?? provider.authorize) as Authorize;

  it("prefers displayName, then email, then a generic label", async () => {
    const hash = await bcrypt.hash("longpass1", 4);
    db.user.findFirst.mockResolvedValueOnce({ id: "u", passwordHash: hash, isDeactivated: false, displayName: "Priya", email: "p@x.com", phone: null });
    expect((await authorize({ contact: "p@x.com", password: "longpass1" }, { headers: { "x-forwarded-for": uniqueIp() } }))?.name).toBe("Priya");
    db.user.findFirst.mockResolvedValueOnce({ id: "u", passwordHash: hash, isDeactivated: false, displayName: null, email: null, phone: null });
    expect((await authorize({ contact: "p@x.com", password: "longpass1" }, { headers: { "x-forwarded-for": uniqueIp() } }))?.name).toBe("User");
  });

  it("falls back to 'unknown' when no proxy headers are present", async () => {
    db.user.findFirst.mockResolvedValue(null);
    expect(await authorize({ contact: "p@x.com", password: "longpass1" }, { headers: {} })).toBeNull();
  });
});

describe("GET /api/connections/discover — geo + city branches", () => {
  beforeEach(() => {
    authAs("me");
    db.connection.findMany.mockResolvedValue([]);
  });

  it("scores nearer users higher and labels city matches", async () => {
    db.user.findUnique.mockResolvedValue({ id: "me", city: "Delhi", preferences: ["Music"], lat: 28.6, lng: 77.2 });
    db.user.findMany.mockResolvedValue([
      { id: "far", displayName: "Far", preferences: ["Music"], city: "Mumbai", lat: 19.07, lng: 72.87 },
      { id: "near", displayName: "Near", preferences: ["Music"], city: "Delhi", lat: 28.6, lng: 77.2 },
      { id: "nowhere", displayName: "Nowhere", preferences: ["Music"], city: null, lat: null, lng: null }
    ]);
    const { body } = await readJson<{ results: Array<Record<string, unknown>> }>(await discover(makeRequest("/api/connections/discover")));
    expect(body.results.map((r) => r.userId)).toEqual(["near", "nowhere", "far"]);
    expect(body.results[0].matchReason).toBe("Shared interests: Music");
  });

  it("uses only the city filter when the user has no preferences and the query is short", async () => {
    db.user.findUnique.mockResolvedValue({ id: "me", city: "Pune", preferences: [], lat: null, lng: null });
    db.user.findMany.mockResolvedValue([{ id: "x", displayName: null, email: "x@y.z", preferences: [], city: "Pune", lat: null, lng: null }]);
    const { body } = await readJson<{ results: Array<Record<string, unknown>> }>(await discover(makeRequest("/api/connections/discover?query=p")));
    expect(db.user.findMany.mock.calls[0][0].where.OR).toEqual([{ city: "Pune" }]);
    expect(body.results[0]).toMatchObject({ name: "x@y.z", matchReason: "Nearby in Pune" });
  });

  it("handles a missing profile row gracefully", async () => {
    db.user.findUnique.mockResolvedValue(null);
    const { body } = await readJson(await discover(makeRequest("/api/connections/discover")));
    expect(body).toEqual({ results: [] });
  });

  it("labels users with no overlap and no city as generic suggestions", async () => {
    db.user.findUnique.mockResolvedValue({ id: "me", city: null, preferences: ["Art"], lat: null, lng: null });
    db.user.findMany.mockResolvedValue([{ id: "z", displayName: "Zed", preferences: ["Food"], city: null, lat: null, lng: null }]);
    const { body } = await readJson<{ results: Array<Record<string, unknown>> }>(await discover(makeRequest("/api/connections/discover?query=zed")));
    expect(body.results[0].matchReason).toBe("Suggested for you");
  });
});

describe("GET /api/connections/suggestions — scoring branches", () => {
  const person = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    displayName: id,
    email: null,
    profilePhotoUrl: null,
    lat: null,
    lng: null,
    preferences: [],
    city: null,
    ...extra
  });

  beforeEach(() => {
    authAs("me");
  });

  it("weights distance, shared interests, and keeps the newest shared event title", async () => {
    db.user.findUnique.mockResolvedValue({ lat: 28.6, lng: 77.2, preferences: ["Music", "Art"], city: null });
    db.user.findMany.mockResolvedValue([]); // fallback top-up finds nobody extra
    const old = new Date(Date.now() - 40 * 86_400_000);
    const recent = new Date(Date.now() - 2 * 86_400_000);
    db.eventAttendee.findMany
      .mockResolvedValueOnce([{ eventId: "e1", event: { id: "e1", title: "A", eventDate: recent } }, { eventId: "e2", event: { id: "e2", title: "B", eventDate: old } }])
      .mockResolvedValueOnce([
        { userId: "near", eventId: "e1", user: person("near", { lat: 28.6, lng: 77.2, preferences: ["Music"] }), event: { id: "e1", title: "A", eventDate: recent, category: "Music" } },
        { userId: "near", eventId: "e2", user: person("near", { lat: 28.6, lng: 77.2, preferences: ["Music"] }), event: { id: "e2", title: "B", eventDate: old, category: "Art" } },
        { userId: "far", eventId: "e1", user: person("far", { lat: 12.9, lng: 77.6 }), event: { id: "e1", title: "A", eventDate: recent, category: "Music" } },
        { userId: "ghost", eventId: "e1", user: person("ghost", { displayName: null }), event: { id: "e1", title: "A", eventDate: recent, category: "Music" } }
      ]);
    db.connection.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const { body } = await readJson<{ suggestions: Array<Record<string, unknown>> }>(await suggestions(makeRequest("/api/connections/suggestions")));
    expect(body.suggestions.map((s) => s.userId)).toEqual(["near", "far"]);
    // Older second event does not replace the newest shared title.
    expect(body.suggestions[0]).toMatchObject({ sharedCount: 2, sharedEventTitle: "A", sharedEventId: "e1" });
  });

  it("counts mutual connections in both directions and skips fallback users already suggested or nameless", async () => {
    db.user.findUnique.mockResolvedValue({ lat: null, lng: null, preferences: ["Art"], city: null });
    db.eventAttendee.findMany
      .mockResolvedValueOnce([{ eventId: "e1", event: { id: "e1", title: "A", eventDate: new Date() } }])
      .mockResolvedValueOnce([{ userId: "shared", eventId: "e1", user: person("shared"), event: { id: "e1", title: "A", eventDate: new Date(), category: "Art" } }]);
    db.user.findMany.mockResolvedValue([person("shared"), person("nameless", { displayName: null }), person("fresh", { preferences: ["Art"] })]);
    db.connection.findMany
      .mockResolvedValueOnce([{ user1Id: "me", user2Id: "f1", status: "accepted" }, { user1Id: "f2", user2Id: "me", status: "accepted" }])
      .mockResolvedValueOnce([{ user1Id: "fresh", user2Id: "f1" }, { user1Id: "f2", user2Id: "fresh" }, { user1Id: "shared", user2Id: "stranger" }]);

    const { body } = await readJson<{ suggestions: Array<Record<string, unknown>> }>(await suggestions(makeRequest("/api/connections/suggestions")));
    const ids = body.suggestions.map((s) => s.userId);
    expect(ids).toContain("shared");
    expect(ids).toContain("fresh");
    expect(ids).not.toContain("nameless");
    expect(ids.filter((id) => id === "shared")).toHaveLength(1);
  });
});

describe("GET /api/memories/user/:userId — event mapping", () => {
  it("includes the source event when present", async () => {
    authAs("them");
    db.user.findUnique.mockResolvedValue({ id: "them", profileVisibility: "public" });
    const eventDate = new Date("2026-02-01T00:00:00Z");
    db.memory.findMany.mockResolvedValue([{ id: "m", imageUrl: "u", caption: "c", createdAt: new Date(0), event: { id: "e", title: "T", eventDate, category: "Art" } }]);
    const { body } = await readJson<{ memories: Array<Record<string, unknown>> }>(await userMemories(makeRequest("/api/memories/user/them"), ctx({ userId: "them" })));
    expect(body.memories[0].event).toEqual({ id: "e", title: "T", date: eventDate.toISOString(), category: "Art" });
  });
});

describe("POST /api/auth/send-otp — phone persistence failures", () => {
  const startVerificationMock = vi.mocked(startVerification);

  beforeEach(() => {
    db.otpToken.findFirst.mockResolvedValue(null);
    db.otpToken.create.mockRejectedValue(new Error("db down"));
  });

  it("returns 502 when the SMS verification cannot be recorded", async () => {
    startVerificationMock.mockResolvedValue({ status: "sent", sid: "VE1" });
    const res = await sendOtp(makeRequest("/api/auth/send-otp", { body: { contact: "+919876543210" }, headers: { "x-forwarded-for": uniqueIp() } }));
    expect(res.status).toBe(502);
  });

  it("returns 502 when the WhatsApp fallback cannot be recorded", async () => {
    startVerificationMock.mockResolvedValueOnce({ status: "failed", error: "sms" }).mockResolvedValueOnce({ status: "sent", sid: "VE2" });
    const res = await sendOtp(makeRequest("/api/auth/send-otp", { body: { contact: "+919876543210" }, headers: { "x-forwarded-for": uniqueIp() } }));
    expect(res.status).toBe(502);
  });
});

describe("PUT /api/users/me/privacy and /api/users/me — remaining branches", () => {
  beforeEach(() => {
    authAs("u1");
    db.user.update.mockImplementation(async ({ data }: { data: unknown }) => ({ id: "u1", ...(data as object) }));
  });

  it("updates just the profile visibility and rejects a non-JSON body", async () => {
    await updatePrivacy(makeRequest("/api/users/me/privacy", { method: "PUT", body: { profileVisibility: "private" } }));
    expect(db.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: { profileVisibility: "private" } }));
    expect((await updatePrivacy(makeRequest("/api/users/me/privacy", { method: "PUT", rawBody: "not json" }))).status).toBe(400);
  });

  it("accepts an empty bio, caps preferences at 20 and stores recommendationsEnabled", async () => {
    const prefs = Array.from({ length: 25 }, (_, i) => `p${i}`);
    await updateMe(makeRequest("/api/users/me", { method: "PUT", body: { bio: "", preferences: prefs, recommendationsEnabled: false } }));
    const data = db.user.update.mock.calls[0][0].data;
    expect(data.bio).toBe("");
    expect(data.preferences).toHaveLength(20);
    expect(data.recommendationsEnabled).toBe(false);
  });
});

describe("POST /api/auth/verify-otp — rate limit", () => {
  it("blocks the 16th attempt from one IP within the window", async () => {
    db.otpToken.findFirst.mockResolvedValue(null);
    const ip = uniqueIp();
    for (let i = 0; i < 15; i += 1) {
      const res = await verifyOtp(makeRequest("/api/auth/verify-otp", { body: { contact: "a@b.com", otp: "1" }, headers: { "x-forwarded-for": ip } }));
      expect(res.status).toBe(400);
    }
    const blocked = await verifyOtp(makeRequest("/api/auth/verify-otp", { body: { contact: "a@b.com", otp: "1" }, headers: { "x-forwarded-for": ip } }));
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).toMatch(/^\d+$/);
  });
});

describe("PUT /api/events/:id/images requires auth", () => {
  it("returns 401 for anonymous callers", async () => {
    authAs(null);
    expect((await updateImage(makeRequest("/api/events/e1/images", { method: "PUT", body: { imageId: "i1" } }), ctx({ id: "e1" }))).status).toBe(401);
  });
});

describe("GET /api/events/:id — paid event without a price", () => {
  it("returns a null ticketPrice", async () => {
    authAs(null);
    db.event.findUnique.mockResolvedValue({
      id: "e1", hostId: "h", title: "T", descriptionFull: "d", category: "Art", eventDate: new Date(), startTime: new Date(), endTime: null,
      venueName: "V", address: "A", lat: 1, lng: 2, coverImageUrl: "c", images: [], isFree: false, ticketPrice: null,
      host: { id: "h", displayName: "H", profilePhotoUrl: null }, _count: { attendees: 0 }, attendees: [], tickets: []
    });
    const { body } = await readJson<Record<string, unknown>>(await eventDetail(makeRequest("/api/events/e1"), ctx({ id: "e1" })));
    expect(body.ticketPrice).toBeNull();
    expect(body.isFree).toBe(false);
  });
});

describe("/api/contacts/sync — secondary failures", () => {
  beforeEach(() => {
    sessionAs("me");
    db.contactImport.deleteMany.mockResolvedValue({ count: 0 });
    db.user.findFirst.mockResolvedValue(null);
  });

  it("records a generic message when a non-Error is thrown for a contact", async () => {
    db.contactImport.create.mockRejectedValueOnce("weird");
    const { body } = await readJson<Record<string, unknown>>(await syncContacts(makeRequest("/api/contacts/sync", { body: { contacts: [{ name: "A", phone: "9876543210" }] } })));
    expect(body.errors).toEqual([{ contact: "A", error: "Unknown error" }]);
  });

  it("returns 500 when listing fails", async () => {
    db.contactImport.findMany.mockRejectedValue(new Error("down"));
    expect((await syncedContacts()).status).toBe(500);
  });
});

describe("events — remaining branches", () => {
  beforeEach(() => authAs("host-1"));

  it("POST /api/events/:id/images stores an explicit order index without touching the cover", async () => {
    db.event.findUnique.mockResolvedValue({ hostId: "host-1" });
    db.eventImage.create.mockResolvedValue({ id: "i9" });
    await addImage(makeRequest("/api/events/e1/images", { body: { imageUrl: "u", orderIndex: 4 } }), ctx({ id: "e1" }));
    expect(db.eventImage.count).not.toHaveBeenCalled();
    expect(db.eventImage.create).toHaveBeenCalledWith({ data: { eventId: "e1", imageUrl: "u", isCover: false, orderIndex: 4 } });
    expect(db.event.update).not.toHaveBeenCalled();
  });

  it("GET /api/events/:id renders open-ended events and hides a nameless host's email", async () => {
    db.event.findUnique.mockResolvedValue({
      id: "e1",
      hostId: "host-1",
      title: "T",
      descriptionFull: "d",
      category: "Art",
      eventDate: new Date(2026, 4, 10),
      startTime: new Date(2026, 4, 10, 9, 0),
      endTime: null,
      venueName: "V",
      address: "A",
      lat: 1,
      lng: 2,
      coverImageUrl: "c",
      images: [],
      isFree: true,
      ticketPrice: null,
      host: { id: "host-1", displayName: null, email: "secret@x.com", profilePhotoUrl: null },
      _count: { attendees: 0 },
      attendees: [],
      tickets: []
    });
    const { body } = await readJson<Record<string, unknown>>(await eventDetail(makeRequest("/api/events/e1"), ctx({ id: "e1" })));
    expect(body.time).toBe("09:00 AM");
    expect(body.endTime).toBeNull();
    expect(body.ticketPrice).toBeNull();
    expect(body.host).toEqual({ id: "host-1", name: "Host", photo: null });
    expect(body.revenueTotal).toBe(0);
  });

  it("POST /api/events/:id/commit schedules reminders from eventDate when startTime is missing", async () => {
    authAs("u1");
    const eventDate = new Date(Date.now() + 5 * 86_400_000);
    db.event.findUnique.mockResolvedValue({ id: "e1", title: "T", isFree: true, startTime: null, eventDate, venueName: null, address: null });
    db.eventAttendee.findFirst.mockResolvedValue(null);
    db.eventAttendee.create.mockResolvedValue({});
    db.$executeRaw.mockResolvedValue(1);
    db.user.findUnique.mockResolvedValue({ remindersEnabled: true });
    db.notificationSchedule.createMany.mockResolvedValue({ count: 3 });
    await commit(makeRequest("/api/events/e1/commit", { method: "POST" }), ctx({ id: "e1" }));
    const data = db.notificationSchedule.createMany.mock.calls[0][0].data;
    expect(data[0].sendAt.getTime()).toBe(eventDate.getTime() - 24 * 3_600_000);
    expect(data[0].body).toContain("at the venue");
  });

  it("POST /api/events keeps a supplied cover image", async () => {
    db.event.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "n", ...data }));
    db.eventAttendee.findMany.mockResolvedValue([]);
    db.user.findMany.mockResolvedValue([]);
    await createEvent(
      makeRequest("/api/events", {
        body: { title: "T", category: "Art", eventDate: "2026-12-01", startTime: "10:00", venueName: "V", address: "A", lat: 1, lng: 2, isFree: true, maxAttendees: 5, coverImageUrl: "https://cdn/c.jpg" }
      })
    );
    expect(db.event.create.mock.calls[0][0].data.coverImageUrl).toBe("https://cdn/c.jpg");
  });
});
