import { beforeEach, describe, expect, it, vi } from "vitest";
import { ctx, makeRequest, readJson } from "../helpers/http";
import type { PrismaMock } from "../helpers/prismaMock";

vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock } = await import("../helpers/prismaMock");
  return { prisma: createPrismaMock() };
});
vi.mock("next-auth/jwt", () => import("../helpers/auth").then((m) => m.jwtModuleMock));
vi.mock("@/lib/socketServer", () => ({ emitToRoom: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { emitToRoom } from "@/lib/socketServer";
import { authAs } from "../helpers/auth";
import { GET as listChats } from "@/app/api/chat/route";
import { GET as history, POST as send } from "@/app/api/chat/[connectionId]/route";
import { PUT as markRead } from "@/app/api/chat/[connectionId]/read/route";

const db = prisma as unknown as PrismaMock;
const emit = vi.mocked(emitToRoom);
const connectionId = "c1";
const accepted = { id: connectionId, user1Id: "me", user2Id: "them", status: "accepted" };

describe("GET /api/chat", () => {
  it("requires auth", async () => {
    authAs(null);
    expect((await listChats(makeRequest("/api/chat"))).status).toBe(401);
  });

  it("lists only accepted connections with at least one message, newest first, with unread counts", async () => {
    authAs("me");
    const t1 = new Date("2026-03-01T10:00:00Z");
    const t2 = new Date("2026-03-02T10:00:00Z");
    db.connection.findMany.mockResolvedValue([
      {
        id: "old",
        user1Id: "me",
        user2Id: "a",
        user1: { id: "me", displayName: "Me" },
        user2: { id: "a", displayName: "Alice", profilePhotoUrl: "pa" },
        messages: [{ content: "first", sentAt: t1 }],
        _count: { messages: 0 }
      },
      {
        id: "new",
        user1Id: "b",
        user2Id: "me",
        user1: { id: "b", displayName: null, email: "bob@x.com" },
        user2: { id: "me", displayName: "Me" },
        messages: [{ content: "latest", sentAt: t2 }],
        _count: { messages: 4 }
      },
      {
        id: "silent",
        user1Id: "me",
        user2Id: "c",
        user1: { id: "me" },
        user2: { id: "c", displayName: "Carol" },
        messages: [],
        _count: { messages: 0 }
      },
      {
        id: "nameless",
        user1Id: "me",
        user2Id: "d",
        user1: { id: "me" },
        user2: { id: "d", displayName: null, email: null, phone: null },
        messages: [{ content: "x", sentAt: t1 }],
        _count: { messages: 1 }
      }
    ]);

    const { body } = await readJson<{ chats: Array<Record<string, unknown>> }>(await listChats(makeRequest("/api/chat")));
    expect(db.connection.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: "accepted", OR: [{ user1Id: "me" }, { user2Id: "me" }] },
        include: expect.objectContaining({
          messages: { orderBy: { sentAt: "desc" }, take: 1 },
          _count: { select: { messages: { where: { readAt: null, senderId: { not: "me" } } } } }
        })
      })
    );
    expect(body.chats.map((c) => c.connectionId)).toEqual(["new", "old"]);
    expect(body.chats[0]).toMatchObject({ userId: "b", name: "bob@x.com", lastMessage: "latest", unreadCount: 4 });
    expect(body.chats[1]).toMatchObject({ userId: "a", name: "Alice", photo: "pa", lastMessage: "first", unreadCount: 0 });
  });
});

describe("GET /api/chat/:connectionId", () => {
  it("requires auth and participant membership", async () => {
    authAs(null);
    expect((await history(makeRequest(`/api/chat/${connectionId}`), ctx({ connectionId }))).status).toBe(401);
    authAs("outsider");
    db.connection.findUnique.mockResolvedValueOnce(accepted);
    expect((await history(makeRequest(`/api/chat/${connectionId}`), ctx({ connectionId }))).status).toBe(403);
    db.connection.findUnique.mockResolvedValueOnce(null);
    expect((await history(makeRequest(`/api/chat/${connectionId}`), ctx({ connectionId }))).status).toBe(403);
    expect(db.message.findMany).not.toHaveBeenCalled();
  });

  it("returns the thread oldest-first for either participant", async () => {
    db.connection.findUnique.mockResolvedValue(accepted);
    db.message.findMany.mockResolvedValue([{ id: "m1" }, { id: "m2" }]);
    for (const who of ["me", "them"]) {
      authAs(who);
      const { status, body } = await readJson<{ messages: unknown[] }>(await history(makeRequest(`/api/chat/${connectionId}`), ctx({ connectionId })));
      expect(status).toBe(200);
      expect(body.messages).toHaveLength(2);
    }
    expect(db.message.findMany).toHaveBeenCalledWith({ where: { connectionId }, orderBy: { sentAt: "asc" } });
  });
});

describe("POST /api/chat/:connectionId", () => {
  beforeEach(() => {
    db.connection.findUnique.mockResolvedValue(accepted);
    db.message.create.mockImplementation(async ({ data }: { data: unknown }) => ({ id: "m9", ...(data as object) }));
  });

  it("requires auth and participant membership", async () => {
    authAs(null);
    expect((await send(makeRequest(`/api/chat/${connectionId}`, { body: { content: "hi" } }), ctx({ connectionId }))).status).toBe(401);
    authAs("outsider");
    expect((await send(makeRequest(`/api/chat/${connectionId}`, { body: { content: "hi" } }), ctx({ connectionId }))).status).toBe(403);
  });

  it("refuses to send on a connection that is not accepted", async () => {
    authAs("me");
    for (const status of ["pending", "declined", "removed"]) {
      db.connection.findUnique.mockResolvedValueOnce({ ...accepted, status });
      const res = await readJson(await send(makeRequest(`/api/chat/${connectionId}`, { body: { content: "hi" } }), ctx({ connectionId })));
      expect(res.status).toBe(403);
      expect(res.body.error).toBe("Connection not active");
    }
    expect(db.message.create).not.toHaveBeenCalled();
  });

  it("rejects empty, whitespace-only, non-string and malformed bodies", async () => {
    authAs("me");
    expect((await send(makeRequest(`/api/chat/${connectionId}`, { body: {} }), ctx({ connectionId }))).status).toBe(400);
    expect((await send(makeRequest(`/api/chat/${connectionId}`, { body: { content: "   " } }), ctx({ connectionId }))).status).toBe(400);
    expect((await send(makeRequest(`/api/chat/${connectionId}`, { body: { content: 42 } }), ctx({ connectionId }))).status).toBe(400);
    expect((await send(makeRequest(`/api/chat/${connectionId}`, { method: "POST", rawBody: "not json" }), ctx({ connectionId }))).status).toBe(400);
  });

  it("persists the trimmed message, then emits it to the connection room", async () => {
    authAs("them");
    const { status, body } = await readJson<{ message: Record<string, unknown> }>(
      await send(makeRequest(`/api/chat/${connectionId}`, { body: { content: "  hello there  " } }), ctx({ connectionId }))
    );
    expect(status).toBe(200);
    expect(db.message.create).toHaveBeenCalledWith({ data: { connectionId, senderId: "them", content: "hello there", type: "text" } });
    expect(body.message).toMatchObject({ id: "m9", content: "hello there", senderId: "them" });
    expect(emit).toHaveBeenCalledWith(connectionId, "message", expect.objectContaining({ id: "m9" }));
  });
});

describe("PUT /api/chat/:connectionId/read", () => {
  it("requires auth and participant membership (no marking other people's threads)", async () => {
    authAs(null);
    expect((await markRead(makeRequest(`/api/chat/${connectionId}/read`, { method: "PUT" }), ctx({ connectionId }))).status).toBe(401);
    authAs("outsider");
    db.connection.findUnique.mockResolvedValueOnce(accepted);
    expect((await markRead(makeRequest(`/api/chat/${connectionId}/read`, { method: "PUT" }), ctx({ connectionId }))).status).toBe(403);
    db.connection.findUnique.mockResolvedValueOnce(null);
    expect((await markRead(makeRequest(`/api/chat/${connectionId}/read`, { method: "PUT" }), ctx({ connectionId }))).status).toBe(403);
    expect(db.message.updateMany).not.toHaveBeenCalled();
  });

  it("marks only the other party's unread messages and broadcasts a read receipt", async () => {
    authAs("me");
    db.connection.findUnique.mockResolvedValue(accepted);
    db.message.updateMany.mockResolvedValue({ count: 2 });
    const { status, body } = await readJson(await markRead(makeRequest(`/api/chat/${connectionId}/read`, { method: "PUT" }), ctx({ connectionId })));
    expect(status).toBe(200);
    expect(body).toEqual({ status: "ok" });
    expect(db.message.updateMany).toHaveBeenCalledWith({
      where: { connectionId, senderId: { not: "me" }, readAt: null },
      data: { readAt: expect.any(Date) }
    });
    expect(emit).toHaveBeenCalledWith(connectionId, "read", { connectionId, readAt: expect.any(String) });
  });
});
