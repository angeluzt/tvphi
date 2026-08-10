import "server-only";
import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { enviarCorreoReset } from "@/lib/email";
import { pasarse } from "@/lib/rate-limit";

const TTL_MS = 60 * 60 * 1000; // 1 hora
const MSG_OK =
  "Si esa cuenta existe, te enviamos un correo con un enlace para elegir una nueva contraseña.";

function hashToken(raw: string) {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

// ── Tope de peticiones ──────────────────────────────────────────────────────
//
// Se cuenta la DIRECCIÓN PEDIDA, exista o no la cuenta. Contando los tokens
// guardados solo se frenaría a las cuentas que existen, y entonces el 429
// diría «esta cuenta existe» a quien fuera probando direcciones.

const VENTANA_MS = 15 * 60 * 1000;
// Tres por dirección: es el que de verdad protege el buzón de una persona.
const TOPE_POR_CORREO = 3;
// El de la IP va MUY por encima a propósito. Muchos usuarios legítimos
// comparten salida —una oficina, un colegio, una operadora móvil—, y apretarlo
// convierte la protección en un bloqueo a gente que no ha hecho nada. Aquí solo
// está para cortar una avalancha contra direcciones distintas.
const TOPE_POR_ORIGEN = 60;

/** true si hay que cortar. Cuenta por dirección y por quien la pide. */
export async function demasiadasPeticiones(email: string, origen?: string | null) {
  const porCorreo = pasarse(`reset:c:${email.trim().toLowerCase()}`, TOPE_POR_CORREO, VENTANA_MS);
  const porOrigen = origen ? pasarse(`reset:o:${origen}`, TOPE_POR_ORIGEN, VENTANA_MS) : false;
  return porCorreo || porOrigen;
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

/** Marca el token usado de forma atómica. Solo gana la primera petición concurrente. */
export async function reclamarTokenReset(raw: string): Promise<TokenValido | null> {
  const token = raw.trim();
  if (!token || token.length < 20 || token.length > 200) return null;
  const tokenHash = hashToken(token);
  const ahora = new Date();
  return prisma.$transaction(async (tx) => {
    const row = await tx.passwordResetToken.findUnique({ where: { tokenHash } });
    if (!row || row.usedAt || row.expiresAt.getTime() <= ahora.getTime()) return null;
    const marcado = await tx.passwordResetToken.updateMany({
      where: { id: row.id, usedAt: null },
      data: { usedAt: ahora },
    });
    if (marcado.count !== 1) return null;
    return { id: row.id, userId: row.userId };
  });
}

/** Marca el token usado (idempotente si ya estaba). */
export async function consumirTokenReset(id: string) {
  await prisma.passwordResetToken.updateMany({
    where: { id, usedAt: null },
    data: { usedAt: new Date() },
  });
}
