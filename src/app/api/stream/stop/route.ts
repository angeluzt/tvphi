import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { emitSettingsToChannel } from "@/server/emit";

export async function POST() {
  const user = await getCurrentUser();
  if (!user?.channel) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const channel = await prisma.channel.update({
    where: { id: user.channel.id },
    data: { isLive: false },
  });
  await prisma.streamSession.updateMany({
    where: { channelId: channel.id, endedAt: null },
    data: { endedAt: new Date() },
  });

  emitSettingsToChannel(channel.slug, {
    isLive: false,
    subscriberOnlyChat: channel.subscriberOnlyChat,
    slowModeSeconds: channel.slowModeSeconds,
    emoteOnly: channel.emoteOnly,
  });

  return NextResponse.json({ ok: true });
}
