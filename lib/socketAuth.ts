import type { IncomingHttpHeaders } from "http";
import { getToken } from "next-auth/jwt";
import type { Server as IOServer, Socket } from "socket.io";
import { prisma } from "@/lib/prisma";

/**
 * Authentication + authorisation for the Socket.io layer.
 *
 *   - The handshake is authenticated with the NextAuth session cookie; sockets
 *     without a valid JWT are refused.
 *   - `join` only succeeds for rooms (connection ids) the user participates in.
 *   - Message persistence + fan-out happens in the REST layer, so the socket
 *     never accepts a client-originated "message" event.
 *   - `typing` is relayed with the authenticated user id, not a client value.
 */

export function parseCookies(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!header) return cookies;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    const name = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (!name) continue;
    try {
      cookies[name] = decodeURIComponent(value);
    } catch {
      cookies[name] = value;
    }
  }
  return cookies;
}

export async function authenticateSocket(headers: IncomingHttpHeaders): Promise<string | null> {
  const cookies = parseCookies(headers.cookie);
  const token = await getToken({
    req: { cookies, headers } as unknown as Parameters<typeof getToken>[0]["req"],
    secret: process.env.NEXTAUTH_SECRET
  });
  return token?.sub ?? null;
}

export async function canJoinRoom(userId: string, room: unknown): Promise<boolean> {
  if (typeof room !== "string" || !room) return false;
  const connection = await prisma.connection.findUnique({
    where: { id: room },
    select: { user1Id: true, user2Id: true }
  });
  return !!connection && (connection.user1Id === userId || connection.user2Id === userId);
}

export function registerSocketHandlers(io: IOServer) {
  io.use(async (socket, next) => {
    try {
      const userId = await authenticateSocket(socket.request.headers);
      if (!userId) {
        next(new Error("Unauthorized"));
        return;
      }
      socket.data.userId = userId;
      next();
    } catch {
      next(new Error("Unauthorized"));
    }
  });

  io.on("connection", (socket: Socket) => {
    const userId = socket.data.userId as string;

    socket.on("join", async (room: unknown) => {
      if (await canJoinRoom(userId, room)) {
        socket.join(room as string);
      }
    });

    socket.on("typing", (payload: { roomId?: unknown; isTyping?: unknown } | undefined) => {
      const roomId = payload?.roomId;
      if (typeof roomId !== "string" || !socket.rooms.has(roomId)) {
        return;
      }
      io.to(roomId).emit("typing", {
        userId,
        isTyping: Boolean(payload?.isTyping)
      });
    });
  });
}
