import "server-only";
import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { enviarCorreoReset } from "@/lib/email";

const TTL_MS = 60 * 60 * 1000; // 1 hora
const MSG_OK =
  "Si esa cuenta existe, te enviamos un correo con un enlace para elegir una nueva contraseña.";

function hashToken(raw: string) {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

function nuevoTokenRaw() {
  return randomBytes(32).toString("base64url");
}

/** Invalida tokens previos y crea uno nuevo; envía el correo. Mensaje siempre genérico. */
export async function solicitarResetPorEmail(email: string): Promise<{ message: string; error?: string }> {
  const normalizado = email.trim().toLowerCase();
  const user = await prisma.user.findFirst({
    where: { email: { equals: normalizado, mode: "insensitive" } },
  });

  // Misma respuesta si no existe: no filtrar cuentas.
  if (!user) return { message: MSG_OK };

  const raw = nuevoTokenRaw();
  const tokenHash = hashToken(raw);
  const expiresAt = new Date(Date.now() + TTL_MS);

  await prisma.$transaction([
    prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    }),
    prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash, expiresAt },
    }),
  ]);

  const resetUrl = `${env.appUrl.replace(/\/$/, "")}/auth/reset?token=${encodeURIComponent(raw)}`;
  const envio = await enviarCorreoReset({
    to: user.email,
    displayName: user.displayName,
    resetUrl,
  });
  if (!envio.ok) return { message: MSG_OK, error: envio.error };
  return { message: MSG_OK };
}

export type TokenValido = { id: string; userId: string };

/** Comprueba token en bruto (del enlace). No lo marca como usado. */
export async function validarTokenReset(raw: string): Promise<TokenValido | null> {
  const token = raw.trim();
  if (!token || token.length < 20 || token.length > 200) return null;
  const row = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
  });
  if (!row || row.usedAt) return null;
  if (row.expiresAt.getTime() <= Date.now()) return null;
  return { id: row.id, userId: row.userId };
}

/** Marca el token usado (idempotente si ya estaba). */
export async function consumirTokenReset(id: string) {
  await prisma.passwordResetToken.updateMany({
    where: { id, usedAt: null },
    data: { usedAt: new Date() },
  });
}
