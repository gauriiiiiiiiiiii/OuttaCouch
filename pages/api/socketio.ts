// ARCHITECTURAL NOTE: Socket.io requires a persistent Node.js process.
// This works on Railway, Render, or any long-lived server deployment.
// It does NOT work on Vercel (serverless) — each invocation is stateless
// and the WebSocket upgrade is never held. For Vercel, replace this with
// a managed realtime service (Pusher, Ably, Liveblocks, etc.) and swap
// emitToRoom() in lib/socketServer.ts to call the provider's REST API.
//
// The chat UI already has a POST-response append fallback so messages
// always appear even when this server is not running.

import type { Server as HttpServer } from "http";
import type { NextApiRequest, NextApiResponse } from "next";
import { Server as IOServer } from "socket.io";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  type NetServerWithIo = HttpServer & { io?: IOServer };
  const socketServer = (res.socket as unknown as { server?: NetServerWithIo })?.server;
  if (!socketServer) {
    res.end();
    return;
  }

  const server = socketServer as NetServerWithIo;

  if (!server.io) {
    const io = new IOServer(server, {
      path: "/api/socketio",
      addTrailingSlash: false
    });

    io.on("connection", (socket) => {
      socket.on("join", (room: string) => {
        socket.join(room);
      });

      socket.on("message", (payload) => {
        if (payload?.room) {
          io.to(payload.room).emit("message", payload.message);
        }
      });

      socket.on("typing", (payload) => {
        if (payload?.roomId) {
          io.to(payload.roomId).emit("typing", {
            userId: payload.userId,
            isTyping: payload.isTyping
          });
        }
      });
    });

    server.io = io;
    (globalThis as { io?: IOServer }).io = io;
  }
  res.end();
}
