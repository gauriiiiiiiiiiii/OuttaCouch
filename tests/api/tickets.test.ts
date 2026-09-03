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
import { GET as myTickets } from "@/app/api/tickets/me/route";
import { GET as ticketQr } from "@/app/api/tickets/[id]/qr/route";
import { POST as validate } from "@/app/api/tickets/validate/route";
import { POST as refund } from "@/app/api/tickets/refund/route";

const db = prisma as unknown as PrismaMock;

describe("GET /api/tickets/me", () => {
  it("requires auth", async () => {
    authAs(null);
    expect((await myTickets(makeRequest("/api/tickets/me"))).status).toBe(401);
  });

  it("returns the caller's tickets with event summary", async () => {
    authAs("u1");
    const eventDate = new Date("2026-07-01T18:00:00Z");
    db.ticket.findMany.mockResolvedValue([
      { id: "t1", quantity: 2, amountPaid: { toString: () => "998" }, paymentStatus: "paid", qrCode: "QR-1", event: { title: "Gig", eventDate } }
    ]);
    const { body } = await readJson<{ tickets: unknown[] }>(await myTickets(makeRequest("/api/tickets/me")));
    expect(db.ticket.findMany).toHaveBeenCalledWith({ where: { userId: "u1" }, include: { event: true } });
    expect(body.tickets).toEqual([
      { id: "t1", eventTitle: "Gig", eventDate: eventDate.toISOString(), quantity: 2, amountPaid: "998", paymentStatus: "paid", qrCode: "QR-1" }
    ]);
  });
});

describe("GET /api/tickets/:id/qr", () => {
  it("requires auth and ownership", async () => {
    authAs(null);
    expect((await ticketQr(makeRequest("/api/tickets/t1/qr"), ctx({ id: "t1" }))).status).toBe(401);
    authAs("u1");
    db.ticket.findUnique.mockResolvedValueOnce(null);
    expect((await ticketQr(makeRequest("/api/tickets/t1/qr"), ctx({ id: "t1" }))).status).toBe(403);
    db.ticket.findUnique.mockResolvedValueOnce({ id: "t1", userId: "someone", qrCode: "QR" });
    expect((await ticketQr(makeRequest("/api/tickets/t1/qr"), ctx({ id: "t1" }))).status).toBe(403);
  });

  it("returns the QR payload for the owner", async () => {
    authAs("u1");
    db.ticket.findUnique.mockResolvedValue({ id: "t1", userId: "u1", qrCode: "QR-XYZ" });
    const { body } = await readJson(await ticketQr(makeRequest("/api/tickets/t1/qr"), ctx({ id: "t1" })));
    expect(body).toEqual({ qrCode: "QR-XYZ" });
  });
});

describe("POST /api/tickets/validate", () => {
  const payload = { qr_code: "QR-1", event_id: "e1" };

  beforeEach(() => {
    authAs("host-1");
    db.event.findUnique.mockResolvedValue({ id: "e1", hostId: "host-1" });
    db.ticket.updateMany.mockResolvedValue({ count: 1 });
    db.eventAttendee.updateMany.mockResolvedValue({ count: 1 });
  });

  it("requires auth, both fields and host ownership of the event", async () => {
    authAs(null);
    expect((await validate(makeRequest("/api/tickets/validate", { body: payload }))).status).toBe(401);
    authAs("host-1");
    expect((await validate(makeRequest("/api/tickets/validate", { body: { qr_code: "x" } }))).status).toBe(400);
    db.event.findUnique.mockResolvedValueOnce(null);
    expect((await validate(makeRequest("/api/tickets/validate", { body: payload }))).status).toBe(403);
    db.event.findUnique.mockResolvedValueOnce({ id: "e1", hostId: "other-host" });
    expect((await validate(makeRequest("/api/tickets/validate", { body: payload }))).status).toBe(403);
  });

  it("404s when the QR does not belong to this event", async () => {
    db.ticket.findFirst.mockResolvedValue(null);
    const res = await validate(makeRequest("/api/tickets/validate", { body: payload }));
    expect(res.status).toBe(404);
    expect(db.ticket.findFirst).toHaveBeenCalledWith({ where: { qrCode: "QR-1", eventId: "e1" } });
  });

  it("rejects a QR that was already scanned", async () => {
    db.ticket.findFirst.mockResolvedValue({ id: "t1", qrValidated: true });
    const { status, body } = await readJson(await validate(makeRequest("/api/tickets/validate", { body: payload })));
    expect(status).toBe(409);
    expect(body.error).toBe("Ticket already validated");
    expect(db.ticket.updateMany).not.toHaveBeenCalled();
  });

  it("uses a conditional update so a racing second scan also gets 409", async () => {
    db.ticket.findFirst.mockResolvedValue({ id: "t1", qrValidated: false });
    db.ticket.updateMany.mockResolvedValue({ count: 0 });
    const res = await validate(makeRequest("/api/tickets/validate", { body: payload }));
    expect(res.status).toBe(409);
    expect(db.ticket.updateMany).toHaveBeenCalledWith({
      where: { id: "t1", qrValidated: false },
      data: { qrValidated: true, validatedAt: expect.any(Date) }
    });
    expect(db.eventAttendee.updateMany).not.toHaveBeenCalled();
  });

  it("validates the ticket and marks its attendee as attended", async () => {
    db.ticket.findFirst.mockResolvedValue({ id: "t1", qrValidated: false });
    const { status, body } = await readJson(await validate(makeRequest("/api/tickets/validate", { body: payload })));
    expect(status).toBe(200);
    expect(body).toEqual({ status: "validated" });
    expect(db.eventAttendee.updateMany).toHaveBeenCalledWith({ where: { ticketId: "t1" }, data: { status: "attended" } });
  });
});

describe("POST /api/tickets/refund", () => {
  const ticket = (overrides: Record<string, unknown> = {}) => ({
    id: "t1",
    userId: "u1",
    eventId: "e1",
    quantity: 2,
    paymentStatus: "paid",
    event: { eventDate: new Date(Date.now() + 5 * 86_400_000) },
    ...overrides
  });

  it("requires auth, an existing ticket and ownership", async () => {
    authAs(null);
    expect((await refund(makeRequest("/api/tickets/refund", { body: { ticketId: "t1" } }))).status).toBe(401);
    authAs("u1");
    db.ticket.findUnique.mockResolvedValueOnce(null);
    expect((await refund(makeRequest("/api/tickets/refund", { body: { ticketId: "t1" } }))).status).toBe(404);
    db.ticket.findUnique.mockResolvedValueOnce(ticket({ userId: "other" }));
    expect((await refund(makeRequest("/api/tickets/refund", { body: { ticketId: "t1" } }))).status).toBe(403);
  });

  it("rejects double refunds and refunds inside 48h of the event", async () => {
    authAs("u1");
    db.ticket.findUnique.mockResolvedValueOnce(ticket({ paymentStatus: "refunded" }));
    let res = await readJson(await refund(makeRequest("/api/tickets/refund", { body: { ticketId: "t1" } })));
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Already refunded");

    db.ticket.findUnique.mockResolvedValueOnce(ticket({ event: { eventDate: new Date(Date.now() + 47 * 3_600_000) } }));
    res = await readJson(await refund(makeRequest("/api/tickets/refund", { body: { ticketId: "t1" } })));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/48 hours/);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("refuses to refund a ticket that was already scanned at the door", async () => {
    authAs("u1");
    db.ticket.findUnique.mockResolvedValue(ticket({ qrValidated: true }));
    const { status, body } = await readJson(await refund(makeRequest("/api/tickets/refund", { body: { ticketId: "t1" } })));
    expect(status).toBe(400);
    expect(body.error).toBe("Ticket already used for entry");
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("refunds atomically: flips status, drops attendees and decrements capacity by quantity with a floor", async () => {
    authAs("u1");
    db.ticket.findUnique.mockResolvedValue(ticket());
    const { status, body } = await readJson(await refund(makeRequest("/api/tickets/refund", { body: { ticketId: "t1" } })));
    expect(status).toBe(200);
    expect(body).toEqual({ success: true });
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.$transaction.mock.calls[0][0]).toHaveLength(3);
    expect(db.ticket.update).toHaveBeenCalledWith({ where: { id: "t1" }, data: { paymentStatus: "refunded" } });
    expect(db.eventAttendee.deleteMany).toHaveBeenCalledWith({ where: { ticketId: "t1" } });
    expect(db.event.updateMany).toHaveBeenCalledWith({
      where: { id: "e1", currentAttendees: { gte: 2 } },
      data: { currentAttendees: { decrement: 2 } }
    });
  });
});
