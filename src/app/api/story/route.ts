import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

// Metadatos del proyecto (ligeros): texto/movimiento/transición de cada slide y
// capas de audio. Las imágenes/audios pesados viven en IndexedDB del navegador y
// se referencian por id (assetId/imageId/audioId), no se suben aquí.
const overlaySchema = z.object({
  id: z.string(),
  imageId: z.string(),
  x: z.number(), y: z.number(), w: z.number(), h: z.number(),
});
const slideSchema = z.object({
  id: z.string(),
  imageId: z.string(),
  narration: z.string().max(5000),
  audioId: z.string().optional(),
  narrationDur: z.number(),
  pan: z.enum(["none", "up", "down", "left", "right"]),
  zoom: z.enum(["none", "in", "out"]),
  transition: z.enum(["cut", "fade", "slide"]),
  overlays: z.array(overlaySchema).max(20),
});
const audioLayerSchema = z.object({
  id: z.string(),
  kind: z.enum(["music", "sfx"]),
  audioId: z.string(),
  name: z.string().max(120),
  volume: z.number(),
  startSec: z.number(),
  loop: z.boolean(),
});
const dataSchema = z.object({
  slides: z.array(slideSchema).max(200),
  audioLayers: z.array(audioLayerSchema).max(30),
  narrationVolume: z.number(),
});
const saveSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(80),
  data: dataSchema,
});

// GET            -> lista de proyectos (sin JSON pesado)
// GET ?id=xxx    -> un proyecto completo
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const id = new URL(req.url).searchParams.get("id");
  if (id) {
    const project = await prisma.storyProject.findFirst({
      where: { id, userId: user.id },
      select: { id: true, name: true, data: true, updatedAt: true },
    });
    if (!project) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    return NextResponse.json({ project });
  }

  const projects = await prisma.storyProject.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, updatedAt: true },
  });
  return NextResponse.json({ projects });
}

// POST -> crea o actualiza (si viene id) un proyecto del usuario.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const parsed = saveSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  const { id, name, data } = parsed.data;

  if (id) {
    const existing = await prisma.storyProject.findFirst({ where: { id, userId: user.id }, select: { id: true } });
    if (!existing) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    const project = await prisma.storyProject.update({
      where: { id },
      data: { name, data: data as any },
      select: { id: true, name: true, updatedAt: true },
    });
    return NextResponse.json({ ok: true, project });
  }

  const project = await prisma.storyProject.create({
    data: { userId: user.id, name, data: data as any },
    select: { id: true, name: true, updatedAt: true },
  });
  return NextResponse.json({ ok: true, project });
}

// DELETE ?id=xxx
export async function DELETE(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Falta id" }, { status: 400 });
  await prisma.storyProject.deleteMany({ where: { id, userId: user.id } });
  return NextResponse.json({ ok: true });
}
