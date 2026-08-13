// Pedir algo al servidor sin que un error se convierta en un jeroglífico.
//
// `await r.json()` a secas revienta con «Unexpected token '<', "<!DOCTYPE"…»
// en cuanto lo que llega NO es JSON, y eso pasa más de lo que parece: un
// tiempo agotado en el proxy, un 502 del borde, una pantalla de error de Next.
// El usuario ve un mensaje sobre comillas y tokens que no le dice nada, y
// nosotros perdemos la única pista de qué pasó de verdad: el código HTTP.
//
// Aquí se lee como TEXTO, se intenta convertir, y si no se puede se dice lo
// que sí se sabe: qué código vino y qué suele significar.

export interface Pedido {
  /** El cuerpo ya convertido. Nunca null si no hubo excepción. */
  datos: any;
  respuesta: Response;
}

/**
 * Qué suele haber detrás de cada código cuando la respuesta no es JSON.
 *
 * Que la respuesta NO sea JSON ya dice mucho: nuestras rutas siempre contestan
 * JSON, incluso al fallar. Si llega una página de error, la cortó el borde del
 * despliegue, y con diferencia la causa más común es una imagen en calidad alta
 * que tardó más de lo que aguanta la conexión. No podemos saberlo con
 * seguridad desde aquí, así que se dice como sospecha y con la salida al lado
 * —«prueba en media»— en vez de dejar al usuario con un número de tres cifras.
 */
function pista(status: number): string {
  const cortado = "Suele pasar al generar imágenes en calidad alta: tardan más de lo que"
    + " aguanta la conexión. Prueba en calidad media, y si ya tenías capas dibujadas"
    + " se conservan: solo se repetirá la que falte.";
  if (status === 504 || status === 524) return `La petición tardó demasiado y se cortó. ${cortado}`;
  if (status === 502 || status === 503) return `El servidor no estaba disponible en ese momento. ${cortado}`;
  if (status === 413) return "Lo que se mandó pesa demasiado.";
  if (status === 429) return "Demasiadas peticiones seguidas.";
  if (status === 404) return "Esa dirección no existe en el servidor.";
  if (status >= 500) return `Falló el servidor. ${cortado}`;
  return "El servidor contestó una página en vez de datos.";
}

/**
 * Como `fetch`, pero devolviendo el JSON ya convertido.
 *
 * Lanza con un mensaje legible si la respuesta no es JSON o si trae error.
 * Cuando el servidor SÍ manda un JSON con `error`, se usa ese texto tal cual:
 * es el que explica de verdad lo que pasó —incluido lo que diga OpenAI—.
 */
export async function pedirJson(url: string, opts?: RequestInit): Promise<any> {
  const { datos, respuesta } = await pedirJsonCrudo(url, opts);
  if (!respuesta.ok) throw new Error(datos?.error || `Error ${respuesta.status}`);
  return datos;
}

/**
 * Igual, pero devuelve también la respuesta y NO lanza si el código es de
 * error. Para quien necesita mirar el estado —un 429 de cupo, por ejemplo—
 * antes de decidir qué hacer.
 */
export async function pedirJsonCrudo(url: string, opts?: RequestInit): Promise<Pedido> {
  let respuesta: Response;
  try {
    respuesta = await fetch(url, opts);
  } catch (e: any) {
    throw new Error(
      e?.name === "AbortError"
        ? "Se canceló la petición."
        : "No se pudo conectar con el servidor. Revisa tu conexión.",
    );
  }

  const texto = await respuesta.text();
  let datos: any = null;
  try { datos = texto ? JSON.parse(texto) : null; } catch { datos = null; }

  if (datos === null) {
    // Sin JSON no hay mensaje del servidor: se arma uno con lo que se sabe.
    throw new Error(`${pista(respuesta.status)} (código ${respuesta.status})`);
  }
  return { datos, respuesta };
}

/**
 * El mensaje de un error, en cristiano.
 *
 * Red de seguridad para los `catch` que enseñan `e.message` tal cual: si algo
 * se escapa de `pedirJson` —un `fetch` suelto, una API del navegador— el
 * usuario acabaría leyendo «Failed to fetch», que no dice qué pasó ni qué
 * hacer, y encima suena a que el servidor falló cuando muchas veces ni se
 * llegó a llamar.
 */
export function mensajeLegible(e: unknown, porDefecto = "No se pudo completar la operación."): string {
  const m = (e as Error)?.message?.trim();
  if (!m) return porDefecto;
  if (/^(TypeError:\s*)?failed to fetch$/i.test(m) || /^network(\s|error)/i.test(m)) {
    return "No se pudo conectar con el servidor. Revisa tu conexión y vuelve a intentarlo.";
  }
  if (/^AbortError/i.test(m) || /aborted/i.test(m)) return "Se canceló la petición.";
  return m;
}
