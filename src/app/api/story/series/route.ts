import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

// Series: agrupan capítulos (proyectos) y personajes. Todo opcional — lo que no
// tiene serie sigue funcionando igual que antes.

const dataSchema = z.object({
  description: z.string().max(8000),
  // El estilo común es lo que hace que los capítulos se parezcan entre sí.
  style: z.string().max(8000),
  model: z.string().max(200),
  seed: z.string().max(80),
  notes: z.string().max(8000),
});
const saveSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(120),
  data: dataSchema,
});

function normalize(raw: any) {
  const d = raw && typeof raw === "object" ? raw : {};
  const t = (v: any) => (typeof v === "string" ? v : "");
  return { description: t(d.description), style: t(d.style), model: t(d.model), seed: t(d.seed), notes: t(d.notes) };
}

// GET -> las series del usuario, con cuántos capítulos y personajes lleva cada una.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const rows = await prisma.storySeries.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { projects: true, characters: true } } },
  });
  const series = rows.map((r) => ({
    id: r.id, name: r.name, data: normalize(r.data),
    capitulos: r._count.projects, personajes: r._count.characters,
    updatedAt: r.updatedAt.toISOString(),
  }));
  return NextResponse.json({ series });
}

// POST -> crea o actualiza una serie.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const parsed = saveSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  const { id, name, data } = parsed.data;
  if (id) {
    const hay = await prisma.storySeries.findFirst({ where: { id, userId: user.id }, select: { id: true } });
    if (!hay) return NextResponse.json({ error: "No encontrada" }, { status: 404 });
    const s = await prisma.storySeries.update({ where: { id }, data: { name, data: data as any } });
    return NextResponse.json({ ok: true, serie: { id: s.id, name: s.name, data, updatedAt: s.updatedAt.toISOString() } });
  }
  const s = await prisma.storySeries.create({ data: { userId: user.id, name, data: data as any } });
  return NextResponse.json({ ok: true, serie: { id: s.id, name: s.name, data, updatedAt: s.updatedAt.toISOString() } });
}

// DELETE ?id=xxx -> borra la serie. Sus capítulos y personajes NO se borran:
// se quedan sueltos, sin serie.
export async function DELETE(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Falta id" }, { status: 400 });
  await prisma.storySeries.deleteMany({ where: { id, userId: user.id } });
  return NextResponse.json({ ok: true });
}
