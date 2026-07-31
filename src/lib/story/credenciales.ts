import crypto from "node:crypto";
import { env } from "@/lib/env";

// Guardar la clave de OpenAI de cada usuario.
//
// Es una credencial de un tercero, así que va cifrada en la base y NUNCA sale
// de aquí: la interfaz solo llega a saber si hay una puesta y sus cuatro
// últimos caracteres, para que el usuario reconozca cuál es.
//
// Se cifra con AES-256-GCM. La clave sale de AUTH_SECRET, que ya existe en el
// servidor; GCM además detecta si el texto cifrado ha sido manipulado.
//
// Aviso honesto: si AUTH_SECRET cambia, las claves guardadas dejan de poder
// descifrarse y hay que volver a ponerlas. No se pierde nada más.

const clave = () => crypto.createHash("sha256").update(`openai:${env.authSecret}`).digest();

export function cifrar(texto: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", clave(), iv);
  const dato = Buffer.concat([c.update(texto, "utf8"), c.final()]);
  // iv.tag.dato, todo en base64: un solo campo de texto en la base.
  return [iv.toString("base64"), c.getAuthTag().toString("base64"), dato.toString("base64")].join(".");
}

export function descifrar(guardado: string): string | null {
  try {
    const [iv, tag, dato] = guardado.split(".");
    if (!iv || !tag || !dato) return null;
    const d = crypto.createDecipheriv("aes-256-gcm", clave(), Buffer.from(iv, "base64"));
    d.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([d.update(Buffer.from(dato, "base64")), d.final()]).toString("utf8");
  } catch {
    // Manipulada, o cifrada con otro AUTH_SECRET.
    return null;
  }
}

// Lo único que puede ver la interfaz: que hay clave y cómo acaba.
export function pista(texto: string) {
  const limpio = texto.trim();
  return limpio.length <= 8 ? "••••" : `••••${limpio.slice(-4)}`;
}

// Una clave de OpenAI empieza por "sk-". No se valida más: el formato lo cambian
// ellos cuando quieren, y quien manda es la primera llamada de verdad.
export function pareceClaveOpenAi(texto: string) {
  const t = texto.trim();
  return t.startsWith("sk-") && t.length >= 20 && !/\s/.test(t);
}

// Un modelo por tarea: no todos hacen de todo. Los modelos baratos de texto no
// generan audio, así que tener uno solo no vale. Vacío = usar el de siempre.
export const MODELOS_POR_DEFECTO = { texto: "", imagen: "", voz: "", vozNombre: "alloy" };
export type Modelos = typeof MODELOS_POR_DEFECTO;
