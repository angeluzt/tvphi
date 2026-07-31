import { NextResponse } from "next/server";
import { catalogoEfectos, reglasSitios, reglasMontaje } from "@/lib/story/catalogo";

// Catálogo de efectos y reglas del montaje, para escribir un proyecto a mano
// (o que lo genere una IA) sin leerse el motor. Lo mismo que viaja dentro de
// los JSON exportados.
export async function GET() {
  return NextResponse.json({
    montaje: reglasMontaje(),
    sitios: reglasSitios(),
    efectos: catalogoEfectos(),
  });
}
