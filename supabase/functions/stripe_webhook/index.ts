import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.23.0?target=deno&deno-std=0.224.0";
import { getServiceSupabaseClient, jsonResponse, logToAppLogs } from "../_shared/utils.ts";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";

if (!STRIPE_SECRET_KEY) {
  throw new Error("Missing STRIPE_SECRET_KEY");
}
if (!STRIPE_WEBHOOK_SECRET) {
  throw new Error("Missing STRIPE_WEBHOOK_SECRET");
}

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: "2023-10-16",
});

const mapSubscriptionStatus = (status: string): "none" | "trial" | "active" | "past_due" | "canceled" => {
  switch (status) {
    case "trialing":
      return "trial";
    case "active":
      return "active";
    case "past_due":
    case "incomplete":
    case "incomplete_expired":
      return "past_due";
    case "canceled":
    case "unpaid":
      return "canceled";
    default:
      return "none";
  }
};

const upsertProfileForStripe = async (
  params: {
    userId?: string | null;
    stripeCustomerId?: string | null;
    updates: Record<string, unknown>;
  },
) => {
  const supabase = getServiceSupabaseClient();
  const { userId, stripeCustomerId, updates } = params;

  const attemptUpdate = async (column: "user_id" | "stripe_customer_id", value: string) => {
    const { data, error } = await supabase.from("profiles")
      .update(updates)
      .eq(column, value)
      .select("user_id");
    if (error) {
      return { error };
    }
    return { updated: data?.length ?? 0 };
  };

  if (userId) {
    const { data: existingProfile, error: fetchError } = await supabase
      .from("profiles")
      .select("user_id, trial_started_at, trial_ends_at, stripe_customer_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (fetchError) {
      return { error: fetchError };
    }

    const preparedUpdates: Record<string, unknown> = { ...updates };
    const nowIso = new Date().toISOString();

    if (!existingProfile) {
      if (preparedUpdates.trial_started_at === undefined) {
        preparedUpdates.trial_started_at = nowIso;
      }
      if (preparedUpdates.trial_ends_at === undefined) {
        preparedUpdates.trial_ends_at = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      }
      if (stripeCustomerId) {
        preparedUpdates.stripe_customer_id = stripeCustomerId;
      }
      const { error: insertError } = await supabase.from("profiles").insert({
        user_id: userId,
        ...preparedUpdates,
      });
      if (insertError) {
        return { error: insertError };
      }
      return { updated: 1 };
    }

    if (preparedUpdates.trial_started_at === undefined && !existingProfile.trial_started_at) {
      preparedUpdates.trial_started_at = nowIso;
    }
    if (preparedUpdates.trial_ends_at === undefined && !existingProfile.trial_ends_at) {
      preparedUpdates.trial_ends_at = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    }
    if (stripeCustomerId && !existingProfile.stripe_customer_id) {
      preparedUpdates.stripe_customer_id = stripeCustomerId;
    }

    const { error: updateError } = await supabase
      .from("profiles")
      .update(preparedUpdates)
      .eq("user_id", userId);
    if (updateError) {
      return { error: updateError };
    }
    return { updated: 1 };
  }

  if (stripeCustomerId) {
    const { error } = await supabase
      .from("profiles")
      .update(updates)
      .eq("stripe_customer_id", stripeCustomerId);
    if (error) {
      return { error };
    }
    return { updated: 1 };
  }

  return { updated: 0 };
};

serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
  }

  const signature = req.headers.get("Stripe-Signature");
  if (!signature) {
    return jsonResponse({ ok: false, error: "Missing Stripe signature" }, 400);
  }

  let event: Stripe.Event;
  const rawBody = await req.text();
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, STRIPE_WEBHOOK_SECRET);
  } catch (error) {
    await logToAppLogs({
      event: "stripe_webhook",
      source: "webhook",
      details: { reason: "invalid_signature", error: error instanceof Error ? error.message : String(error) },
    });
    return jsonResponse({ ok: false, error: "Invalid signature" }, 400);
  }

  const supabase = getServiceSupabaseClient();

  // Idempotency insert
  const { error: insertEventError } = await supabase
    .from("stripe_webhook_events")
    .insert({
      event_id: event.id,
      payload: event,
    });

  if (insertEventError) {
    if ((insertEventError as any).code === "23505") {
      return jsonResponse({ ok: true, duplicate: true });
    }
    await logToAppLogs({
      event: "stripe_webhook",
      source: "webhook",
      details: { step: "insert_event", error: insertEventError },
    });
    return jsonResponse({ ok: false, error: "Failed to persist event" }, 500);
  }

  const finishEvent = async () => {
    await supabase
      .from("stripe_webhook_events")
      .update({ processed_at: new Date().toISOString() })
      .eq("event_id", event.id);
  };

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.user_id ?? null;
        const customerId = typeof session.customer === "string"
          ? session.customer
          : session.customer?.id ?? null;

        const { error } = await upsertProfileForStripe({
          userId,
          stripeCustomerId: customerId,
          updates: {
            entitlement_status: "trial",
            ever_started_trial: true,
            trial_ends_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          },
        });

        if (error) {
          throw error;
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const status = mapSubscriptionStatus(subscription.status);
        const customerId = typeof subscription.customer === "string"
          ? subscription.customer
          : subscription.customer?.id ?? null;
        const userId = (subscription.metadata as Record<string, string> | undefined)?.user_id ?? null;

        const periodEnd = subscription.current_period_end
          ? new Date(subscription.current_period_end * 1000).toISOString()
          : null;

        const { error } = await upsertProfileForStripe({
          userId,
          stripeCustomerId: customerId,
          updates: {
            entitlement_status: status,
            ever_subscribed: status === "active" || status === "past_due",
            active_subscription_id: subscription.id,
            trial_ends_at: periodEnd ?? undefined,
          },
        });
        if (error) {
          throw error;
        }
        break;
      }
      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = typeof invoice.customer === "string"
          ? invoice.customer
          : invoice.customer?.id ?? null;
        const subscriptionId = typeof invoice.subscription === "string"
          ? invoice.subscription
          : invoice.subscription?.id ?? null;

        const { error } = await upsertProfileForStripe({
          stripeCustomerId: customerId,
          updates: {
            entitlement_status: "active",
            active_subscription_id: subscriptionId ?? undefined,
            ever_subscribed: true,
          },
        });
        if (error) {
          throw error;
        }
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = typeof invoice.customer === "string"
          ? invoice.customer
          : invoice.customer?.id ?? null;

        const { error } = await upsertProfileForStripe({
          stripeCustomerId: customerId,
          updates: {
            entitlement_status: "past_due",
          },
        });
        if (error) {
          throw error;
        }
        break;
      }
      default:
        break;
    }
  } catch (error) {
    await logToAppLogs({
      event: "stripe_webhook",
      source: "webhook",
      details: {
        error: error instanceof Error ? error.message : String(error),
        event_type: event.type,
      },
    });
    return jsonResponse({ ok: false, error: "Processing error" }, 500);
  } finally {
    await finishEvent();
  }

  return jsonResponse({ ok: true });
});
