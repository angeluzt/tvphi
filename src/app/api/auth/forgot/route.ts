import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { correoConfigurado } from "@/lib/email";
import { demasiadasPeticiones, solicitarResetPorEmail } from "@/lib/password-reset";

const schema = z.object({
  email: z.string().email().max(200).optional(),
});

/**
 * Pide el correo de restablecer.
 * - Sin sesión: hace falta `email`.
 * - Con sesión: usa el correo de la cuenta (el del formulario se ignora).
 * La respuesta es genérica para no filtrar si la cuenta existe.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Email no válido" }, { status: 400 });
  }

  const email = user?.email ?? parsed.data.email;
  if (!email) {
    return NextResponse.json({ error: "Indica tu email" }, { status: 400 });
  }

  // Esto se mira antes de tocar la base de datos: si el despliegue no tiene
  // configurado el correo, no hay enlace que enviar, y decirlo aquí no filtra
  // nada porque la respuesta es la misma exista la cuenta o no.
  if (!correoConfigurado()) {
    return NextResponse.json(
      { error: "El correo no está configurado en el servidor. Avisa al administrador." },
      { status: 503 },
    );
  }

  // Un tope por dirección: si no, cualquiera puede llenarle el buzón a otro
  // pidiendo enlaces sin parar, y de paso gastar el cupo de envíos.
  const origen = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? req.headers.get("x-real-ip");
  if (await demasiadasPeticiones(email, origen)) {
    return NextResponse.json(
      { error: "Ya se pidieron varios enlaces para ese correo. Espera unos minutos." },
      { status: 429 },
    );
  }

  // Pequeña espera constante: dificulta medir si el email existía.
  const started = Date.now();
  const result = await solicitarResetPorEmail(email);
  const wait = 400 - (Date.now() - started);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));

  // Un fallo de envío sí depende de que la cuenta exista —solo se intenta
  // enviar si existe—, así que solo se cuenta a quien ya ha entrado y por
  // tanto no descubre nada que no supiera. Al resto, el mensaje de siempre;
  // el motivo queda en los logs del servidor.
  if (result.error && user) {
    return NextResponse.json({ error: result.error }, { status: 503 });
  }

  return NextResponse.json({ ok: true, message: result.message });
}
