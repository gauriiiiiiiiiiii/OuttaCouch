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
import { DELETE as clearAll, GET as list } from "@/app/api/notifications/route";
import { DELETE as dismiss } from "@/app/api/notifications/[id]/route";
import { PUT as markOne } from "@/app/api/notifications/[id]/read/route";
import { PUT as markAll } from "@/app/api/notifications/read-all/route";
import { GET as dispatchGet, POST as dispatchPost } from "@/app/api/notifications/dispatch/route";

const db = prisma as unknown as PrismaMock;

describe("GET/DELETE /api/notifications", () => {
  it("requires auth", async () => {
    authAs(null);
    expect((await list(makeRequest("/api/notifications"))).status).toBe(401);
    expect((await clearAll(makeRequest("/api/notifications", { method: "DELETE" }))).status).toBe(401);
  });

  it("lists the newest 50 notifications for the caller", async () => {
    authAs("u1");
    db.notification.findMany.mockResolvedValue([{ id: "n1" }]);
    const { body } = await readJson<{ notifications: unknown[] }>(await list(makeRequest("/api/notifications")));
    expect(db.notification.findMany).toHaveBeenCalledWith({ where: { userId: "u1" }, orderBy: { createdAt: "desc" }, take: 50 });
    expect(body.notifications).toEqual([{ id: "n1" }]);
  });

  it("clears only the caller's notifications", async () => {
    authAs("u1");
    db.notification.deleteMany.mockResolvedValue({ count: 3 });
    const { body } = await readJson(await clearAll(makeRequest("/api/notifications", { method: "DELETE" })));
    expect(body).toEqual({ status: "cleared" });
    expect(db.notification.deleteMany).toHaveBeenCalledWith({ where: { userId: "u1" } });
  });
});

describe("DELETE /api/notifications/:id and PUT /api/notifications/:id/read", () => {
  it("require auth", async () => {
    authAs(null);
    expect((await dismiss(makeRequest("/api/notifications/n1", { method: "DELETE" }), ctx({ id: "n1" }))).status).toBe(401);
    expect((await markOne(makeRequest("/api/notifications/n1/read", { method: "PUT" }), ctx({ id: "n1" }))).status).toBe(401);
  });

  it("404 for missing notifications and for other users' notifications", async () => {
    authAs("u1");
    db.notification.findUnique.mockResolvedValueOnce(null);
    expect((await dismiss(makeRequest("/api/notifications/n1", { method: "DELETE" }), ctx({ id: "n1" }))).status).toBe(404);
    db.notification.findUnique.mockResolvedValueOnce({ id: "n1", userId: "someone-else" });
    expect((await dismiss(makeRequest("/api/notifications/n1", { method: "DELETE" }), ctx({ id: "n1" }))).status).toBe(404);
    db.notification.findUnique.mockResolvedValueOnce({ id: "n1", userId: "someone-else" });
    expect((await markOne(makeRequest("/api/notifications/n1/read", { method: "PUT" }), ctx({ id: "n1" }))).status).toBe(404);
    expect(db.notification.delete).not.toHaveBeenCalled();
    expect(db.notification.update).not.toHaveBeenCalled();
  });

  it("dismisses and marks read for the owner", async () => {
    authAs("u1");
    db.notification.findUnique.mockResolvedValue({ id: "n1", userId: "u1" });
    let res = await readJson(await dismiss(makeRequest("/api/notifications/n1", { method: "DELETE" }), ctx({ id: "n1" })));
    expect(res.body).toEqual({ status: "deleted" });
    expect(db.notification.delete).toHaveBeenCalledWith({ where: { id: "n1" } });

    res = await readJson(await markOne(makeRequest("/api/notifications/n1/read", { method: "PUT" }), ctx({ id: "n1" })));
    expect(res.body).toEqual({ status: "ok" });
    expect(db.notification.update).toHaveBeenCalledWith({ where: { id: "n1" }, data: { readAt: expect.any(Date) } });
  });
});

describe("PUT /api/notifications/read-all", () => {
  it("requires auth", async () => {
    authAs(null);
    expect((await markAll(makeRequest("/api/notifications/read-all", { method: "PUT" }))).status).toBe(401);
  });

  it("marks only unread notifications of the caller", async () => {
    authAs("u1");
    db.notification.updateMany.mockResolvedValue({ count: 2 });
    const { body } = await readJson(await markAll(makeRequest("/api/notifications/read-all", { method: "PUT" })));
    expect(body).toEqual({ status: "ok" });
    expect(db.notification.updateMany).toHaveBeenCalledWith({ where: { userId: "u1", readAt: null }, data: { readAt: expect.any(Date) } });
  });
});

describe("/api/notifications/dispatch (cron)", () => {
  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", "cron-secret");
    vi.stubEnv("NOTIFICATION_DISPATCH_SECRET", "manual-secret");
    db.notificationSchedule.updateManyAndReturn.mockResolvedValue([]);
  });

  it("rejects requests without a valid secret", async () => {
    expect((await dispatchPost(makeRequest("/api/notifications/dispatch", { method: "POST" }))).status).toBe(401);
    expect((await dispatchPost(makeRequest("/api/notifications/dispatch", { method: "POST", headers: { authorization: "Bearer wrong" } }))).status).toBe(401);
    expect((await dispatchPost(makeRequest("/api/notifications/dispatch", { method: "POST", headers: { "x-notification-secret": "nope" } }))).status).toBe(401);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("cannot be bypassed when the secrets are unset", async () => {
    vi.stubEnv("CRON_SECRET", "");
    vi.stubEnv("NOTIFICATION_DISPATCH_SECRET", "");
    expect((await dispatchPost(makeRequest("/api/notifications/dispatch", { method: "POST", headers: { authorization: "Bearer " } }))).status).toBe(401);
    expect((await dispatchPost(makeRequest("/api/notifications/dispatch", { method: "POST", headers: { authorization: "Bearer undefined" } }))).status).toBe(401);
    expect((await dispatchPost(makeRequest("/api/notifications/dispatch", { method: "POST", headers: { "x-notification-secret": "" } }))).status).toBe(401);
  });

  it("accepts either the Vercel cron bearer or the manual header, on GET or POST", async () => {
    const bearer = { authorization: "Bearer cron-secret" };
    const manual = { "x-notification-secret": "manual-secret" };
    expect((await dispatchGet(makeRequest("/api/notifications/dispatch", { headers: bearer }))).status).toBe(200);
    expect((await dispatchPost(makeRequest("/api/notifications/dispatch", { method: "POST", headers: manual }))).status).toBe(200);
  });

  it("reports zero without fanning out when nothing is due", async () => {
    const { body } = await readJson(await dispatchGet(makeRequest("/api/notifications/dispatch", { headers: { authorization: "Bearer cron-secret" } })));
    expect(body).toEqual({ status: "ok", sent: 0 });
    expect(db.notificationSchedule.updateManyAndReturn).toHaveBeenCalledWith({
      where: { sentAt: null, sendAt: { lte: expect.any(Date) } },
      data: { sentAt: expect.any(Date) }
    });
    expect(db.notification.createMany).not.toHaveBeenCalled();
  });

  it("claims due schedules atomically (UPDATE ... RETURNING) then creates one notification per claimed row", async () => {
    db.notificationSchedule.updateManyAndReturn.mockResolvedValue([
      { id: "s1", userId: "u1", title: "Reminder", body: "Soon", link: "/events/e1" },
      { id: "s2", userId: "u2", title: "Reminder", body: "Soon", link: null }
    ]);
    db.notification.createMany.mockResolvedValue({ count: 2 });

    const { body } = await readJson(await dispatchGet(makeRequest("/api/notifications/dispatch", { headers: { authorization: "Bearer cron-secret" } })));
    expect(body).toEqual({ status: "ok", sent: 2 });
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.notification.createMany).toHaveBeenCalledWith({
      data: [
        { userId: "u1", title: "Reminder", body: "Soon", link: "/events/e1" },
        { userId: "u2", title: "Reminder", body: "Soon", link: null }
      ]
    });
  });

  it("rolls the claim back with the transaction if fan-out fails", async () => {
    db.notificationSchedule.updateManyAndReturn.mockResolvedValue([{ id: "s1", userId: "u1", title: "R", body: "B", link: null }]);
    db.notification.createMany.mockRejectedValue(new Error("insert failed"));
    await expect(dispatchGet(makeRequest("/api/notifications/dispatch", { headers: { authorization: "Bearer cron-secret" } }))).rejects.toThrow("insert failed");
  });
});

