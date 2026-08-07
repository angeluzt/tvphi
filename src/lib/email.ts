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

  return enviar({
    to: opts.to,
    subject: asunto,
    texto,
    html,
    etiquetaDev: "enlace de reset",
    enlaceDev: opts.resetUrl,
  });
}

/**
 * Envía el enlace para comprobar que el correo es de quien se registró.
 * Sin RESEND_API_KEY en desarrollo: escribe el enlace en la consola.
 */
export async function enviarCorreoVerificacion(opts: {
  to: string;
  displayName: string;
  verifyUrl: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const texto =
    `Hola ${opts.displayName},\n\n` +
    `Confirma que esta dirección es tuya abriendo este enlace (válido 2 días):\n\n` +
    `${opts.verifyUrl}\n\n` +
    `Si no te registraste en TVPHI, ignora este correo: sin confirmar, la cuenta no hace nada.\n`;
  const html =
    `<p>Hola ${escapeHtml(opts.displayName)},</p>` +
    `<p>Confirma que esta dirección es tuya. El enlace caduca en <strong>2 días</strong>.</p>` +
    `<p><a href="${escapeAttr(opts.verifyUrl)}">Confirmar mi correo</a></p>` +
    `<p style="color:#666;font-size:13px">Si el botón no abre, copia y pega:<br>${escapeHtml(opts.verifyUrl)}</p>` +
    `<p style="color:#666;font-size:13px">Si no te registraste en TVPHI, ignora el mensaje.</p>`;

  return enviar({
    to: opts.to,
    subject: "Confirma tu correo en TVPHI",
    texto,
    html,
    etiquetaDev: "enlace de verificación",
    enlaceDev: opts.verifyUrl,
  });
}

/** Lo común a los dos correos: cliente, modo desarrollo y traducción del error. */
async function enviar(o: {
  to: string; subject: string; texto: string; html: string;
  etiquetaDev: string; enlaceDev: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const api = resend();
  if (!api) {
    if (isProd) return { ok: false, error: "El correo no está configurado en el servidor." };
    console.info(`[email] RESEND_API_KEY ausente — ${o.etiquetaDev}:\n`, o.enlaceDev);
    return { ok: true };
  }
  const { error } = await api.emails.send({
    from: env.emailFrom, to: o.to, subject: o.subject, text: o.texto, html: o.html,
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
