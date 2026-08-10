import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { normalizeCharacterData } from "@/lib/story/characters";
import {
  MAX_BYTES_JSON_PERSONAJE, MAX_PERSONAJES_POR_USUARIO,
  bytesJson, cuerpoDemasiadoGrande,
} from "@/lib/story/limites";
import { resolverSeriesId } from "@/lib/story/series-id";

// Fichas de personaje. Igual que los proyectos: aquí solo van los textos y las
// referencias; las imágenes pesan y viven en el navegador (IndexedDB).

const imageSchema = z.object({
  id: z.string().max(80),
  name: z.string().max(200),
  prompt: z.string().max(4000).optional(),
  seed: z.string().max(80).optional(),
  note: z.string().max(1000).optional(),
});

const dataSchema = z.object({
  description: z.string().max(8000),
  prompt: z.string().max(8000),
  negative: z.string().max(4000),
  model: z.string().max(200),
  seed: z.string().max(80),
  params: z.string().max(2000),
  notes: z.string().max(8000),
  images: z.array(imageSchema).max(120),
});

const saveSchema = z.object({
  // Personaje de una serie. null lo suelta; sin el campo, se deja como esté.
  seriesId: z.string().nullable().optional(),
  id: z.string().optional(),
  name: z.string().min(1).max(120),
  data: dataSchema,
});

// GET -> todas las fichas del usuario, con su contenido: son ligeras.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const rows = await prisma.storyCharacter.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
  });
  const characters = rows.map((r) => ({
    id: r.id,
    name: r.name,
    seriesId: r.seriesId,
    data: normalizeCharacterData(r.data),
    updatedAt: r.updatedAt.toISOString(),
  }));
  return NextResponse.json({ characters });
}

// POST -> crea o actualiza (si viene id) una ficha del usuario.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const peso = cuerpoDemasiadoGrande(req, MAX_BYTES_JSON_PERSONAJE * 2);
  if (peso) return NextResponse.json({ error: peso }, { status: 413 });
  const parsed = saveSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  const { id, name, data, seriesId } = parsed.data;
  if (bytesJson(data) > MAX_BYTES_JSON_PERSONAJE) {
    return NextResponse.json({ error: "La ficha es demasiado grande." }, { status: 413 });
  }
  const serie = await resolverSeriesId(user.id, seriesId);
  if (!serie.ok) return NextResponse.json({ error: serie.error }, { status: 403 });

  if (id) {
    const existing = await prisma.storyCharacter.findFirst({ where: { id, userId: user.id }, select: { id: true } });
    if (!existing) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    const character = await prisma.storyCharacter.update({
      where: { id },
      data: { name, data: data as any, ...(serie.seriesId !== undefined ? { seriesId: serie.seriesId } : {}) },
    });
    return NextResponse.json({ ok: true, character: { id: character.id, name: character.name, seriesId: character.seriesId, data, updatedAt: character.updatedAt.toISOString() } });
  }

  const cuantos = await prisma.storyCharacter.count({ where: { userId: user.id } });
  if (cuantos >= MAX_PERSONAJES_POR_USUARIO) {
    return NextResponse.json({
      error: `Has llegado al tope de ${MAX_PERSONAJES_POR_USUARIO} personajes.`,
    }, { status: 409 });
  }

  const character = await prisma.storyCharacter.create({
    data: { userId: user.id, name, data: data as any, seriesId: serie.seriesId ?? null },
  });
  return NextResponse.json({ ok: true, character: { id: character.id, name: character.name, seriesId: character.seriesId, data, updatedAt: character.updatedAt.toISOString() } });
}

// DELETE ?id=xxx
export async function DELETE(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Falta id" }, { status: 400 });
  await prisma.storyCharacter.deleteMany({ where: { id, userId: user.id } });
  return NextResponse.json({ ok: true });
}
