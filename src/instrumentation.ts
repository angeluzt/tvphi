import { assertEnvProduccion } from "@/lib/env";

export async function register() {
  assertEnvProduccion();
}
