import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

const schema = z.object({
  channelSlug: z.string(),
  action: z.enum(["subscribe", "unsubscribe"]),
});

// Suscripción a un canal. En esta versión es "simulada" (gratuita) para que el chat
// solo-suscriptores sea funcional. Con Stripe recurrente configurado, aquí se crearía
// una Checkout Session de suscripción y se activaría vía webhook.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Inicia sesión" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const channel = await prisma.channel.findUnique({ where: { slug: parsed.data.channelSlug } });
  if (!channel) return NextResponse.json({ error: "Canal no encontrado" }, { status: 404 });
  if (channel.ownerId === user.id) {
    return NextResponse.json({ error: "No puedes suscribirte a tu propio canal" }, { status: 400 });
  }

  if (parsed.data.action === "unsubscribe") {
    await prisma.subscription.updateMany({
      where: { channelId: channel.id, userId: user.id },
      data: { status: "CANCELED" },
    });
    return NextResponse.json({ ok: true, subscribed: false });
  }

  await prisma.subscription.upsert({
    where: { channelId_userId: { channelId: channel.id, userId: user.id } },
    create: { channelId: channel.id, userId: user.id, tier: 1, status: "ACTIVE", provider: "simulated" },
    update: { status: "ACTIVE" },
  });
  return NextResponse.json({ ok: true, subscribed: true });
}
