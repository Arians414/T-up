import { serve } from \"https://deno.land/std@0.224.0/http/server.ts\";

/**
 * POST /stripe_webhook_referrals
 * Handles Stripe invoice events for referral revenue logging.
 */

import { getAdminClient, jsonResponse, logToAppLogs } from \"../_shared/db.ts\";
import { getStripeClient, getStripeWebhookSecret } from \"../_shared/stripe.ts\";
import Stripe from \"https://esm.sh/stripe@14.23.0?target=deno&deno-std=0.224.0\";

serve(async (req) => {
  if (req.method !== \"POST\") {
    return jsonResponse({ ok: false, error: \"method_not_allowed\" }, 405);
  }

  const stripe = getStripeClient();
  const webhookSecret = getStripeWebhookSecret();
  if (!stripe || !webhookSecret) {
    return jsonResponse({ ok: false, error: \"stripe_unavailable\" }, 503);
  }

  const signature = req.headers.get(\"stripe-signature\");
  if (!signature) {
    return jsonResponse({ ok: false, error: \"missing_signature\" }, 400);
  }

  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (error) {
    console.error(\"stripe_webhook_referrals invalid_signature\", error);
    return jsonResponse({ ok: false, error: \"invalid_signature\" }, 401);
  }

  const supabase = getAdminClient();

  try {
    switch (event.type) {
      case \"invoice.payment_succeeded\": {
        const invoice = event.data.object as Stripe.Invoice;
        await handleInvoicePaymentSucceeded(supabase, stripe, invoice);
        break;
      }
      default: {
        await logToAppLogs({
          event: \"stripe_webhook_referrals.unhandled\",
          source: \"webhook\",
          severity: \"info\",
          details: { event_type: event.type },
        });
      }
    }
  } catch (error) {
    console.error(\"stripe_webhook_referrals handler_error\", error);
    await logToAppLogs({
      event: \"stripe_webhook_referrals.error\",
      source: \"webhook\",
      severity: \"error\",
      details: { event_type: event.type, error: error instanceof Error ? error.message : String(error) },
    });
  }

  return jsonResponse({ ok: true }, 200);
});

const handleInvoicePaymentSucceeded = async (
  supabase: ReturnType<typeof getAdminClient>,
  stripe: Stripe,
  invoice: Stripe.Invoice,
) => {
  const amountPaid = invoice.amount_paid ?? 0;
  if (amountPaid <= 0) {
    return;
  }

  const customerId = typeof invoice.customer === \"string\"
    ? invoice.customer
    : invoice.customer?.id ?? null;
  if (!customerId) {
    return;
  }

  const { data: profile, error: profileError } = await supabase
    .from(\"profiles\")
    .select(\"user_id, referred_creator_id\")
    .eq(\"stripe_customer_id\", customerId)
    .maybeSingle();

  if (profileError) {
    console.error(\"stripe_webhook_referrals profile_lookup_failed\", profileError);
    return;
  }
  if (!profile?.user_id || !profile.referred_creator_id) {
    return;
  }

  const discountTotal = (invoice.total_discount_amounts ?? []).reduce(
    (sum, entry) => sum + (entry.amount ?? 0),
    0,
  );
  const taxTotal = (invoice.total_tax_amounts ?? []).reduce(
    (sum, entry) => sum + (entry.amount ?? 0),
    0,
  );

  let feeTotal = 0;
  try {
    if (invoice.charge) {
      const chargeId = typeof invoice.charge === \"string\" ? invoice.charge : invoice.charge.id;
      const charge = await stripe.charges.retrieve(chargeId, { expand: [\"balance_transaction\"] });
      const balanceTransaction = charge.balance_transaction;
      if (balanceTransaction && typeof balanceTransaction !== \"string\" && balanceTransaction.fee) {
        feeTotal = Math.max(0, balanceTransaction.fee);
      }
    }
  } catch (error) {
    console.warn(\"stripe_webhook_referrals fee_lookup_failed\", error);
  }

  const net = Math.max(amountPaid - discountTotal - taxTotal - feeTotal, 0);

  const primaryLine = invoice.lines?.data?.[0];
  const periodStart = primaryLine?.period?.start
    ? new Date(primaryLine.period.start * 1000).toISOString()
    : new Date().toISOString();
  const periodEnd = primaryLine?.period?.end
    ? new Date(primaryLine.period.end * 1000).toISOString()
    : new Date().toISOString();

  const payload = {
    user_id: profile.user_id,
    creator_id: profile.referred_creator_id,
    stripe_invoice_id: invoice.id,
    amount_net_cents: net,
    period_start: periodStart,
    period_end: periodEnd,
  };

  const { error: upsertError } = await supabase
    .from(\"referral_revenue_log\")
    .upsert(payload, { onConflict: \"stripe_invoice_id\" });

  if (upsertError) {
    console.error(\"stripe_webhook_referrals upsert_failed\", upsertError);
  }
};
