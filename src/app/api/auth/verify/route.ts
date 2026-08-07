import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { verificarConToken } from "@/lib/email-verify";

// El enlace del correo.
//
// Es un GET porque lo abre un navegador desde el correo, y contesta con una
// REDIRECCIÓN a una página, no con JSON: quien llega aquí es una persona
// mirando, no un programa. El resultado va en la URL para que la página pueda
// decir qué pasó sin volver a preguntar.

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const destino = (estado: string) =>
    NextResponse.redirect(
      new URL(`/auth/verificado?estado=${estado}`, env.appUrl),
      { status: 303 },
    );

  try {
    const r = await verificarConToken(token);
    if (r.ok) return destino(r.yaEstaba ? "ya" : "listo");
    return destino(r.motivo);
  } catch (e) {
    console.error("[verify] ", e);
    return destino("error");
  }
}
