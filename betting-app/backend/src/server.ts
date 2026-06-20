import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import { Server as SocketIOServer, type Socket } from "socket.io";
import { Session } from "./session.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT ?? 3000);
const LIQUIDITY_B = Number(process.env.LIQUIDITY_B ?? 80);
const HOST_TOKEN = process.env.HOST_TOKEN ?? "host123";

const session = new Session({ liquidityB: LIQUIDITY_B, hostToken: HOST_TOKEN });

const app = express();
const httpServer = http.createServer(app);
const io = new SocketIOServer(httpServer, { cors: { origin: "*" } });

// Serve the built frontend (see Dockerfile - frontend is built into ./public)
const publicDir = path.join(__dirname, "..", "public");
app.use(express.static(publicDir));
app.get("/health", (_req, res) => res.json({ ok: true }));

function broadcastState() {
  io.emit("state", session.publicState());
}

function isHost(socket: Socket): boolean {
  const userId = socket.data.userId;
  if (!userId) return false;
  const u = session.getUser(userId);
  return !!u?.isHost;
}

io.on("connection", (socket) => {
  socket.on("join", (payload: { nickname: string; hostToken?: string }, ack) => {
    try {
      const nickname = (payload.nickname ?? "").trim().slice(0, 24);
      if (!nickname) throw new Error("nickname required");
      const claimHost = !!payload.hostToken && payload.hostToken === HOST_TOKEN;
      const user = session.join(nickname, claimHost);
      session.attachSocket(user.id, socket.id);
      socket.data.userId = user.id;
      ack?.({ ok: true, userId: user.id, isHost: claimHost });
      broadcastState();
    } catch (err: any) {
      ack?.({ ok: false, error: err.message });
    }
  });

  socket.on("rejoin", (payload: { userId: string }, ack) => {
    const u = session.getUser(payload.userId);
    if (!u) {
      ack?.({ ok: false, error: "session expired - please rejoin with a nickname" });
      return;
    }
    session.attachSocket(u.id, socket.id);
    socket.data.userId = u.id;
    ack?.({ ok: true, userId: u.id, isHost: u.isHost });
    socket.emit("state", session.publicState());
  });

  socket.on("place_bet", (payload: { presentationId: string; coins: number }, ack) => {
    try {
      const userId = socket.data.userId;
      if (!userId) throw new Error("not joined");
      session.placeBet(userId, payload.presentationId, Number(payload.coins));
      ack?.({ ok: true });
      broadcastState();
    } catch (err: any) {
      ack?.({ ok: false, error: err.message });
    }
  });

  socket.on("cast_vote", (payload: { presentationId: string }, ack) => {
    try {
      const userId = socket.data.userId;
      if (!userId) throw new Error("not joined");
      session.castVote(userId, payload.presentationId);
      ack?.({ ok: true });
      broadcastState();
    } catch (err: any) {
      ack?.({ ok: false, error: err.message });
    }
  });

  // ---- host-only controls ----

  socket.on("host_set_presentations", (payload: { names: string[] }, ack) => {
    try {
      if (!isHost(socket)) throw new Error("host only");
      session.setPresentations(payload.names.map((n) => n.trim()).filter(Boolean));
      ack?.({ ok: true });
      broadcastState();
    } catch (err: any) {
      ack?.({ ok: false, error: err.message });
    }
  });

  socket.on("host_open_betting", (_payload, ack) => {
    try {
      if (!isHost(socket)) throw new Error("host only");
      session.openBetting();
      ack?.({ ok: true });
      broadcastState();
    } catch (err: any) {
      ack?.({ ok: false, error: err.message });
    }
  });

  socket.on("host_lock_betting", (_payload, ack) => {
    try {
      if (!isHost(socket)) throw new Error("host only");
      session.lockBetting();
      ack?.({ ok: true });
      broadcastState();
    } catch (err: any) {
      ack?.({ ok: false, error: err.message });
    }
  });

  socket.on("host_open_voting", (_payload, ack) => {
    try {
      if (!isHost(socket)) throw new Error("host only");
      session.openVoting();
      ack?.({ ok: true });
      broadcastState();
    } catch (err: any) {
      ack?.({ ok: false, error: err.message });
    }
  });

  socket.on("host_resolve", (_payload, ack) => {
    try {
      if (!isHost(socket)) throw new Error("host only");
      session.resolve();
      ack?.({ ok: true });
      broadcastState();
    } catch (err: any) {
      ack?.({ ok: false, error: err.message });
    }
  });

  socket.on("host_reset", (_payload, ack) => {
    try {
      if (!isHost(socket)) throw new Error("host only");
      session.reset();
      // Every connected client (including the host) loses their identity -
      // tell them all to log out before broadcasting the fresh empty state.
      io.emit("force_reset");
      broadcastState();
      ack?.({ ok: true });
    } catch (err: any) {
      ack?.({ ok: false, error: err.message });
    }
  });
});

// SPA fallback - must come after static + socket.io setup
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/socket.io")) return next();
  res.sendFile(path.join(publicDir, "index.html"));
});

httpServer.listen(PORT, () => {
  console.log(`Betting app listening on port ${PORT}`);
  console.log(`Host token: ${HOST_TOKEN}`);
});
