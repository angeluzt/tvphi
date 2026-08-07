import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { esAdminHistorias } from "@/lib/story/cupo";
import { leerGasto } from "@/lib/story/gasto";

// Lo gastado en OpenAI, para el panel de administración.
//
// Cerrado a admin y sin excepciones: aquí se ve la factura de la organización
// entera, no la de un usuario. Lo que sale por aquí son SUMAS; la clave de
// administrador se queda en el servidor y no aparece ni en la respuesta ni en
// los mensajes de error.

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!esAdminHistorias(user.email)) {
    return NextResponse.json({ error: "Solo administradores" }, { status: 403 });
  }

  const pedidos = Number(new URL(req.url).searchParams.get("dias"));
  const dias = Number.isFinite(pedidos) ? Math.max(1, Math.min(90, pedidos)) : 30;

  // Cualquier fallo sale como JSON. Sin esto, un error inesperado lo contesta
  // Next con su página de error, y el panel —que espera JSON— solo sabía decir
  // «Unexpected token '<'», que no ayuda a nadie a arreglar nada.
  try {
    const g = await leerGasto(dias);
    if ("error" in g) return NextResponse.json({ error: g.error }, { status: 502 });
    return NextResponse.json({ ok: true, ...g });
  } catch (e: any) {
    console.error("[gasto] ", e);
    return NextResponse.json(
      { error: "Falló al leer los costes: " + (e?.message ?? "error desconocido") },
      { status: 500 },
    );
  }
}
