import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { esAdminHistorias } from "@/lib/story/cupo";
import { TOPE_BYTES, TOPE_SPRITES, esPng, type SpriteMeta } from "@/lib/lab/biblioteca";

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
      ancho: true, alto: true, bytes: true, createdAt: true,
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
  }));

  return NextResponse.json({
    sprites,
    total: sprites.length,
    // Lo que ocupa todo junto, para saber si esto se está yendo de las manos.
    bytes: sprites.reduce((a, s) => a + s.bytes, 0),
    puedeEditar: esAdminHistorias(user.email),
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

  const cuantos = await prisma.sprite.count();
  if (cuantos >= TOPE_SPRITES) {
    return NextResponse.json({
      error: `La biblioteca está llena (${TOPE_SPRITES}). Borra alguno para hacer sitio.`,
    }, { status: 409 });
  }

  const fila = await prisma.sprite.create({
    data: {
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
      tira,
      bytes: tira.byteLength,
      creadoPor: user.id,
    },
    select: { id: true, createdAt: true },
  });

  return NextResponse.json({
    ok: true,
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
    } satisfies SpriteMeta,
  });
}
