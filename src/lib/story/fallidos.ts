import { prisma } from "@/lib/prisma";

// Modelos que ya fallaron para ESTE usuario.
//
// Por qué esto y no filtrar por el nombre: la lista de /v1/models no marca en
// ningún sitio si un modelo está retirado. Lo único que demuestra que no sirve
// es haberlo intentado: se apunta y la próxima vez sale avisado en la lista.

const TOPE = 30;

export async function anotarFallo(userId: string, modelo: string) {
  try {
    const cred = await prisma.aiCredential.findUnique({ where: { userId }, select: { models: true } });
    const models = ((cred?.models as Record<string, unknown>) ?? {});
    const previos: string[] = Array.isArray(models.fallidos) ? (models.fallidos as string[]) : [];
    if (previos.includes(modelo)) return;
    const fallidos = [modelo, ...previos].slice(0, TOPE);
    const next = { ...models, fallidos };
    await prisma.aiCredential.upsert({
      where: { userId },
      create: {
        userId,
        provider: "openai",
        encrypted: "env",
        hint: "servidor",
        models: next as object,
      },
      update: { models: next as object },
    });
  } catch {
    // Que no se pueda apuntar el fallo no debe romper la respuesta.
  }
}

export async function leerFallidos(userId: string): Promise<string[]> {
  try {
    const cred = await prisma.aiCredential.findUnique({ where: { userId }, select: { models: true } });
    const f = (cred?.models as any)?.fallidos;
    return Array.isArray(f) ? f : [];
  } catch { return []; }
}
