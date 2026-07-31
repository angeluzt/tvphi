import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { cifrar, pista, pareceClaveOpenAi } from "@/lib/story/credenciales";

// La clave de OpenAI del usuario. Se guarda cifrada y NO se devuelve nunca:
// lo único que sale de aquí es si hay una puesta y sus cuatro últimos caracteres.

const guardar = z.object({ key: z.string().min(20).max(300) });

// GET -> ¿hay clave? ¿cuál es?  (sin la clave)
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const c = await prisma.aiCredential.findUnique({
    where: { userId: user.id },
    select: { provider: true, hint: true, updatedAt: true },
  });
  return NextResponse.json({ configurada: !!c, provider: c?.provider ?? null, pista: c?.hint ?? null });
}

// POST -> guarda o reemplaza la clave.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const parsed = guardar.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  const key = parsed.data.key.trim();
  if (!pareceClaveOpenAi(key)) {
    return NextResponse.json({ error: "Eso no parece una clave de OpenAI (empiezan por «sk-»)" }, { status: 400 });
  }
  const datos = { provider: "openai", encrypted: cifrar(key), hint: pista(key) };
  await prisma.aiCredential.upsert({
    where: { userId: user.id },
    create: { userId: user.id, ...datos },
    update: datos,
  });
  return NextResponse.json({ ok: true, configurada: true, pista: datos.hint });
}

// DELETE -> la borra.
export async function DELETE() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  await prisma.aiCredential.deleteMany({ where: { userId: user.id } });
  return NextResponse.json({ ok: true, configurada: false });
}
