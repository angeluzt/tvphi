import { NextResponse } from "next/server";
import { z } from "zod";
import { createSession, getCurrentUser, hashPassword, verifyPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  actual: z.string().min(1),
  nueva: z.string().min(6).max(100),
  confirmar: z.string().min(1),
}).refine((d) => d.nueva === d.confirmar, {
  message: "Las contraseñas nuevas no coinciden",
  path: ["confirmar"],
});

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Datos inválidos";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  const { actual, nueva } = parsed.data;

  if (!(await verifyPassword(actual, user.passwordHash))) {
    return NextResponse.json({ error: "La contraseña actual no es correcta" }, { status: 400 });
  }
  if (await verifyPassword(nueva, user.passwordHash)) {
    return NextResponse.json({ error: "La nueva contraseña debe ser distinta" }, { status: 400 });
  }

  const passwordHash = await hashPassword(nueva);
  // La fecha invalida las sesiones firmadas antes: si alguien tenía la cuenta
  // abierta en otro sitio, cambiar la contraseña ahora sí lo echa.
  const passwordChangedAt = new Date();
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { passwordHash, passwordChangedAt } }),
    // Invalida enlaces de reset pendientes al cambiar la contraseña.
    prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    }),
  ]);

  // Y se vuelve a firmar la de aquí, que si no se echaría a sí mismo.
  await createSession(user.id);

  return NextResponse.json({ ok: true });
}
