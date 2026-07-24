import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { emitSettingsToChannel } from "@/server/emit";

const schema = z.object({
  title: z.string().min(1).max(80).optional(),
  description: z.string().max(500).optional(),
  subscriberOnlyChat: z.boolean().optional(),
  slowModeSeconds: z.number().int().min(0).max(600).optional(),
  emoteOnly: z.boolean().optional(),
});

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user?.channel) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const channel = await prisma.channel.update({
    where: { id: user.channel.id },
    data: parsed.data,
  });

  emitSettingsToChannel(channel.slug, {
    isLive: channel.isLive,
    subscriberOnlyChat: channel.subscriberOnlyChat,
    slowModeSeconds: channel.slowModeSeconds,
    emoteOnly: channel.emoteOnly,
  });

  return NextResponse.json({ ok: true });
}
