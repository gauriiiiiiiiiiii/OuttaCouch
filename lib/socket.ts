import { Server } from "socket.io";

export type SocketServer = Server;

export function createSocketServer() {
  return new Server({
    cors: { origin: "*" }
  });
}
