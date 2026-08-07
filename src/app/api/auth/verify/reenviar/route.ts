import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { correoConfigurado } from "@/lib/email";
import { reenviarVerificacion } from "@/lib/email-verify";

// «No me llegó el correo». Pide sesión a propósito: así se manda siempre a la
// dirección de la cuenta y esto no sirve para mandarle correos a nadie más.

export const dynamic = "force-dynamic";

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  if (!correoConfigurado()) {
    return NextResponse.json(
      { error: "El correo no está configurado en el servidor. Avisa al administrador." },
      { status: 503 },
    );
  }

  const r = await reenviarVerificacion(user);
  if (r.yaEstaba) return NextResponse.json({ ok: true, yaEstaba: true });
  if (r.espera) {
    return NextResponse.json(
      { error: "Ya pediste varios enlaces. Espera unos minutos y mira también en spam." },
      { status: 429 },
    );
  }
  if (!r.ok) return NextResponse.json({ error: r.error ?? "No se pudo enviar" }, { status: 503 });
  return NextResponse.json({ ok: true, enviadoA: user.email });
}
