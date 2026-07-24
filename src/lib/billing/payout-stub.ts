import { prisma } from "../prisma";
import { spendPoints } from "../points/ledger";
import { env } from "../env";

// STUB de retiros. En producción requeriría Stripe Connect + KYC + verificación fiscal.
// Aquí quemamos puntos del solicitante y registramos una solicitud de pago.
export async function requestPayout(opts: {
  channelId: string;
  userId: string;
  points: number;
  note?: string;
}) {
  const amountCents = Math.round((opts.points / env.pointsPerUsd) * 100);
  await spendPoints(opts.channelId, opts.userId, opts.points, "Solicitud de retiro (simulado)");
  const payout = await prisma.payout.create({
    data: {
      channelId: opts.channelId,
      amountCents,
      pointsBurned: BigInt(opts.points),
      status: "REQUESTED",
      note: opts.note ?? "Retiro simulado — integración real pendiente (Stripe Connect + KYC)",
    },
  });
  return payout;
}
