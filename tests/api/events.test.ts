import { beforeEach, describe, expect, it, vi } from "vitest";
import { ctx, makeRequest, readJson } from "../helpers/http";
import type { PrismaMock } from "../helpers/prismaMock";

vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock } = await import("../helpers/prismaMock");
  return { prisma: createPrismaMock() };
});
vi.mock("next-auth/jwt", () => import("../helpers/auth").then((m) => m.jwtModuleMock));

import { prisma } from "@/lib/prisma";
import { authAs } from "../helpers/auth";
import { GET as feed, POST as createEvent } from "@/app/api/events/route";
import { DELETE as deleteEvent, GET as eventDetail, PUT as updateEvent } from "@/app/api/events/[id]/route";

const db = prisma as unknown as PrismaMock;

// Shared timestamps so events built from the same base score identically on the
// time-based signals (only the field under test should differ).
const IN_TWO_DAYS = new Date(Date.now() + 2 * 86_400_000);
const CREATED_NOW = new Date();

const baseEvent = (overrides: Record<string, unknown> = {}) => ({
  id: "e1",
  title: "Rooftop Jam",
  category: "Music",
  eventDate: IN_TWO_DAYS,
  createdAt: CREATED_NOW,
  address: "Skyline Terrace",
  coverImageUrl: "https://img/cover.jpg",
  lat: 28.6139,
  lng: 77.209,
  currentAttendees: 5,
  maxAttendees: 10,
  ...overrides
});

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

// ---------------------------------------------------------------------------
// GET /api/events (ranked feed)
// ---------------------------------------------------------------------------
describe("GET /api/events", () => {
  beforeEach(() => {
    db.event.count.mockResolvedValue(2);
    db.connection.findMany.mockResolvedValue([]);
    db.eventAttendee.findMany.mockResolvedValue([]);
  });

  it("serves anonymous users without a user lookup and only public events", async () => {
    authAs(null);
    db.event.count.mockResolvedValue(1);
    db.event.findMany.mockResolvedValue([baseEvent()]);
    const { status, body } = await readJson<{ events: Array<Record<string, unknown>>; page: number; hasMore: boolean; totalCount: number }>(
      await feed(makeRequest("/api/events"))
    );
    expect(status).toBe(200);
    expect(db.user.findUnique).not.toHaveBeenCalled();
    expect(db.event.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { visibility: "public" }, take: 50, skip: 0, orderBy: { eventDate: "asc" } })
    );
    expect(body.events[0]).toMatchObject({
      id: "e1",
      title: "Rooftop Jam",
      category: "Music",
      location: "Skyline Terrace",
      imageUrl: "https://img/cover.jpg",
      lat: 28.6139,
      lng: 77.209
    });
    expect(body.events[0].date).toMatch(/^[A-Z][a-z]{2} \d{1,2}, \d{4}$/);
    expect(typeof body.events[0].score).toBe("number");
    expect(body).toMatchObject({ page: 1, hasMore: false, totalCount: 1 });
  });

  it("paginates with a fixed page size of 50", async () => {
    authAs(null);
    db.event.findMany.mockResolvedValue([]);
    db.event.count.mockResolvedValue(120);
    const { body } = await readJson<{ page: number; hasMore: boolean }>(await feed(makeRequest("/api/events?page=2")));
    expect(db.event.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 50, take: 50 }));
    expect(body.page).toBe(2);
    expect(body.hasMore).toBe(true);
  });

  it("clamps a bad page param to 1", async () => {
    authAs(null);
    db.event.findMany.mockResolvedValue([]);
    await feed(makeRequest("/api/events?page=-4"));
    expect(db.event.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 0 }));
    await feed(makeRequest("/api/events?page=abc"));
    expect(db.event.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ skip: 0 }));
  });

  it("ranks events matching the user's preferences higher", async () => {
    authAs("u1");
    db.user.findUnique.mockResolvedValue({ lat: null, lng: null, preferences: ["Food"] });
    db.event.findMany.mockResolvedValue([baseEvent({ id: "music", category: "Music" }), baseEvent({ id: "food", category: "Food" })]);
    const { body } = await readJson<{ events: Array<{ id: string; score: number }> }>(await feed(makeRequest("/api/events")));
    expect(body.events.map((e) => e.id)).toEqual(["food", "music"]);
    expect(body.events[0].score - body.events[1].score).toBeCloseTo(0.25, 5);
  });

  it("ranks nearby events higher than distant ones", async () => {
    authAs("u1");
    db.user.findUnique.mockResolvedValue({ lat: 28.6139, lng: 77.209, preferences: [] });
    db.event.findMany.mockResolvedValue([
      baseEvent({ id: "far", lat: 19.076, lng: 72.8777 }),
      baseEvent({ id: "near", lat: 28.6139, lng: 77.209 })
    ]);
    const { body } = await readJson<{ events: Array<{ id: string; score: number }> }>(await feed(makeRequest("/api/events")));
    expect(body.events.map((e) => e.id)).toEqual(["near", "far"]);
    // Full location weight (0.30) for a zero-distance event, ~0 for 1000km+.
    expect(body.events[0].score - body.events[1].score).toBeCloseTo(0.3, 2);
  });

  it("boosts events that accepted connections are attending", async () => {
    authAs("u1");
    db.user.findUnique.mockResolvedValue({ lat: null, lng: null, preferences: [] });
    db.connection.findMany.mockResolvedValue([{ user1Id: "u1", user2Id: "friend" }, { user1Id: "buddy", user2Id: "u1" }]);
    db.eventAttendee.findMany.mockResolvedValue([{ eventId: "social" }]);
    db.event.findMany.mockResolvedValue([baseEvent({ id: "solo" }), baseEvent({ id: "social" })]);
    const { body } = await readJson<{ events: Array<{ id: string; score: number }> }>(await feed(makeRequest("/api/events")));
    expect(body.events.map((e) => e.id)).toEqual(["social", "solo"]);
    expect(body.events[0].score - body.events[1].score).toBeCloseTo(0.15, 5);
    expect(db.eventAttendee.findMany).toHaveBeenCalledWith({
      where: { userId: { in: ["friend", "buddy"] }, eventId: { in: ["solo", "social"] } },
      select: { eventId: true }
    });
  });

  it("skips the shared-attendance query when the user has no connections", async () => {
    authAs("u1");
    db.user.findUnique.mockResolvedValue({ lat: null, lng: null, preferences: [] });
    db.event.findMany.mockResolvedValue([baseEvent()]);
    await feed(makeRequest("/api/events"));
    expect(db.eventAttendee.findMany).not.toHaveBeenCalled();
  });

  it("favours popularity, urgency and recency", async () => {
    authAs(null);
    const soon = baseEvent({ id: "soon", eventDate: new Date(Date.now() + 86_400_000) });
    const later = baseEvent({ id: "later", eventDate: new Date(Date.now() + 20 * 86_400_000) });
    db.event.findMany.mockResolvedValueOnce([later, soon]);
    let res = await readJson<{ events: Array<{ id: string }> }>(await feed(makeRequest("/api/events")));
    expect(res.body.events[0].id).toBe("soon");

    const empty = baseEvent({ id: "empty", currentAttendees: 0 });
    const full = baseEvent({ id: "full", currentAttendees: 10 });
    db.event.findMany.mockResolvedValueOnce([empty, full]);
    res = await readJson(await feed(makeRequest("/api/events")));
    expect(res.body.events[0].id).toBe("full");

    const old = baseEvent({ id: "old", createdAt: new Date(Date.now() - 60 * 86_400_000) });
    const fresh = baseEvent({ id: "fresh", createdAt: new Date() });
    db.event.findMany.mockResolvedValueOnce([old, fresh]);
    res = await readJson(await feed(makeRequest("/api/events")));
    expect(res.body.events[0].id).toBe("fresh");
  });

  it("degrades to an empty list when the database fails", async () => {
    authAs(null);
    db.event.findMany.mockRejectedValue(new Error("db down"));
    const { status, body } = await readJson<{ events: unknown[] }>(await feed(makeRequest("/api/events")));
    expect(status).toBe(200);
    expect(body).toEqual({ events: [] });
  });
});

// ---------------------------------------------------------------------------
// POST /api/events (create)
// ---------------------------------------------------------------------------
describe("POST /api/events", () => {
  const validBody = {
    title: "Trail Run",
    descriptionShort: "Morning 5k",
    descriptionFull: "Meet at the gate.",
    category: "Outdoors",
    eventDate: "2026-05-10",
    startTime: "07:30",
    endTime: "09:00",
    venueName: "Riverbend Park",
    address: "Gate 2",
    lat: 28.61,
    lng: 77.24,
    isFree: true,
    maxAttendees: 25,
    coverImageUrl: ""
  };

  beforeEach(() => {
    db.event.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "new-event", ...data }));
    db.eventAttendee.findMany.mockResolvedValue([]);
    db.user.findMany.mockResolvedValue([]);
    db.notification.findMany.mockResolvedValue([]);
    db.notification.createMany.mockResolvedValue({ count: 0 });
  });

  it("rejects cross-origin, anonymous and incomplete-profile callers", async () => {
    authAs("u1");
    expect((await createEvent(makeRequest("/api/events", { body: validBody, headers: { origin: "https://evil" } }))).status).toBe(403);
    authAs(null);
    expect((await createEvent(makeRequest("/api/events", { body: validBody }))).status).toBe(401);
    authAs("u1", { profileComplete: false });
    const { status, body } = await readJson(await createEvent(makeRequest("/api/events", { body: validBody })));
    expect(status).toBe(403);
    expect(body.error).toBe("Profile incomplete");
  });

  it("requires the core fields", async () => {
    authAs("u1");
    const { status, body } = await readJson(await createEvent(makeRequest("/api/events", { body: { ...validBody, venueName: "" } })));
    expect(status).toBe(400);
    expect(body.error).toBe("Missing fields");
    expect(db.event.create).not.toHaveBeenCalled();
  });

  it("creates a public, auto-approved upcoming event with parsed date/times and defaults", async () => {
    authAs("host-1");
    const { status, body } = await readJson(await createEvent(makeRequest("/api/events", { body: validBody })));
    expect(status).toBe(200);
    expect(body).toEqual({ id: "new-event" });

    const data = db.event.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      hostId: "host-1",
      title: "Trail Run",
      descriptionShort: "Morning 5k",
      descriptionFull: "Meet at the gate.",
      category: "Outdoors",
      venueName: "Riverbend Park",
      isFree: true,
      ticketPrice: null,
      currency: "INR",
      maxAttendees: 25,
      currentAttendees: 0,
      approvalMode: "auto",
      visibility: "public",
      status: "upcoming",
      coverImageUrl: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee"
    });
    expect(data.eventDate).toEqual(new Date("2026-05-10T00:00:00"));
    expect(data.startTime).toEqual(new Date("2026-05-10T07:30:00"));
    expect(data.endTime).toEqual(new Date("2026-05-10T09:00:00"));
  });

  it("falls back description fields to the title and keeps ticketPrice for paid events", async () => {
    authAs("host-1");
    await createEvent(
      makeRequest("/api/events", {
        body: { ...validBody, descriptionShort: "", descriptionFull: "", isFree: false, ticketPrice: 499, endTime: undefined, endDate: "2026-05-11" }
      })
    );
    const data = db.event.create.mock.calls[0][0].data;
    expect(data.descriptionShort).toBe("Trail Run");
    expect(data.descriptionFull).toBe("Trail Run");
    expect(data.ticketPrice).toBe(499);
    expect(data.endTime).toBeNull();
  });

  it("honours an explicit end date for multi-day events", async () => {
    authAs("host-1");
    await createEvent(makeRequest("/api/events", { body: { ...validBody, endDate: "2026-05-11", endTime: "01:00" } }));
    expect(db.event.create.mock.calls[0][0].data.endTime).toEqual(new Date("2026-05-11T01:00:00"));
  });

  it("notifies interested users once, skipping those already notified", async () => {
    authAs("host-1");
    db.eventAttendee.findMany.mockResolvedValue([{ userId: "past-attendee" }]);
    db.user.findMany.mockResolvedValue([
      { id: "pref-match", preferences: ["Outdoors"], lat: null, lng: null },
      { id: "past-attendee", preferences: [], lat: null, lng: null },
      { id: "nearby", preferences: [], lat: 28.61, lng: 77.24 },
      { id: "irrelevant", preferences: ["Gaming"], lat: 10, lng: 10 },
      { id: "already", preferences: ["Outdoors"], lat: null, lng: null }
    ]);
    db.notification.findMany.mockResolvedValue([{ userId: "already" }]);

    await createEvent(makeRequest("/api/events", { body: validBody }));

    expect(db.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { not: "host-1" }, isDeactivated: false, recommendationsEnabled: true })
      })
    );
    const notified = db.notification.createMany.mock.calls[0][0].data.map((n: { userId: string }) => n.userId);
    expect(notified.sort()).toEqual(["nearby", "past-attendee", "pref-match"]);
    expect(db.notification.createMany.mock.calls[0][0].data[0]).toMatchObject({
      title: "New event you might like",
      link: "/events/new-event"
    });
  });

  it("does not write notifications when nobody matches", async () => {
    authAs("host-1");
    db.user.findMany.mockResolvedValue([{ id: "far", preferences: ["Gaming"], lat: 0, lng: 0 }]);
    await createEvent(makeRequest("/api/events", { body: validBody }));
    expect(db.notification.createMany).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// GET/PUT/DELETE /api/events/:id
// ---------------------------------------------------------------------------
describe("GET /api/events/:id", () => {
  const detailEvent = () => ({
    ...baseEvent({
      hostId: "host-1",
      descriptionFull: "Long story",
      startTime: new Date("2026-05-10T18:30:00"),
      endTime: new Date("2026-05-10T21:00:00"),
      venueName: "Terrace",
      isFree: false,
      ticketPrice: { toString: () => "499" }
    }),
    host: { id: "host-1", displayName: "Host", email: "host@x.com", profilePhotoUrl: null },
    images: [{ id: "i1", imageUrl: "https://img/1.jpg", isCover: true, orderIndex: 0 }],
    _count: { attendees: 12 },
    attendees: Array.from({ length: 12 }, (_, i) => ({
      id: `a${i}`,
      userId: `u${i}`,
      status: i === 0 ? "attended" : "committed",
      ticketId: null,
      createdAt: new Date("2026-04-0" + ((i % 3) + 1)),
      user: { displayName: i % 2 ? `User ${i}` : null, email: `u${i}@x.com`, profilePhotoUrl: null },
      ticket: null
    })),
    tickets: [
      { amountPaid: 499, createdAt: new Date("2026-04-01") },
      { amountPaid: 499, createdAt: new Date("2026-04-02") }
    ]
  });

  it("returns 404 for an unknown event", async () => {
    authAs(null);
    db.event.findUnique.mockResolvedValue(null);
    expect((await eventDetail(makeRequest("/api/events/nope"), ctx({ id: "nope" }))).status).toBe(404);
  });

  it("returns public detail without PII or financials for non-hosts", async () => {
    authAs("u3");
    db.event.findUnique.mockResolvedValue(detailEvent());
    const { status, body } = await readJson<Record<string, unknown>>(await eventDetail(makeRequest("/api/events/e1"), ctx({ id: "e1" })));
    expect(status).toBe(200);
    expect(body).toMatchObject({
      id: "e1",
      title: "Rooftop Jam",
      description: "Long story",
      venueName: "Terrace",
      isFree: false,
      ticketPrice: "499",
      host: { id: "host-1", name: "Host", photo: null },
      attendeeCount: 12,
      isCommitted: true,
      isHost: false
    });
    expect(JSON.stringify(body.host)).not.toContain("host@x.com");
    expect(body.time).toMatch(/06:30 PM - 09:00 PM/);
    expect(body.images).toEqual([{ id: "i1", imageUrl: "https://img/1.jpg", isCover: true, orderIndex: 0 }]);

    const going = body.goingList as Array<{ name: string }>;
    expect(going).toHaveLength(10);
    expect(going[0].name).toBe("Guest");
    expect(going.some((g) => g.name.includes("@"))).toBe(false);

    expect(body).not.toHaveProperty("attendees");
    expect(body).not.toHaveProperty("revenueTotal");
    expect(body).not.toHaveProperty("analytics");
  });

  it("marks isCommitted false for anonymous and non-attending viewers", async () => {
    db.event.findUnique.mockResolvedValue(detailEvent());
    authAs(null);
    let res = await readJson<{ isCommitted: boolean }>(await eventDetail(makeRequest("/api/events/e1"), ctx({ id: "e1" })));
    expect(res.body.isCommitted).toBe(false);
    authAs("stranger");
    res = await readJson(await eventDetail(makeRequest("/api/events/e1"), ctx({ id: "e1" })));
    expect(res.body.isCommitted).toBe(false);
  });

  it("includes the roster, revenue and analytics for the host", async () => {
    authAs("host-1");
    db.event.findUnique.mockResolvedValue(detailEvent());
    const { body } = await readJson<Record<string, unknown>>(await eventDetail(makeRequest("/api/events/e1"), ctx({ id: "e1" })));
    expect(body.isHost).toBe(true);
    expect(body.revenueTotal).toBe(998);
    expect((body.attendees as unknown[]).length).toBe(12);
    expect((body.attendees as Array<{ status: string }>)[0].status).toBe("attended");
    const analytics = body.analytics as { attendeeSeries: Array<{ date: string; count: number }>; revenueSeries: Array<{ total: number }> };
    expect(analytics.attendeeSeries.reduce((s, p) => s + p.count, 0)).toBe(12);
    expect(analytics.attendeeSeries).toHaveLength(3);
    expect(analytics.revenueSeries).toEqual([
      { date: "Apr 1", total: 499 },
      { date: "Apr 2", total: 499 }
    ]);
  });
});

describe("PUT /api/events/:id", () => {
  const body = {
    title: "Renamed",
    category: "Art",
    eventDate: "2026-06-01",
    startTime: "10:00",
    venueName: "Gallery",
    address: "1 Art St",
    lat: 1,
    lng: 2,
    isFree: false,
    ticketPrice: 250,
    maxAttendees: 40,
    coverImageUrl: "https://img/new.jpg"
  };

  it("enforces auth, existence and host ownership", async () => {
    authAs(null);
    expect((await updateEvent(makeRequest("/api/events/e1", { method: "PUT", body }), ctx({ id: "e1" }))).status).toBe(401);
    authAs("host-1");
    db.event.findUnique.mockResolvedValueOnce(null);
    expect((await updateEvent(makeRequest("/api/events/e1", { method: "PUT", body }), ctx({ id: "e1" }))).status).toBe(404);
    db.event.findUnique.mockResolvedValueOnce({ id: "e1", hostId: "someone-else" });
    expect((await updateEvent(makeRequest("/api/events/e1", { method: "PUT", body }), ctx({ id: "e1" }))).status).toBe(403);
  });

  it("validates required fields", async () => {
    authAs("host-1");
    db.event.findUnique.mockResolvedValue({ id: "e1", hostId: "host-1" });
    const res = await updateEvent(makeRequest("/api/events/e1", { method: "PUT", body: { ...body, maxAttendees: 0 } }), ctx({ id: "e1" }));
    expect(res.status).toBe(400);
  });

  it("updates the event for its host", async () => {
    authAs("host-1");
    db.event.findUnique.mockResolvedValue({ id: "e1", hostId: "host-1" });
    db.event.update.mockResolvedValue({ id: "e1" });
    const { status, body: out } = await readJson(await updateEvent(makeRequest("/api/events/e1", { method: "PUT", body }), ctx({ id: "e1" })));
    expect(status).toBe(200);
    expect(out).toEqual({ id: "e1" });
    expect(db.event.update).toHaveBeenCalledWith({
      where: { id: "e1" },
      data: expect.objectContaining({
        title: "Renamed",
        descriptionShort: "Renamed",
        descriptionFull: "Renamed",
        ticketPrice: 250,
        coverImageUrl: "https://img/new.jpg",
        eventDate: new Date("2026-06-01T00:00:00"),
        startTime: new Date("2026-06-01T10:00:00"),
        endTime: null
      })
    });
  });
});

describe("DELETE /api/events/:id", () => {
  it("enforces auth, existence and host ownership", async () => {
    authAs(null);
    expect((await deleteEvent(makeRequest("/api/events/e1", { method: "DELETE" }), ctx({ id: "e1" }))).status).toBe(401);
    authAs("host-1");
    db.event.findUnique.mockResolvedValueOnce(null);
    expect((await deleteEvent(makeRequest("/api/events/e1", { method: "DELETE" }), ctx({ id: "e1" }))).status).toBe(404);
    db.event.findUnique.mockResolvedValueOnce({ id: "e1", hostId: "other" });
    expect((await deleteEvent(makeRequest("/api/events/e1", { method: "DELETE" }), ctx({ id: "e1" }))).status).toBe(403);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("detaches history and cascades dependants inside one transaction", async () => {
    authAs("host-1");
    db.event.findUnique.mockResolvedValue({ id: "e1", hostId: "host-1" });
    const { status, body } = await readJson(await deleteEvent(makeRequest("/api/events/e1", { method: "DELETE" }), ctx({ id: "e1" })));
    expect(status).toBe(200);
    expect(body).toEqual({ status: "deleted" });
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.$transaction.mock.calls[0][0]).toHaveLength(8);
    expect(db.connection.updateMany).toHaveBeenCalledWith({ where: { sharedEventId: "e1" }, data: { sharedEventId: null } });
    expect(db.memory.updateMany).toHaveBeenCalledWith({ where: { eventId: "e1" }, data: { eventId: null } });
    for (const model of ["notificationSchedule", "eventSwipe", "eventImage", "eventAttendee", "ticket"] as const) {
      expect((db[model] as Record<string, ReturnType<typeof vi.fn>>).deleteMany).toHaveBeenCalledWith({ where: { eventId: "e1" } });
    }
    expect(db.event.delete).toHaveBeenCalledWith({ where: { id: "e1" } });
  });
});
