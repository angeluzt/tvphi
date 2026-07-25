import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.channel) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  await prisma.channelEmote.deleteMany({ where: { id: params.id, channelId: user.channel.id } });
  return NextResponse.json({ ok: true });
}
