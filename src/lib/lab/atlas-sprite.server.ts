import "server-only";
import sharp from "sharp";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizarMarcosAtlas, reservarMarcoAtlas, TAMANO_ATLAS_SPRITE, type CursorAtlasSprite, type MarcoAtlasSprite } from "./atlas-sprite";

const vacio = () => sharp({ create: { width: 2048, height: 2048, channels: 4,
  background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png({ compressionLevel: 9 }).toBuffer();
async function cuadros(tira: Buffer, w: number, h: number, n: number) {
  const m = await sharp(tira).metadata();
  if (m.width !== w * n || m.height !== h) throw new Error("Tira inválida");
  return Promise.all(Array.from({ length: n }, (_, i) => sharp(tira)
    .extract({ left: i * w, top: 0, width: w, height: h }).png({ compressionLevel: 9 }).toBuffer()));
}
interface Pagina extends CursorAtlasSprite { id: string; png: Buffer; usados: number; }

export async function archivarAnimacionEnAtlas(userId: string, id: string) {
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`tvphi-atlas:${userId}`}))`;
    const a = await tx.spriteAnimation.findFirst({ where: { id, character: { userId } },
      select: { id: true, tira: true, atlasFrames: true, fotogramas: true, ancho: true, alto: true } });
    if (!a) throw new Error("Animación no encontrada");
    if (!a.tira) return !!normalizarMarcosAtlas(a.atlasFrames, a.fotogramas, a.ancho, a.alto);
    if (a.ancho + 4 > 2048 || a.alto + 4 > 2048) return false;
    const fotos = await cuadros(Buffer.from(a.tira), a.ancho, a.alto, a.fotogramas);
    const prev = normalizarMarcosAtlas(a.atlasFrames, a.fotogramas, a.ancho, a.alto);
    const prevIds = [...new Set(prev?.map(x => x.atlasId) ?? [])];
    const prevRows = prevIds.length ? await tx.spriteAtlas.findMany({ where: { userId, id: { in: prevIds } } }) : [];
    const paginas = new Map<string, Pagina>(prevRows.map(p => [p.id, { id: p.id, ancho: p.ancho, alto: p.alto,
      png: Buffer.from(p.png), cursorX: p.cursorX, cursorY: p.cursorY, altoFila: p.altoFila, usados: p.usados }]));
    let marcos: MarcoAtlasSprite[] = [];
    if (prev && prevRows.length === prevIds.length) marcos = prev;
    else {
      const ultima = await tx.spriteAtlas.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } });
      let p: Pagina | null = ultima ? { id: ultima.id, ancho: ultima.ancho, alto: ultima.alto, png: Buffer.from(ultima.png),
        cursorX: ultima.cursorX, cursorY: ultima.cursorY, altoFila: ultima.altoFila, usados: ultima.usados } : null;
      if (p) paginas.set(p.id, p);
      for (let i = 0; i < fotos.length; i++) {
        let sitio = p ? reservarMarcoAtlas(p, a.ancho, a.alto) : null;
        if (!p || !sitio) {
          const png = await vacio();
          const nueva = await tx.spriteAtlas.create({ data: { userId, png, bytes: png.length } });
          p = { id: nueva.id, ancho: nueva.ancho, alto: nueva.alto, png: Buffer.from(nueva.png),
            cursorX: nueva.cursorX, cursorY: nueva.cursorY, altoFila: nueva.altoFila, usados: nueva.usados };
          paginas.set(p.id, p); sitio = reservarMarcoAtlas(p, a.ancho, a.alto);
        }
        if (!sitio) return false;
        p.cursorX = sitio.siguiente.cursorX; p.cursorY = sitio.siguiente.cursorY; p.altoFila = sitio.siguiente.altoFila;
        p.usados += a.ancho * a.alto;
        marcos.push({ atlasId: p.id, x: sitio.x, y: sitio.y, ancho: a.ancho, alto: a.alto });
      }
    }
    const porPagina = new Map<string, { marco: MarcoAtlasSprite; foto: Buffer }[]>();
    marcos.forEach((marco, i) => porPagina.set(marco.atlasId, [...(porPagina.get(marco.atlasId) ?? []), { marco, foto: fotos[i] }]));
    for (const [pid, elems] of porPagina) {
      const p = paginas.get(pid)!; const mask = Buffer.alloc(a.ancho * a.alto * 4, 255);
      const ops = elems.flatMap(({ marco, foto }) => [{ input: mask, raw: { width: a.ancho, height: a.alto, channels: 4 as const },
        left: marco.x, top: marco.y, blend: "dest-out" as const }, { input: foto, left: marco.x, top: marco.y, blend: "over" as const }]);
      const png = await sharp(p.png).composite(ops).png({ compressionLevel: 9 }).toBuffer();
      await tx.spriteAtlas.update({ where: { id: pid }, data: { png, bytes: png.length, cursorX: p.cursorX,
        cursorY: p.cursorY, altoFila: p.altoFila, usados: p.usados } });
    }
    await tx.spriteAnimation.update({ where: { id }, data: { atlasFrames: marcos as unknown as Prisma.InputJsonValue,
      tira: null, bytesTira: 0 } });
    return true;
  }, { maxWait: 10000, timeout: 60000 });
}

export async function reconstruirTiraAnimacion(o: { userId: string; tira: Uint8Array | Buffer | null;
  atlasFrames: unknown; fotogramas: number; ancho: number; alto: number; }) {
  if (o.tira) return Buffer.from(o.tira);
  const marcos = normalizarMarcosAtlas(o.atlasFrames, o.fotogramas, o.ancho, o.alto);
  if (!marcos) throw new Error("Sin tira ni atlas");
  const ids = [...new Set(marcos.map(m => m.atlasId))];
  const rows = await prisma.spriteAtlas.findMany({ where: { userId: o.userId, id: { in: ids } }, select: { id: true, png: true } });
  if (rows.length !== ids.length) throw new Error("Atlas incompleto");
  const pages = new Map(rows.map(p => [p.id, Buffer.from(p.png)]));
  const fotos = await Promise.all(marcos.map(m => sharp(pages.get(m.atlasId)!).extract({ left: m.x, top: m.y,
    width: m.ancho, height: m.alto }).png({ compressionLevel: 9 }).toBuffer()));
  return sharp({ create: { width: o.ancho * o.fotogramas, height: o.alto, channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(fotos.map((input, i) => ({ input,
      left: i * o.ancho, top: 0, blend: "over" as const }))).png({ compressionLevel: 9 }).toBuffer();
}

export async function limpiarPaginasAtlasHuerfanas(userId: string) {
  const as = await prisma.spriteAnimation.findMany({ where: { character: { userId }, atlasFrames: { not: Prisma.DbNull } },
    select: { atlasFrames: true, fotogramas: true, ancho: true, alto: true } });
  const usados = new Set<string>();
  as.forEach(a => normalizarMarcosAtlas(a.atlasFrames, a.fotogramas, a.ancho, a.alto)?.forEach(m => usados.add(m.atlasId)));
  return prisma.spriteAtlas.deleteMany({ where: { userId, ...(usados.size ? { id: { notIn: [...usados] } } : {}) } });
}
