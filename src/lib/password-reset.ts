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

// ── Tope de peticiones ──────────────────────────────────────────────────────
//
// Se lleva EN MEMORIA y no en la base de datos a propósito. Contando los
// tokens guardados solo se frenaría a las cuentas que existen, y entonces el
// 429 diría «esta cuenta existe» a quien fuera probando direcciones. Aquí se
// cuenta la dirección pedida, exista o no.
//
// Se pierde al reiniciar el servidor, y con varias instancias cada una lleva
// la suya. Aun así frena lo que hay que frenar: llenarle el buzón a alguien a
// base de pedir enlaces, y gastar el cupo de envíos.

const VENTANA_MS = 15 * 60 * 1000;
// Tres por dirección: es el que de verdad protege el buzón de una persona.
const TOPE_POR_CORREO = 3;
// El de la IP va MUY por encima a propósito. Muchos usuarios legítimos
// comparten salida —una oficina, un colegio, una operadora móvil—, y apretarlo
// convierte la protección en un bloqueo a gente que no ha hecho nada. Aquí solo
// está para cortar una avalancha contra direcciones distintas.
const TOPE_POR_ORIGEN = 60;
const registro = new Map<string, number[]>();

function apuntar(clave: string, tope: number, ahora: number) {
  const previos = (registro.get(clave) ?? []).filter((t) => ahora - t < VENTANA_MS);
  if (previos.length >= tope) {
    registro.set(clave, previos);
    return true;
  }
  previos.push(ahora);
  registro.set(clave, previos);
  return false;
}

/** true si hay que cortar. Cuenta por dirección y por quien la pide. */
export async function demasiadasPeticiones(email: string, origen?: string | null) {
  const ahora = Date.now();
  // Limpieza perezosa, para que el mapa no crezca sin fin.
  if (registro.size > 5000) {
    for (const [k, v] of registro) {
      if (!v.some((t) => ahora - t < VENTANA_MS)) registro.delete(k);
    }
  }
  const porCorreo = apuntar(`c:${email.trim().toLowerCase()}`, TOPE_POR_CORREO, ahora);
  const porOrigen = origen ? apuntar(`o:${origen}`, TOPE_POR_ORIGEN, ahora) : false;
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

/** Marca el token usado (idempotente si ya estaba). */
export async function consumirTokenReset(id: string) {
  await prisma.passwordResetToken.updateMany({
    where: { id, usedAt: null },
    data: { usedAt: new Date() },
  });
}
