import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { esPng } from "@/lib/lab/biblioteca";
import { archivarAnimacionEnAtlas } from "@/lib/lab/atlas-sprite.server";
import { urlImagenAnimacion, type PersonajeSprite } from "@/lib/lab/personajes-sprite";

export const dynamic = "force-dynamic";

const MAX_HOJA = 6 * 1024 * 1024;
const MAX_TIRA = 4 * 1024 * 1024;
// Los personajes del taller de sprites y sus animaciones.
//
// TODO LO DE AQUÍ ES DE UN SOLO USUARIO. Cada consulta lleva `userId` (o
// `character: { userId }`) en el where, y eso ES la autorización: el personaje
// de otro no aparece, así que se contesta 404 sin llegar a decir si el id
// existe. No hay un rol que pueda ver los de todos.
//
// POR QUÉ HAY TANTO TOPE. Cada animación guarda hasta tres imágenes (hoja
// original, hoja retocada y tira), y todo eso son bytes en la base de datos que
// nadie más va a limpiar. Sin límites, una cuenta puede llenar el disco del
// despliegue ella sola. Los topes se comprueban SUMANDO lo que ya tiene el
// usuario —incluidas las páginas del atlas— y no por petición: si no, veinte
// peticiones de 6 MB pasan una a una.

/** La miniatura del personaje. Es un solo fotograma, no necesita más. */
const MAX_REF = 2 * 1024 * 1024;
/** Cuántos personajes, y cuántas animaciones cuelgan de cada uno. */
const MAX_P = 20;
const MAX_A = 30;
/** El total por usuario, contando hojas, tiras, referencias y páginas de atlas. */
const MAX_TOTAL = 120 * 1024 * 1024;

const celda = z.object({
  x: z.number().int().min(0).max(8192),
  y: z.number().int().min(0).max(8192),
  ancho: z.number().int().min(1).max(8192),
  alto: z.number().int().min(1).max(8192),
});

const cuerpo = z.object({
  personajeId: z.string().cuid().optional(),
  animacionId: z.string().cuid().optional(),
  nombrePersonaje: z.string().trim().min(1).max(60),
  descripcionPersonaje: z.string().trim().min(1).max(600),
  nombre: z.string().trim().min(1).max(60),
  que: z.string().trim().min(1).max(400),
  fotogramas: z.number().int().min(1).max(24),
  fps: z.number().int().min(1).max(60),
  vista: z.enum(["lateral", "frontal", "trasera", "superior", "libre"]),
  direccion: z.enum(["derecha", "izquierda", "frente", "espaldas", "arriba", "abajo", "ninguna"]),
  accion: z.enum(["quieto", "caminar", "correr", "volar", "flotar", "nadar", "caer", "girar", "otro"]),
  anclaje: z.enum(["centro", "pies"]),
  croma: z.string().regex(/^#[0-9a-f]{6}$/i),
  columnas: z.number().int().min(1).max(24),
  filas: z.number().int().min(1).max(24),
  anchoHoja: z.number().int().min(1).max(8192),
  altoHoja: z.number().int().min(1).max(8192),
  ancho: z.number().int().min(1).max(4096),
  alto: z.number().int().min(1).max(4096),
  celdas: z.array(celda).min(1).max(24),
  hojaOriginal: z.string().min(100).max(9_000_000),
  hojaTrabajo: z.string().min(100).max(9_000_000),
  tira: z.string().min(100).max(6_000_000),
  referencia: z.string().min(100).max(3_000_000).optional(),
});

const rename = z.object({
  personajeId: z.string().cuid(),
  nombre: z.string().trim().min(1).max(60).optional(),
  descripcion: z.string().trim().min(1).max(600).optional(),
  animacionId: z.string().cuid().optional(),
  nombreAnimacion: z.string().trim().min(1).max(60).optional(),
}).refine(
  (v) => !!(v.nombre || v.descripcion || (v.animacionId && v.nombreAnimacion)),
  "No hay cambios",
);

function png(v: string, max: number) {
  try {
    const b = Buffer.from(v.replace(/^data:image\/png;base64,/, "").replace(/\s+/g, ""), "base64");
    return b.length >= 100 && b.length <= max && esPng(b) ? b : null;
  } catch {
    return null;
  }
}

/** Solo personajes del taller de sprites — no fichas de Historias. */
export async function GET() {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const rows = await prisma.spriteCharacter.findMany({
    where: { userId: u.id },
    orderBy: { updatedAt: "desc" },
    take: MAX_P,
    include: {
      animaciones: {
        orderBy: { updatedAt: "desc" },
        select: {
          id: true, nombre: true, que: true, fotogramas: true, fps: true,
          vista: true, direccion: true, accion: true, anclaje: true,
          ancho: true, alto: true, columnas: true, filas: true,
          bytesOriginal: true, bytesTrabajo: true, bytesTira: true, updatedAt: true,
        },
      },
    },
  });

  const personajes: PersonajeSprite[] = rows.map((p) => ({
    id: `sprite:${p.id}`,
    spriteId: p.id,
    storyCharacterId: null,
    origen: "sprites" as const,
    nombre: p.nombre,
    descripcion: p.descripcion,
    prompt: p.descripcion,
    actualizadoEn: p.updatedAt.toISOString(),
    animaciones: p.animaciones.map((a) => ({
      id: a.id,
      nombre: a.nombre,
      que: a.que,
      fotogramas: a.fotogramas,
      fps: a.fps,
      vista: a.vista as PersonajeSprite["animaciones"][number]["vista"],
      direccion: a.direccion as PersonajeSprite["animaciones"][number]["direccion"],
      accion: a.accion as PersonajeSprite["animaciones"][number]["accion"],
      anclaje: a.anclaje as PersonajeSprite["animaciones"][number]["anclaje"],
      ancho: a.ancho,
      alto: a.alto,
      columnas: a.columnas,
      filas: a.filas,
      bytes: a.bytesOriginal + a.bytesTrabajo + a.bytesTira,
      actualizadoEn: a.updatedAt.toISOString(),
      // El `v` no lo usa el servidor: fuerza al navegador a pedirla de nuevo
      // cuando la animación se ha retocado, en vez de enseñar la vieja.
      tiraUrl: `${urlImagenAnimacion(a.id, "tira")}&v=${a.updatedAt.getTime()}`,
    })),
  }));

  return NextResponse.json({ personajes });
}

export async function PATCH(req: Request) {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const p = rename.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
  const d = p.data;

  const c = await prisma.spriteCharacter.findFirst({
    where: { id: d.personajeId, userId: u.id },
    select: { id: true },
  });
  if (!c) return NextResponse.json({ error: "Personaje no encontrado." }, { status: 404 });

  if (d.nombre || d.descripcion) {
    await prisma.spriteCharacter.update({
      where: { id: c.id },
      data: {
        ...(d.nombre ? { nombre: d.nombre } : {}),
        ...(d.descripcion ? { descripcion: d.descripcion } : {}),
      },
    });
  }

  if (d.animacionId && d.nombreAnimacion) {
    const a = await prisma.spriteAnimation.updateMany({
      where: { id: d.animacionId, characterId: c.id },
      data: { nombre: d.nombreAnimacion },
    });
    if (!a.count) return NextResponse.json({ error: "Animación no encontrada." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}

export async function POST(req: Request) {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const userId = u.id;
  const p = cuerpo.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: "Proyecto incompleto o inválido." }, { status: 400 });
  const d = p.data;
  if (d.columnas * d.filas < d.fotogramas || d.celdas.length !== d.fotogramas) {
    return NextResponse.json({ error: "La rejilla no coincide." }, { status: 400 });
  }
  if (d.ancho * d.fotogramas > 16384) {
    return NextResponse.json({ error: "La tira sería demasiado ancha." }, { status: 400 });
  }
  const original = png(d.hojaOriginal, MAX_HOJA);
  const trabajo = png(d.hojaTrabajo, MAX_HOJA);
  const tira = png(d.tira, MAX_TIRA);
  const ref = d.referencia ? png(d.referencia, MAX_REF) : null;
  if (!original || !trabajo || !tira) {
    return NextResponse.json({ error: "Los PNG no son válidos o pesan demasiado." }, { status: 413 });
  }
  const work = trabajo.equals(original) ? null : trabajo;
  const propios = await prisma.spriteCharacter.findMany({
    where: { userId },
    select: {
      id: true,
      bytesReferencia: true,
      animaciones: { select: { id: true, bytesOriginal: true, bytesTrabajo: true, bytesTira: true } },
    },
  });
  const total = propios.reduce(
    (s, x) => s + x.bytesReferencia + x.animaciones.reduce((a, y) => a + y.bytesOriginal + y.bytesTrabajo + y.bytesTira, 0),
    0,
  );
  const atl = await prisma.spriteAtlas.aggregate({ where: { userId }, _sum: { bytes: true } });
  const prev = d.animacionId ? propios.flatMap((x) => x.animaciones).find((x) => x.id === d.animacionId) : null;
  const old = prev ? prev.bytesOriginal + prev.bytesTrabajo + prev.bytesTira : 0;
  const nuevo = original.length + (work?.length ?? 0) + tira.length + (!d.personajeId && !d.animacionId ? (ref?.length ?? 0) : 0);
  if (total + (atl._sum.bytes ?? 0) - old + nuevo > MAX_TOTAL) {
    return NextResponse.json({ error: "Tu biblioteca alcanzó 120 MB." }, { status: 409 });
  }
  const data = {
    nombre: d.nombre, que: d.que, fotogramas: d.fotogramas, fps: d.fps,
    vista: d.vista, direccion: d.direccion, accion: d.accion, anclaje: d.anclaje, croma: d.croma,
    columnas: d.columnas, filas: d.filas, anchoHoja: d.anchoHoja, altoHoja: d.altoHoja,
    ancho: d.ancho, alto: d.alto, celdas: d.celdas,
    hojaOriginal: original, hojaTrabajo: work, tira,
    bytesOriginal: original.length, bytesTrabajo: work?.length ?? 0, bytesTira: tira.length,
  };
  const pack = async (id: string) => {
    try { return await archivarAnimacionEnAtlas(userId, id); }
    catch (e) { console.error("Se conserva la tira porque falló el atlas", e); return false; }
  };

  if (d.animacionId) {
    const e = await prisma.spriteAnimation.findFirst({
      where: { id: d.animacionId, character: { userId } },
      select: { id: true, characterId: true, hojaOriginal: true, bytesOriginal: true },
    });
    if (!e) return NextResponse.json({ error: "Animación no encontrada." }, { status: 404 });
    const a = await prisma.spriteAnimation.update({
      where: { id: e.id },
      data: { ...data, hojaOriginal: e.hojaOriginal, bytesOriginal: e.bytesOriginal },
    });
    await prisma.spriteCharacter.update({
      where: { id: e.characterId },
      data: { nombre: d.nombrePersonaje, descripcion: d.descripcionPersonaje },
    });
    return NextResponse.json({ ok: true, personajeId: e.characterId, animacionId: a.id, actualizada: true, enAtlas: await pack(a.id) });
  }

  if (d.personajeId) {
    const c = await prisma.spriteCharacter.findFirst({
      where: { id: d.personajeId, userId },
      include: { _count: { select: { animaciones: true } } },
    });
    if (!c) return NextResponse.json({ error: "Personaje no encontrado." }, { status: 404 });
    if (c._count.animaciones >= MAX_A) {
      return NextResponse.json({ error: `Ese personaje ya tiene ${MAX_A} animaciones.` }, { status: 409 });
    }
    const a = await prisma.spriteAnimation.create({ data: { ...data, characterId: c.id } });
    await prisma.spriteCharacter.update({
      where: { id: c.id },
      data: { nombre: d.nombrePersonaje, descripcion: d.descripcionPersonaje },
    });
    return NextResponse.json({ ok: true, personajeId: c.id, animacionId: a.id, enAtlas: await pack(a.id) });
  }

  if (propios.length >= MAX_P) {
    return NextResponse.json({ error: `Ya tienes ${MAX_P} personajes.` }, { status: 409 });
  }
  if (!ref) return NextResponse.json({ error: "Falta el cuadro de referencia." }, { status: 400 });

  const c = await prisma.spriteCharacter.create({
    data: {
      userId,
      nombre: d.nombrePersonaje,
      descripcion: d.descripcionPersonaje,
      referencia: ref,
      bytesReferencia: ref.length,
      animaciones: { create: data },
    },
    include: { animaciones: { select: { id: true } } },
  });
  const id = c.animaciones[0].id;
  return NextResponse.json({ ok: true, personajeId: c.id, animacionId: id, enAtlas: await pack(id) });
}
