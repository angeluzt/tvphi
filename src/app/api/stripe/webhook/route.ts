import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/billing/stripe";
import { env } from "@/lib/env";
import { emitAlertToChannel } from "@/server/emit";
import { formatMoney } from "@/lib/utils";

// Next necesita el cuerpo crudo para verificar la firma.
export async function POST(req: Request) {
  const stripe = getStripe();
  if (!stripe || !env.stripeWebhookSecret) {
    return NextResponse.json({ error: "Stripe no configurado" }, { status: 400 });
  }

  const sig = req.headers.get("stripe-signature") ?? "";
  const raw = await req.text();

  let event;
  try {
    event = stripe.webhooks.constructEvent(raw, sig, env.stripeWebhookSecret);
  } catch (err: any) {
    return NextResponse.json({ error: `Firma inválida: ${err.message}` }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as any;
    const donationId = session.metadata?.donationId as string | undefined;
    const channelSlug = session.metadata?.channelSlug as string | undefined;
    if (donationId) {
      const donation = await prisma.donation.update({
        where: { id: donationId },
        data: { status: "COMPLETED", providerRef: session.id },
      });
      if (channelSlug) {
        emitAlertToChannel(channelSlug, {
          id: donation.id,
          kind: "donation",
          title: `${donation.displayName} donó ${formatMoney(donation.amountCents)}`,
          subtitle: donation.message ?? undefined,
          amount: formatMoney(donation.amountCents),
          accent: "#f5c542",
          durationMs: 7000,
        });
      }
    }
  }

  return NextResponse.json({ received: true });
}
