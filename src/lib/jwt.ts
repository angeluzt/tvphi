import { SignJWT, jwtVerify } from "jose";
import { env } from "./env";

// Firma/verificación de sesiones JWT (cookie httpOnly).
//
// El secreto se resuelve LAZY: si se evalúa al importar el módulo, `next build`
// (NODE_ENV=production) rompe el deploy cuando AUTH_SECRET solo existe en
// runtime del contenedor (caso típico en Railway).

export const SESSION_COOKIE = "tvphi_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 días

let secretoCache: Uint8Array | null = null;
function secretoJwt() {
  if (!secretoCache) secretoCache = new TextEncoder().encode(env.authSecret);
  return secretoCache;
}

export async function signSession(userId: string) {
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(secretoJwt());
}

export async function verifySessionToken(token: string): Promise<string | null> {
  return (await verifySession(token))?.userId ?? null;
}

/**
 * Igual que la anterior, pero devuelve también CUÁNDO se firmó.
 *
 * Hace falta para poder tirar sesiones: la sesión es un JWT firmado, no hay
 * ninguna tabla que borrar, así que la única forma de invalidar las viejas es
 * comparar su fecha de emisión con la del último cambio de contraseña.
 */
export async function verifySession(
  token: string,
): Promise<{ userId: string; emitido: Date } | null> {
  try {
    const { payload } = await jwtVerify(token, secretoJwt());
    const userId = payload.sub;
    if (!userId || typeof payload.iat !== "number") return null;
    return { userId, emitido: new Date(payload.iat * 1000) };
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
