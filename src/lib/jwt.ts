import { SignJWT, jwtVerify } from "jose";
import { env } from "./env";

// Firma/verificación de sesiones. Sin dependencias de Next, para poder usarse
// tanto en route handlers como en el servidor de realtime (Socket.IO).

const secret = new TextEncoder().encode(env.authSecret);
export const SESSION_COOKIE = "tvphi_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 días

export async function signSession(userId: string) {
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(secret);
}

export async function verifySessionToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    return (payload.sub as string) ?? null;
  } catch {
    return null;
  }
}

// Extrae el token de sesión de una cabecera Cookie cruda.
export function tokenFromCookieHeader(cookieHeader?: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === SESSION_COOKIE) return decodeURIComponent(v.join("="));
  }
  return null;
}
