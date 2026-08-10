import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createSession, hashPassword } from "@/lib/auth";
import { enviarVerificacion } from "@/lib/email-verify";
import { comprobarCaptcha } from "@/lib/captcha";
import { pasarse, origen } from "@/lib/rate-limit";

// Abrir cuenta.
//
// TRES CAPAS, y ninguna sirve sola:
//
// 1. Tope por IP. Es la única que no depende de nadie de fuera y la única que
//    estaba faltando: sin ella un guion abría cuentas tan rápido como aguantara
//    el servidor.
// 2. Captcha (Turnstile), si está configurado. Convierte «gratis e infinito» en
//    «cuesta algo por cuenta».
// 3. Confirmar el correo, que ya estaba: hace falta un buzón de verdad para
//    tocar la IA, que es lo único que gasta dinero.

/**
 * Cuántas cuentas puede abrir una misma salida a internet.
 *
 * Va holgado a propósito: una casa, una oficina, un colegio o una operadora
 * móvil comparten IP, y apretarlo convierte la defensa en un bloqueo a gente
 * que no ha hecho nada. Cinco en una hora no molesta a nadie normal y le rompe
 * el ritmo a un guion, que es de lo que se trata.
 */
const TOPE_HORA = 5;
const TOPE_DIA = 20;
const HORA = 60 * 60 * 1000;
const DIA = 24 * HORA;

const schema = z.object({
  email: z.string().email("Ese email no parece válido."),
  username: z.string()
    .min(3, "El usuario necesita al menos 3 letras.")
    .max(24, "El usuario no puede pasar de 24 letras.")
    .regex(/^[a-zA-Z0-9_]+$/, "El usuario solo admite letras, números y _"),
  /**
   * El formulario NO lo pide como obligatorio y siempre manda algo, aunque sea
   * "". Con `min(1)` eso fallaba, así que dejar el campo en blanco —lo normal,
   * porque pone «opcional»— impedía registrarse, y encima con el mensaje de zod
   * en inglés: «String must contain at least 1 character(s)».
   */
  displayName: z.string().max(40, "El nombre no puede pasar de 40 letras.").optional(),
  password: z.string()
    .min(6, "La contraseña necesita al menos 6 caracteres.")
    .max(100, "La contraseña es demasiado larga."),
  /** El token de Turnstile. Si el captcha está apagado, no se mira. */
  captcha: z.string().max(4000).optional(),
});

export async function POST(req: Request) {
  // El tope va ANTES de leer el cuerpo y antes de tocar la base: lo que se
  // quiere frenar es el volumen, y hacer trabajo por cada intento es
  // exactamente lo que busca quien manda muchos.
  const ip = origen(req);
  if (pasarse(`reg:h:${ip}`, TOPE_HORA, HORA) || pasarse(`reg:d:${ip}`, TOPE_DIA, DIA)) {
    return NextResponse.json(
      { error: "Se han abierto varias cuentas desde aquí. Prueba dentro de un rato." },
      { status: 429 },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" }, { status: 400 });
  }

  const captcha = await comprobarCaptcha(parsed.data.captcha, ip);
  if (!captcha.ok) {
    return NextResponse.json({ error: captcha.error, captcha: true }, { status: 400 });
  }

  const { email, username, password } = parsed.data;
  const displayName = parsed.data.displayName?.trim() || username;

  const exists = await prisma.user.findFirst({
    where: { OR: [{ email }, { username }] },
  });
  if (exists) {
    return NextResponse.json({ error: "Email o usuario ya en uso" }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);
  // Canal/streaming antiguo: ya no se crea. El producto es historias narradas.
  const user = await prisma.user.create({
    data: {
      email,
      username,
      displayName,
      passwordHash,
    },
  });

  await createSession(user.id);

  // Se entra ya, con la cuenta sin confirmar. El editor funciona entero desde
  // el primer momento; lo único que espera al correo es la IA, que es lo que
  // cuesta dinero. Y si el envío falla, el registro NO se cae: la cuenta ya
  // existe, y desde dentro puede pedir el enlace otra vez.
  let correoEnviado = true;
  try {
    const envio = await enviarVerificacion(user);
    correoEnviado = envio.ok;
    if (!envio.ok) console.error("[register] verificación:", envio.error);
  } catch (e) {
    correoEnviado = false;
    console.error("[register] verificación:", e);
  }

  return NextResponse.json({
    ok: true, username: user.username,
    verificacion: { pendiente: true, correoEnviado, email: user.email },
  });
}
