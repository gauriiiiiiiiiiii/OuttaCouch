import type { NextApiRequest, NextApiResponse } from "next";
import { Server, ServerOptions } from "socket.io";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const socket = res.socket as (typeof res.socket) & { server?: any };
  if (!socket.server?.io) {
    const io = new Server(socket.server || res.socket, {
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

    const socketServer = res.socket as (typeof res.socket) & { server?: any };
    if (socketServer.server) {
      socketServer.server.io = io;
    }
    (globalThis as { io?: Server }).io = io;
  }
  res.end();
}
