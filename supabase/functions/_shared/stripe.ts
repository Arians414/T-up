import Stripe from "https://esm.sh/stripe@14.23.0?target=deno&deno-std=0.224.0";

let stripeClient: Stripe | null = null;

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
const APP_BASE_URL = (Deno.env.get("APP_BASE_URL") ?? "").trim().replace(/\/+$/, "");

export const getStripeClient = (): Stripe | null => {
  if (!STRIPE_SECRET_KEY) {
    return null;
  }
  if (!stripeClient) {
    stripeClient = new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: "2023-10-16",
    });
  }
  return stripeClient;
};

export const getStripeWebhookSecret = (): string => STRIPE_WEBHOOK_SECRET;

export const getAppBaseUrl = (): string => APP_BASE_URL;

export const stripeConfigured = (): boolean => Boolean(getStripeClient() && APP_BASE_URL);

export const assertStripeConfigured = (): { ok: boolean; status: number; response?: Response } => {
  if (!STRIPE_SECRET_KEY || !APP_BASE_URL) {
    const response = new Response(JSON.stringify({ ok: false, error: "stripe_not_configured" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
    return { ok: false, status: 503, response };
  }
  return { ok: true, status: 200 };
};

export type StripeType = Stripe;
