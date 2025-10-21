import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.23.0?target=deno&deno-std=0.224.0";
import {
  getServiceSupabaseClient,
  getSupabaseClientWithAuth,
  jsonResponse,
  logToAppLogs,
} from "../_shared/utils.ts";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const BILLING_PORTAL_RETURN_URL = Deno.env.get("BILLING_PORTAL_RETURN_URL") ?? "tup://billing-return";

if (!STRIPE_SECRET_KEY) {
  throw new Error("Missing STRIPE_SECRET_KEY");
}

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: "2023-10-16",
});

serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
  }

  const { client: authClient, accessToken } = getSupabaseClientWithAuth(req);
  const {
    data: userData,
    error: userError,
  } = await authClient.auth.getUser(accessToken);

  if (userError || !userData?.user) {
    return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
  }

  const supabase = getServiceSupabaseClient();
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("stripe_customer_id")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (profileError) {
    await logToAppLogs({
      event: "create_billing_portal_session",
      source: "edge",
      details: { error: profileError },
      userId: userData.user.id,
    });
    return jsonResponse({ ok: false, error: "Failed to load profile" }, 500);
  }

  if (!profile?.stripe_customer_id) {
    return jsonResponse({ ok: false, error: "No Stripe customer", code: "missing_customer" }, 400);
  }

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: BILLING_PORTAL_RETURN_URL,
    });

    return jsonResponse({ ok: true, url: session.url });
  } catch (error) {
    await logToAppLogs({
      event: "create_billing_portal_session",
      source: "edge",
      details: { error: error instanceof Error ? error.message : String(error) },
      userId: userData.user.id,
    });
    return jsonResponse({ ok: false, error: "Failed to create portal session" }, 500);
  }
});
