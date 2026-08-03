import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { claveOpenAi, OPENAI } from "@/lib/story/credenciales";
import { repartir, CONOCIDOS } from "@/lib/story/modelos";
import { leerFallidos } from "@/lib/story/fallidos";

// Qué modelos puede usar la clave del SERVIDOR.
//
// Se le pregunta a OpenAI en vez de llevar una lista escrita a fuego: así no
// envejece. Sin OPENAI_API_KEY se devuelve la lista conocida de referencia.

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const key = claveOpenAi();
  const fallidos = await leerFallidos(user.id);
  if (!key) {
    return NextResponse.json({
      deLaCuenta: false,
      modelos: CONOCIDOS,
      aviso: "La IA no está disponible ahora.",
      fallidos,
    });
  }

  try {
    const r = await fetch(OPENAI("/v1/models"), {
      headers: { Authorization: `Bearer ${key}` },
    });
    const texto = await r.text();
    let j: any = null;
    try { j = JSON.parse(texto); } catch {}
    if (!r.ok) {
      return NextResponse.json({
        deLaCuenta: false, modelos: CONOCIDOS,
        aviso: j?.error?.message || `OpenAI respondió ${r.status}`,
        fallidos,
      });
    }
    const ids: string[] = (j?.data ?? []).map((m: any) => String(m?.id ?? "")).filter(Boolean);
    const modelos = repartir(ids, fallidos);
    for (const t of ["texto", "imagen", "voz"] as const) {
      if (!modelos[t].length) modelos[t] = CONOCIDOS[t];
    }
    return NextResponse.json({
      deLaCuenta: true, total: ids.length, modelos, fallidos,
    });
  } catch (e: any) {
    return NextResponse.json({
      deLaCuenta: false, modelos: CONOCIDOS,
      aviso: "No se pudo hablar con OpenAI: " + (e?.message ?? ""),
      fallidos,
    });
  }
}
