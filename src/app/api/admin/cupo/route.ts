import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { esAdminHistorias, guardarLimiteIa, leerLimiteIa } from "@/lib/story/cupo";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!esAdminHistorias(user.email)) {
    return NextResponse.json({ error: "Solo administradores" }, { status: 403 });
  }
  const limite = await leerLimiteIa();
  return NextResponse.json({ limite });
}

const body = z.object({
  limite: z.number().int().min(1).max(100),
});

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!esAdminHistorias(user.email)) {
    return NextResponse.json({ error: "Solo administradores" }, { status: 403 });
  }
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Indica un número entre 1 y 100." }, { status: 400 });
  }
  try {
    const limite = await guardarLimiteIa(parsed.data.limite);
    return NextResponse.json({ ok: true, limite });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
