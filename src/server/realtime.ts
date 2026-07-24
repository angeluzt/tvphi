import type { Server as HttpServer } from "http";
import { Server as IOServer, type Socket } from "socket.io";
import { prisma } from "../lib/prisma";
import { tokenFromCookieHeader, verifySessionToken } from "../lib/jwt";
import { getRestriction, resolveRole, roleAtLeast } from "../lib/channel";
import { applyPoints } from "../lib/points/ledger";
import { redeemReward } from "../lib/points/rewards";
import {
  channelRoom,
  type ChannelSettings,
  type ClientToServerEvents,
  type ServerToClientEvents,
  type ChatMessagePayload,
  type ChannelRoleName,
} from "../lib/realtime/events";

interface SocketData {
  userId: string | null;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  channelId: string;
  channelSlug: string;
  role: ChannelRoleName;
}

type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, {}, SocketData>;

// Presencia y slow-mode en memoria (suficiente para una instancia; para escalar
// horizontalmente se añadiría el adaptador Redis de Socket.IO).
const presence = new Map<string, Set<string>>(); // slug -> socketIds
const lastMessageAt = new Map<string, number>(); // channelId:userId -> ms

function settingsOf(ch: {
  isLive: boolean;
  subscriberOnlyChat: boolean;
  slowModeSeconds: number;
  emoteOnly: boolean;
}): ChannelSettings {
  return {
    isLive: ch.isLive,
    subscriberOnlyChat: ch.subscriberOnlyChat,
    slowModeSeconds: ch.slowModeSeconds,
    emoteOnly: ch.emoteOnly,
  };
}

export function attachRealtime(httpServer: HttpServer) {
  const io = new IOServer<ClientToServerEvents, ServerToClientEvents, {}, SocketData>(httpServer, {
    path: "/socket.io",
    cors: { origin: true, credentials: true },
  });

  // Autenticación por cookie de sesión (opcional: viewers anónimos permitidos).
  io.use(async (socket, next) => {
    const token = tokenFromCookieHeader(socket.handshake.headers.cookie);
    const userId = token ? await verifySessionToken(token) : null;
    socket.data.userId = userId;
    next();
  });

  io.on("connection", (socket: AppSocket) => {
    socket.on("join", async ({ channelSlug }, ack) => {
      try {
        const channel = await prisma.channel.findUnique({ where: { slug: channelSlug } });
        if (!channel) {
          ack?.({ ok: false, role: "VIEWER", settings: emptySettings(), error: "Canal no encontrado" });
          return;
        }

        let username = "invitado";
        let displayName = "Invitado";
        let avatarUrl: string | null = null;
        if (socket.data.userId) {
          const u = await prisma.user.findUnique({ where: { id: socket.data.userId } });
          if (u) {
            username = u.username;
            displayName = u.displayName;
            avatarUrl = u.avatarUrl;
          }
        }

        const role = await resolveRole(channel, socket.data.userId);
        socket.data.channelId = channel.id;
        socket.data.channelSlug = channel.slug;
        socket.data.username = username;
        socket.data.displayName = displayName;
        socket.data.avatarUrl = avatarUrl;
        socket.data.role = role;

        await socket.join(channelRoom(channel.slug));
        addPresence(channel.slug, socket.id);
        broadcastPresence(io, channel.slug);

        // Historial reciente de chat
        const recent = await prisma.chatMessage.findMany({
          where: { channelId: channel.id, deleted: false },
          orderBy: { createdAt: "desc" },
          take: 40,
          include: { user: true },
        });
        const history: ChatMessagePayload[] = [];
        for (const m of recent.reverse()) {
          const r = await resolveRole(channel, m.userId);
          history.push({
            id: m.id,
            user: {
              id: m.user.id,
              username: m.user.username,
              displayName: m.user.displayName,
              avatarUrl: m.user.avatarUrl,
              role: r,
            },
            body: m.body,
            createdAt: m.createdAt.toISOString(),
          });
        }
        socket.emit("chat:history", history);

        ack?.({ ok: true, role, settings: settingsOf(channel) });
      } catch (err) {
        ack?.({ ok: false, role: "VIEWER", settings: emptySettings(), error: "Error al unirse" });
        console.error("join error", err);
      }
    });

    socket.on("chat:send", async ({ body }) => {
      const d = socket.data;
      if (!d.userId || !d.channelId) {
        socket.emit("system:notice", { level: "error", message: "Inicia sesión para chatear" });
        return;
      }
      const text = (body ?? "").trim().slice(0, 500);
      if (!text) return;

      const channel = await prisma.channel.findUnique({ where: { id: d.channelId } });
      if (!channel) return;

      // Restricciones
      const restriction = await getRestriction(d.channelId, d.userId);
      if (restriction.banned) {
        socket.emit("system:notice", { level: "error", message: "Estás baneado de este chat" });
        return;
      }
      if (restriction.timedOutUntil && restriction.timedOutUntil > new Date()) {
        socket.emit("system:notice", { level: "error", message: "Estás en timeout" });
        return;
      }
      if (channel.subscriberOnlyChat && !roleAtLeast(d.role, "SUBSCRIBER")) {
        socket.emit("system:notice", {
          level: "error",
          message: "El chat es solo para suscriptores",
        });
        return;
      }
      // Slow mode (no aplica a mods/broadcaster)
      if (channel.slowModeSeconds > 0 && !roleAtLeast(d.role, "MODERATOR")) {
        const key = `${d.channelId}:${d.userId}`;
        const last = lastMessageAt.get(key) ?? 0;
        const waitMs = channel.slowModeSeconds * 1000 - (Date.now() - last);
        if (waitMs > 0) {
          socket.emit("system:notice", {
            level: "error",
            message: `Modo lento: espera ${Math.ceil(waitMs / 1000)}s`,
          });
          return;
        }
        lastMessageAt.set(key, Date.now());
      }

      const saved = await prisma.chatMessage.create({
        data: { channelId: d.channelId, userId: d.userId, body: text },
      });
      const payload: ChatMessagePayload = {
        id: saved.id,
        user: {
          id: d.userId,
          username: d.username,
          displayName: d.displayName,
          avatarUrl: d.avatarUrl,
          role: d.role,
        },
        body: text,
        createdAt: saved.createdAt.toISOString(),
      };
      io.to(channelRoom(d.channelSlug)).emit("chat:message", payload);
    });

    socket.on("mod", async (data) => {
      const d = socket.data;
      if (!d.userId || !d.channelId || !roleAtLeast(d.role, "MODERATOR")) return;

      if (data.type === "DELETE_MESSAGE" && data.messageId) {
        await prisma.chatMessage.update({ where: { id: data.messageId }, data: { deleted: true } });
        await prisma.moderationAction.create({
          data: { channelId: d.channelId, actorId: d.userId, targetId: d.userId, type: "DELETE_MESSAGE" },
        });
        io.to(channelRoom(d.channelSlug)).emit("chat:delete", { messageId: data.messageId });
        return;
      }

      if (!data.targetUsername) return;
      const target = await prisma.user.findUnique({ where: { username: data.targetUsername } });
      if (!target) {
        socket.emit("system:notice", { level: "error", message: "Usuario no encontrado" });
        return;
      }
      const expiresAt =
        data.type === "TIMEOUT" && data.seconds
          ? new Date(Date.now() + data.seconds * 1000)
          : null;

      await prisma.moderationAction.create({
        data: {
          channelId: d.channelId,
          actorId: d.userId,
          targetId: target.id,
          type: data.type as any,
          reason: data.reason,
          expiresAt,
        },
      });
      io.to(channelRoom(d.channelSlug)).emit("system:notice", {
        level: "info",
        message: `@${target.username}: ${data.type.toLowerCase()}`,
      });
    });

    socket.on("award", async ({ targetUsername, amount }) => {
      const d = socket.data;
      if (!d.userId || !d.channelId || !roleAtLeast(d.role, "MODERATOR")) return;
      const amt = Math.max(0, Math.floor(amount || 0));
      if (!amt) return;
      const target = await prisma.user.findUnique({ where: { username: targetUsername } });
      if (!target) return;
      const bal = await applyPoints({
        channelId: d.channelId,
        userId: target.id,
        type: "AWARD",
        amount: BigInt(amt),
        memo: `Otorgado por @${d.username}`,
      });
      emitToUser(io, d.channelSlug, target.id, "points:update", { balance: Number(bal) });
      socket.emit("system:notice", { level: "info", message: `+${amt} pts a @${target.username}` });
    });

    socket.on("reward:redeem", async ({ rewardId, userInput }) => {
      const d = socket.data;
      if (!d.userId || !d.channelId) {
        socket.emit("system:notice", { level: "error", message: "Inicia sesión para canjear" });
        return;
      }
      try {
        const { overlay, newBalance } = await redeemReward({
          channelId: d.channelId,
          rewardId,
          userId: d.userId,
          userInput,
        });
        io.to(channelRoom(d.channelSlug)).emit("overlay:action", overlay);
        io.to(channelRoom(d.channelSlug)).emit("alert", {
          id: overlay.id,
          kind: "redemption",
          title: `${d.displayName} canjeó ${String((overlay.payload as any).title ?? "un reward")}`,
          subtitle: userInput,
          accent: "#8b5cf6",
          durationMs: 6000,
        });
        socket.emit("points:update", { balance: newBalance });
      } catch (err: any) {
        socket.emit("system:notice", { level: "error", message: err?.message ?? "No se pudo canjear" });
      }
    });

    socket.on("settings:update", async (partial) => {
      const d = socket.data;
      if (!d.userId || !d.channelId || d.role !== "BROADCASTER") return;
      const updated = await prisma.channel.update({
        where: { id: d.channelId },
        data: {
          subscriberOnlyChat: partial.subscriberOnlyChat,
          slowModeSeconds: partial.slowModeSeconds,
          emoteOnly: partial.emoteOnly,
        },
      });
      io.to(channelRoom(d.channelSlug)).emit("channel:settings", settingsOf(updated));
    });

    socket.on("overlay:test", ({ kind }) => {
      const d = socket.data;
      if (!d.channelSlug || !roleAtLeast(d.role, "BROADCASTER")) return;
      io.to(channelRoom(d.channelSlug)).emit("alert", {
        id: `test_${Date.now()}`,
        kind,
        title:
          kind === "donation"
            ? "Alguien donó $9.99"
            : kind === "subscription"
              ? "Nuevo suscriptor: Fan_01"
              : kind === "follow"
                ? "Nuevo seguidor: Fan_02"
                : "Reward canjeado",
        subtitle: "¡Mensaje de prueba desde el Studio!",
        amount: kind === "donation" ? "$9.99" : undefined,
        accent: "#22d3ee",
        durationMs: 6000,
      });
    });

    socket.on("disconnect", () => {
      const slug = socket.data.channelSlug;
      if (slug) {
        removePresence(slug, socket.id);
        broadcastPresence(io, slug);
      }
    });
  });

  // Exponer io al resto del proceso (route handlers de Next) para poder emitir
  // eventos desde webhooks/APIs (donaciones, suscripciones, etc.).
  (globalThis as any).__tvphi_io = io;
  return io;
}

// ---- helpers ----

function emptySettings(): ChannelSettings {
  return { isLive: false, subscriberOnlyChat: false, slowModeSeconds: 0, emoteOnly: false };
}

function addPresence(slug: string, socketId: string) {
  if (!presence.has(slug)) presence.set(slug, new Set());
  presence.get(slug)!.add(socketId);
}
function removePresence(slug: string, socketId: string) {
  presence.get(slug)?.delete(socketId);
}
function broadcastPresence(io: IOServer<any, any, any, any>, slug: string) {
  const viewers = presence.get(slug)?.size ?? 0;
  io.to(channelRoom(slug)).emit("presence", { viewers });
}

// Emite un evento a todos los sockets de un usuario concreto dentro de un canal.
function emitToUser(
  io: IOServer<ClientToServerEvents, ServerToClientEvents, {}, SocketData>,
  slug: string,
  userId: string,
  event: "points:update",
  payload: { balance: number },
) {
  for (const [, s] of io.of("/").sockets) {
    const sd = s.data as SocketData;
    if (sd.userId === userId && sd.channelSlug === slug) {
      s.emit(event, payload);
    }
  }
}
