import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { solicitarResetPorEmail } from "@/lib/password-reset";

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

  // Pequeña espera constante: dificulta medir si el email existía.
  const started = Date.now();
  const result = await solicitarResetPorEmail(email);
  const wait = 400 - (Date.now() - started);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));

  if (result.error && process.env.NODE_ENV === "production") {
    // En prod, si Resend falla de verdad, avisar sin revelar existencia de cuenta
    // solo cuando el usuario está logueado (ya conoce su email).
    if (user) {
      return NextResponse.json({ error: result.error }, { status: 503 });
    }
  }

  return NextResponse.json({ ok: true, message: result.message });
}
