import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

/**
 * POST /create_checkout_session
 * Body: { price_id: string }
 * Auth: user JWT (Bearer)
 * Response: { ok:true, data:{ url, session_id } }
 */

import { getAdminClient, jsonResponse, logRequest, readJson } from "../_shared/db.ts";
import { requireString } from "../_shared/validation.ts";
import { getStripeClient, getAppBaseUrl, assertStripeConfigured } from "../_shared/stripe.ts";
import { getSupabaseClientWithAuth } from "../_shared/utils.ts";

serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse(405, { ok: false, error: "method_not_allowed" });
  }

  const stripeCheck = assertStripeConfigured();
  if (!stripeCheck.ok) {
    return stripeCheck.response!;
  }

  const stripe = getStripeClient();
  if (!stripe) {
    return jsonResponse(503, { ok: false, error: "stripe_not_configured" });
  }

  const { client: authClient, accessToken } = getSupabaseClientWithAuth(req);
  const {
    data: userData,
    error: userError,
  } = await authClient.auth.getUser(accessToken);

  if (userError || !userData?.user) {
    return jsonResponse(401, { ok: false, error: "unauthorized" });
  }

  const body = await readJson(req);
  if (!body) {
    return jsonResponse(400, { ok: false, error: "invalid_json" });
  }

  try {
    const priceId = requireString(body.price_id, "price_id");
    const userId = userData.user.id;
    const userEmail = userData.user.email ?? undefined;
    const supabase = getAdminClient();

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("user_id, stripe_customer_id, contact_email, timezone")
      .eq("user_id", userId)
      .maybeSingle();

    if (profileError) {
      console.error("create_checkout_session profile_fetch_failed", profileError);
      return jsonResponse(500, { ok: false, error: "profile_lookup_failed" });
    }

    const emailForCustomer = userEmail ?? profile?.contact_email ?? undefined;
    let stripeCustomerId = profile?.stripe_customer_id ?? null;

    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: emailForCustomer,
        metadata: { user_id: userId },
      });
      stripeCustomerId = customer.id;
      const { error: updateError } = await supabase
        .from("profiles")
        .upsert({ user_id: userId, stripe_customer_id: stripeCustomerId }, { onConflict: "user_id" });
      if (updateError) {
        console.error("create_checkout_session profile_update_failed", updateError);
      }
    }

    const baseUrl = getAppBaseUrl();
    const successUrl = `${baseUrl}/stripe/success`;
    const cancelUrl = `${baseUrl}/stripe/cancel`;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: stripeCustomerId ?? undefined,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      metadata: { user_id: userId },
      success_url: successUrl,
      cancel_url: cancelUrl,
      allow_promotion_codes: false,
    });

    if (!session?.url || !session.id) {
      return jsonResponse(500, { ok: false, error: "stripe_session_failed" });
    }

    logRequest({ route: "create_checkout_session", user_id: userId, install_id: null, code: null, session_id: session.id });
    return jsonResponse(200, {
      ok: true,
      data: {
        url: session.url,
        session_id: session.id,
      },
    });
  } catch (error) {
    if (error instanceof Error && /price_id_(required|invalid|too_short|too_long)/i.test(error.message)) {
      return jsonResponse(400, { ok: false, error: error.message });
    }
    console.error("create_checkout_session unexpected_error", error);
    return jsonResponse(500, { ok: false, error: "unexpected_error" });
  }
});
