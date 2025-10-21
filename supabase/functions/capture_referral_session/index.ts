import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

/**
 * POST /capture_referral_session
 * Body: { install_id: string, code: string }
 * Auth: public
 * Response: { ok:true, data:{ session:{ install_id, code, creator_id } } }
 */

import { getAdminClient, jsonResponse, logRequest, readJson } from "../_shared/db.ts";
import { normalizeReferralCode, requireString } from "../_shared/validation.ts";

serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse(405, { ok: false, error: "method_not_allowed" });
  }

  const body = await readJson(req);
  if (!body) {
    return jsonResponse(400, { ok: false, error: "invalid_json" });
  }

  const supabase = getAdminClient();

  try {
    const installId = requireString(body.install_id, "install_id", { min: 3, max: 128 });
    const code = normalizeReferralCode(body.code);

    const { data: codeRow, error: codeError } = await supabase
      .from("referral_codes")
      .select("id, creator_id, code, active")
      .eq("code", code)
      .maybeSingle();

    if (codeError) {
      console.error("capture_referral_session code_lookup_failed", codeError);
      return jsonResponse(500, { ok: false, error: "lookup_failed" });
    }

    if (!codeRow || codeRow.active !== true) {
      logRequest({ route: "capture_referral_session", user_id: null, install_id: installId, code, valid: false });
      return jsonResponse(400, { ok: false, error: "invalid_or_inactive_code" });
    }

    const { data: inserted, error: insertError } = await supabase
      .from("referral_sessions")
      .upsert(
        {
          install_id: installId,
          code_id: codeRow.id,
          creator_id: codeRow.creator_id,
        },
        { onConflict: "install_id", ignoreDuplicates: true },
      )
      .select("install_id, code_id, creator_id")
      .maybeSingle();

    if (insertError && (insertError as { code?: string }).code !== "23505") {
      console.error("capture_referral_session upsert_failed", insertError);
      return jsonResponse(500, { ok: false, error: "upsert_failed" });
    }

    let session = inserted;
    if (!session) {
      const { data: existing, error: existingError } = await supabase
        .from("referral_sessions")
        .select("install_id, code_id, creator_id")
        .eq("install_id", installId)
        .maybeSingle();
      if (existingError) {
        console.error("capture_referral_session fetch_existing_failed", existingError);
        return jsonResponse(500, { ok: false, error: "lookup_failed" });
      }
      session = existing ?? { install_id: installId, code_id: codeRow.id, creator_id: codeRow.creator_id };
    }

    logRequest({ route: "capture_referral_session", user_id: null, install_id: installId, code, creator_id: session.creator_id });
    return jsonResponse(200, {
      ok: true,
      data: {
        session: {
          install_id: session.install_id,
          code,
          creator_id: session.creator_id,
        },
      },
    });
  } catch (error) {
    if (error instanceof Error && /^(install_id|code)_(required|invalid|too_short|too_long)$/i.test(error.message)) {
      return jsonResponse(400, { ok: false, error: error.message });
    }
    console.error("capture_referral_session unexpected_error", error);
    return jsonResponse(500, { ok: false, error: "unexpected_error" });
  }
});
