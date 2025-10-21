import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

/**
 * POST /admin_disable_referral_code
 * Body: { code: string, active: boolean }
 * Auth: service role (Authorization: Bearer <service_key>)
 * Response: { ok:true, data:{ code:{ ... } } }
 */

import { getAdminClient, ensureServiceRole, jsonResponse, logRequest, readJson } from "../_shared/db.ts";
import { normalizeReferralCode } from "../_shared/validation.ts";

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
    const supabase = getAdminClient();
    const code = normalizeReferralCode(body.code);
    if (typeof body.active !== "boolean") {
      return jsonResponse(400, { ok: false, error: "active_invalid" });
    }
    const active = body.active;

    const { data, error } = await supabase
      .from("referral_codes")
      .update({ active })
      .eq("code", code)
      .select("id, code, creator_id, discount_percent, active")
      .maybeSingle();

    if (error) {
      console.error("admin_disable_referral_code update_failed", error);
      return jsonResponse(500, { ok: false, error: "update_failed" });
    }

    if (!data) {
      return jsonResponse(404, { ok: false, error: "code_not_found" });
    }

    logRequest({ route: "admin_disable_referral_code", user_id: null, install_id: null, code, creator_id: data.creator_id });
    return jsonResponse(200, { ok: true, data: { code: data } });
  } catch (error) {
    if (error instanceof Error && /^(code|install_id)_(required|invalid|too_short|too_long)$/i.test(error.message)) {
      return jsonResponse(400, { ok: false, error: error.message });
    }
    console.error("admin_disable_referral_code unexpected_error", error);
    return jsonResponse(500, { ok: false, error: "unexpected_error" });
  }
});
