import { assertEnvProduccion } from "@/lib/env";

/** Solo al arrancar el server Node — no en edge ni con efectos laterales del build. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") return;
  assertEnvProduccion();
}
