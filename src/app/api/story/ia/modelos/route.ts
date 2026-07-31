import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { descifrar } from "@/lib/story/credenciales";
import { repartir, CONOCIDOS } from "@/lib/story/modelos";

// Qué modelos puede usar ESTA cuenta.
//
// Se le pregunta a OpenAI en vez de llevar una lista escrita a fuego: así no
// envejece y no aparecen modelos que la clave del usuario no puede usar (que
// darían un 404 al generar, sin explicar por qué).
//
// La consulta a /v1/models no cuesta tokens.

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const cred = await prisma.aiCredential.findUnique({ where: { userId: user.id } });
  // Sin clave no hay lista de la cuenta, pero sí la de siempre: así el
  // desplegable nunca sale vacío.
  if (!cred) return NextResponse.json({ deLaCuenta: false, modelos: CONOCIDOS });
  const key = descifrar(cred.encrypted);
  if (!key) return NextResponse.json({ deLaCuenta: false, modelos: CONOCIDOS });

  try {
    const r = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
    });
    const texto = await r.text();
    let j: any = null;
    try { j = JSON.parse(texto); } catch {}
    if (!r.ok) {
      // Se devuelve la lista conocida igualmente: mejor eso que dejar al
      // usuario sin nada que elegir.
      return NextResponse.json({
        deLaCuenta: false, modelos: CONOCIDOS,
        aviso: j?.error?.message || `OpenAI respondió ${r.status}`,
      });
    }
    const ids: string[] = (j?.data ?? []).map((m: any) => String(m?.id ?? "")).filter(Boolean);
    const modelos = repartir(ids);
    // Si el reparto deja alguna tarea vacía (cuenta limitada, o nombres que no
    // reconozco), se completa con los conocidos para que se pueda seguir.
    for (const t of ["texto", "imagen", "voz"] as const) {
      if (!modelos[t].length) modelos[t] = CONOCIDOS[t];
    }
    return NextResponse.json({ deLaCuenta: true, total: ids.length, modelos });
  } catch (e: any) {
    return NextResponse.json({
      deLaCuenta: false, modelos: CONOCIDOS,
      aviso: "No se pudo hablar con OpenAI: " + (e?.message ?? ""),
    });
  }
}
