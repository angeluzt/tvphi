import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

// Metadatos del proyecto (ligeros): texto/movimiento/transición de cada slide y
// capas de audio. Las imágenes/audios pesados viven en IndexedDB del navegador y
// se referencian por id (assetId/imageId/audioId), no se suben aquí.
const frameSchema = z.object({ cx: z.number(), cy: z.number(), w: z.number() });
const presetSchema = z.object({
  kind: z.enum(["fixed", "left", "right", "up", "down", "in", "out"]),
  cx: z.number(), cy: z.number(), w: z.number(), distance: z.number(),
});
const overlaySchema = z.object({
  id: z.string(),
  imageId: z.string(),
  x: z.number(), y: z.number(), w: z.number(), h: z.number(),
  motion: z.enum(["fixed", "follow", "free"]),
  toX: z.number(), toY: z.number(), toW: z.number(), toH: z.number(),
  transition: z.enum(["inherit", "cut", "fade", "slide"]),
  // Cuándo se ve dentro de la toma.
  timing: z.enum(["all", "range", "after"]).optional(),
  startSec: z.number().optional(),
  endSec: z.number().optional(),
  durSec: z.number().optional(),
});
const dialogueSchema = z.object({
  id: z.string(),
  text: z.string().max(5000),
  audioId: z.string().optional(),
  dur: z.number(),
  gapSec: z.number(),
  effect: z.enum(["none", "deep", "demon", "whisper", "robot", "cave", "radio", "high"]),
  // El texto cambió y la voz aún es la antigua.
  stale: z.boolean().optional(),
});
const shotSfxSchema = z.object({
  id: z.string(),
  audioId: z.string(),
  name: z.string().max(120),
  volume: z.number(),
  dur: z.number(),
  gapSec: z.number(),
  loop: z.boolean(),
});
const audioOverrideSchema = z.object({
  sfxId: z.string(),
  stop: z.boolean(),
  volume: z.number().nullable(),
});
// Encuadre guardado para un formato que no es el activo (horizontal/vertical…).
const framingSchema = z.object({
  motionMode: z.enum(["preset", "free"]),
  preset: presetSchema,
  from: frameSchema,
  to: frameSchema,
});
const shotSchema = z.object({
  id: z.string(),
  altFrames: z.record(z.string(), framingSchema).optional(),
  durationSec: z.number(),
  autoDuration: z.boolean(),
  holdSec: z.number(),
  motionMode: z.enum(["preset", "free"]),
  preset: presetSchema,
  from: frameSchema,
  to: frameSchema,
  transition: z.enum(["cut", "fade", "slide"]),
  transitionDur: z.number(),
  dialogues: z.array(dialogueSchema).max(50),
  sfx: z.array(shotSfxSchema).max(20),
  audioOverrides: z.array(audioOverrideSchema).max(30),
  overlays: z.array(overlaySchema).max(20),
});
const sceneSchema = z.object({
  id: z.string(),
  imageId: z.string(),
  imgW: z.number(),
  imgH: z.number(),
  shots: z.array(shotSchema).max(50),
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
// Videos que se pegan antes/después al exportar. Como todo lo pesado, el archivo
// vive en el navegador; aquí solo se guarda a cuál se refiere.
const clipSchema = z.object({
  assetId: z.string(),
  name: z.string().max(200),
  dur: z.number(),
}).nullable();
const dataSchema = z.object({
  aspect: z.enum(["16:9", "9:16", "1:1"]).optional(),
  scenes: z.array(sceneSchema).max(200),
  audioLayers: z.array(audioLayerSchema).max(30),
  narrationVolume: z.number(),
  intro: clipSchema.optional(),
  outro: clipSchema.optional(),
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
