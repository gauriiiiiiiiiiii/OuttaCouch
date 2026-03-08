import type { Server } from "socket.io";

export const emitToRoom = (room: string, event: string, payload: unknown) => {
  const io = (globalThis as { io?: Server }).io;
  if (!io) {
    return;
  }
  io.to(room).emit(event, payload);
};
