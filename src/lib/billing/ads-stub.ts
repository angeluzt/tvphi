import { prisma } from "../prisma";
import { applyPoints } from "../points/ledger";
import { env } from "../env";

// STUB de monetización por publicidad.
// En producción, esto lo alimentaría una red de anuncios real (previa aprobación
// y con cumplimiento legal/KYC). Aquí simulamos que las impresiones de anuncios
// mostradas a un espectador generan ingresos, y esos ingresos se acreditan como
// puntos (los puntos representan dinero real a la tasa POINTS_PER_USD).

const CPM_CENTS = 200; // ingreso simulado por cada 1000 impresiones (USD 2.00 CPM)

export interface AdAccrualResult {
  revenueCents: number;
  pointsMinted: number;
  newBalance: number;
}

export async function accrueAdRevenue(opts: {
  channelId: string;
  userId: string;
  impressions: number;
}): Promise<AdAccrualResult> {
  const revenueCents = Math.round((opts.impressions / 1000) * CPM_CENTS);
  // 1 USD => env.pointsPerUsd puntos.
  const points = Math.round((revenueCents / 100) * env.pointsPerUsd);
  const pointsMinted = BigInt(points);

  await prisma.adRevenueAccrual.create({
    data: {
      channelId: opts.channelId,
      impressions: opts.impressions,
      revenueCents,
      pointsMinted,
    },
  });

  const newBalance = await applyPoints({
    channelId: opts.channelId,
    userId: opts.userId,
    type: "AD_ACCRUAL",
    amount: pointsMinted,
    memo: `Publicidad: ${opts.impressions} impresiones (simulado)`,
  });

  return { revenueCents, pointsMinted: points, newBalance: Number(newBalance) };
}
