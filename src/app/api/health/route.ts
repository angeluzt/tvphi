import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Healthcheck para Railway. Comprueba proceso + (si puede) Postgres.
// Si la BD cae: ok=false y status 503, para que el orquestador no mande tráfico.

export const dynamic = "force-dynamic";

export async function GET() {
  const ts = Date.now();
  let db: "ok" | "error" = "ok";
  let dbMs = 0;
  try {
    const t0 = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    dbMs = Date.now() - t0;
  } catch {
    db = "error";
  }

  const sano = db === "ok";
  return NextResponse.json(
    { ok: sano, service: "tvphi", ts, db, dbMs },
    { status: sano ? 200 : 503 },
  );
}
