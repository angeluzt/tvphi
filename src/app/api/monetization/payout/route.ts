import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { requestPayout } from "@/lib/billing/payout-stub";
import { PointsError } from "@/lib/points/ledger";

const schema = z.object({ points: z.number().int().min(1) });

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user?.channel) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  try {
    const payout = await requestPayout({
      channelId: user.channel.id,
      userId: user.id,
      points: parsed.data.points,
    });
    return NextResponse.json({
      ok: true,
      payout: {
        id: payout.id,
        amountCents: payout.amountCents,
        points: Number(payout.pointsBurned),
        status: payout.status,
      },
    });
  } catch (err) {
    const msg = err instanceof PointsError ? err.message : "No se pudo solicitar el retiro";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
