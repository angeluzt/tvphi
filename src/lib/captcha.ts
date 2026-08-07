import "server-only";

// Comprobar que quien se registra es una persona, con Cloudflare Turnstile.
//
// POR QUÉ TURNSTILE Y NO OTRO: es gratis de verdad y sin tope que importe, no
// enseña rompecabezas de semáforos a casi nadie, y no hace falta tener el
// dominio en Cloudflare — basta una cuenta gratuita para sacar las dos claves.
//
// APAGADO SI NO ESTÁ CONFIGURADO. Sin TURNSTILE_SECRET_KEY esto deja pasar todo,
// para que el registro siga funcionando en local y para que un despliegue no se
// quede sin poder dar de alta a nadie por una variable que falta. Lo que protege
// mientras tanto es el tope por IP, que no depende de nadie de fuera.
//
// Y QUE QUEDE CLARO: ningún captcha es infalible. Hay servicios que los
// resuelven por dinero. Lo que hace es cambiar «gratis e infinito» por «cuesta
// algo por cuenta», que para el que quiere abrir miles ya no sale a cuenta.

const VERIFICAR = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** La clave pública, la que sí puede ver el navegador. Vacía = apagado. */
export function claveSitioCaptcha(): string {
  return (process.env["TURNSTILE_SITE_KEY"] ?? "").trim();
}

function claveSecreta(): string {
  return (process.env["TURNSTILE_SECRET_KEY"] ?? "").trim();
}

/** ¿Está puesto? Hacen falta las DOS: una sola no protege nada. */
export function hayCaptcha(): boolean {
  return !!claveSitioCaptcha() && !!claveSecreta();
}

export type ResultadoCaptcha = { ok: true } | { ok: false; error: string };

/**
 * Valida el token contra Cloudflare. Se hace SIEMPRE en el servidor: el
 * resultado que trae el navegador no vale nada, porque el navegador es
 * justamente lo que no nos fiamos.
 */
export async function comprobarCaptcha(
  token: string | undefined | null,
  ip?: string,
): Promise<ResultadoCaptcha> {
  if (!hayCaptcha()) return { ok: true };

  const t = (token ?? "").trim();
  if (!t) return { ok: false, error: "Falta la comprobación de seguridad. Recarga la página." };

  const form = new URLSearchParams();
  form.set("secret", claveSecreta());
  form.set("response", t);
  if (ip && ip !== "desconocido") form.set("remoteip", ip);

  try {
    const r = await fetch(VERIFICAR, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
      signal: AbortSignal.timeout(8000),
    });
    const j: any = await r.json().catch(() => null);
    if (j?.success) return { ok: true };

    const codigos: string[] = Array.isArray(j?.["error-codes"]) ? j["error-codes"] : [];
    // Un token ya gastado o caducado es lo más común, y no es culpa de nadie:
    // pasa si se tarda en rellenar el formulario o si se reenvía.
    if (codigos.some((c) => c.includes("timeout") || c.includes("duplicate"))) {
      return { ok: false, error: "La comprobación caducó. Vuelve a intentarlo." };
    }
    console.error("[captcha] rechazado:", codigos);
    return { ok: false, error: "No se pudo verificar que no eres un robot. Inténtalo otra vez." };
  } catch (e) {
    // Si Cloudflare no responde, NO se deja pasar: esta comprobación existe
    // justo para los momentos malos, y dejarla caer abierta la vuelve inútil
    // en el único momento en que hace falta. Con el tope por IP detrás, decir
    // «ahora no» un rato es preferible a abrir la puerta.
    console.error("[captcha] no se pudo comprobar:", e);
    return { ok: false, error: "No se pudo comprobar la seguridad ahora mismo. Inténtalo en un minuto." };
  }
}
