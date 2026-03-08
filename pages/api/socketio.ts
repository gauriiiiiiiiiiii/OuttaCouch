import type { NextApiRequest, NextApiResponse } from "next";
import { Server } from "socket.io";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!(res.socket as any).server.io) {
    const io = new Server((res.socket as any).server, {
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

    (res.socket as any).server.io = io;
    (globalThis as { io?: Server }).io = io;
  }
  res.end();
}
