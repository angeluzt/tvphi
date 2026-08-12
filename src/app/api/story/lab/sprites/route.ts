import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { esAdminHistorias } from "@/lib/story/cupo";
import { TOPE_BYTES, TOPE_SPRITES, esPng, type SpriteMeta } from "@/lib/lab/biblioteca";
import { publicadoDe, publicar } from "@/lib/lab/publicado.server";

// La biblioteca de sprites: lo que se fabricó una vez y ya no hay que pagar.
//
// LA GRACIA DE QUE ESTÉ AQUÍ Y NO EN TU DISCO. Un sprite bajado en un ZIP se
// pierde: hay que volver a subirlo en cada montaje, y desde el móvil ni eso.
// Guardado en la aplicación, un pájaro se fabrica una vez —$0.005— y se puede
// meter en todos los vídeos que se hagan, desde cualquier equipo. Es la
// diferencia entre pagar por vídeo y pagar por bicho.
//
// QUIÉN PUEDE QUÉ. Guardar y borrar, solo administración: la biblioteca es
// común, y que cualquiera pueda llenarla o vaciarla es pedir que se rompa.
// Verla y usarla, cualquiera con sesión. Está pensado así a propósito, porque
// el siguiente paso es que las historias tiren de estos sprites, y entonces no
// habría que tocar los permisos.

export const dynamic = "force-dynamic";

/** El listado. Sin `tira`: son megas que nadie ha pedido todavía. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const filas = await prisma.sprite.findMany({
    orderBy: { createdAt: "desc" },
    take: TOPE_SPRITES,
    select: {
      id: true, nombre: true, que: true, fotogramas: true, fps: true,
      vista: true, direccion: true, accion: true, anclaje: true,
      ancho: true, alto: true, bytes: true, createdAt: true, animationId: true,
    },
  });

  const sprites: SpriteMeta[] = filas.map((f) => ({
    id: f.id,
    nombre: f.nombre,
    que: f.que,
    fotogramas: f.fotogramas,
    fps: f.fps,
    vista: f.vista as SpriteMeta["vista"],
    direccion: f.direccion as SpriteMeta["direccion"],
    accion: f.accion as SpriteMeta["accion"],
    anclaje: f.anclaje as SpriteMeta["anclaje"],
    ancho: f.ancho,
    alto: f.alto,
    bytes: f.bytes,
    creadoEn: f.createdAt.toISOString(),
    animationId: f.animationId,
  }));

  // Solo si el usuario actual es dueño de la plantilla: sirve para Editar / Nueva animación.
  const enlaces = [...new Set(sprites.map((s) => s.animationId).filter(Boolean))] as string[];
  let propias: Record<string, string> = {};
  if (enlaces.length) {
    const rows = await prisma.spriteAnimation.findMany({
      where: { id: { in: enlaces }, character: { userId: user.id } },
      select: { id: true, characterId: true },
    });
    propias = Object.fromEntries(rows.map((r) => [r.id, r.characterId]));
  }

  return NextResponse.json({
    sprites,
    total: sprites.length,
    // Lo que ocupa todo junto, para saber si esto se está yendo de las manos.
    bytes: sprites.reduce((a, s) => a + s.bytes, 0),
    puedeEditar: esAdminHistorias(user.email),
    /** animationId → characterId propias del usuario (editables). */
    plantillas: propias,
  });
}

const cuerpo = z.object({
  nombre: z.string().trim().min(1, "Ponle un nombre").max(60),
  que: z.string().trim().min(1).max(400),
  fotogramas: z.number().int().min(1).max(24),
  fps: z.number().int().min(1).max(60),
  vista: z.enum(["lateral", "frontal", "trasera", "superior", "libre"]).default("lateral"),
  direccion: z.enum(["derecha", "izquierda", "frente", "espaldas", "arriba", "abajo", "ninguna"]).default("derecha"),
  accion: z.enum(["quieto", "caminar", "correr", "volar", "flotar", "nadar", "caer", "girar", "otro"]).default("otro"),
  anclaje: z.enum(["centro", "pies"]).default("centro"),
  ancho: z.number().int().min(1).max(4096),
  alto: z.number().int().min(1).max(4096),
  /** La tira entera en base64, tal como la compuso el navegador. */
  tira: z.string().min(1),
  /** Plantilla editable asociada (animación del taller), si ya se guardó. */
  animationId: z.string().cuid().optional(),
});

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!esAdminHistorias(user.email)) {
    return NextResponse.json({ error: "Solo administradores" }, { status: 403 });
  }

  const parsed = cuerpo.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const detalle = parsed.error.issues
      .map((i) => `${i.path.join(".") || "cuerpo"}: ${i.message}`)
      .join(" · ");
    return NextResponse.json({ error: `Datos inválidos — ${detalle}` }, { status: 400 });
  }
  const d = parsed.data;

  let tira: Buffer;
  try {
    tira = Buffer.from(d.tira.replace(/^data:image\/png;base64,/, ""), "base64");
  } catch {
    return NextResponse.json({ error: "La imagen no se pudo leer." }, { status: 400 });
  }

  if (tira.byteLength > TOPE_BYTES) {
    return NextResponse.json({
      error: `Esa tira pesa demasiado (${Math.round(tira.byteLength / 1024)} KB). El tope son ${Math.round(TOPE_BYTES / 1024)} KB.`,
    }, { status: 413 });
  }
  // Que sea un PNG de verdad, y no cualquier cosa que luego se devolverá con
  // Content-Type de imagen. Sin esta comprobación la ruta es un sitio donde
  // dejar un archivo arbitrario y que la aplicación lo sirva por ti.
  if (!esPng(tira)) {
    return NextResponse.json({ error: "Eso no es un PNG." }, { status: 400 });
  }
  // El tamaño declarado tiene que cuadrar con una tira de N fotogramas. Si no
  // cuadra, al pintarla se cortaría por donde no toca y el sprite saldría
  // partido a la mitad, sin que nada avisara.
  if (d.ancho * d.fotogramas > 16384) {
    return NextResponse.json({ error: "La tira es demasiado ancha." }, { status: 400 });
  }

  if (d.animationId) {
    const propia = await prisma.spriteAnimation.findFirst({
      where: { id: d.animationId, character: { userId: user.id } },
      select: { id: true },
    });
    if (!propia) {
      return NextResponse.json({ error: "La plantilla enlazada no existe." }, { status: 400 });
    }
  }

  // UNA SOLA COPIA PÚBLICA POR ANIMACIÓN. Antes esto era siempre un `create`:
  // quien corregía un sprite y volvía a publicarlo acababa con dos entradas en
  // la biblioteca —la vieja mal y la nueva bien—, y la que ya estaba metida en
  // los montajes era la vieja. Ahora se actualiza la que hay.
  const ya = d.animationId ? await publicadoDe(d.animationId) : null;

  // El tope solo frena lo que AÑADE una fila. Volver a publicar una corrección
  // con la biblioteca llena no ocupa un sitio más, y bloquearlo dejaría el
  // sprite malo puesto sin ninguna forma de arreglarlo.
  if (!ya) {
    const cuantos = await prisma.sprite.count();
    if (cuantos >= TOPE_SPRITES) {
      return NextResponse.json({
        error: `La biblioteca está llena (${TOPE_SPRITES}). Borra alguno para hacer sitio.`,
      }, { status: 409 });
    }
  }

  const { fila, actualizado } = await publicar(d.animationId, { ...d, tira }, user.id);

  return NextResponse.json({
    ok: true,
    actualizado,
    sprite: {
      id: fila.id,
      nombre: d.nombre,
      que: d.que,
      fotogramas: d.fotogramas,
      fps: d.fps,
      vista: d.vista,
      direccion: d.direccion,
      accion: d.accion,
      anclaje: d.anclaje,
      ancho: d.ancho,
      alto: d.alto,
      bytes: tira.byteLength,
      creadoEn: fila.createdAt.toISOString(),
      animationId: fila.animationId,
    } satisfies SpriteMeta,
  });
}
