import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/billing/stripe";
import { getSessionUserId } from "@/lib/auth";
import { emitAlertToChannel } from "@/server/emit";
import { formatMoney } from "@/lib/utils";
import { env } from "@/lib/env";

const schema = z.object({
  channelSlug: z.string(),
  displayName: z.string().min(1).max(40),
  amountCents: z.number().int().min(100).max(1_000_000),
  message: z.string().max(200).optional(),
});

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const { channelSlug, displayName, amountCents, message } = parsed.data;
  const channel = await prisma.channel.findUnique({ where: { slug: channelSlug } });
  if (!channel) return NextResponse.json({ error: "Canal no encontrado" }, { status: 404 });

  const userId = await getSessionUserId();
  const stripe = getStripe();

  // Modo real: Stripe Checkout.
  if (stripe) {
    const donation = await prisma.donation.create({
      data: {
        channelId: channel.id,
        fromUserId: userId,
        displayName,
        amountCents,
        message,
        status: "PENDING",
        provider: "stripe",
      },
    });
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      success_url: `${env.appUrl}/${channelSlug}?donation=ok`,
      cancel_url: `${env.appUrl}/${channelSlug}?donation=cancel`,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: amountCents,
            product_data: { name: `Donación a ${channel.title}` },
          },
        },
      ],
      metadata: { donationId: donation.id, channelSlug },
    });
    return NextResponse.json({ checkoutUrl: session.url });
  }

  // Modo simulado (dev): completa la donación y dispara la alerta al instante.
  const donation = await prisma.donation.create({
    data: {
      channelId: channel.id,
      fromUserId: userId,
      displayName,
      amountCents,
      message,
      status: "COMPLETED",
      provider: "simulated",
    },
  });

  emitAlertToChannel(channelSlug, {
    id: donation.id,
    kind: "donation",
    title: `${displayName} donó ${formatMoney(amountCents)}`,
    subtitle: message,
    amount: formatMoney(amountCents),
    accent: "#facc15",
    durationMs: 7000,
  });

  return NextResponse.json({ ok: true, simulated: true });
}
