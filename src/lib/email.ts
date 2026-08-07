import "server-only";
import { Resend } from "resend";
import { env, isProd } from "@/lib/env";
import { correoHtml } from "@/lib/email-plantilla";

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
  const texto =
    `Hola ${opts.displayName},\n\n` +
    `Pediste restablecer tu contraseña en TVPHI. Abre este enlace (válido 1 hora):\n\n` +
    `${opts.resetUrl}\n\n` +
    `Si no fuiste tú, ignora este correo. Tu contraseña no cambiará.\n\n` +
    `— TVPHI · ${env.appUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")}\n`;

  return enviar({
    to: opts.to,
    subject: "Restablecer tu contraseña en TVPHI",
    texto,
    html: correoHtml({
      avance: "Elige una contraseña nueva. El enlace vale 1 hora.",
      titulo: "Restablecer tu contraseña",
      saludo: `Hola ${opts.displayName},`,
      parrafos: [
        "Pediste elegir una contraseña nueva. Pulsa el botón y te dejamos ponerla.",
        "El enlace caduca en <b>1 hora</b> y solo se puede usar una vez.",
      ],
      boton: { texto: "Elegir nueva contraseña", url: opts.resetUrl },
      coletilla:
        "Si no pediste esto, ignora el correo: tu contraseña sigue siendo la misma "
        + "y nadie ha entrado en tu cuenta.",
    }),
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
    `Te damos la bienvenida a TVPHI. Confirma que esta dirección es tuya abriendo ` +
    `este enlace (válido 2 días):\n\n` +
    `${opts.verifyUrl}\n\n` +
    `Mientras tanto ya puedes usar el editor entero. Al confirmar se activan las ` +
    `funciones con IA: escribir capítulos, generar imágenes y la narración.\n\n` +
    `Si no te registraste en TVPHI, ignora este correo.\n\n` +
    `— TVPHI · ${env.appUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")}\n`;

  return enviar({
    to: opts.to,
    subject: "Confirma tu correo en TVPHI",
    texto,
    html: correoHtml({
      avance: "Confirma tu correo y se activan las funciones con IA.",
      titulo: "Confirma tu correo",
      saludo: `Hola ${opts.displayName},`,
      parrafos: [
        "Te damos la bienvenida a TVPHI. Solo falta comprobar que esta dirección es tuya.",
        "Mientras tanto <b>ya puedes usar el editor entero</b>: subir imágenes, montar el "
        + "video, narrarlo con la voz del navegador y descargarlo.",
        "Al confirmar se activan además las funciones con IA — escribir capítulos, "
        + "generar imágenes y la narración de calidad.",
        "El enlace caduca en <b>2 días</b>.",
      ],
      boton: { texto: "Confirmar mi correo", url: opts.verifyUrl },
      coletilla:
        "Si no te registraste en TVPHI, ignora este correo y no pasará nada: "
        + "sin confirmar, la cuenta no puede usar la IA.",
    }),
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
