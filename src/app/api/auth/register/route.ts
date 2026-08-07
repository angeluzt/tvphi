import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createSession, hashPassword } from "@/lib/auth";
import { slugify } from "@/lib/utils";
import { defaultScenes } from "@/lib/scene";
import { enviarVerificacion } from "@/lib/email-verify";

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
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" }, { status: 400 });
  }
  const { email, username, password } = parsed.data;
  const displayName = parsed.data.displayName?.trim() || username;
  const slug = slugify(username);

  const exists = await prisma.user.findFirst({
    where: { OR: [{ email }, { username }] },
  });
  if (exists) {
    return NextResponse.json({ error: "Email o usuario ya en uso" }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: {
      email,
      username,
      displayName,
      passwordHash,
      channel: {
        create: {
          slug,
          title: `Proyecto de ${displayName}`,
          scenes: {
            create: defaultScenes().map((s) => ({
              name: s.name,
              order: s.order,
              layers: s.layers as any,
            })),
          },
        },
      },
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
    ok: true, username: user.username, slug,
    verificacion: { pendiente: true, correoEnviado, email: user.email },
  });
}
