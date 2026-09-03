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
import { DELETE as cancelCommit, POST as commit } from "@/app/api/events/[id]/commit/route";
import { GET as editForm } from "@/app/api/events/[id]/edit/route";
import { DELETE as deleteImage, GET as listImages, POST as addImage, PUT as updateImage } from "@/app/api/events/[id]/images/route";
import { GET as hostEvents } from "@/app/api/events/host/route";
import { POST as swipe } from "@/app/api/events/swipe/route";

const db = prisma as unknown as PrismaMock;
const id = "e1";

// ---------------------------------------------------------------------------
// POST/DELETE /api/events/:id/commit
// ---------------------------------------------------------------------------
describe("POST /api/events/:id/commit", () => {
  const event = (overrides: Record<string, unknown> = {}) => ({
    id,
    title: "Trail Run",
    isFree: true,
    currentAttendees: 3,
    maxAttendees: 5,
    startTime: new Date(Date.now() + 3 * 86_400_000),
    eventDate: new Date(Date.now() + 3 * 86_400_000),
    venueName: "Park",
    address: "Gate 2",
    ...overrides
  });

  beforeEach(() => {
    authAs("u1");
    db.eventAttendee.findFirst.mockResolvedValue(null);
    db.eventAttendee.create.mockResolvedValue({});
    db.$executeRaw.mockResolvedValue(1);
    db.user.findUnique.mockResolvedValue({ remindersEnabled: true });
    db.notificationSchedule.createMany.mockResolvedValue({ count: 3 });
  });

  it("requires auth and an existing free event", async () => {
    authAs(null);
    expect((await commit(makeRequest(`/api/events/${id}/commit`, { method: "POST" }), ctx({ id }))).status).toBe(401);
    authAs("u1");
    db.event.findUnique.mockResolvedValueOnce(null);
    expect((await commit(makeRequest(`/api/events/${id}/commit`, { method: "POST" }), ctx({ id }))).status).toBe(404);
    db.event.findUnique.mockResolvedValueOnce(event({ isFree: false }));
    const paid = await readJson(await commit(makeRequest(`/api/events/${id}/commit`, { method: "POST" }), ctx({ id })));
    expect(paid.status).toBe(403);
    expect(paid.body.error).toBe("Paid event");
  });

  it("is idempotent for a user who already committed", async () => {
    db.event.findUnique.mockResolvedValue(event());
    db.eventAttendee.findFirst.mockResolvedValue({ id: "a1" });
    const { body } = await readJson(await commit(makeRequest(`/api/events/${id}/commit`, { method: "POST" }), ctx({ id })));
    expect(body).toEqual({ status: "already-committed" });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("enforces capacity with a conditional UPDATE and returns 409 when no seat was claimed", async () => {
    db.event.findUnique.mockResolvedValue(event({ currentAttendees: 5 }));
    db.$executeRaw.mockResolvedValue(0);
    const { status, body } = await readJson(await commit(makeRequest(`/api/events/${id}/commit`, { method: "POST" }), ctx({ id })));
    expect(status).toBe(409);
    expect(body.error).toBe("Event full");
    // The attendee insert happens inside the same transaction and is rolled back by the throw.
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    const [strings, ...values] = db.$executeRaw.mock.calls[0] as [TemplateStringsArray, ...unknown[]];
    const sql = strings.join("?").replace(/\s+/g, " ");
    expect(sql).toContain('UPDATE "events" SET "current_attendees" = "current_attendees" + 1');
    expect(sql).toContain('"current_attendees" < "max_attendees"');
    expect(values).toEqual([id]);
    expect(db.notificationSchedule.createMany).not.toHaveBeenCalled();
  });

  it("treats a concurrent duplicate (P2002) as already-committed instead of failing", async () => {
    db.event.findUnique.mockResolvedValue(event());
    db.eventAttendee.create.mockRejectedValue(Object.assign(new Error("Unique constraint"), { code: "P2002" }));
    const { status, body } = await readJson(await commit(makeRequest(`/api/events/${id}/commit`, { method: "POST" }), ctx({ id })));
    expect(status).toBe(200);
    expect(body).toEqual({ status: "already-committed" });
  });

  it("rethrows unexpected transaction errors", async () => {
    db.event.findUnique.mockResolvedValue(event());
    db.eventAttendee.create.mockRejectedValue(new Error("boom"));
    await expect(commit(makeRequest(`/api/events/${id}/commit`, { method: "POST" }), ctx({ id }))).rejects.toThrow("boom");
  });

  it("creates the attendee, increments the counter and schedules only future reminders", async () => {
    const start = new Date(Date.now() + 90 * 60_000); // 90 minutes away: 1-day reminder is in the past
    db.event.findUnique.mockResolvedValue(event({ startTime: start, eventDate: start }));
    const { status, body } = await readJson(await commit(makeRequest(`/api/events/${id}/commit`, { method: "POST" }), ctx({ id })));
    expect(status).toBe(200);
    expect(body).toEqual({ status: "committed" });

    expect(db.eventAttendee.create).toHaveBeenCalledWith({ data: { eventId: id, userId: "u1", status: "committed" } });
    expect(db.$executeRaw).toHaveBeenCalledTimes(1);

    const { data, skipDuplicates } = db.notificationSchedule.createMany.mock.calls[0][0];
    expect(skipDuplicates).toBe(true);
    expect(data.map((s: { body: string }) => /starts in (1 hour|10 minutes)/.exec(s.body)?.[1])).toEqual(["1 hour", "10 minutes"]);
    expect(data[0]).toMatchObject({ userId: "u1", eventId: id, type: "event_reminder", link: `/events/${id}` });
    expect(data[0].sendAt.getTime()).toBe(start.getTime() - 60 * 60_000);
    expect(data[1].sendAt.getTime()).toBe(start.getTime() - 10 * 60_000);
  });

  it("schedules all three reminders for an event days away", async () => {
    db.event.findUnique.mockResolvedValue(event());
    await commit(makeRequest(`/api/events/${id}/commit`, { method: "POST" }), ctx({ id }));
    expect(db.notificationSchedule.createMany.mock.calls[0][0].data).toHaveLength(3);
  });

  it("skips reminders when the user disabled them or the event is imminent", async () => {
    db.event.findUnique.mockResolvedValue(event());
    db.user.findUnique.mockResolvedValue({ remindersEnabled: false });
    await commit(makeRequest(`/api/events/${id}/commit`, { method: "POST" }), ctx({ id }));
    expect(db.notificationSchedule.createMany).not.toHaveBeenCalled();

    db.user.findUnique.mockResolvedValue({ remindersEnabled: true });
    const now = new Date(Date.now() + 60_000);
    db.event.findUnique.mockResolvedValue(event({ startTime: now, eventDate: now }));
    await commit(makeRequest(`/api/events/${id}/commit`, { method: "POST" }), ctx({ id }));
    expect(db.notificationSchedule.createMany).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/events/:id/commit", () => {
  it("requires auth and an existing commitment", async () => {
    authAs(null);
    expect((await cancelCommit(makeRequest(`/api/events/${id}/commit`, { method: "DELETE" }), ctx({ id }))).status).toBe(401);
    authAs("u1");
    db.eventAttendee.findFirst.mockResolvedValue(null);
    const { status, body } = await readJson(await cancelCommit(makeRequest(`/api/events/${id}/commit`, { method: "DELETE" }), ctx({ id })));
    expect(status).toBe(404);
    expect(body.error).toBe("Not committed");
  });

  it("removes the attendee, floors the counter at zero and cancels unsent reminders", async () => {
    authAs("u1");
    db.eventAttendee.findFirst.mockResolvedValue({ id: "a1" });
    const { status, body } = await readJson(await cancelCommit(makeRequest(`/api/events/${id}/commit`, { method: "DELETE" }), ctx({ id })));
    expect(status).toBe(200);
    expect(body).toEqual({ status: "cancelled" });
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.eventAttendee.delete).toHaveBeenCalledWith({ where: { id: "a1" } });
    expect(db.event.updateMany).toHaveBeenCalledWith({
      where: { id, currentAttendees: { gt: 0 } },
      data: { currentAttendees: { decrement: 1 } }
    });
    expect(db.notificationSchedule.deleteMany).toHaveBeenCalledWith({
      where: { userId: "u1", eventId: id, sentAt: null }
    });
  });
});

// ---------------------------------------------------------------------------
// GET /api/events/:id/edit
// ---------------------------------------------------------------------------
describe("GET /api/events/:id/edit", () => {
  it("is host-only", async () => {
    authAs(null);
    expect((await editForm(makeRequest(`/api/events/${id}/edit`), ctx({ id }))).status).toBe(401);
    authAs("u1");
    db.event.findUnique.mockResolvedValueOnce(null);
    expect((await editForm(makeRequest(`/api/events/${id}/edit`), ctx({ id }))).status).toBe(404);
    db.event.findUnique.mockResolvedValueOnce({ id, hostId: "other" });
    expect((await editForm(makeRequest(`/api/events/${id}/edit`), ctx({ id }))).status).toBe(403);
  });

  it("returns form-shaped local date and time strings", async () => {
    authAs("host-1");
    db.event.findUnique.mockResolvedValue({
      id,
      hostId: "host-1",
      title: "T",
      descriptionShort: "s",
      descriptionFull: "f",
      category: "Art",
      eventDate: new Date(2026, 4, 10, 0, 0),
      startTime: new Date(2026, 4, 10, 18, 5),
      endTime: new Date(2026, 4, 11, 1, 30),
      venueName: "V",
      address: "A",
      lat: "28.6",
      lng: "77.2",
      isFree: false,
      ticketPrice: "499",
      maxAttendees: 10,
      coverImageUrl: "c"
    });
    const { body } = await readJson(await editForm(makeRequest(`/api/events/${id}/edit`), ctx({ id })));
    expect(body).toEqual({
      id,
      title: "T",
      descriptionShort: "s",
      descriptionFull: "f",
      category: "Art",
      eventDate: "2026-05-10",
      startTime: "18:05",
      endDate: "2026-05-11",
      endTime: "01:30",
      venueName: "V",
      address: "A",
      lat: 28.6,
      lng: 77.2,
      isFree: false,
      ticketPrice: 499,
      maxAttendees: 10,
      coverImageUrl: "c"
    });
  });

  it("defaults the end date to the start date when there is no end time", async () => {
    authAs("host-1");
    db.event.findUnique.mockResolvedValue({
      id,
      hostId: "host-1",
      eventDate: new Date(2026, 4, 10),
      startTime: new Date(2026, 4, 10, 9, 0),
      endTime: null,
      ticketPrice: null,
      lat: 1,
      lng: 2
    });
    const { body } = await readJson(await editForm(makeRequest(`/api/events/${id}/edit`), ctx({ id })));
    expect(body).toMatchObject({ endDate: "2026-05-10", endTime: "", ticketPrice: null });
  });
});

// ---------------------------------------------------------------------------
// /api/events/:id/images
// ---------------------------------------------------------------------------
describe("/api/events/:id/images", () => {
  const images = [
    { id: "i1", eventId: id, imageUrl: "u1", isCover: true, orderIndex: 0 },
    { id: "i2", eventId: id, imageUrl: "u2", isCover: false, orderIndex: 1 },
    { id: "i3", eventId: id, imageUrl: "u3", isCover: false, orderIndex: 2 }
  ];

  beforeEach(() => {
    db.event.findUnique.mockResolvedValue({ hostId: "host-1" });
    db.eventImage.findMany.mockResolvedValue(images);
    db.eventImage.update.mockResolvedValue({});
    db.eventImage.updateMany.mockResolvedValue({});
    db.event.update.mockResolvedValue({});
  });

  it("GET lists images in order without requiring auth", async () => {
    authAs(null);
    const { status, body } = await readJson<{ images: unknown[] }>(await listImages(makeRequest(`/api/events/${id}/images`), ctx({ id })));
    expect(status).toBe(200);
    expect(body.images).toHaveLength(3);
    expect(db.eventImage.findMany).toHaveBeenCalledWith({ where: { eventId: id }, orderBy: { orderIndex: "asc" } });
  });

  it("POST is host-only and requires an imageUrl", async () => {
    authAs(null);
    expect((await addImage(makeRequest(`/api/events/${id}/images`, { body: { imageUrl: "x" } }), ctx({ id }))).status).toBe(401);
    authAs("host-1");
    db.event.findUnique.mockResolvedValueOnce(null);
    expect((await addImage(makeRequest(`/api/events/${id}/images`, { body: { imageUrl: "x" } }), ctx({ id }))).status).toBe(404);
    authAs("intruder");
    expect((await addImage(makeRequest(`/api/events/${id}/images`, { body: { imageUrl: "x" } }), ctx({ id }))).status).toBe(403);
    authAs("host-1");
    expect((await addImage(makeRequest(`/api/events/${id}/images`, { body: { imageUrl: "  " } }), ctx({ id }))).status).toBe(400);
  });

  it("POST appends at the next order index by default", async () => {
    authAs("host-1");
    db.eventImage.count.mockResolvedValue(3);
    db.eventImage.create.mockImplementation(async ({ data }: { data: unknown }) => ({ id: "i4", ...(data as object) }));
    const { body } = await readJson<{ image: Record<string, unknown> }>(
      await addImage(makeRequest(`/api/events/${id}/images`, { body: { imageUrl: " https://img/4.jpg " } }), ctx({ id }))
    );
    expect(body.image).toMatchObject({ eventId: id, imageUrl: "https://img/4.jpg", isCover: false, orderIndex: 3 });
    expect(db.event.update).not.toHaveBeenCalled();
  });

  it("POST with isCover promotes the image and demotes the previous cover", async () => {
    authAs("host-1");
    db.eventImage.create.mockResolvedValue({ id: "i4" });
    await addImage(makeRequest(`/api/events/${id}/images`, { body: { imageUrl: "u4", isCover: true, orderIndex: 9 } }), ctx({ id }));
    expect(db.event.update).toHaveBeenCalledWith({ where: { id }, data: { coverImageUrl: "u4" } });
    expect(db.eventImage.updateMany).toHaveBeenCalledWith({ where: { eventId: id, isCover: true }, data: { isCover: false } });
    expect(db.eventImage.create).toHaveBeenCalledWith({ data: { eventId: id, imageUrl: "u4", isCover: true, orderIndex: 9 } });
  });

  it("PUT is host-only and requires imageId", async () => {
    authAs("intruder");
    expect((await updateImage(makeRequest(`/api/events/${id}/images`, { method: "PUT", body: { imageId: "i2", isCover: true } }), ctx({ id }))).status).toBe(403);
    authAs("host-1");
    expect((await updateImage(makeRequest(`/api/events/${id}/images`, { method: "PUT", body: {} }), ctx({ id }))).status).toBe(400);
  });

  it("PUT isCover only accepts images that belong to this event", async () => {
    authAs("host-1");
    db.eventImage.findFirst.mockResolvedValueOnce(null);
    expect((await updateImage(makeRequest(`/api/events/${id}/images`, { method: "PUT", body: { imageId: "foreign", isCover: true } }), ctx({ id }))).status).toBe(404);
    expect(db.eventImage.findFirst).toHaveBeenCalledWith({ where: { id: "foreign", eventId: id } });

    db.eventImage.findFirst.mockResolvedValueOnce(images[1]);
    const { body } = await readJson(await updateImage(makeRequest(`/api/events/${id}/images`, { method: "PUT", body: { imageId: "i2", isCover: true } }), ctx({ id })));
    expect(body).toEqual({ status: "ok" });
    expect(db.event.update).toHaveBeenCalledWith({ where: { id }, data: { coverImageUrl: "u2" } });
    expect(db.eventImage.update).toHaveBeenCalledWith({ where: { id: "i2" }, data: { isCover: true } });
  });

  it("PUT direction swaps order indexes atomically and ignores out-of-range moves", async () => {
    authAs("host-1");
    await updateImage(makeRequest(`/api/events/${id}/images`, { method: "PUT", body: { imageId: "i2", direction: "up" } }), ctx({ id }));
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.eventImage.update).toHaveBeenCalledWith({ where: { id: "i2" }, data: { orderIndex: 0 } });
    expect(db.eventImage.update).toHaveBeenCalledWith({ where: { id: "i1" }, data: { orderIndex: 1 } });

    db.$transaction.mockClear();
    const top = await readJson(await updateImage(makeRequest(`/api/events/${id}/images`, { method: "PUT", body: { imageId: "i1", direction: "up" } }), ctx({ id })));
    expect(top.body).toEqual({ status: "ok" });
    expect(db.$transaction).not.toHaveBeenCalled();

    const missing = await updateImage(makeRequest(`/api/events/${id}/images`, { method: "PUT", body: { imageId: "nope", direction: "down" } }), ctx({ id }));
    expect(missing.status).toBe(404);
  });

  it("PUT without a recognised operation is a no-op", async () => {
    authAs("host-1");
    const { body } = await readJson(await updateImage(makeRequest(`/api/events/${id}/images`, { method: "PUT", body: { imageId: "i2" } }), ctx({ id })));
    expect(body).toEqual({ status: "noop" });
  });

  it("DELETE is host-only, scoped to the event, and 404s for foreign images", async () => {
    authAs(null);
    expect((await deleteImage(makeRequest(`/api/events/${id}/images`, { method: "DELETE", body: { imageId: "i1" } }), ctx({ id }))).status).toBe(401);
    authAs("intruder");
    expect((await deleteImage(makeRequest(`/api/events/${id}/images`, { method: "DELETE", body: { imageId: "i1" } }), ctx({ id }))).status).toBe(403);
    authAs("host-1");
    expect((await deleteImage(makeRequest(`/api/events/${id}/images`, { method: "DELETE", body: {} }), ctx({ id }))).status).toBe(400);

    db.eventImage.deleteMany.mockResolvedValueOnce({ count: 0 });
    expect((await deleteImage(makeRequest(`/api/events/${id}/images`, { method: "DELETE", body: { imageId: "foreign" } }), ctx({ id }))).status).toBe(404);

    db.eventImage.deleteMany.mockResolvedValueOnce({ count: 1 });
    const { body } = await readJson(await deleteImage(makeRequest(`/api/events/${id}/images`, { method: "DELETE", body: { imageId: "i2" } }), ctx({ id })));
    expect(body).toEqual({ status: "deleted" });
    expect(db.eventImage.deleteMany).toHaveBeenLastCalledWith({ where: { id: "i2", eventId: id } });
  });
});

// ---------------------------------------------------------------------------
// GET /api/events/host
// ---------------------------------------------------------------------------
describe("GET /api/events/host", () => {
  it("requires auth", async () => {
    authAs(null);
    expect((await hostEvents(makeRequest("/api/events/host"))).status).toBe(401);
  });

  it("lists the caller's events newest first with attendee counts", async () => {
    authAs("host-1");
    db.event.findMany.mockResolvedValue([
      { id: "e2", title: "B", eventDate: new Date(2026, 5, 2), _count: { attendees: 7 } },
      { id: "e1", title: "A", eventDate: new Date(2026, 0, 15), _count: { attendees: 0 } }
    ]);
    const { body } = await readJson<{ events: unknown[] }>(await hostEvents(makeRequest("/api/events/host")));
    expect(db.event.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { hostId: "host-1" }, orderBy: { eventDate: "desc" } }));
    expect(body.events).toEqual([
      { id: "e2", title: "B", date: "Jun 2, 2026", attendeeCount: 7 },
      { id: "e1", title: "A", date: "Jan 15, 2026", attendeeCount: 0 }
    ]);
  });
});

// ---------------------------------------------------------------------------
// POST /api/events/swipe
// ---------------------------------------------------------------------------
describe("POST /api/events/swipe", () => {
  it("rejects cross-origin, anonymous, incomplete and invalid payloads", async () => {
    authAs("u1");
    expect((await swipe(makeRequest("/api/events/swipe", { body: { event_id: "e1", action: "left" }, headers: { origin: "https://evil" } }))).status).toBe(403);
    authAs(null);
    expect((await swipe(makeRequest("/api/events/swipe", { body: { event_id: "e1", action: "left" } }))).status).toBe(401);
    authAs("u1");
    expect((await swipe(makeRequest("/api/events/swipe", { body: { event_id: "e1" } }))).status).toBe(400);
    const bad = await readJson(await swipe(makeRequest("/api/events/swipe", { body: { event_id: "e1", action: "sideways" } })));
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe("Invalid action");
  });

  it("updates an existing swipe instead of inserting a duplicate", async () => {
    authAs("u1");
    db.eventSwipe.findFirst.mockResolvedValue({ id: "s1" });
    const { body } = await readJson(await swipe(makeRequest("/api/events/swipe", { body: { event_id: "e1", action: "right" } })));
    expect(body).toEqual({ status: "logged" });
    expect(db.eventSwipe.update).toHaveBeenCalledWith({ where: { id: "s1" }, data: { action: "right" } });
    expect(db.eventSwipe.create).not.toHaveBeenCalled();
  });

  it("records a first swipe", async () => {
    authAs("u1");
    db.eventSwipe.findFirst.mockResolvedValue(null);
    await swipe(makeRequest("/api/events/swipe", { body: { event_id: "e1", action: "left" } }));
    expect(db.eventSwipe.create).toHaveBeenCalledWith({ data: { eventId: "e1", userId: "u1", action: "left" } });
  });
});
