import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { esAdminHistorias } from "@/lib/story/cupo";
import { leerAjustes, guardarAjustes } from "@/lib/story/ajustes";

// Los mandos del gasto. Solo admin, y solo desde aquí: las rutas de IA leen
// estos valores del servidor, así que tocar la petición desde el navegador no
// sirve de nada.

export const dynamic = "force-dynamic";

const cuerpo = z.object({
  calidadImagen: z.enum(["low", "medium", "high"]).optional(),
  imagenesPorDia: z.number().int().min(0).max(500).optional(),
  historiasPorDia: z.number().int().min(0).max(100).optional(),
  vozDePago: z.boolean().optional(),
  imagenesIa: z.boolean().optional(),
});

async function puerta() {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: "No autorizado" }, { status: 401 }) };
  if (!esAdminHistorias(user.email)) {
    return { error: NextResponse.json({ error: "Solo administradores" }, { status: 403 }) };
  }
  return { user };
}

export async function GET() {
  const g = await puerta();
  if (g.error) return g.error;
  return NextResponse.json({ ok: true, ajustes: await leerAjustes() });
}

export async function POST(req: Request) {
  const g = await puerta();
  if (g.error) return g.error;

  const parsed = cuerpo.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const detalle = parsed.error.issues
      .map((i) => `${i.path.join(".") || "cuerpo"}: ${i.message}`)
      .join(" · ");
    return NextResponse.json({ error: `Datos inválidos — ${detalle}` }, { status: 400 });
  }
  try {
    return NextResponse.json({ ok: true, ajustes: await guardarAjustes(parsed.data) });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "No se pudo guardar" }, { status: 400 });
  }
}
