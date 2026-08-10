import "server-only";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { env } from "./env";
import { prisma } from "./prisma";
import { SESSION_COOKIE, SESSION_MAX_AGE, signSession, verifySession, verifySessionToken } from "./jwt";

export { verifySessionToken };

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 10);
}
export async function verifyPassword(pw: string, hash: string) {
  return bcrypt.compare(pw, hash);
}

export async function createSession(userId: string) {
  const token = await signSession(userId);
  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.nodeEnv === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

export function destroySession() {
  cookies().set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
}

/**
 * Margen al comparar fechas: el «iat» del JWT va en segundos, así que una
 * sesión recién firmada puede quedar hasta un segundo por detrás del cambio de
 * contraseña que la provocó. Sin esto, cambiar la contraseña te echaría a ti
 * mismo del navegador desde el que la cambiaste.
 */
const MARGEN_MS = 2000;

export async function getSessionUserId(): Promise<string | null> {
  return (await getCurrentUser())?.id ?? null;
}

export async function getCurrentUser() {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const sesion = await verifySession(token);
  if (!sesion) return null;

  const user = await prisma.user.findUnique({
    where: { id: sesion.userId },
  });
  if (!user) return null;

  // Una sesión firmada ANTES del último cambio de contraseña ya no vale. Es lo
  // que hace que restablecer la contraseña sirva de algo cuando alguien te ha
  // robado la sesión: si no, la cookie robada seguía entrando treinta días.
  if (user.passwordChangedAt &&
      sesion.emitido.getTime() < user.passwordChangedAt.getTime() - MARGEN_MS) {
    return null;
  }
  return user;
}

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;
