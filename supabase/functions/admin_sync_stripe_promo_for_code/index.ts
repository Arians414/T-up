import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

/**
 * POST /admin_sync_stripe_promo_for_code
 * Body: { code: string }
 * Auth: service role (Authorization: Bearer <service_key>)
 * Response: { ok:true, data:{ code, stripe_promo_code_id } }
 */

import { ensureServiceRole, getAdminClient, jsonResponse, logRequest, readJson } from "../_shared/db.ts";
import { normalizeReferralCode } from "../_shared/validation.ts";
import { getStripeClient } from "../_shared/stripe.ts";
import Stripe from "https://esm.sh/stripe@14.23.0?target=deno&deno-std=0.224.0";

serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse(405, { ok: false, error: "method_not_allowed" });
  }

  const authError = ensureServiceRole(req);
  if (authError) {
    return authError;
  }

  const body = await readJson(req);
  if (!body) {
    return jsonResponse(400, { ok: false, error: "invalid_json" });
  }

  try {
    const code = normalizeReferralCode(body.code);
    const supabase = getAdminClient();

    const { data: referralCode, error: codeError } = await supabase
      .from("referral_codes")
      .select("id, code, discount_percent, stripe_promo_code_id, creator_id, active")
      .eq("code", code)
      .eq("active", true)
      .maybeSingle();

    if (codeError) {
      console.error("admin_sync_stripe_promo_for_code lookup_failed", codeError);
      return jsonResponse(500, { ok: false, error: "lookup_failed" });
    }
    if (!referralCode) {
      return jsonResponse(404, { ok: false, error: "code_not_found_or_inactive" });
    }

    const stripe = getStripeClient();
    if (!stripe) {
      return jsonResponse(503, { ok: false, error: "stripe_unavailable" });
    }

    const promoId = await ensurePromotionCode(stripe, referralCode);

    const { error: updateError } = await supabase
      .from("referral_codes")
      .update({ stripe_promo_code_id: promoId })
      .eq("id", referralCode.id);

    if (updateError) {
      console.error("admin_sync_stripe_promo_for_code update_failed", updateError);
      return jsonResponse(500, { ok: false, error: "update_failed" });
    }

    logRequest({
      route: "admin_sync_stripe_promo_for_code",
      user_id: null,
      install_id: null,
      code,
      creator_id: referralCode.creator_id,
      stripe_promo_code_id: promoId,
    });

    return jsonResponse(200, { ok: true, data: { code, stripe_promo_code_id: promoId } });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("code_")) {
      return jsonResponse(400, { ok: false, error: error.message });
    }
    if (error instanceof Stripe.errors.StripeError) {
      console.error("admin_sync_stripe_promo_for_code stripe_error", error);
      return jsonResponse(503, { ok: false, error: "stripe_unavailable" });
    }
    console.error("admin_sync_stripe_promo_for_code unexpected_error", error);
    return jsonResponse(500, { ok: false, error: "unexpected_error" });
  }
});

const ensurePromotionCode = async (
  stripe: Stripe,
  referralCode: { code: string; discount_percent: number; stripe_promo_code_id: string | null },
): Promise<string> => {
  // 1. Existing promo id? verify
  if (referralCode.stripe_promo_code_id) {
    try {
      const existingPromo = await stripe.promotionCodes.retrieve(referralCode.stripe_promo_code_id);
      if (existingPromo && !existingPromo.deleted) {
        return existingPromo.id;
      }
    } catch (error) {
      if (!(error instanceof Stripe.errors.StripeInvalidRequestError)) {
        throw error;
      }
    }
  }

  // 2. Try to find an existing promo by code
  const list = await stripe.promotionCodes.list({ code: referralCode.code, limit: 1 });
  if (list.data.length > 0) {
    return list.data[0].id;
  }

  // 3. Create coupon and promo
  const coupon = await stripe.coupons.create({
    percent_off: referralCode.discount_percent,
    duration: "forever",
    metadata: { referral_code: referralCode.code },
  });

  const promo = await stripe.promotionCodes.create({
    code: referralCode.code,
    coupon: coupon.id,
    active: true,
  });

  return promo.id;
};
