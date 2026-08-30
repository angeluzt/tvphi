import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import {
  claveOpenAi, preferenciasModelos, OPENAI, IA_NO_DISPONIBLE, espera, motivoFallo,
} from "@/lib/story/credenciales";
import { esAdminHistorias, bloqueoDeGasto, respuestaBloqueo } from "@/lib/story/cupo";
import { migrateProject } from "@/lib/story/model";
import { acotarSonidosCapitulo, reglaDeVolumen } from "@/lib/story/sonido";

// Parchear UNA pieza del capítulo con un prompt, sin rehacerlo.
//
// El patrón es el de /ia/lab/retoque: entra el JSON de esa pieza, sale el
// mismo JSON modificado, se conserva lo que no se ha nombrado. Regenerar el
// capítulo porque un fuego está mal colocado es tirar el resto —y pagarlo
// otra vez—.

export const dynamic = "force-dynamic";

const GRANOS = ["capitulo", "escena", "toma", "vfx", "audio"] as const;

const cuerpo = z.object({
  grano: z.enum(GRANOS),
  instruccion: z.string().trim().min(2).max(600),
  /** El JSON de esa pieza, tal cual está ahora. */
  base: z.unknown(),
  modelo: z.string().max(80).optional(),
});

const REGLA = `Editas el montaje JSON de un vídeo narrado (TVPHI). Recibes el JSON de UNA pieza y una instrucción.

Devuelves SOLO el JSON modificado, del MISMO tipo que recibiste. Sin markdown, sin explicaciones.

REGLA PRINCIPAL: conserva TODO lo que la instrucción no menciona.
- No renombres ids. No borres arrays enteros. No «mejores» el resto.
- Si la instrucción es ambigua, haz la interpretación MÍNIMA.
- Coordenadas 0..1. Efectos solo con ids del catálogo que ya aparezcan o que la instrucción pida con un id conocido.
- Diálogos: el campo "text" se lee en voz alta. Nada de presentador, saludos ni acotaciones.
- No inventes imageId ni audioId nuevos: los archivos ya existen. Si hay que quitar un sonido, quita el nodo; no dejes un id vacío.
- gapSec ≥ 0. durationSec > 0.
- __REGLA_VOLUMEN__`;

const REGLA_CON_VOLUMEN = REGLA.replace("__REGLA_VOLUMEN__", reglaDeVolumen());

const FORMA: Record<(typeof GRANOS)[number], string> = {
  capitulo: "Recibes un proyecto {aspect, scenes, audioLayers, narrationVolume, voices, paleta}. Devuelves el proyecto entero.",
  escena: "Recibes UNA escena {id, imageId, imgW, imgH, prompt, medio, shots, vfx, capas?, camara?, loop?}. Devuelves esa escena.",
  toma: "Recibes UNA toma (shot) con dialogues, sfx, overlays, vfx, encuadre. Devuelves esa toma.",
  vfx: "Recibes un array de efectos (VfxLayer) o un solo efecto. Devuelves lo mismo, parcheado.",
  audio: "Recibes audioLayers y/o sfx de una toma. Devuelves la misma forma.",
};

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!esAdminHistorias(user.email)) {
    return NextResponse.json({ error: "Solo administradores" }, { status: 403 });
  }
  const sinCupo = await bloqueoDeGasto(user);
  if (sinCupo) return respuestaBloqueo(sinCupo);

  const parsed = cuerpo.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const key = claveOpenAi();
  if (!key) return NextResponse.json({ error: IA_NO_DISPONIBLE }, { status: 503 });

  const guardados = await preferenciasModelos(user.id, user.email);
  const modelo = parsed.data.modelo || guardados.texto;
  if (!modelo) return NextResponse.json({ error: IA_NO_DISPONIBLE }, { status: 400 });

  let bruto: string;
  try {
    const r = await fetch(OPENAI("/v1/chat/completions"), {
      signal: espera("texto"),
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: modelo,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: `${REGLA_CON_VOLUMEN}\n\n${FORMA[parsed.data.grano]}` },
          { role: "user", content: `Instrucción:\n${parsed.data.instruccion}\n\nJSON actual:\n${JSON.stringify(parsed.data.base)}` },
        ],
      }),
    });
    const texto = await r.text();
    let j: any = null;
    try { j = JSON.parse(texto); } catch { /* no JSON */ }
    if (!r.ok) {
      return NextResponse.json(
        { error: j?.error?.message || `OpenAI respondió ${r.status}` },
        { status: 502 },
      );
    }
    bruto = j?.choices?.[0]?.message?.content ?? "";
  } catch (e: any) {
    return NextResponse.json({ error: motivoFallo(e, "texto") }, { status: 502 });
  }

  let data: unknown;
  try { data = JSON.parse(bruto); }
  catch { return NextResponse.json({ error: "La IA no devolvió un JSON válido" }, { status: 502 }); }

  // El capítulo entero se pasa por el mismo normalizador que el resto.
  if (parsed.data.grano === "capitulo") {
    const project = migrateProject((data as any)?.project ?? data);
    if (!project.scenes.length) {
      return NextResponse.json({ error: "El parche dejó el capítulo sin escenas." }, { status: 502 });
    }
    const sonido = acotarSonidosCapitulo(project);
    return NextResponse.json({ ok: true, pieza: project, sonido });
  }

  // Una escena o una toma parcheadas traen sus propios sonidos, y un parche
  // que solo tocaba un efecto puede llegar con un volume de 0.8 arrastrado del
  // ejemplo. Se envuelve en la forma que espera el acotador y se corrige: es la
  // misma regla que en la generación, y aquí también acaba en el vídeo.
  const envoltorio = parsed.data.grano === "escena"
    ? { scenes: [data as any] }
    : parsed.data.grano === "toma"
      ? { scenes: [{ shots: [data as any] }] }
      : null;
  const sonido = envoltorio ? acotarSonidosCapitulo(envoltorio) : { tocados: 0 };

  return NextResponse.json({ ok: true, pieza: data, sonido });
}
