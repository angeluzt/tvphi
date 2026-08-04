import { NextResponse } from "next/server";
import { z } from "zod";
import { destroySession, hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { consumirTokenReset, validarTokenReset } from "@/lib/password-reset";

const schema = z.object({
  token: z.string().min(20).max(200),
  nueva: z.string().min(6).max(100),
  confirmar: z.string().min(1),
}).refine((d) => d.nueva === d.confirmar, {
  message: "Las contraseñas no coinciden",
  path: ["confirmar"],
});

/** Comprueba si el token del enlace sigue valiendo (para la página /auth/reset). */
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const ok = !!(await validarTokenReset(token));
  return NextResponse.json({ ok });
}

/** Aplica la nueva contraseña y cierra sesión. El cliente redirige a login. */
export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Datos inválidos";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const row = await validarTokenReset(parsed.data.token);
  if (!row) {
    return NextResponse.json(
      { error: "El enlace no es válido o ya caducó. Pide uno nuevo." },
      { status: 400 },
    );
  }

  const passwordHash = await hashPassword(parsed.data.nueva);
  await prisma.$transaction([
    prisma.user.update({ where: { id: row.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.updateMany({
      where: { userId: row.userId, usedAt: null },
      data: { usedAt: new Date() },
    }),
  ]);
  await consumirTokenReset(row.id);
  destroySession();

  return NextResponse.json({ ok: true });
}
