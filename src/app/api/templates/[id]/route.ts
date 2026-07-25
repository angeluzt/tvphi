import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { sceneSchema } from "@/lib/scene";

// Devuelve las escenas de una plantilla (para cargarla en el Studio).
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const tpl = await prisma.template.findFirst({
    where: { id: params.id, userId: user.id },
  });
  if (!tpl) return NextResponse.json({ error: "No encontrada" }, { status: 404 });

  const parsed = z.array(sceneSchema).safeParse(tpl.data);
  return NextResponse.json({
    id: tpl.id,
    name: tpl.name,
    scenes: parsed.success ? parsed.data : [],
  });
}

const putSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  scenes: z.array(sceneSchema).min(1).optional(),
});

// Renombra y/o actualiza (sobrescribe) una plantilla.
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const parsed = putSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const owned = await prisma.template.findFirst({ where: { id: params.id, userId: user.id }, select: { id: true } });
  if (!owned) return NextResponse.json({ error: "No encontrada" }, { status: 404 });

  const tpl = await prisma.template.update({
    where: { id: params.id },
    data: {
      ...(parsed.data.name ? { name: parsed.data.name } : {}),
      ...(parsed.data.scenes ? { data: parsed.data.scenes as any } : {}),
    },
    select: { id: true, name: true, updatedAt: true },
  });
  return NextResponse.json({ ok: true, template: tpl });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  await prisma.template.deleteMany({ where: { id: params.id, userId: user.id } });
  return NextResponse.json({ ok: true });
}
