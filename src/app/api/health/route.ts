import { NextResponse } from "next/server";

// Healthcheck para Railway u otros orquestadores. No toca la base de datos,
// para que un fallo transitorio de la BD no marque la app como caída.
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ ok: true, service: "tvphi", ts: Date.now() });
}
