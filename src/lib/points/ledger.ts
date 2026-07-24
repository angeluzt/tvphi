import { prisma } from "../prisma";
import type { PointsTxType, Prisma } from "@prisma/client";

// Ledger de puntos: cada movimiento se registra en PointsTransaction y el saldo
// materializado en PointsBalance se mantiene consistente dentro de una transacción.

export interface ApplyPointsInput {
  channelId: string;
  userId: string;
  type: PointsTxType;
  amount: bigint; // positivo = ganancia, negativo = gasto
  memo?: string;
}

export async function applyPoints(input: ApplyPointsInput): Promise<bigint> {
  const { channelId, userId, type, amount, memo } = input;
  const result = await prisma.$transaction(async (tx) => {
    await tx.pointsTransaction.create({
      data: { channelId, userId, type, amount, memo },
    });
    const bal = await tx.pointsBalance.upsert({
      where: { channelId_userId: { channelId, userId } },
      create: { channelId, userId, balance: amount },
      update: { balance: { increment: amount } },
    });
    return bal.balance;
  });
  return result;
}

export async function getBalance(channelId: string, userId: string): Promise<bigint> {
  const row = await prisma.pointsBalance.findUnique({
    where: { channelId_userId: { channelId, userId } },
  });
  return row?.balance ?? 0n;
}

// Gasta puntos de forma atómica solo si hay saldo suficiente.
// Devuelve el nuevo saldo o lanza si es insuficiente.
export async function spendPoints(
  channelId: string,
  userId: string,
  cost: number,
  memo?: string,
): Promise<bigint> {
  const amount = BigInt(cost);
  return prisma.$transaction(async (tx) => {
    const bal = await tx.pointsBalance.findUnique({
      where: { channelId_userId: { channelId, userId } },
    });
    const current = bal?.balance ?? 0n;
    if (current < amount) {
      throw new PointsError("Puntos insuficientes");
    }
    await tx.pointsTransaction.create({
      data: { channelId, userId, type: "REDEEM", amount: -amount, memo },
    });
    const updated = await tx.pointsBalance.update({
      where: { channelId_userId: { channelId, userId } },
      data: { balance: { decrement: amount } },
    });
    return updated.balance;
  });
}

export class PointsError extends Error {}

// Suma total de puntos en circulación de un canal (para el panel de ingresos).
export async function channelPointsInCirculation(channelId: string): Promise<bigint> {
  const agg = await prisma.pointsBalance.aggregate({
    where: { channelId },
    _sum: { balance: true },
  });
  return (agg._sum.balance as bigint | null) ?? 0n;
}

export type { Prisma };
