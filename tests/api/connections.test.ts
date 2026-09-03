import { beforeEach, describe, expect, it, vi } from "vitest";
import { ctx, makeRequest, readJson } from "../helpers/http";
import type { PrismaMock } from "../helpers/prismaMock";

vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock } = await import("../helpers/prismaMock");
  return { prisma: createPrismaMock() };
});
vi.mock("next-auth/jwt", () => import("../helpers/auth").then((m) => m.jwtModuleMock));
vi.mock("@/lib/notifications", () => ({ sendNotificationEmail: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { sendNotificationEmail } from "@/lib/notifications";
import { authAs } from "../helpers/auth";
import { GET as listConnections } from "@/app/api/connections/route";
import { DELETE as removeConnection } from "@/app/api/connections/[id]/route";
import { PUT as accept } from "@/app/api/connections/[id]/accept/route";
import { PUT as decline } from "@/app/api/connections/[id]/decline/route";
import { POST as requestConnection } from "@/app/api/connections/request/[userId]/route";
import { GET as incomingRequests } from "@/app/api/connections/requests/route";
import { GET as discover } from "@/app/api/connections/discover/route";
import { GET as suggestions } from "@/app/api/connections/suggestions/route";

const db = prisma as unknown as PrismaMock;
const email = vi.mocked(sendNotificationEmail);

describe("GET /api/connections", () => {
  it("requires auth", async () => {
    authAs(null);
    expect((await listConnections(makeRequest("/api/connections"))).status).toBe(401);
  });

  it("returns the other party of each accepted connection, dropping nameless users", async () => {
    authAs("me");
    db.connection.findMany.mockResolvedValue([
      { id: "c1", user1Id: "me", user2Id: "a", user1: {}, user2: { id: "a", displayName: "Alice", profilePhotoUrl: "p" } },
      { id: "c2", user1Id: "b", user2Id: "me", user1: { id: "b", displayName: null, email: null, phone: "+911" }, user2: {} },
      { id: "c3", user1Id: "me", user2Id: "c", user1: {}, user2: { id: "c", displayName: null, email: null, phone: null } }
    ]);
    const { body } = await readJson<{ connections: unknown[] }>(await listConnections(makeRequest("/api/connections")));
    expect(db.connection.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: "accepted", OR: [{ user1Id: "me" }, { user2Id: "me" }] } })
    );
    expect(body.connections).toEqual([
      { id: "c1", userId: "a", name: "Alice", photo: "p" },
      { id: "c2", userId: "b", name: "+911", photo: undefined }
    ]);
  });
});

describe("DELETE /api/connections/:id", () => {
  it("requires auth, existence and participation", async () => {
    authAs(null);
    expect((await removeConnection(makeRequest("/api/connections/c1", { method: "DELETE" }), ctx({ id: "c1" }))).status).toBe(401);
    authAs("me");
    db.connection.findUnique.mockResolvedValueOnce(null);
    expect((await removeConnection(makeRequest("/api/connections/c1", { method: "DELETE" }), ctx({ id: "c1" }))).status).toBe(404);
    db.connection.findUnique.mockResolvedValueOnce({ id: "c1", user1Id: "a", user2Id: "b", status: "accepted" });
    expect((await removeConnection(makeRequest("/api/connections/c1", { method: "DELETE" }), ctx({ id: "c1" }))).status).toBe(403);
  });

  it("soft-removes and is idempotent", async () => {
    authAs("me");
    db.connection.findUnique.mockResolvedValueOnce({ id: "c1", user1Id: "me", user2Id: "b", status: "accepted" });
    db.connection.update.mockResolvedValue({ status: "removed" });
    const { body } = await readJson(await removeConnection(makeRequest("/api/connections/c1", { method: "DELETE" }), ctx({ id: "c1" })));
    expect(body).toEqual({ status: "removed" });
    expect(db.connection.update).toHaveBeenCalledWith({ where: { id: "c1" }, data: { status: "removed" } });

    db.connection.findUnique.mockResolvedValueOnce({ id: "c1", user1Id: "me", user2Id: "b", status: "removed" });
    db.connection.update.mockClear();
    const again = await readJson(await removeConnection(makeRequest("/api/connections/c1", { method: "DELETE" }), ctx({ id: "c1" })));
    expect(again.body).toEqual({ status: "removed" });
    expect(db.connection.update).not.toHaveBeenCalled();
  });
});

describe("PUT /api/connections/:id/accept", () => {
  const pending = { id: "c1", user1Id: "requester", user2Id: "me", status: "pending" };

  beforeEach(() => {
    db.connection.update.mockResolvedValue({ id: "c1", status: "accepted" });
    db.message.findFirst.mockResolvedValue(null);
    db.message.create.mockResolvedValue({});
    db.notification.create.mockResolvedValue({});
    db.user.findUnique.mockResolvedValue({ email: "req@x.com" });
  });

  it("only the recipient of a pending request may accept", async () => {
    authAs(null);
    expect((await accept(makeRequest("/api/connections/c1/accept", { method: "PUT" }), ctx({ id: "c1" }))).status).toBe(401);
    authAs("requester");
    db.connection.findUnique.mockResolvedValueOnce(pending);
    expect((await accept(makeRequest("/api/connections/c1/accept", { method: "PUT" }), ctx({ id: "c1" }))).status).toBe(403);
    authAs("me");
    db.connection.findUnique.mockResolvedValueOnce(null);
    expect((await accept(makeRequest("/api/connections/c1/accept", { method: "PUT" }), ctx({ id: "c1" }))).status).toBe(403);
    db.connection.findUnique.mockResolvedValueOnce({ ...pending, status: "removed" });
    const notPending = await readJson(await accept(makeRequest("/api/connections/c1/accept", { method: "PUT" }), ctx({ id: "c1" })));
    expect(notPending.status).toBe(409);
    expect(db.connection.update).not.toHaveBeenCalled();
  });

  it("accepts, seeds the thread, notifies and emails the requester", async () => {
    authAs("me");
    db.connection.findUnique.mockResolvedValue(pending);
    const { status, body } = await readJson(await accept(makeRequest("/api/connections/c1/accept", { method: "PUT" }), ctx({ id: "c1" })));
    expect(status).toBe(200);
    expect(body).toEqual({ status: "accepted" });
    expect(db.connection.update).toHaveBeenCalledWith({ where: { id: "c1" }, data: { status: "accepted", acceptedAt: expect.any(Date) } });
    expect(db.message.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ connectionId: "c1", senderId: "me", type: "text" })
    });
    expect(db.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: "requester", title: "Connection accepted", link: "/connections" })
    });
    expect(email).toHaveBeenCalledWith(expect.objectContaining({ to: "req@x.com", subject: "Connection accepted" }));
  });

  it("does not seed a second welcome message or email a phone-only requester", async () => {
    authAs("me");
    db.connection.findUnique.mockResolvedValue(pending);
    db.message.findFirst.mockResolvedValue({ id: "m1" });
    db.user.findUnique.mockResolvedValue({ email: null });
    await accept(makeRequest("/api/connections/c1/accept", { method: "PUT" }), ctx({ id: "c1" }));
    expect(db.message.create).not.toHaveBeenCalled();
    expect(email).not.toHaveBeenCalled();
  });
});

describe("PUT /api/connections/:id/decline", () => {
  it("only the recipient of a pending request may decline", async () => {
    authAs(null);
    expect((await decline(makeRequest("/api/connections/c1/decline", { method: "PUT" }), ctx({ id: "c1" }))).status).toBe(401);
    authAs("me");
    db.connection.findUnique.mockResolvedValueOnce({ id: "c1", user1Id: "me", user2Id: "x", status: "pending" });
    expect((await decline(makeRequest("/api/connections/c1/decline", { method: "PUT" }), ctx({ id: "c1" }))).status).toBe(403);
    db.connection.findUnique.mockResolvedValueOnce({ id: "c1", user1Id: "x", user2Id: "me", status: "accepted" });
    expect((await decline(makeRequest("/api/connections/c1/decline", { method: "PUT" }), ctx({ id: "c1" }))).status).toBe(409);
  });

  it("declines a pending request", async () => {
    authAs("me");
    db.connection.findUnique.mockResolvedValue({ id: "c1", user1Id: "x", user2Id: "me", status: "pending" });
    db.connection.update.mockResolvedValue({ status: "declined" });
    const { body } = await readJson(await decline(makeRequest("/api/connections/c1/decline", { method: "PUT" }), ctx({ id: "c1" })));
    expect(body).toEqual({ status: "declined" });
    expect(db.connection.update).toHaveBeenCalledWith({ where: { id: "c1" }, data: { status: "declined" } });
  });
});

describe("POST /api/connections/request/:userId", () => {
  const target = { id: "them", email: "them@x.com", displayName: "Them", isDeactivated: false };

  beforeEach(() => {
    db.user.findUnique.mockResolvedValue(target);
    db.connection.findFirst.mockResolvedValue(null);
    db.connection.create.mockImplementation(async ({ data }: { data: unknown }) => ({ id: "c-new", ...(data as object) }));
    db.connection.update.mockResolvedValue({ id: "c-old", status: "accepted" });
    db.message.findFirst.mockResolvedValue(null);
    db.message.create.mockResolvedValue({});
    db.notification.create.mockResolvedValue({});
  });

  it("requires auth, a real active target and not yourself", async () => {
    authAs(null);
    expect((await requestConnection(makeRequest("/api/connections/request/them", { method: "POST" }), ctx({ userId: "them" }))).status).toBe(401);
    authAs("me");
    const self = await readJson(await requestConnection(makeRequest("/api/connections/request/me", { method: "POST" }), ctx({ userId: "me" })));
    expect(self.status).toBe(400);
    db.user.findUnique.mockResolvedValueOnce(null);
    expect((await requestConnection(makeRequest("/api/connections/request/ghost", { method: "POST" }), ctx({ userId: "ghost" }))).status).toBe(404);
    db.user.findUnique.mockResolvedValueOnce({ ...target, isDeactivated: true });
    expect((await requestConnection(makeRequest("/api/connections/request/them", { method: "POST" }), ctx({ userId: "them" }))).status).toBe(404);
    expect(db.connection.create).not.toHaveBeenCalled();
  });

  it("creates a pending request anchored to a shared event and notifies the target", async () => {
    authAs("me");
    const { status, body } = await readJson(
      await requestConnection(makeRequest("/api/connections/request/them", { body: { sharedEventId: "e1" } }), ctx({ userId: "them" }))
    );
    expect(status).toBe(200);
    expect(body).toEqual({ status: "pending", id: "c-new" });
    expect(db.connection.findFirst).toHaveBeenCalledWith({
      where: { OR: [{ user1Id: "me", user2Id: "them" }, { user1Id: "them", user2Id: "me" }] }
    });
    expect(db.connection.create).toHaveBeenCalledWith({
      data: { user1Id: "me", user2Id: "them", status: "pending", sharedEventId: "e1" }
    });
    expect(db.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: "them", title: "New connection request" })
    });
    expect(email).toHaveBeenCalledWith(expect.objectContaining({ to: "them@x.com", subject: "New connection request" }));
  });

  it("tolerates a missing or malformed body", async () => {
    authAs("me");
    const res = await requestConnection(makeRequest("/api/connections/request/them", { method: "POST", rawBody: "{{" }), ctx({ userId: "them" }));
    expect(res.status).toBe(200);
    expect(db.connection.create).toHaveBeenCalledWith({ data: expect.objectContaining({ sharedEventId: null }) });
  });

  it("auto-accepts when the target already sent me a pending request", async () => {
    authAs("me");
    db.connection.findFirst.mockResolvedValue({ id: "c-old", user1Id: "them", user2Id: "me", status: "pending" });
    const { body } = await readJson(await requestConnection(makeRequest("/api/connections/request/them", { method: "POST" }), ctx({ userId: "them" })));
    expect(body).toEqual({ status: "accepted", id: "c-old" });
    expect(db.connection.update).toHaveBeenCalledWith({ where: { id: "c-old" }, data: { status: "accepted", acceptedAt: expect.any(Date) } });
    expect(db.message.create).toHaveBeenCalledTimes(1);
    expect(db.notification.create).toHaveBeenCalledWith({ data: expect.objectContaining({ userId: "them", title: "Connection accepted" }) });
    expect(db.connection.create).not.toHaveBeenCalled();
  });

  it("returns the existing state for any other prior connection", async () => {
    authAs("me");
    for (const status of ["pending", "accepted", "declined", "removed"]) {
      db.connection.findFirst.mockResolvedValueOnce({ id: "c-old", user1Id: "me", user2Id: "them", status });
      const { body } = await readJson(await requestConnection(makeRequest("/api/connections/request/them", { method: "POST" }), ctx({ userId: "them" })));
      expect(body).toEqual({ status, id: "c-old" });
    }
    expect(db.connection.create).not.toHaveBeenCalled();
    expect(db.connection.update).not.toHaveBeenCalled();
  });
});

describe("GET /api/connections/requests", () => {
  it("requires auth", async () => {
    authAs(null);
    expect((await incomingRequests(makeRequest("/api/connections/requests"))).status).toBe(401);
  });

  it("lists incoming pending requests with the shared event title", async () => {
    authAs("me");
    const requestedAt = new Date("2026-03-01T00:00:00Z");
    db.connection.findMany.mockResolvedValue([
      { id: "c1", user1Id: "a", sharedEventId: "e1", requestedAt, user1: { displayName: "Alice", profilePhotoUrl: null }, sharedEvent: { title: "Jam" } },
      { id: "c2", user1Id: "b", sharedEventId: null, requestedAt, user1: { displayName: null, email: "b@x.com" }, sharedEvent: null },
      { id: "c3", user1Id: "c", sharedEventId: null, requestedAt, user1: { displayName: null, email: null, phone: null }, sharedEvent: null }
    ]);
    const { body } = await readJson<{ requests: Array<Record<string, unknown>> }>(await incomingRequests(makeRequest("/api/connections/requests")));
    expect(db.connection.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { status: "pending", user2Id: "me" } }));
    expect(body.requests).toHaveLength(2);
    expect(body.requests[0]).toMatchObject({ id: "c1", userId: "a", name: "Alice", sharedEventId: "e1", sharedEventTitle: "Jam" });
    expect(body.requests[1]).toMatchObject({ id: "c2", name: "b@x.com", sharedEventTitle: "Shared event" });
  });
});

describe("GET /api/connections/discover", () => {
  beforeEach(() => {
    authAs("me");
    db.connection.findMany.mockResolvedValue([{ user1Id: "me", user2Id: "friend" }]);
  });

  it("requires auth", async () => {
    authAs(null);
    expect((await discover(makeRequest("/api/connections/discover"))).status).toBe(401);
  });

  it("returns nothing when there is no query, no preferences and no city", async () => {
    db.user.findUnique.mockResolvedValue({ id: "me", city: null, preferences: [], lat: null, lng: null });
    const { body } = await readJson(await discover(makeRequest("/api/connections/discover")));
    expect(body).toEqual({ results: [] });
    expect(db.user.findMany).not.toHaveBeenCalled();
  });

  it("searches by name/email for queries of 2+ chars and excludes self and existing connections", async () => {
    db.user.findUnique.mockResolvedValue({ id: "me", city: "Delhi", preferences: ["Music"], lat: null, lng: null });
    db.user.findMany.mockResolvedValue([{ id: "x", displayName: "Xavier", preferences: [], city: "Delhi", lat: null, lng: null }]);
    const { body } = await readJson<{ results: Array<Record<string, unknown>> }>(await discover(makeRequest("/api/connections/discover?query=xa")));
    const where = db.user.findMany.mock.calls[0][0].where;
    expect(where.id.notIn.sort()).toEqual(["friend", "me"]);
    expect(where.isDeactivated).toBe(false);
    expect(where.OR).toEqual([
      { displayName: { contains: "xa", mode: "insensitive" } },
      { email: { contains: "xa", mode: "insensitive" } },
      { city: "Delhi" }
    ]);
    expect(body.results[0]).toMatchObject({ userId: "x", name: "Xavier", city: "Delhi", matchReason: "Nearby in Delhi" });
  });

  it("falls back to shared-interest matching for short queries and ranks by overlap", async () => {
    db.user.findUnique.mockResolvedValue({ id: "me", city: null, preferences: ["Music", "Food"], lat: null, lng: null });
    db.user.findMany.mockResolvedValue([
      { id: "one", displayName: "One", preferences: ["Food"], city: null, lat: null, lng: null },
      { id: "both", displayName: "Both", preferences: ["Music", "Food"], city: null, lat: null, lng: null },
      { id: "none", displayName: null, email: null, preferences: [], city: null, lat: null, lng: null }
    ]);
    const { body } = await readJson<{ results: Array<Record<string, unknown>> }>(await discover(makeRequest("/api/connections/discover?query=x")));
    expect(db.user.findMany.mock.calls[0][0].where.OR).toEqual([{ preferences: { hasSome: ["Music", "Food"] } }]);
    expect(body.results.map((r) => r.userId)).toEqual(["both", "one"]);
    expect(body.results[0].matchReason).toBe("Shared interests: Music, Food");
  });
});

describe("GET /api/connections/suggestions", () => {
  beforeEach(() => {
    authAs("me");
    db.connection.findMany.mockResolvedValue([]);
  });

  it("requires auth", async () => {
    authAs(null);
    expect((await suggestions(makeRequest("/api/connections/suggestions"))).status).toBe(401);
  });

  it("returns nothing for a user with no attendance and no fallback signals", async () => {
    db.user.findUnique.mockResolvedValue({ lat: null, lng: null, preferences: [], city: null });
    db.eventAttendee.findMany.mockResolvedValue([]);
    const { body } = await readJson(await suggestions(makeRequest("/api/connections/suggestions")));
    expect(body).toEqual({ suggestions: [] });
  });

  it("aggregates co-attendees across shared events and excludes existing connections", async () => {
    db.user.findUnique.mockResolvedValue({ lat: null, lng: null, preferences: [], city: null });
    const myEvents = [{ eventId: "e1", event: { id: "e1", title: "A", eventDate: new Date() } }, { eventId: "e2", event: { id: "e2", title: "B", eventDate: new Date() } }];
    const co = (userId: string, eventId: string, title: string, daysAgo: number) => ({
      userId,
      eventId,
      user: { id: userId, displayName: userId.toUpperCase(), email: null, profilePhotoUrl: null, lat: null, lng: null, preferences: [], city: null },
      event: { id: eventId, title, eventDate: new Date(Date.now() - daysAgo * 86_400_000), category: "Music" }
    });
    db.eventAttendee.findMany
      .mockResolvedValueOnce(myEvents)
      .mockResolvedValueOnce([co("twice", "e1", "A", 10), co("twice", "e2", "B", 1), co("once", "e1", "A", 10)]);
    db.connection.findMany
      .mockResolvedValueOnce([{ user1Id: "me", user2Id: "blocked", status: "accepted" }, { user1Id: "gone", user2Id: "me", status: "removed" }])
      .mockResolvedValueOnce([]);

    const { body } = await readJson<{ suggestions: Array<Record<string, unknown>> }>(await suggestions(makeRequest("/api/connections/suggestions")));

    const sharedQuery = db.eventAttendee.findMany.mock.calls[1][0].where;
    expect(sharedQuery.eventId).toEqual({ in: ["e1", "e2"] });
    expect(sharedQuery.userId).toEqual({ not: "me", notIn: ["blocked"] });

    expect(body.suggestions.map((s) => s.userId)).toEqual(["twice", "once"]);
    expect(body.suggestions[0]).toMatchObject({ sharedCount: 2, sharedEventTitle: "B", sharedEventId: "e2", name: "TWICE" });
    expect(body.suggestions[1]).toMatchObject({ sharedCount: 1, sharedEventTitle: "A" });
  });

  it("tops up with interest/city matches when shared-attendance yields too few", async () => {
    db.user.findUnique.mockResolvedValue({ lat: null, lng: null, preferences: ["Art"], city: "Pune" });
    db.eventAttendee.findMany.mockResolvedValue([]);
    db.user.findMany.mockResolvedValue([
      { id: "artsy", displayName: "Artsy", email: null, profilePhotoUrl: null, preferences: ["Art"], lat: null, lng: null, city: "Goa" },
      { id: "local", displayName: "Local", email: null, profilePhotoUrl: null, preferences: [], lat: null, lng: null, city: "Pune" }
    ]);
    const { body } = await readJson<{ suggestions: Array<Record<string, unknown>> }>(await suggestions(makeRequest("/api/connections/suggestions")));
    expect(db.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ OR: [{ preferences: { hasSome: ["Art"] } }, { city: "Pune" }] }) })
    );
    expect(body.suggestions.map((s) => s.userId)).toEqual(["artsy", "local"]);
    expect(body.suggestions[0]).toMatchObject({ sharedCount: 0, sharedEventTitle: null });
  });

  it("boosts candidates with mutual connections", async () => {
    db.user.findUnique.mockResolvedValue({ lat: null, lng: null, preferences: ["Art"], city: null });
    db.eventAttendee.findMany.mockResolvedValue([]);
    db.user.findMany.mockResolvedValue([
      { id: "plain", displayName: "Plain", preferences: ["Art"], lat: null, lng: null, city: null },
      { id: "popular", displayName: "Popular", preferences: ["Art"], lat: null, lng: null, city: null }
    ]);
    db.connection.findMany
      .mockResolvedValueOnce([{ user1Id: "me", user2Id: "friend", status: "accepted" }])
      .mockResolvedValueOnce([{ user1Id: "popular", user2Id: "friend" }]);
    const { body } = await readJson<{ suggestions: Array<{ userId: string }> }>(await suggestions(makeRequest("/api/connections/suggestions")));
    expect(body.suggestions[0].userId).toBe("popular");
  });
});
