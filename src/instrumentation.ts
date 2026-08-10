import { assertEnvProduccion } from "@/lib/env";

/** Solo al arrancar el server Node — no en edge ni con efectos laterales del build. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") return;

  // Prisma lee process.env.DATABASE_URL, no nuestro getter. Preferir la privada.
  const privada = (process.env.DATABASE_PRIVATE_URL ?? "").trim();
  if (privada) process.env.DATABASE_URL = privada;

  assertEnvProduccion();
}
