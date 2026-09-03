import { beforeEach, describe, expect, it, vi } from "vitest";
import { ctx, makeRequest, readJson } from "../helpers/http";
import type { PrismaMock } from "../helpers/prismaMock";

vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock } = await import("../helpers/prismaMock");
  return { prisma: createPrismaMock() };
});
vi.mock("next-auth/jwt", () => import("../helpers/auth").then((m) => m.jwtModuleMock));
vi.mock("@/lib/supabaseAdmin", () => ({ getSupabaseAdmin: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { buildObjectPath, isValidFolder } from "@/lib/storagePath";
import { authAs } from "../helpers/auth";
import { GET as listMemories, POST as createMemory } from "@/app/api/memories/route";
import { DELETE as deleteMemory } from "@/app/api/memories/[id]/route";
import { GET as userMemories } from "@/app/api/memories/user/[userId]/route";
import { POST as upload } from "@/app/api/storage/upload/route";

const db = prisma as unknown as PrismaMock;
const supabaseAdmin = vi.mocked(getSupabaseAdmin);

// ---------------------------------------------------------------------------
// Memories
// ---------------------------------------------------------------------------
describe("GET/POST /api/memories", () => {
  it("requires auth", async () => {
    authAs(null);
    expect((await listMemories(makeRequest("/api/memories"))).status).toBe(401);
    expect((await createMemory(makeRequest("/api/memories", { body: { imageUrl: "x" } }))).status).toBe(401);
  });

  it("lists the caller's memories newest first with optional event", async () => {
    authAs("u1");
    const created = new Date("2026-04-01T10:00:00Z");
    const eventDate = new Date("2026-03-30T18:00:00Z");
    db.memory.findMany.mockResolvedValue([
      { id: "m1", imageUrl: "a.jpg", caption: "Fun", createdAt: created, event: { id: "e1", title: "Gig", eventDate, category: "Music" } },
      { id: "m2", imageUrl: "b.jpg", caption: null, createdAt: created, event: null }
    ]);
    const { body } = await readJson<{ memories: unknown[] }>(await listMemories(makeRequest("/api/memories")));
    expect(db.memory.findMany).toHaveBeenCalledWith({ where: { userId: "u1" }, include: { event: true }, orderBy: { createdAt: "desc" } });
    expect(body.memories).toEqual([
      { id: "m1", imageUrl: "a.jpg", caption: "Fun", createdAt: created.toISOString(), event: { id: "e1", title: "Gig", date: eventDate.toISOString(), category: "Music" } },
      { id: "m2", imageUrl: "b.jpg", caption: null, createdAt: created.toISOString(), event: null }
    ]);
  });

  it("requires an imageUrl and stores caption/event when provided", async () => {
    authAs("u1");
    expect((await createMemory(makeRequest("/api/memories", { body: { imageUrl: "  " } }))).status).toBe(400);
    db.memory.create.mockResolvedValue({ id: "m9" });
    const { body } = await readJson(await createMemory(makeRequest("/api/memories", { body: { imageUrl: " https://cdn/x.jpg ", caption: "hi", eventId: "e1" } })));
    expect(body).toEqual({ id: "m9" });
    expect(db.memory.create).toHaveBeenCalledWith({ data: { userId: "u1", eventId: "e1", imageUrl: "https://cdn/x.jpg", caption: "hi" } });
    await createMemory(makeRequest("/api/memories", { body: { imageUrl: "y.jpg" } }));
    expect(db.memory.create).toHaveBeenLastCalledWith({ data: { userId: "u1", eventId: null, imageUrl: "y.jpg", caption: null } });
  });
});

describe("DELETE /api/memories/:id", () => {
  it("requires auth, existence and ownership", async () => {
    authAs(null);
    expect((await deleteMemory(makeRequest("/api/memories/m1", { method: "DELETE" }), ctx({ id: "m1" }))).status).toBe(401);
    authAs("u1");
    db.memory.findUnique.mockResolvedValueOnce(null);
    expect((await deleteMemory(makeRequest("/api/memories/m1", { method: "DELETE" }), ctx({ id: "m1" }))).status).toBe(404);
    db.memory.findUnique.mockResolvedValueOnce({ userId: "other" });
    expect((await deleteMemory(makeRequest("/api/memories/m1", { method: "DELETE" }), ctx({ id: "m1" }))).status).toBe(403);
    expect(db.memory.delete).not.toHaveBeenCalled();
  });

  it("deletes the owner's memory", async () => {
    authAs("u1");
    db.memory.findUnique.mockResolvedValue({ userId: "u1" });
    db.memory.delete.mockResolvedValue({});
    const { body } = await readJson(await deleteMemory(makeRequest("/api/memories/m1", { method: "DELETE" }), ctx({ id: "m1" })));
    expect(body).toEqual({ status: "deleted" });
    expect(db.memory.delete).toHaveBeenCalledWith({ where: { id: "m1" } });
  });
});

describe("GET /api/memories/user/:userId", () => {
  beforeEach(() => {
    db.memory.findMany.mockResolvedValue([{ id: "m1", imageUrl: "a", caption: null, createdAt: new Date(0), event: null }]);
  });

  it("404s unknown users", async () => {
    authAs(null);
    db.user.findUnique.mockResolvedValue(null);
    expect((await userMemories(makeRequest("/api/memories/user/x"), ctx({ userId: "x" }))).status).toBe(404);
  });

  it("applies profile visibility: private, connections-only, public, self", async () => {
    db.user.findUnique.mockResolvedValue({ id: "them", profileVisibility: "private" });
    authAs("viewer");
    expect((await userMemories(makeRequest("/api/memories/user/them"), ctx({ userId: "them" }))).status).toBe(403);
    authAs("them");
    expect((await userMemories(makeRequest("/api/memories/user/them"), ctx({ userId: "them" }))).status).toBe(200);

    db.user.findUnique.mockResolvedValue({ id: "them", profileVisibility: "connections" });
    authAs("viewer");
    db.connection.findFirst.mockResolvedValueOnce(null);
    expect((await userMemories(makeRequest("/api/memories/user/them"), ctx({ userId: "them" }))).status).toBe(403);
    db.connection.findFirst.mockResolvedValueOnce({ id: "c1" });
    expect((await userMemories(makeRequest("/api/memories/user/them"), ctx({ userId: "them" }))).status).toBe(200);
    authAs(null);
    db.connection.findFirst.mockResolvedValueOnce(null);
    expect((await userMemories(makeRequest("/api/memories/user/them"), ctx({ userId: "them" }))).status).toBe(403);

    db.user.findUnique.mockResolvedValue({ id: "them", profileVisibility: "public" });
    const { body } = await readJson<{ memories: unknown[] }>(await userMemories(makeRequest("/api/memories/user/them"), ctx({ userId: "them" })));
    expect(body.memories).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Storage upload
// ---------------------------------------------------------------------------
describe("storagePath helpers", () => {
  it("accepts simple nested folders and rejects traversal, spaces and odd characters", () => {
    for (const ok of ["users", "events/abc-123", "covers", "a_b/c-d/e"]) expect(isValidFolder(ok), ok).toBe(true);
    for (const bad of ["", "../etc", "a/../b", "a b", "/leading", "trailing/", "a//b", "x".repeat(121), "dir;rm", "ünïcode"]) {
      expect(isValidFolder(bad), bad).toBe(false);
    }
  });

  it("scopes object keys under the user id with a random file name", () => {
    const path = buildObjectPath({ folder: "covers", userId: "u1", extension: "png" });
    expect(path).toMatch(/^covers\/u1\/\d+-[a-z0-9]+\.png$/);
    expect(buildObjectPath({ folder: null, userId: "u1", extension: "jpg" })).toMatch(/^u1\/\d+-[a-z0-9]+\.jpg$/);
    expect(buildObjectPath({ folder: "x", userId: "u1", extension: "png" })).not.toBe(buildObjectPath({ folder: "x", userId: "u1", extension: "png" }));
  });
});

describe("POST /api/storage/upload", () => {
  const png = (name = "photo.png", type = "image/png", bytes = 3) => new File([new Uint8Array(bytes)], name, { type });
  const form = (fields: Record<string, string | File | undefined>) => {
    const fd = new FormData();
    for (const [key, value] of Object.entries(fields)) {
      if (value === undefined) continue;
      fd.append(key, value);
    }
    return fd;
  };
  const post = (fd: FormData) => upload(makeRequest("/api/storage/upload", { method: "POST", rawBody: fd }));
  const uploadMock = vi.fn();
  const getPublicUrl = vi.fn(() => ({ data: { publicUrl: "https://cdn/public" } }));

  beforeEach(() => {
    authAs("u1");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co");
    uploadMock.mockResolvedValue({ error: null });
    supabaseAdmin.mockReturnValue({ storage: { from: () => ({ upload: uploadMock, getPublicUrl }) } } as never);
  });

  it("requires auth", async () => {
    authAs(null);
    expect((await post(form({ bucket: "memories", file: png() }))).status).toBe(401);
  });

  it("validates bucket, file, folder, size, mime and extension", async () => {
    const expectError = async (fd: FormData, error: RegExp) => {
      const { status, body } = await readJson(await post(fd));
      expect(status).toBe(400);
      expect(body.error).toMatch(error);
    };
    await expectError(form({ file: png() }), /Bucket required/);
    await expectError(form({ bucket: "secrets", file: png() }), /Invalid bucket/);
    await expectError(form({ bucket: "memories" }), /File required/);
    await expectError(form({ bucket: "memories", file: png(), folder: "../../etc" }), /Invalid folder/);
    await expectError(form({ bucket: "memories", file: png(), folder: "has space" }), /Invalid folder/);
    await expectError(form({ bucket: "memories", file: png("big.png", "image/png", 10 * 1024 * 1024 + 1) }), /too large/);
    await expectError(form({ bucket: "memories", file: png("script.png", "text/html") }), /Images only/);
    await expectError(form({ bucket: "memories", file: png("script.php", "image/png") }), /Invalid file extension/);
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("fails closed when Supabase is not configured", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    expect((await post(form({ bucket: "memories", file: png() }))).status).toBe(500);
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service");
    supabaseAdmin.mockReturnValueOnce(null);
    expect((await post(form({ bucket: "memories", file: png() }))).status).toBe(500);
  });

  it("surfaces storage errors as 400", async () => {
    uploadMock.mockResolvedValueOnce({ error: { message: "Bucket not found" } });
    const { status, body } = await readJson(await post(form({ bucket: "event-images", file: png() })));
    expect(status).toBe(400);
    expect(body.error).toBe("Bucket not found");
  });

  it("uploads under a user-scoped random key without upsert and returns the public URL", async () => {
    const { status, body } = await readJson<{ publicUrl: string; path: string }>(await post(form({ bucket: "profile-photos", file: png("Me.JPEG", "image/jpeg"), folder: "users" })));
    expect(status).toBe(200);
    expect(body.publicUrl).toBe("https://cdn/public");
    expect(body.path).toMatch(/^users\/u1\/\d+-[a-z0-9]+\.jpeg$/);
    const [path, buffer, options] = uploadMock.mock.calls[0] as [string, Buffer, Record<string, unknown>];
    expect(path).toBe(body.path);
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(options).toEqual({ upsert: false, contentType: "image/jpeg" });
    expect(getPublicUrl).toHaveBeenCalledWith(body.path);
  });

  it("works without a folder", async () => {
    const { body } = await readJson<{ path: string }>(await post(form({ bucket: "memories", file: png() })));
    expect(body.path).toMatch(/^u1\/\d+-[a-z0-9]+\.png$/);
  });
});
