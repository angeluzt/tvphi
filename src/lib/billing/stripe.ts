import Stripe from "stripe";
import { env } from "../env";

// Cliente Stripe perezoso. En dev sin clave, `stripe` es null y los flujos caen
// en modo simulado (ver rutas /api/donations y /api/subscriptions).
let client: Stripe | null = null;

export function getStripe(): Stripe | null {
  if (!env.stripeSecretKey) return null;
  if (!client) client = new Stripe(env.stripeSecretKey, { apiVersion: "2024-06-20" as any });
  return client;
}

export const stripeConfigured = () => Boolean(env.stripeSecretKey);
