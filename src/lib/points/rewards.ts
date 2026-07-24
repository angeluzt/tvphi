import { prisma } from "../prisma";
import { spendPoints } from "./ledger";
import type { OverlayAction } from "../realtime/events";

// Canjea un reward: descuenta puntos y produce la acción de overlay resultante.
export async function redeemReward(opts: {
  channelId: string;
  rewardId: string;
  userId: string;
  userInput?: string;
}): Promise<{ overlay: OverlayAction; redemptionId: string; newBalance: number }> {
  const reward = await prisma.channelReward.findFirst({
    where: { id: opts.rewardId, channelId: opts.channelId, enabled: true },
  });
  if (!reward) throw new Error("Reward no disponible");

  const newBalance = await spendPoints(
    opts.channelId,
    opts.userId,
    reward.cost,
    `Canje: ${reward.title}`,
  );

  const redemption = await prisma.rewardRedemption.create({
    data: {
      channelId: opts.channelId,
      rewardId: reward.id,
      userId: opts.userId,
      userInput: opts.userInput,
      status: "COMPLETED",
    },
    include: { user: true },
  });

  const overlay: OverlayAction = {
    id: redemption.id,
    action: reward.action,
    payload: {
      title: reward.title,
      user: redemption.user.displayName,
      userInput: opts.userInput ?? "",
      config: reward.config,
    },
  };

  return { overlay, redemptionId: redemption.id, newBalance: Number(newBalance) };
}
