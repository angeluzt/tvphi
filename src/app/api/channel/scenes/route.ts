import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { sceneSchema } from "@/lib/scene";

const bodySchema = z.object({ scenes: z.array(sceneSchema) });

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user?.channel) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Escenas inválidas" }, { status: 400 });

  const channelId = user.channel.id;
  const scenes = parsed.data.scenes;

  await prisma.$transaction([
    prisma.scene.deleteMany({ where: { channelId } }),
    ...scenes.map((s, i) =>
      prisma.scene.create({
        data: {
          id: s.id,
          channelId,
          name: s.name,
          order: i,
          layers: s.layers as any,
        },
      }),
    ),
  ]);

  return NextResponse.json({ ok: true });
}
