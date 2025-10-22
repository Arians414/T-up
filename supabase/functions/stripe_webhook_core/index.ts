
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

/**
 * POST /stripe_webhook_core
 * Handles core subscription lifecycle events.
 */

import { getAdminClient } from "../_shared/db.ts";
import { jsonResponse } from "../_shared/http.ts";
import { getStripeClient, getStripeWebhookSecret, assertStripeConfigured } from "../_shared/stripe.ts";
import { computeNextDueAt19Local, logToAppLogs } from "../_shared/utils.ts";

import type Stripe from "https://esm.sh/stripe@14.23.0?target=deno&deno-std=0.224.0";

serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse(405, { ok: false, error: "method_not_allowed" });
  }

  const stripeCheck = assertStripeConfigured();
  if (!stripeCheck.ok) {
    return stripeCheck.response!;
  }

  const stripe = getStripeClient();
  const webhookSecret = getStripeWebhookSecret();
  
  // Debug: Log webhook secret info (don't log the actual secret, just metadata)
  console.log("[stripe_webhook_core] Webhook secret exists:", !!webhookSecret);
  console.log("[stripe_webhook_core] Webhook secret length:", webhookSecret?.length ?? 0);
  console.log("[stripe_webhook_core] Webhook secret starts with 'whsec_':", webhookSecret?.startsWith("whsec_"));
  
  if (!stripe || !webhookSecret) {
    console.error("[stripe_webhook_core] Missing Stripe client or webhook secret");
    return jsonResponse(503, { ok: false, error: "stripe_not_configured" });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return jsonResponse(400, { ok: false, error: "missing_signature" });
  }

  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    console.log("[stripe_webhook_core] Successfully verified webhook signature for event:", event.type);
  } catch (error) {
    console.error("[stripe_webhook_core] Signature verification failed:", error);
    console.error("[stripe_webhook_core] Signature from header:", signature?.substring(0, 50) + "...");
    return jsonResponse(401, { ok: false, error: "invalid_signature" });
  }

  const supabase = getAdminClient();

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutSessionCompleted(supabase, session);
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionUpdated(supabase, subscription, event.type);
        break;
      }
      case "invoice.payment_succeeded":
      case "invoice.payment_failed": {
        // No-op for now, reserve for referral revenue tracking later.
        await logToAppLogs({
          event: event.type,
          source: "webhook",
          severity: "info",
          details: { invoice_id: (event.data.object as Stripe.Invoice).id },
        });
        break;
      }
      default: {
        await logToAppLogs({
          event: "stripe_webhook_core.unhandled",
          source: "webhook",
          severity: "info",
          details: { event_type: event.type },
        });
      }
    }
  } catch (error) {
    console.error("stripe_webhook_core handler_error", error);
    await logToAppLogs({
      event: "stripe_webhook_core.error",
      source: "webhook",
      severity: "error",
      details: { event_type: event.type, error: error instanceof Error ? error.message : String(error) },
    });
  }

  return jsonResponse(200, { ok: true });
});

const mapSubscriptionStatus = (status: string): "active" | "grace" | "canceled" | null => {
  switch (status) {
    case "trialing":
    case "active":
      return "active";
    case "past_due":
    case "unpaid":
    case "incomplete":
      return "grace";
    case "canceled":
    case "incomplete_expired":
      return "canceled";
    default:
      return null;
  }
};

const resolveUserIdByCustomer = async (supabase: ReturnType<typeof getAdminClient>, customerId: string) => {
  const { data, error } = await supabase
    .from("profiles")
    .select("user_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();

  if (error) {
    console.error("stripe_webhook_core resolveUserIdByCustomer error", error);
    return null;
  }
  return data?.user_id ?? null;
};

const handleCheckoutSessionCompleted = async (
  supabase: ReturnType<typeof getAdminClient>,
  session: Stripe.Checkout.Session,
) => {
  const customerId = typeof session.customer === "string"
    ? session.customer
    : session.customer?.id ?? null;
  let userId = session.metadata?.user_id ?? null;
  if (!userId && customerId) {
    userId = await resolveUserIdByCustomer(supabase, customerId);
  }
  if (!userId) {
    return;
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("user_id, stripe_customer_id, timezone, current_week_number")
    .eq("user_id", userId)
    .maybeSingle();

  if (profileError) {
    console.error("stripe_webhook_core profile_fetch_failed", profileError);
  }

  const now = new Date();
  const updates: Record<string, unknown> = {
    user_id: userId,
    entitlement_status: "active",
  };

  if (customerId && (!profile?.stripe_customer_id || profile.stripe_customer_id !== customerId)) {
    updates.stripe_customer_id = customerId;
  }

  if (!profile || !profile.current_week_number || profile.current_week_number < 1) {
    updates.current_week_number = 1;
    updates.next_week_due_at = computeNextDueAt19Local(profile?.timezone ?? undefined, now);
  }

  const { error: upsertError } = await supabase
    .from("profiles")
    .upsert(updates, { onConflict: "user_id" });

  if (upsertError) {
    console.error("stripe_webhook_core checkout upsert_failed", upsertError);
  }

  await logToAppLogs({
    event: "stripe.checkout_session_completed",
    source: "webhook",
    severity: "info",
    userId,
    details: {
      session_id: session.id,
      customer_id: customerId,
    },
  });
};

const handleSubscriptionUpdated = async (
  supabase: ReturnType<typeof getAdminClient>,
  subscription: Stripe.Subscription,
  eventType: string,
) => {
  const status = mapSubscriptionStatus(subscription.status);
  if (!status) {
    await logToAppLogs({
      event: "stripe.subscription.unhandled_status",
      source: "webhook",
      severity: "warn",
      details: { subscription_id: subscription.id, status: subscription.status, event_type: eventType },
    });
    return;
  }

  const customerId = typeof subscription.customer === "string"
    ? subscription.customer
    : subscription.customer?.id ?? null;
  let userId = subscription.metadata?.user_id ?? null;
  if (!userId && customerId) {
    userId = await resolveUserIdByCustomer(supabase, customerId);
  }
  if (!userId) {
    return;
  }

  const updates: Record<string, unknown> = {
    user_id: userId,
    entitlement_status: status,
  };

  if (customerId) {
    updates.stripe_customer_id = customerId;
  }

  const { error: upsertError } = await supabase
    .from("profiles")
    .upsert(updates, { onConflict: "user_id" });

  if (upsertError) {
    console.error("stripe_webhook_core subscription upsert_failed", upsertError);
  }

  await logToAppLogs({
    event: `stripe.subscription.${eventType}`,
    source: "webhook",
    severity: "info",
    userId,
    details: {
      subscription_id: subscription.id,
      customer_id: customerId,
      status,
    },
  });
};
