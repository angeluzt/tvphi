import { prisma } from "@/lib/prisma";

// Modelos que ya fallaron en ESTA cuenta.
//
// Por qué esto y no filtrar por el nombre: la lista de /v1/models no marca en
// ningún sitio si un modelo está retirado, y ningún identificador contiene la
// palabra «deprecated». Filtrar por texto no quita ni uno solo — da sensación
// de estar protegido sin estarlo.
//
// Lo único que de verdad demuestra que un modelo ya no sirve es haberlo
// intentado. Así que cuando OpenAI rechaza uno, se apunta, y la próxima vez
// sale avisado en la lista en vez de volver a cobrarte el descubrimiento.

const TOPE = 30;

export async function anotarFallo(userId: string, modelo: string) {
  try {
    const cred = await prisma.aiCredential.findUnique({ where: { userId }, select: { models: true } });
    if (!cred) return;
    const models = (cred.models as any) ?? {};
    const previos: string[] = Array.isArray(models.fallidos) ? models.fallidos : [];
    if (previos.includes(modelo)) return;
    const fallidos = [modelo, ...previos].slice(0, TOPE);
    await prisma.aiCredential.update({ where: { userId }, data: { models: { ...models, fallidos } as any } });
  } catch {
    // Que no se pueda apuntar el fallo no debe romper la respuesta: el usuario
    // ya tiene un problema, no le añadamos otro.
  }
}

export async function leerFallidos(userId: string): Promise<string[]> {
  try {
    const cred = await prisma.aiCredential.findUnique({ where: { userId }, select: { models: true } });
    const f = (cred?.models as any)?.fallidos;
    return Array.isArray(f) ? f : [];
  } catch { return []; }
}
