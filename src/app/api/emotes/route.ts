import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { EMOTE_CODE_RE } from "@/lib/emotes";

const schema = z.object({
  code: z.string().regex(EMOTE_CODE_RE, "Código inválido (2-24, letras/números/_)"),
  imageUrl: z
    .string()
    .startsWith("data:image/", "Debe ser una imagen")
    .max(400_000, "Imagen muy grande (máx ~300 KB)"),
});

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user?.channel) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" }, { status: 400 });
  }

  const existing = await prisma.channelEmote.findUnique({
    where: { channelId_code: { channelId: user.channel.id, code: parsed.data.code } },
  });
  if (existing) return NextResponse.json({ error: "Ya tienes un emote con ese código" }, { status: 409 });

  const emote = await prisma.channelEmote.create({
    data: { channelId: user.channel.id, code: parsed.data.code, imageUrl: parsed.data.imageUrl },
  });
  return NextResponse.json({ ok: true, emote: { id: emote.id, code: emote.code, imageUrl: emote.imageUrl } });
}
