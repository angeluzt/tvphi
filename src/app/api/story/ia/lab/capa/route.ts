import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { claveOpenAi, preferenciasModelos, OPENAI, IA_NO_DISPONIBLE } from "@/lib/story/credenciales";
import { anotarFallo } from "@/lib/story/fallidos";
import { esAdminHistorias, cupoAgotado } from "@/lib/story/cupo";
import { CROMA } from "@/lib/lab/quitar-fondo";

// Pintar UNA capa a partir de su trozo del mapa.
//
// El mapa va como imagen de entrada a /v1/images/edits: es lo que hace que la
// geometría se respete, porque el modelo está viendo dónde va cada cosa en vez
// de imaginárselo. Sin eso, pedir cinco capas da cinco escenas distintas que no
// encajan entre sí.
//
// EL FONDO SE PIDE OPACO y las demás capas SOBRE CROMA (magenta plano), que el
// cliente quita al recibirlas.
//
// Lo suyo sería pedir alfa de verdad (background: "transparent"), pero
// gpt-image-2 contesta «Transparent background is not supported for this model»
// al editar. Pedirlo igualmente y reintentar era pagar DOS viajes por capa para
// acabar siempre en el croma, así que se va directo a lo que funciona. El
// intento con alfa sigue ahí, apagado, detrás de la opción «alfa».
//
// Aun así el cliente nunca da por hecho lo que vino: mira la imagen y decide.


const cuerpo = z.object({
  /** El PNG del mapa de ESTA capa, en base64. */
  mapa: z.string().min(100).max(6_000_000),
  // Estos textos los escribe la IA en el mapa, así que no se puede apretar el
  // límite a ojo: se le da el mismo aire que a las rutas que ya funcionaban.
  /** Qué dibujar y qué no, de la propia capa. */
  prompt: z.string().min(3).max(4000),
  excluir: z.string().max(2000).optional(),
  /** Estilo común a todas las capas: es lo que las hace parecer la misma escena. */
  estilo: z.string().max(2000).optional(),
  escena: z.string().max(4000).optional(),
  esFondo: z.boolean().default(false),
  formato: z.enum(["16:9", "9:16", "1:1"]).default("16:9"),
  modelo: z.string().max(80).optional(),
  /**
   * Intentar primero la transparencia de verdad (alfa) y caer al croma si el
   * modelo la rechaza. Apagado por defecto A PROPÓSITO.
   *
   * gpt-image-2 contesta «Transparent background is not supported for this
   * model» al editar, así que con él ese primer intento no sirve para nada:
   * son dos viajes por capa —el doble de espera— para acabar siempre en el
   * croma. Se deja la puerta abierta por si un modelo futuro sí lo admite.
   */
  alfa: z.boolean().default(false),
});

const TAMANOS: Record<string, string> = {
  "16:9": "1536x1024",
  "9:16": "1024x1536",
  "1:1": "1024x1024",
};

const editable = (m: string) =>
  /^(gpt-image-2|gpt-image-1\.5|gpt-image-1(?:$|-\d)|chatgpt-image-latest)/i.test(m);

function pngBytes(v: string): Buffer | null {
  try {
    const b = Buffer.from(v.replace(/^data:image\/png;base64,/, "").replace(/\s+/g, ""), "base64");
    if (b.length < 100 || b.length > 5_000_000) return null;
    if (b[0] !== 0x89 || b[1] !== 0x50 || b[2] !== 0x4e || b[3] !== 0x47) return null;
    return b;
  } catch { return null; }
}

/**
 * `croma` = ya sabemos que este modelo NO sabe devolver transparencia.
 *
 * En el primer intento el magenta se menciona como plan B, y un plan B enterrado
 * en el prompt lo cumple el modelo cuando le apetece. En el segundo ya no hay
 * plan A: se le pide el magenta como LA instrucción, con su color escrito, y
 * repetida al final, que es donde más pesa.
 */
function instruccion(d: z.infer<typeof cuerpo>, croma = false) {
  const comun = [
    "The input image is a SEMANTIC LAYOUT MAP, not artwork.",
    "Flat colors and written labels tell you WHAT goes WHERE. Never reproduce them:",
    "replace each marked area with the real thing it stands for, at the exact same position, size and proportion.",
    "Never draw text, letters, labels, watermarks, borders or UI.",
    d.escena ? `Scene: ${d.escena}` : "",
    d.estilo ? `Visual style, identical across all layers: ${d.estilo}` : "",
    `Draw: ${d.prompt}`,
    d.excluir ? `Do NOT draw: ${d.excluir}` : "",
  ].filter(Boolean);

  if (d.esFondo) {
    comun.push(
      "This is the BACKGROUND layer: it must be fully opaque and fill the entire frame edge to edge.",
      "Everything that belongs to nearer layers is drawn later on top, so leave room for it but do not paint it.",
    );
  } else if (croma) {
    comun.push(
      "This is a FOREGROUND layer that will be cut out and stacked on top of others.",
      `CHROMA KEY BACKGROUND, MANDATORY: every pixel that is not part of the described content must be flat pure magenta ${CROMA} (R255 G0 B255).`,
      "That magenta must be perfectly uniform: no gradient, no shading, no vignette, no texture, no glow, no reflection of it on the subject.",
      "Do not paint sky, ground, fog or scenery in the empty space — only the magenta.",
      "Do not extend the content to the frame edges unless the map says so.",
      `Remember: background = flat ${CROMA} magenta, subject = the described content. Nothing else.`,
    );
  } else {
    comun.push(
      "This is a FOREGROUND layer that will be stacked on top of others.",
      "OUTPUT WITH A TRANSPARENT BACKGROUND: every pixel that is not part of the described content must be fully transparent.",
      `If you cannot output transparency, fill all empty space with flat pure ${CROMA} magenta and nothing else — no gradient, no shading, no vignette — so it can be keyed out.`,
      "Do not extend the content to the frame edges unless the map says so.",
    );
  }
  return comun.join("\n");
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!esAdminHistorias(user.email)) {
    return NextResponse.json({ error: "Solo administradores" }, { status: 403 });
  }
  const sinCupo = await cupoAgotado(user.id, user.email);
  if (sinCupo) return NextResponse.json({ error: sinCupo, sinCupo: true }, { status: 429 });

  const parsed = cuerpo.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const detalle = parsed.error.issues
      .map((i) => `${i.path.join(".") || "cuerpo"}: ${i.message}`)
      .join(" · ");
    return NextResponse.json({ error: `Datos inválidos — ${detalle}` }, { status: 400 });
  }

  const key = claveOpenAi();
  if (!key) return NextResponse.json({ error: IA_NO_DISPONIBLE }, { status: 503 });

  const guardados = await preferenciasModelos(user.id, user.email);
  const modelo = parsed.data.modelo || guardados.imagen;
  if (!modelo) return NextResponse.json({ error: IA_NO_DISPONIBLE }, { status: 400 });

  const mapa = pngBytes(parsed.data.mapa);
  if (!mapa) return NextResponse.json({ error: "El mapa de la capa no es un PNG válido." }, { status: 400 });
  if (!editable(modelo)) {
    // Sin edits no hay forma de que respete la geometría, y una capa que no
    // encaja con las demás no sirve para nada. Mejor decirlo que gastar.
    return NextResponse.json({
      error: `«${modelo}» no admite imagen de referencia, así que no puede respetar el mapa. Elige gpt-image-2 o gpt-image-1.`,
      modelo,
    }, { status: 400 });
  }

  // El formulario se arma cada vez: un FormData ya enviado no se puede reusar.
  const armar = (croma: boolean) => {
    const form = new FormData();
    form.set("model", modelo);
    form.set("prompt", instruccion(parsed.data, croma));
    form.set("size", TAMANOS[parsed.data.formato]);
    form.set("n", "1");
    form.set("quality", "medium");
    form.set("output_format", "png");
    // Con croma NO se manda «background»: es justo el parámetro que el modelo
    // rechaza, y el fondo se pide por prompt.
    if (!croma) form.set("background", parsed.data.esFondo ? "opaque" : "transparent");
    form.append("image[]", new Blob([new Uint8Array(mapa)], { type: "image/png" }), "mapa.png");
    return form;
  };
  const pedir = (croma: boolean) => fetch(OPENAI("/v1/images/edits"), {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: armar(croma),
  });

  try {
    // Una llamada, la que va a servir. El fondo se pide opaco —eso el modelo sí
    // lo admite— y las capas de delante van directas al croma.
    let porCroma = !parsed.data.esFondo && !parsed.data.alfa;
    let r = await pedir(porCroma);
    // Solo si se pidió intentar el alfa: si el modelo lo rechaza, se reintenta
    // con croma en vez de perder la capa.
    if (!r.ok && !parsed.data.esFondo && parsed.data.alfa) {
      const aviso = await r.clone().text();
      if (/background|transparen/i.test(aviso)) {
        r = await pedir(true);
        porCroma = true;
      }
    }
    const txt = await r.text();
    let j: any = null;
    try { j = JSON.parse(txt); } catch {}
    if (r.ok && !j) {
      return NextResponse.json(
        { error: "OpenAI respondió algo que no es JSON. ¿Hay un proxy o cortafuegos por medio?" },
        { status: 502 });
    }
    if (!r.ok) {
      const crudo = j?.error?.message || `OpenAI respondió ${r.status}`;
      const delModelo = /deprecat|does not exist|no longer|not found|must be verified/i.test(crudo)
        && !/parameter|unsupported.*param|background/i.test(crudo);
      if (delModelo) await anotarFallo(user.id, modelo);
      return NextResponse.json({ error: crudo, modeloMal: delModelo, modelo }, { status: 502 });
    }
    const b64 = j?.data?.[0]?.b64_json ?? null;
    if (!b64) {
      return NextResponse.json({ error: `«${modelo}» contestó sin imagen.`, modelo }, { status: 502 });
    }
    // «porCroma» le dice al cliente que este modelo no da alfa: así puede
    // avisar de una vez en vez de dejarlo en un «se le quitó el color» suelto.
    return NextResponse.json({ ok: true, imagen: b64, croma: CROMA, porCroma });
  } catch (e: any) {
    return NextResponse.json({ error: "No se pudo hablar con OpenAI: " + (e?.message ?? "") }, { status: 502 });
  }
}
