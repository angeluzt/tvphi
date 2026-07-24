import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { accrueAdRevenue } from "@/lib/billing/ads-stub";

// DEMO: simula ingresos por publicidad y los acredita como puntos al usuario actual
// dentro de su canal. En producción esto lo alimentaría una red de anuncios real.
export async function POST() {
  const user = await getCurrentUser();
  if (!user?.channel) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const impressions = 1000 + Math.floor(Math.random() * 4000);
  const result = await accrueAdRevenue({
    channelId: user.channel.id,
    userId: user.id,
    impressions,
  });
  return NextResponse.json({ ok: true, impressions, ...result });
}
