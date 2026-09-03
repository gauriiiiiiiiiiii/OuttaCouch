import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaMock } from "../helpers/prismaMock";

vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock } = await import("../helpers/prismaMock");
  return { prisma: createPrismaMock() };
});
vi.mock("next-auth/jwt", () => import("../helpers/auth").then((m) => m.jwtModuleMock));

const ioInstances: FakeIo[] = [];
vi.mock("socket.io", () => ({
  Server: vi.fn(function Server(this: FakeIo) {
    Object.assign(this, createFakeIo());
    ioInstances.push(this);
  })
}));

import { prisma } from "@/lib/prisma";
import { authAs, getTokenMock } from "../helpers/auth";
import { authenticateSocket, canJoinRoom, parseCookies, registerSocketHandlers } from "@/lib/socketAuth";
import handler from "@/pages/api/socketio";

const db = prisma as unknown as PrismaMock;

type Middleware = (socket: FakeSocket, next: (err?: Error) => void) => Promise<void> | void;
type FakeIo = {
  use: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  to: ReturnType<typeof vi.fn>;
  emit: ReturnType<typeof vi.fn>;
  middlewares: Middleware[];
  handlers: Record<string, (socket: FakeSocket) => void>;
};
type FakeSocket = {
  request: { headers: Record<string, string | undefined> };
  data: Record<string, unknown>;
  rooms: Set<string>;
  join: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  listeners: Record<string, (...args: unknown[]) => unknown>;
};

function createFakeIo(): FakeIo {
  const emit = vi.fn();
  const io: FakeIo = {
    middlewares: [],
    handlers: {},
    use: vi.fn((fn: Middleware) => io.middlewares.push(fn)),
    on: vi.fn((event: string, fn: (socket: FakeSocket) => void) => {
      io.handlers[event] = fn;
    }),
    to: vi.fn(() => ({ emit })),
    emit
  };
  return io;
}

function createFakeSocket(cookie?: string): FakeSocket {
  const socket: FakeSocket = {
    request: { headers: { cookie } },
    data: {},
    rooms: new Set(),
    join: vi.fn((room: string) => socket.rooms.add(room)),
    listeners: {},
    on: vi.fn((event: string, fn: (...args: unknown[]) => unknown) => {
      socket.listeners[event] = fn;
    })
  };
  return socket;
}

describe("parseCookies", () => {
  it("parses a standard cookie header and decodes values", () => {
    expect(parseCookies("a=1; next-auth.session-token=abc%20def; empty=; =novalue; junk")).toEqual({
      a: "1",
      "next-auth.session-token": "abc def",
      empty: ""
    });
  });

  it("returns an empty object for a missing header", () => {
    expect(parseCookies(undefined)).toEqual({});
    expect(parseCookies("")).toEqual({});
  });

  it("keeps the raw value when decoding fails", () => {
    expect(parseCookies("bad=%E0%A4%A")).toEqual({ bad: "%E0%A4%A" });
  });
});

describe("authenticateSocket", () => {
  it("hands the parsed cookies to getToken and returns the subject", async () => {
    authAs("u1");
    const userId = await authenticateSocket({ cookie: "next-auth.session-token=jwt" });
    expect(userId).toBe("u1");
    expect(getTokenMock).toHaveBeenCalledWith({
      req: { cookies: { "next-auth.session-token": "jwt" }, headers: { cookie: "next-auth.session-token=jwt" } },
      secret: "test-secret"
    });
  });

  it("returns null without a valid token", async () => {
    authAs(null);
    expect(await authenticateSocket({})).toBeNull();
  });
});

describe("canJoinRoom", () => {
  it("rejects non-string or empty rooms without a lookup", async () => {
    expect(await canJoinRoom("u1", 42)).toBe(false);
    expect(await canJoinRoom("u1", "")).toBe(false);
    expect(db.connection.findUnique).not.toHaveBeenCalled();
  });

  it("allows only participants of the connection", async () => {
    db.connection.findUnique.mockResolvedValue({ user1Id: "a", user2Id: "b" });
    expect(await canJoinRoom("a", "c1")).toBe(true);
    expect(await canJoinRoom("b", "c1")).toBe(true);
    expect(await canJoinRoom("z", "c1")).toBe(false);
    db.connection.findUnique.mockResolvedValue(null);
    expect(await canJoinRoom("a", "missing")).toBe(false);
  });
});

describe("registerSocketHandlers", () => {
  let io: FakeIo;

  beforeEach(() => {
    io = createFakeIo();
    registerSocketHandlers(io as never);
  });

  it("refuses unauthenticated handshakes", async () => {
    authAs(null);
    const next = vi.fn();
    await io.middlewares[0](createFakeSocket(), next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(next.mock.calls[0][0].message).toBe("Unauthorized");
  });

  it("accepts authenticated handshakes and stores the user id on the socket", async () => {
    authAs("u1");
    const socket = createFakeSocket("next-auth.session-token=jwt");
    const next = vi.fn();
    await io.middlewares[0](socket, next);
    expect(next).toHaveBeenCalledWith();
    expect(socket.data.userId).toBe("u1");
  });

  it("treats token verification errors as unauthorized", async () => {
    getTokenMock.mockRejectedValue(new Error("bad jwt"));
    const next = vi.fn();
    await io.middlewares[0](createFakeSocket("x=y"), next);
    expect(next.mock.calls[0][0]).toBeInstanceOf(Error);
  });

  it("joins only rooms the user participates in", async () => {
    const socket = createFakeSocket();
    socket.data.userId = "a";
    io.handlers.connection(socket);
    db.connection.findUnique.mockResolvedValueOnce({ user1Id: "a", user2Id: "b" });
    await socket.listeners.join("c1");
    expect(socket.join).toHaveBeenCalledWith("c1");
    db.connection.findUnique.mockResolvedValueOnce({ user1Id: "x", user2Id: "y" });
    await socket.listeners.join("c2");
    expect(socket.join).not.toHaveBeenCalledWith("c2");
  });

  it("relays typing with the authenticated user id, only for joined rooms", () => {
    const socket = createFakeSocket();
    socket.data.userId = "a";
    socket.rooms.add("c1");
    io.handlers.connection(socket);

    socket.listeners.typing({ roomId: "c1", isTyping: true, userId: "spoofed" });
    expect(io.to).toHaveBeenCalledWith("c1");
    expect(io.emit).toHaveBeenCalledWith("typing", { userId: "a", isTyping: true });

    io.to.mockClear();
    socket.listeners.typing({ roomId: "not-joined", isTyping: true });
    socket.listeners.typing({ roomId: 5, isTyping: true });
    socket.listeners.typing(undefined);
    expect(io.to).not.toHaveBeenCalled();
  });

  it("does not expose a client-originated message relay", () => {
    const socket = createFakeSocket();
    socket.data.userId = "a";
    io.handlers.connection(socket);
    expect(socket.listeners).not.toHaveProperty("message");
    expect(Object.keys(socket.listeners).sort()).toEqual(["join", "typing"]);
  });
});

describe("pages/api/socketio handler", () => {
  beforeEach(() => {
    ioInstances.length = 0;
    delete (globalThis as { io?: unknown }).io;
  });

  it("ends the response when there is no underlying server", () => {
    const end = vi.fn();
    handler({} as never, { socket: null, end } as never);
    expect(end).toHaveBeenCalled();
    expect(ioInstances).toHaveLength(0);
  });

  it("boots Socket.io once per server and registers the auth middleware", () => {
    const server: { io?: unknown } = {};
    const end = vi.fn();
    const res = { socket: { server }, end } as never;

    handler({} as never, res);
    handler({} as never, res);

    expect(end).toHaveBeenCalledTimes(2);
    expect(ioInstances).toHaveLength(1);
    expect(server.io).toBe(ioInstances[0]);
    expect((globalThis as { io?: unknown }).io).toBe(ioInstances[0]);
    expect(ioInstances[0].use).toHaveBeenCalledTimes(1);
    expect(ioInstances[0].on).toHaveBeenCalledWith("connection", expect.any(Function));
  });
});
