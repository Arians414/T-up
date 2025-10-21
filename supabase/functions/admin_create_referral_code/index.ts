import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

/**
 * POST /admin_create_referral_code
 * Body: { creator_id: uuid, code: string, discount_percent: number, active?: boolean }
 * Auth: service role (Authorization: Bearer <service_key>)
 * Response: { ok:true, data:{ code:{ id, code, creator_id, discount_percent, active } } }
 */

import { getAdminClient, ensureServiceRole, jsonResponse, logRequest, readJson } from "../_shared/db.ts";
import { normalizeReferralCode, requireNumberInRange, requireUUID } from "../_shared/validation.ts";

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
    const creatorId = requireUUID(body.creator_id, "creator_id");
    const code = normalizeReferralCode(body.code);
    const discountPercent = requireNumberInRange(body.discount_percent, "discount_percent", { min: 0, max: 100 });
    let active: boolean | undefined;
    if (body.active !== undefined) {
      if (typeof body.active !== "boolean") {
        return jsonResponse(400, { ok: false, error: "active_invalid" });
      }
      active = body.active;
    }

    const insertPayload: Record<string, unknown> = {
      creator_id: creatorId,
      code,
      discount_percent: discountPercent,
    };
    if (active !== undefined) {
      insertPayload.active = active;
    }

    const { data, error } = await supabase
      .from("referral_codes")
      .insert(insertPayload)
      .select("id, code, creator_id, discount_percent, active")
      .single();

    if (error) {
      if ((error as { code?: string }).code === "23505") {
        return jsonResponse(409, { ok: false, error: "code_already_exists" });
      }
      console.error("admin_create_referral_code insert_failed", error);
      return jsonResponse(500, { ok: false, error: "insert_failed" });
    }
    if (!data) {
      return jsonResponse(500, { ok: false, error: "insert_failed" });
    }

    logRequest({ route: "admin_create_referral_code", user_id: null, install_id: null, code, creator_id: creatorId });
    return jsonResponse(200, { ok: true, data: { code: data } });
  } catch (error) {
    if (error instanceof Error && /_(required|invalid|too_short|too_long|too_small|too_large)$/i.test(error.message)) {
      return jsonResponse(400, { ok: false, error: error.message });
    }
    console.error("admin_create_referral_code unexpected_error", error);
    return jsonResponse(500, { ok: false, error: "unexpected_error" });
  }
});
