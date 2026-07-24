import { prisma } from "./prisma";
import type { ChannelRoleName } from "./realtime/events";
import type { Channel } from "@prisma/client";

// Resuelve el rol efectivo de un usuario dentro de un canal.
export async function resolveRole(
  channel: Pick<Channel, "id" | "ownerId">,
  userId: string | null,
): Promise<ChannelRoleName> {
  if (!userId) return "VIEWER";
  if (channel.ownerId === userId) return "BROADCASTER";

  const [member, sub] = await Promise.all([
    prisma.channelMember.findUnique({
      where: { channelId_userId: { channelId: channel.id, userId } },
    }),
    prisma.subscription.findUnique({
      where: { channelId_userId: { channelId: channel.id, userId } },
    }),
  ]);

  if (member?.role === "MODERATOR") return "MODERATOR";
  if (sub?.status === "ACTIVE") return "SUBSCRIBER";
  if (member?.role === "SUBSCRIBER") return "SUBSCRIBER";
  return "VIEWER";
}

export interface Restriction {
  banned: boolean;
  blocked: boolean;
  timedOutUntil: Date | null;
}

// Calcula el estado de restricción actual de un usuario en un canal a partir del
// histórico de acciones de moderación (par acción/deshacer, timeout con expiración).
export async function getRestriction(channelId: string, userId: string): Promise<Restriction> {
  const actions = await prisma.moderationAction.findMany({
    where: { channelId, targetId: userId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  let banned = false;
  let blocked = false;
  let timedOutUntil: Date | null = null;
  let banDecided = false;
  let blockDecided = false;

  for (const a of actions) {
    if (!banDecided && (a.type === "BAN" || a.type === "UNBAN")) {
      banned = a.type === "BAN";
      banDecided = true;
    }
    if (!blockDecided && (a.type === "BLOCK" || a.type === "UNBLOCK")) {
      blocked = a.type === "BLOCK";
      blockDecided = true;
    }
    if (a.type === "TIMEOUT" && a.expiresAt && a.expiresAt > new Date() && !timedOutUntil) {
      timedOutUntil = a.expiresAt;
    }
  }

  return { banned, blocked, timedOutUntil };
}

export function roleAtLeast(role: ChannelRoleName, min: ChannelRoleName): boolean {
  const order: ChannelRoleName[] = ["VIEWER", "SUBSCRIBER", "MODERATOR", "BROADCASTER"];
  return order.indexOf(role) >= order.indexOf(min);
}
