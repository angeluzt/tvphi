import "server-only";
import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { enviarCorreoVerificacion } from "@/lib/email";

// Comprobar que el correo es de quien se registró.
//
// PARA QUÉ SIRVE, que marca todo lo demás: para que nadie se apunte con
// direcciones de usar y tirar y queme la clave de OpenAI, que la paga el dueño
// del despliegue. NO es para cerrarle la puerta a quien se registra: sin
// verificar se entra igual y se usa el editor entero, que no cuesta nada. Lo
// único que se bloquea es lo que gasta dinero.
//
// El mecanismo es el mismo que el de restablecer contraseña —se guarda el hash
// del token y no el token, caduca, y se marca usado— porque ya estaba probado
// y no hacía falta inventar otro.

const TTL_MS = 2 * 24 * 60 * 60 * 1000; // 2 días: se registra uno de noche y lo abre al día siguiente.

function hashToken(raw: string) {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

// ── Tope de reenvíos ────────────────────────────────────────────────────────
//
// En memoria y por cuenta, igual que en el reset y por lo mismo: aquí sí se
// sabe ya quién pide (hace falta sesión), así que no hay nada que filtrar, pero
// sigue haciendo falta que nadie se mande cien correos a sí mismo y agote el
// cupo de envíos de Resend, que es compartido por todo el despliegue.

const VENTANA_MS = 15 * 60 * 1000;
const TOPE = 3;
const reenvios = new Map<string, number[]>();

function demasiados(userId: string): boolean {
  const ahora = Date.now();
  if (reenvios.size > 5000) {
    for (const [k, v] of reenvios) {
      if (!v.some((t) => ahora - t < VENTANA_MS)) reenvios.delete(k);
    }
  }
  const previos = (reenvios.get(userId) ?? []).filter((t) => ahora - t < VENTANA_MS);
  if (previos.length >= TOPE) {
    reenvios.set(userId, previos);
    return true;
  }
  previos.push(ahora);
  reenvios.set(userId, previos);
  return false;
}

/**
 * Crea un token nuevo y manda el correo. Invalida los anteriores: si alguien
 * pide otro enlace porque no le llegó el primero, que solo valga el último.
 */
export async function enviarVerificacion(
  user: { id: string; email: string; displayName: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const raw = randomBytes(32).toString("base64url");

  await prisma.$transaction([
    prisma.emailVerificationToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    }),
    prisma.emailVerificationToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(raw),
        email: user.email,
        expiresAt: new Date(Date.now() + TTL_MS),
      },
    }),
  ]);

  const verifyUrl =
    `${env.appUrl.replace(/\/$/, "")}/api/auth/verify?token=${encodeURIComponent(raw)}`;
  return enviarCorreoVerificacion({
    to: user.email,
    displayName: user.displayName,
    verifyUrl,
  });
}

/** Reenvía, con tope. `espera` significa que hay que esperar, no que falle. */
export async function reenviarVerificacion(
  user: { id: string; email: string; displayName: string; emailVerifiedAt: Date | null },
): Promise<{ ok: boolean; yaEstaba?: boolean; espera?: boolean; error?: string }> {
  if (user.emailVerifiedAt) return { ok: true, yaEstaba: true };
  if (demasiados(user.id)) return { ok: false, espera: true };
  const envio = await enviarVerificacion(user);
  return envio.ok ? { ok: true } : { ok: false, error: envio.error };
}

export type ResultadoVerificar =
  | { ok: true; yaEstaba: boolean }
  | { ok: false; motivo: "invalido" | "caducado" | "otro-correo" };

/** Comprueba el token del enlace y marca la cuenta como verificada. */
export async function verificarConToken(raw: string): Promise<ResultadoVerificar> {
  const token = (raw ?? "").trim();
  if (!token || token.length < 20 || token.length > 200) return { ok: false, motivo: "invalido" };

  const row = await prisma.emailVerificationToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { select: { id: true, email: true, emailVerifiedAt: true } } },
  });
  if (!row) return { ok: false, motivo: "invalido" };

  // Un token ya usado sobre una cuenta ya verificada no es un error que haya
  // que enseñar: es alguien que abrió el enlace dos veces, o el que lo abrió
  // primero fue el antivirus del correo. Se le dice que ya está.
  if (row.user.emailVerifiedAt) return { ok: true, yaEstaba: true };
  if (row.usedAt) return { ok: false, motivo: "invalido" };
  if (row.expiresAt.getTime() <= Date.now()) return { ok: false, motivo: "caducado" };

  // Si la cuenta cambió de dirección después de pedir el enlace, este token
  // probaba la dirección vieja y ya no dice nada de la nueva.
  if (row.email.trim().toLowerCase() !== row.user.email.trim().toLowerCase()) {
    return { ok: false, motivo: "otro-correo" };
  }

  await prisma.$transaction([
    prisma.emailVerificationToken.updateMany({
      where: { id: row.id, usedAt: null },
      data: { usedAt: new Date() },
    }),
    prisma.user.update({
      where: { id: row.userId },
      data: { emailVerifiedAt: new Date() },
    }),
  ]);
  return { ok: true, yaEstaba: false };
}

export const AVISO_SIN_VERIFICAR =
  "Confirma tu correo para poder usar la IA. Te mandamos un enlace al registrarte; "
  + "si no llegó, puedes pedir otro desde tu cuenta.";
