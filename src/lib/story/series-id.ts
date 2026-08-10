import { prisma } from "@/lib/prisma";

/**
 * Comprueba que seriesId sea null (desvincular), undefined (no tocar) o una
 * serie del mismo usuario. Evita colgar capítulos ajenos a series de otro.
 */
export async function resolverSeriesId(
  userId: string,
  seriesId: string | null | undefined,
): Promise<{ ok: true; seriesId: string | null | undefined } | { ok: false; error: string }> {
  if (seriesId === undefined) return { ok: true, seriesId: undefined };
  if (seriesId === null) return { ok: true, seriesId: null };
  const s = await prisma.storySeries.findFirst({
    where: { id: seriesId, userId },
    select: { id: true },
  });
  if (!s) return { ok: false, error: "Esa serie no está en tu cuenta." };
  return { ok: true, seriesId: s.id };
}
