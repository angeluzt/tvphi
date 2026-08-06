import "server-only";
import { Resend } from "resend";
import { env, isProd } from "@/lib/env";

let client: Resend | null = null;
function resend() {
  if (!env.resendApiKey) return null;
  if (!client) client = new Resend(env.resendApiKey);
  return client;
}

/**
 * ¿Se puede enviar correo en este despliegue?
 *
 * Se pregunta ANTES de buscar la cuenta a propósito. La respuesta no depende
 * de quién pide el enlace, así que se puede contar sin filtrar si esa cuenta
 * existe; y es el fallo más habitual con diferencia —desplegar sin la clave—,
 * que antes se tragaba en silencio.
 */
export function correoConfigurado() {
  return !!env.resendApiKey || !isProd;
}

/**
 * Envía el enlace de restablecer contraseña.
 * Sin RESEND_API_KEY en desarrollo: escribe el enlace en la consola del servidor.
 */
export async function enviarCorreoReset(opts: {
  to: string;
  displayName: string;
  resetUrl: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const asunto = "Restablecer tu contraseña en TVPHI";
  const texto =
    `Hola ${opts.displayName},\n\n` +
    `Pediste restablecer tu contraseña. Abre este enlace (válido 1 hora):\n\n` +
    `${opts.resetUrl}\n\n` +
    `Si no fuiste tú, ignora este correo. Tu contraseña no cambiará.\n`;
  const html =
    `<p>Hola ${escapeHtml(opts.displayName)},</p>` +
    `<p>Pediste restablecer tu contraseña. El enlace caduca en <strong>1 hora</strong>.</p>` +
    `<p><a href="${escapeAttr(opts.resetUrl)}">Elegir nueva contraseña</a></p>` +
    `<p style="color:#666;font-size:13px">Si el botón no abre, copia y pega:<br>${escapeHtml(opts.resetUrl)}</p>` +
    `<p style="color:#666;font-size:13px">Si no pediste esto, ignora el mensaje.</p>`;

  const api = resend();
  if (!api) {
    if (isProd) {
      return { ok: false, error: "El correo no está configurado en el servidor." };
    }
    console.info("[email] RESEND_API_KEY ausente — enlace de reset:\n", opts.resetUrl);
    return { ok: true };
  }

  const { error } = await api.emails.send({
    from: env.emailFrom,
    to: opts.to,
    subject: asunto,
    text: texto,
    html,
  });
  if (error) {
    console.error("[email] Resend:", error);
    return { ok: false, error: "No se pudo enviar el correo. Inténtalo más tarde." };
  }
  return { ok: true };
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function escapeAttr(s: string) {
  return escapeHtml(s).replace(/'/g, "&#39;");
}
