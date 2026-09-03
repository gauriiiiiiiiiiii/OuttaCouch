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
import { selfUserSelect } from "@/lib/userSelect";
import { DELETE as deactivate, GET as me, PUT as updateMe } from "@/app/api/users/me/route";
import { PUT as updateLocation } from "@/app/api/users/me/location/route";
import { PUT as updatePrivacy } from "@/app/api/users/me/privacy/route";
import { GET as publicProfile } from "@/app/api/users/[id]/route";

const db = prisma as unknown as PrismaMock;

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("selfUserSelect", () => {
  it("never exposes secrets or billing identifiers", () => {
    const keys = Object.keys(selfUserSelect);
    for (const forbidden of ["passwordHash", "stripeCustomerId", "stripeAccountId", "deactivatedAt"]) {
      expect(keys).not.toContain(forbidden);
    }
    expect(keys).toEqual(expect.arrayContaining(["id", "email", "phone", "displayName", "profileVisibility", "remindersEnabled"]));
  });
});

describe("GET /api/users/me", () => {
  it("requires auth and an existing user", async () => {
    authAs(null);
    expect((await me(makeRequest("/api/users/me"))).status).toBe(401);
    authAs("u1");
    db.user.findUnique.mockResolvedValue(null);
    expect((await me(makeRequest("/api/users/me"))).status).toBe(404);
  });

  it("selects only safe fields and builds the private calendar from hosted + attended events", async () => {
    authAs("u1");
    db.user.findUnique.mockResolvedValue({ id: "u1", displayName: "Me" });
    const d = (day: number) => new Date(2026, 5, day);
    db.event.findMany.mockResolvedValue([{ id: "hosted", title: "Hosted", eventDate: d(1), category: "Art", coverImageUrl: "h.jpg" }]);
    db.eventAttendee.findMany.mockResolvedValue([
      { status: "committed", event: { id: "going", title: "Going", eventDate: d(2), category: "Music", coverImageUrl: "g.jpg" } }
    ]);
    db.connection.count.mockResolvedValue(4);

    const { status, body } = await readJson<Record<string, unknown>>(await me(makeRequest("/api/users/me")));
    expect(status).toBe(200);
    expect(db.user.findUnique).toHaveBeenCalledWith({ where: { id: "u1" }, select: selfUserSelect });
    expect(db.eventAttendee.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "u1", status: { in: ["committed", "attended", "missed"] } } })
    );
    expect(db.eventSwipe.findMany).not.toHaveBeenCalled();
    expect(body.stats).toEqual({ eventsHosted: 1, eventsAttended: 1, connections: 4 });
    expect(body.privateCalendar).toEqual([
      { id: "hosted", title: "Hosted", date: d(1).toISOString(), category: "Art", status: "hosted", imageUrl: "h.jpg" },
      { id: "going", title: "Going", date: d(2).toISOString(), category: "Music", status: "committed", imageUrl: "g.jpg" }
    ]);
    expect(body).not.toHaveProperty("publicCalendar");
  });

  it("returns 502 when the database fails", async () => {
    authAs("u1");
    db.user.findUnique.mockRejectedValue(new Error("down"));
    const { status, body } = await readJson(await me(makeRequest("/api/users/me")));
    expect(status).toBe(502);
    expect(body.error).toBe("Database unavailable");
  });
});

describe("PUT /api/users/me", () => {
  beforeEach(() => {
    authAs("u1");
    db.user.update.mockImplementation(async ({ data }: { data: unknown }) => ({ id: "u1", ...(data as object) }));
  });

  it("requires auth and a JSON object body", async () => {
    authAs(null);
    expect((await updateMe(makeRequest("/api/users/me", { method: "PUT", body: {} }))).status).toBe(401);
    authAs("u1");
    expect((await updateMe(makeRequest("/api/users/me", { method: "PUT", rawBody: "nope" }))).status).toBe(400);
    expect((await updateMe(makeRequest("/api/users/me", { method: "PUT", body: null }))).status).toBe(400);
  });

  it("validates each field", async () => {
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ displayName: "   " }, "Display name required"],
      [{ displayName: 42 }, "Display name required"],
      [{ displayName: "x".repeat(81) }, "Display name too long"],
      [{ bio: 12 }, "Bio must be text up to 500 characters"],
      [{ bio: "b".repeat(501) }, "Bio must be text up to 500 characters"],
      [{ preferences: "Music" }, "Preferences must be a list of strings"],
      [{ preferences: ["Music", 3] }, "Preferences must be a list of strings"],
      [{ profilePhotoUrl: 7 }, "Invalid photo URL"]
    ];
    for (const [payload, error] of cases) {
      const { status, body } = await readJson(await updateMe(makeRequest("/api/users/me", { method: "PUT", body: payload })));
      expect(status, JSON.stringify(payload)).toBe(400);
      expect(body.error).toBe(error);
    }
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("updates the provided fields, trimming and de-duplicating, and never accepts profileComplete", async () => {
    const { status, body } = await readJson<{ user: Record<string, unknown> }>(
      await updateMe(
        makeRequest("/api/users/me", {
          method: "PUT",
          body: {
            displayName: "  Priya  ",
            bio: " hi ",
            preferences: ["Music", "Music", "Food"],
            profilePhotoUrl: "",
            remindersEnabled: false,
            recommendationsEnabled: "yes",
            profileComplete: true,
            isDeactivated: false,
            passwordHash: "hack"
          }
        })
      )
    );
    expect(status).toBe(200);
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { displayName: "Priya", bio: "hi", preferences: ["Music", "Food"], remindersEnabled: false },
      select: selfUserSelect
    });
    expect(body.user.displayName).toBe("Priya");
  });

  it("clears the photo with null and sets it with a string", async () => {
    await updateMe(makeRequest("/api/users/me", { method: "PUT", body: { profilePhotoUrl: null } }));
    expect(db.user.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: { profilePhotoUrl: null } }));
    await updateMe(makeRequest("/api/users/me", { method: "PUT", body: { profilePhotoUrl: "https://cdn/p.jpg" } }));
    expect(db.user.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: { profilePhotoUrl: "https://cdn/p.jpg" } }));
  });
});

describe("DELETE /api/users/me", () => {
  it("requires auth", async () => {
    authAs(null);
    expect((await deactivate(makeRequest("/api/users/me", { method: "DELETE" }))).status).toBe(401);
  });

  it("soft-deactivates: strips identity, locks visibility, keeps the row", async () => {
    authAs("u1");
    db.user.update.mockResolvedValue({});
    const { body } = await readJson(await deactivate(makeRequest("/api/users/me", { method: "DELETE" })));
    expect(body).toEqual({ status: "deactivated" });
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: expect.objectContaining({
        email: null,
        phone: null,
        passwordHash: "",
        displayName: null,
        isDeactivated: true,
        deactivatedAt: expect.any(Date),
        profileVisibility: "private",
        calendarVisibility: "private",
        profileComplete: false
      })
    });
    expect(db.user.delete).not.toHaveBeenCalled();
  });
});

describe("PUT /api/users/me/location", () => {
  beforeEach(() => {
    authAs("u1");
    db.user.update.mockResolvedValue({ id: "u1" });
  });

  it("requires auth and a JSON object", async () => {
    authAs(null);
    expect((await updateLocation(makeRequest("/api/users/me/location", { method: "PUT", body: {} }))).status).toBe(401);
    authAs("u1");
    expect((await updateLocation(makeRequest("/api/users/me/location", { method: "PUT", rawBody: "x" }))).status).toBe(400);
  });

  it("validates coordinates and city", async () => {
    const bad: Array<[Record<string, unknown>, RegExp]> = [
      [{ lat: 10 }, /together/],
      [{ lat: "10", lng: "20" }, /Invalid coordinates/],
      [{ lat: 91, lng: 0 }, /Invalid coordinates/],
      [{ lat: 0, lng: -181 }, /Invalid coordinates/],
      [{ lat: null, lng: 0 }, /together/],
      [{ city: 5 }, /City must be text/],
      [{ profileComplete: true }, /location is required/]
    ];
    for (const [payload, pattern] of bad) {
      const { status, body } = await readJson(await updateLocation(makeRequest("/api/users/me/location", { method: "PUT", body: payload })));
      expect(status, JSON.stringify(payload)).toBe(400);
      expect(body.error).toMatch(pattern);
    }
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("saves the location and completes onboarding only on an explicit true", async () => {
    await updateLocation(makeRequest("/api/users/me/location", { method: "PUT", body: { city: " Delhi ", lat: 28.6, lng: 77.2, profileComplete: true } }));
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { city: "Delhi", lat: 28.6, lng: 77.2, profileComplete: true },
      select: selfUserSelect
    });

    await updateLocation(makeRequest("/api/users/me/location", { method: "PUT", body: { city: "Pune", profileComplete: "true" } }));
    expect(db.user.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: { city: "Pune" } }));

    await updateLocation(makeRequest("/api/users/me/location", { method: "PUT", body: { city: "Goa", profileComplete: true } }));
    expect(db.user.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: { city: "Goa", profileComplete: true } }));
  });
});

describe("PUT /api/users/me/privacy", () => {
  beforeEach(() => {
    authAs("u1");
    db.user.update.mockResolvedValue({ id: "u1" });
  });

  it("requires auth and rejects invalid or empty updates", async () => {
    authAs(null);
    expect((await updatePrivacy(makeRequest("/api/users/me/privacy", { method: "PUT", body: { profileVisibility: "public" } }))).status).toBe(401);
    authAs("u1");
    expect((await updatePrivacy(makeRequest("/api/users/me/privacy", { method: "PUT", body: { profileVisibility: "everyone" } }))).status).toBe(400);
    expect((await updatePrivacy(makeRequest("/api/users/me/privacy", { method: "PUT", body: { calendarVisibility: 1 } }))).status).toBe(400);
    expect((await updatePrivacy(makeRequest("/api/users/me/privacy", { method: "PUT", body: {} }))).status).toBe(400);
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("updates profile and calendar visibility", async () => {
    await updatePrivacy(makeRequest("/api/users/me/privacy", { method: "PUT", body: { profileVisibility: "connections", calendarVisibility: "private" } }));
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { profileVisibility: "connections", calendarVisibility: "private" },
      select: selfUserSelect
    });
  });
});

describe("GET /api/users/:id", () => {
  const target = (visibility: string) => ({
    id: "them",
    displayName: "Them",
    bio: null,
    profilePhotoUrl: null,
    city: "Delhi",
    preferences: ["Art"],
    profileVisibility: visibility,
    isVerifiedHost: true
  });
  const ev = (id: string, visibility = "public") => ({
    id,
    title: id,
    eventDate: new Date(2026, 1, 1),
    category: "Art",
    address: "Addr",
    venueName: "Venue",
    coverImageUrl: "c.jpg",
    visibility
  });

  beforeEach(() => {
    db.event.count.mockResolvedValue(2);
    db.connection.count.mockResolvedValue(3);
    db.event.findMany.mockResolvedValue([{ id: "h1", title: "Hosted", eventDate: new Date(2026, 1, 1), venueName: "V", coverImageUrl: "c", isFree: false, ticketPrice: { toString: () => "100" } }]);
    db.eventAttendee.findMany.mockResolvedValue([]);
  });

  it("404s for unknown users", async () => {
    authAs(null);
    db.user.findUnique.mockResolvedValue(null);
    expect((await publicProfile(makeRequest("/api/users/x"), ctx({ id: "x" }))).status).toBe(404);
  });

  it("hides private profiles from everyone but the owner", async () => {
    db.user.findUnique.mockResolvedValue(target("private"));
    authAs(null);
    expect((await publicProfile(makeRequest("/api/users/them"), ctx({ id: "them" }))).status).toBe(403);
    authAs("viewer");
    expect((await publicProfile(makeRequest("/api/users/them"), ctx({ id: "them" }))).status).toBe(403);
    authAs("them");
    const { status, body } = await readJson<Record<string, unknown>>(await publicProfile(makeRequest("/api/users/them"), ctx({ id: "them" })));
    expect(status).toBe(200);
    expect(body.isSelf).toBe(true);
  });

  it("gates connections-only profiles on an accepted connection", async () => {
    db.user.findUnique.mockResolvedValue(target("connections"));
    authAs(null);
    expect((await publicProfile(makeRequest("/api/users/them"), ctx({ id: "them" }))).status).toBe(403);
    authAs("viewer");
    db.connection.findFirst.mockResolvedValueOnce(null);
    expect((await publicProfile(makeRequest("/api/users/them"), ctx({ id: "them" }))).status).toBe(403);
    db.connection.findFirst.mockResolvedValueOnce({ id: "c1", status: "accepted" });
    const { status, body } = await readJson<Record<string, unknown>>(await publicProfile(makeRequest("/api/users/them"), ctx({ id: "them" })));
    expect(status).toBe(200);
    expect(body).toMatchObject({ connectionStatus: "accepted", connectionId: "c1", isSelf: false });
  });

  it("reports the viewer's pending request on a public profile, and 'none' for anonymous", async () => {
    db.user.findUnique.mockResolvedValue(target("public"));
    authAs("viewer");
    db.connection.findFirst.mockResolvedValue({ id: "c9", status: "pending" });
    let res = await readJson<Record<string, unknown>>(await publicProfile(makeRequest("/api/users/them"), ctx({ id: "them" })));
    expect(res.body).toMatchObject({ connectionStatus: "pending", connectionId: "c9" });

    authAs(null);
    res = await readJson(await publicProfile(makeRequest("/api/users/them"), ctx({ id: "them" })));
    expect(res.body).toMatchObject({ connectionStatus: "none", connectionId: null, isSelf: false });
    expect(res.body.stats).toEqual({ eventsHosted: 2, connections: 3 });
    expect(res.body.hostedEvents).toEqual([
      { id: "h1", title: "Hosted", date: new Date(2026, 1, 1).toISOString(), venueName: "V", coverImageUrl: "c", isFree: false, ticketPrice: "100" }
    ]);
    expect(res.body.user).toMatchObject({ id: "them", displayName: "Them", isVerifiedHost: true });
  });

  it("only shows public-event attendance to other viewers and de-duplicates", async () => {
    db.user.findUnique.mockResolvedValue(target("public"));
    authAs("viewer");
    db.connection.findFirst.mockResolvedValue(null);
    db.eventAttendee.findMany
      .mockResolvedValueOnce([{ status: "attended", event: ev("pub") }, { status: "committed", event: ev("pub") }])
      .mockResolvedValueOnce([{ status: "attended", event: ev("pub") }]);

    const { body } = await readJson<Record<string, unknown>>(await publicProfile(makeRequest("/api/users/them"), ctx({ id: "them" })));
    const timelineWhere = db.eventAttendee.findMany.mock.calls[0][0].where;
    expect(timelineWhere.event).toEqual({ visibility: "public" });
    expect(body.timelineEvents).toHaveLength(1);
    expect(body.publicCalendar).toEqual([
      { id: "pub", title: "pub", date: new Date(2026, 1, 1).toISOString(), category: "Art", location: "Venue", status: "attended", imageUrl: "c.jpg" }
    ]);
  });

  it("shows the owner their full timeline including non-public events", async () => {
    db.user.findUnique.mockResolvedValue(target("public"));
    authAs("them");
    db.eventAttendee.findMany.mockResolvedValueOnce([{ status: "committed", event: ev("secret", "private") }]).mockResolvedValueOnce([]);
    const { body } = await readJson<Record<string, unknown>>(await publicProfile(makeRequest("/api/users/them"), ctx({ id: "them" })));
    expect(db.eventAttendee.findMany.mock.calls[0][0].where).not.toHaveProperty("event");
    expect((body.timelineEvents as unknown[]).length).toBe(1);
  });
});
