import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { cifrar, pista, pareceClaveOpenAi, MODELOS_POR_DEFECTO } from "@/lib/story/credenciales";

// La clave de OpenAI del usuario. Se guarda cifrada y NO se devuelve nunca:
// lo único que sale de aquí es si hay una puesta y sus cuatro últimos caracteres.

// Un modelo por tarea: no todos hacen de todo. Los baratos de texto no generan
// audio, así que tener uno solo no vale.
const modelos = z.object({
  texto: z.string().max(80),
  imagen: z.string().max(80),
  voz: z.string().max(80),
  vozNombre: z.string().max(40),
});
const guardar = z.object({
  key: z.string().min(20).max(300).optional(),
  models: modelos.partial().optional(),
});


// GET -> ¿hay clave? ¿cuál es?  (sin la clave)
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const c = await prisma.aiCredential.findUnique({
    where: { userId: user.id },
    select: { provider: true, hint: true, models: true, updatedAt: true },
  });
  return NextResponse.json({
    configurada: !!c, provider: c?.provider ?? null, pista: c?.hint ?? null,
    models: { ...MODELOS_POR_DEFECTO, ...((c?.models as any) ?? {}) },
  });
}

// POST -> guarda o reemplaza la clave.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const parsed = guardar.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  const { key, models } = parsed.data;

  // Se pueden cambiar solo los modelos, sin volver a escribir la clave.
  if (!key) {
    if (!models) return NextResponse.json({ error: "No hay nada que guardar" }, { status: 400 });
    const hay = await prisma.aiCredential.findUnique({ where: { userId: user.id }, select: { models: true } });
    if (!hay) return NextResponse.json({ error: "Pon primero tu clave" }, { status: 400 });
    const fusion = { ...MODELOS_POR_DEFECTO, ...((hay.models as any) ?? {}), ...models };
    await prisma.aiCredential.update({ where: { userId: user.id }, data: { models: fusion as any } });
    return NextResponse.json({ ok: true, configurada: true, models: fusion });
  }

  const limpia = key.trim();
  if (!pareceClaveOpenAi(limpia)) {
    return NextResponse.json({ error: "Eso no parece una clave de OpenAI (empiezan por «sk-»)" }, { status: 400 });
  }
  const datos = { provider: "openai", encrypted: cifrar(limpia), hint: pista(limpia) };
  // Los modelos que vengan se FUNDEN con los guardados: cambiar la clave no
  // debe borrar el modelo de voz que ya estaba puesto.
  const previos = await prisma.aiCredential.findUnique({ where: { userId: user.id }, select: { models: true } });
  const fusion = { ...MODELOS_POR_DEFECTO, ...((previos?.models as any) ?? {}), ...(models ?? {}) };
  const c = await prisma.aiCredential.upsert({
    where: { userId: user.id },
    create: { userId: user.id, ...datos, models: fusion as any },
    update: { ...datos, models: fusion as any },
  });
  return NextResponse.json({
    ok: true, configurada: true, pista: datos.hint,
    models: { ...MODELOS_POR_DEFECTO, ...((c.models as any) ?? {}) },
  });
}

// DELETE -> la borra.
export async function DELETE() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  await prisma.aiCredential.deleteMany({ where: { userId: user.id } });
  return NextResponse.json({ ok: true, configurada: false });
}
