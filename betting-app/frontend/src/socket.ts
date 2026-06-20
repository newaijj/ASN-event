import { io, Socket } from "socket.io-client";

// Same-origin: backend serves the built frontend, so no host needed.
export const socket: Socket = io({ autoConnect: true });
