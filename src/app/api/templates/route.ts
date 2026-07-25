import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { sceneSchema } from "@/lib/scene";

const createSchema = z.object({
  name: z.string().min(1).max(60),
  scenes: z.array(sceneSchema).min(1),
});

// Lista las plantillas del usuario (sin el JSON pesado).
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const templates = await prisma.template.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, updatedAt: true },
  });
  return NextResponse.json({ templates });
}

// Guarda las escenas actuales como una plantilla nueva.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const tpl = await prisma.template.create({
    data: { userId: user.id, name: parsed.data.name, data: parsed.data.scenes as any },
    select: { id: true, name: true, updatedAt: true },
  });
  return NextResponse.json({ ok: true, template: tpl });
}
