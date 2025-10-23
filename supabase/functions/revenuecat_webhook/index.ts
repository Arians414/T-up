import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { getAdminClient } from "../_shared/db.ts";
import { jsonResponse } from "../_shared/http.ts";
import { logToAppLogs } from "../_shared/utils.ts";

/**
 * POST /revenuecat_webhook
 * Handles RevenueCat webhook events for subscription lifecycle
 * 
 * Events to handle:
 * - INITIAL_PURCHASE: User starts subscription (activate trial)
 * - RENEWAL: Subscription renewed (keep active)
 * - CANCELLATION: User canceled (mark for expiration)
 * - EXPIRATION: Subscription expired (deactivate)
 * - BILLING_ISSUE: Payment failed (grace period)
 * 
 * Setup: Configure this URL in RevenueCat Dashboard → Integrations → Webhooks
 * URL: https://sxgqbxgeoqsbssiwbbpi.functions.supabase.co/revenuecat_webhook
 */

const RC_WEBHOOK_SECRET = Deno.env.get("REVENUECAT_WEBHOOK_SECRET") ?? "";

serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse(405, { ok: false, error: "method_not_allowed" });
  }

  // Verify webhook signature (RevenueCat sends Authorization header)
  const authHeader = req.headers.get("Authorization");
  if (RC_WEBHOOK_SECRET && authHeader !== `Bearer ${RC_WEBHOOK_SECRET}`) {
    console.error("[revenuecat_webhook] invalid_authorization");
    return jsonResponse(401, { ok: false, error: "unauthorized" });
  }

  let event: Record<string, unknown>;
  try {
    event = await req.json();
  } catch (error) {
    console.error("[revenuecat_webhook] invalid_json", error);
    return jsonResponse(400, { ok: false, error: "invalid_json" });
  }

  const eventType = typeof event.type === "string" ? event.type : "unknown";
  const eventData = (event.event ?? {}) as Record<string, unknown>;

  const supabase = getAdminClient();

  try {
    switch (eventType) {
      case "INITIAL_PURCHASE":
        await handleInitialPurchase(supabase, eventData);
        break;
      
      case "RENEWAL":
        await handleRenewal(supabase, eventData);
        break;
      
      case "CANCELLATION":
        await handleCancellation(supabase, eventData);
        break;
      
      case "EXPIRATION":
        await handleExpiration(supabase, eventData);
        break;
      
      case "BILLING_ISSUE":
        await handleBillingIssue(supabase, eventData);
        break;
      
      case "PRODUCT_CHANGE":
        await handleProductChange(supabase, eventData);
        break;
      
      default:
        await logToAppLogs({
          event: "revenuecat_webhook.unhandled",
          source: "webhook",
          severity: "info",
          details: { event_type: eventType },
        });
    }
  } catch (error) {
    console.error("[revenuecat_webhook] handler_error", error);
    await logToAppLogs({
      event: "revenuecat_webhook.error",
      source: "webhook",
      severity: "error",
      details: { 
        event_type: eventType, 
        error: error instanceof Error ? error.message : String(error) 
      },
    });
  }

  return jsonResponse(200, { ok: true });
});

// Helper: Extract user ID from RevenueCat event
const extractUserId = (eventData: Record<string, unknown>): string | null => {
  const appUserId = eventData.app_user_id;
  if (typeof appUserId === "string" && appUserId.length > 0) {
    // RevenueCat app_user_id should be our Supabase user_id
    return appUserId;
  }
  return null;
};

// Helper: Extract subscription details
const extractSubscriptionDetails = (eventData: Record<string, unknown>) => {
  const productId = typeof eventData.product_id === "string" ? eventData.product_id : null;
  const expiresAt = typeof eventData.expiration_at_ms === "number"
    ? new Date(eventData.expiration_at_ms).toISOString()
    : null;
  const originalTransactionId = typeof eventData.original_transaction_id === "string"
    ? eventData.original_transaction_id
    : null;
  const store = typeof eventData.store === "string" ? eventData.store : null;
  
  const platform = (() => {
    if (store === "APP_STORE") return "apple";
    if (store === "PLAY_STORE") return "google";
    if (store === "STRIPE") return "stripe";
    return "web";
  })();

  return {
    productId,
    expiresAt,
    originalTransactionId,
    platform: platform as "apple" | "google" | "stripe" | "web",
  };
};

const handleInitialPurchase = async (
  supabase: ReturnType<typeof getAdminClient>,
  eventData: Record<string, unknown>,
) => {
  const userId = extractUserId(eventData);
  if (!userId) {
    console.warn("[revenuecat_webhook] INITIAL_PURCHASE missing user_id");
    return;
  }

  const { productId, expiresAt, originalTransactionId, platform } = extractSubscriptionDetails(eventData);

  const updates: Record<string, unknown> = {
    user_id: userId,
    entitlement_status: "active",
    ever_subscribed: true,
    subscription_platform: platform,
    subscription_product_id: productId,
    subscription_expires_at: expiresAt,
    original_transaction_id: originalTransactionId,
  };

  // Set rc_customer_id from event
  const rcCustomerId = typeof eventData.app_user_id === "string" ? eventData.app_user_id : null;
  if (rcCustomerId) {
    updates.rc_customer_id = rcCustomerId;
  }

  const { error } = await supabase
    .from("profiles")
    .upsert(updates, { onConflict: "user_id" });

  if (error) {
    console.error("[revenuecat_webhook] INITIAL_PURCHASE upsert_failed", error);
  }

  await logToAppLogs({
    event: "revenuecat.initial_purchase",
    source: "webhook",
    severity: "info",
    userId,
    details: { product_id: productId, platform },
  });
};

const handleRenewal = async (
  supabase: ReturnType<typeof getAdminClient>,
  eventData: Record<string, unknown>,
) => {
  const userId = extractUserId(eventData);
  if (!userId) return;

  const { expiresAt } = extractSubscriptionDetails(eventData);

  const { error } = await supabase
    .from("profiles")
    .update({
      entitlement_status: "active",
      subscription_expires_at: expiresAt,
    })
    .eq("user_id", userId);

  if (error) {
    console.error("[revenuecat_webhook] RENEWAL update_failed", error);
  }

  await logToAppLogs({
    event: "revenuecat.renewal",
    source: "webhook",
    severity: "info",
    userId,
  });
};

const handleCancellation = async (
  supabase: ReturnType<typeof getAdminClient>,
  eventData: Record<string, unknown>,
) => {
  const userId = extractUserId(eventData);
  if (!userId) return;

  // User canceled - but subscription is active until expiration
  // Keep entitlement_status as "active" until it actually expires

  await logToAppLogs({
    event: "revenuecat.cancellation",
    source: "webhook",
    severity: "info",
    userId,
    details: { note: "subscription_active_until_expiration" },
  });
};

const handleExpiration = async (
  supabase: ReturnType<typeof getAdminClient>,
  eventData: Record<string, unknown>,
) => {
  const userId = extractUserId(eventData);
  if (!userId) return;

  const { error } = await supabase
    .from("profiles")
    .update({
      entitlement_status: "canceled",
    })
    .eq("user_id", userId);

  if (error) {
    console.error("[revenuecat_webhook] EXPIRATION update_failed", error);
  }

  await logToAppLogs({
    event: "revenuecat.expiration",
    source: "webhook",
    severity: "info",
    userId,
  });
};

const handleBillingIssue = async (
  supabase: ReturnType<typeof getAdminClient>,
  eventData: Record<string, unknown>,
) => {
  const userId = extractUserId(eventData);
  if (!userId) return;

  // Payment failed - put in grace period
  const { error } = await supabase
    .from("profiles")
    .update({
      entitlement_status: "grace",
    })
    .eq("user_id", userId);

  if (error) {
    console.error("[revenuecat_webhook] BILLING_ISSUE update_failed", error);
  }

  await logToAppLogs({
    event: "revenuecat.billing_issue",
    source: "webhook",
    severity: "warn",
    userId,
  });
};

const handleProductChange = async (
  supabase: ReturnType<typeof getAdminClient>,
  eventData: Record<string, unknown>,
) => {
  const userId = extractUserId(eventData);
  if (!userId) return;

  const { productId } = extractSubscriptionDetails(eventData);

  const { error } = await supabase
    .from("profiles")
    .update({
      subscription_product_id: productId,
    })
    .eq("user_id", userId);

  if (error) {
    console.error("[revenuecat_webhook] PRODUCT_CHANGE update_failed", error);
  }

  await logToAppLogs({
    event: "revenuecat.product_change",
    source: "webhook",
    severity: "info",
    userId,
    details: { new_product_id: productId },
  });
};

