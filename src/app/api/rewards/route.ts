import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

const schema = z.object({
  title: z.string().min(1).max(60),
  cost: z.number().int().min(1).max(1_000_000),
  action: z.enum(["SHOW_MESSAGE", "PLAY_SOUND", "CHANGE_SCENE", "CUSTOM"]),
});

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user?.channel) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const reward = await prisma.channelReward.create({
    data: { channelId: user.channel.id, ...parsed.data },
  });
  return NextResponse.json({ ok: true, reward });
}
