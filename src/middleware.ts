import { NextResponse, type NextRequest } from "next/server";
import { isProd } from "@/lib/env";

/**
 * Cabeceras defensivas. La CSP es deliberadamente permisiva con inline/eval:
 * Next, FFmpeg WASM y el captcha de Turnstile los necesitan. Un endurecimiento
 * más estricto se puede hacer más adelante sin romper el editor.
 */
export function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const headers = res.headers;

  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", "payment=(), interest-cohort=()");
  headers.set("X-DNS-Prefetch-Control", "off");

  // Studio antiguo usa cámara; el flujo de historias no. No bloqueamos camera/
  // microphone del todo por si alguien entra a restos de /studio.
  headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "media-src 'self' blob: data:",
      "font-src 'self' data:",
      // Solo el propio sitio y el captcha. ffmpeg.wasm se sirve desde /ffmpeg,
      // así que no hace falta abrirle la puerta a ningún CDN: todo el código
      // que se ejecuta aquí sale de este despliegue.
      "connect-src 'self' https://challenges.cloudflare.com",
      "worker-src 'self' blob:",
      "child-src 'self' blob:",
      "frame-src https://challenges.cloudflare.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join("; "),
  );

  if (isProd && req.nextUrl.protocol === "https:") {
    headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }

  return res;
}

export const config = {
  matcher: [
    /*
     * Todo excepto estáticos de Next y favicon.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|mp3|wav|ogg)$).*)",
  ],
};
