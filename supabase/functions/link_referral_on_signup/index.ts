import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

/**
 * POST /link_referral_on_signup
 * Body: { install_id: string }
 * Auth: user JWT
 * Response:
 *   - { ok:true, data:{ reused:true, code?, creator_id? } } if already linked
 *   - { ok:true, data:{ linked:false } } if no session exists
 *   - { ok:true, data:{ linked:true, code, creator_id } } on successful link
 */

import { getAdminClient, logRequest, nowIso, readJson } from "../_shared/db.ts";
import { jsonResponse } from "../_shared/http.ts";
import { requireString } from "../_shared/validation.ts";
import { getSupabaseClientWithAuth } from "../_shared/utils.ts";

serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse(405, { ok: false, error: "method_not_allowed" });
  }

  const body = await readJson(req);
  if (!body) {
    return jsonResponse(400, { ok: false, error: "invalid_json" });
  }

  const { client: authClient, accessToken } = getSupabaseClientWithAuth(req);
  const {
    data: userData,
    error: userError,
  } = await authClient.auth.getUser(accessToken);

  if (userError || !userData?.user) {
    return jsonResponse(401, { ok: false, error: "unauthorized" });
  }

  const userId = userData.user.id;

  try {
    const installId = requireString(body.install_id, "install_id", { min: 3, max: 128 });
    const supabase = getAdminClient();

    // Already linked?
    const { data: existingReferral, error: existingReferralError } = await supabase
      .from("referrals")
      .select("code_id, creator_id, referral_codes(code)")
      .eq("user_id", userId)
      .maybeSingle();

    if (existingReferralError) {
      console.error("link_referral_on_signup existing_referral_failed", existingReferralError);
      return jsonResponse(500, { ok: false, error: "lookup_failed" });
    }

    if (existingReferral) {
      const code = existingReferral.referral_codes?.code ?? null;
      logRequest({ route: "link_referral_on_signup", user_id: userId, install_id: installId, code, reused: true });
      return jsonResponse(200, {
        ok: true,
        data: {
          reused: true,
          code,
          creator_id: existingReferral.creator_id,
        },
      });
    }

    // Lookup captured session (URL-based referrals)
    const { data: session, error: sessionError } = await supabase
      .from("referral_sessions")
      .select("code_id, creator_id, referral_codes(code)")
      .eq("install_id", installId)
      .maybeSingle();

    if (sessionError) {
      console.error("link_referral_on_signup session_lookup_failed", sessionError);
      return jsonResponse(500, { ok: false, error: "lookup_failed" });
    }

    let codeId: string | null = null;
    let creatorId: string | null = null;
    let code: string | null = null;

    if (session) {
      // Found URL-based referral
      codeId = session.code_id;
      creatorId = session.creator_id;
      code = session.referral_codes?.code ?? null;
    } else {
      // Check anonymous intake for manually entered referral code
      const { data: intake, error: intakeError } = await supabase
        .from("anonymous_intake_p1_submissions")
        .select("payload")
        .eq("install_id", installId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (intakeError) {
        console.error("link_referral_on_signup intake_lookup_failed", intakeError);
      } else if (intake?.payload) {
        const payload = intake.payload as Record<string, unknown>;
        const referralCode = typeof payload.referral_code === "string" 
          ? payload.referral_code.trim().toUpperCase() 
          : null;

        if (referralCode && referralCode.length > 0) {
          // Look up the code in referral_codes table
          const { data: codeData, error: codeError } = await supabase
            .from("referral_codes")
            .select("id, code, creator_id, active")
            .eq("code", referralCode)
            .eq("active", true)
            .maybeSingle();

          if (!codeError && codeData) {
            codeId = codeData.id;
            creatorId = codeData.creator_id;
            code = codeData.code;
          } else {
            console.warn("link_referral_on_signup invalid_or_inactive_code", referralCode);
          }
        }
      }
    }

    // No referral found (neither URL-based nor manual entry)
    if (!codeId || !creatorId) {
      logRequest({ route: "link_referral_on_signup", user_id: userId, install_id: installId, code: null, linked: false });
      return jsonResponse(200, { ok: true, data: { linked: false } });
    }

    const { error: insertError } = await supabase
      .from("referrals")
      .insert({
        user_id: userId,
        code_id: codeId,
        creator_id: creatorId,
      });

    if (insertError) {
      if ((insertError as { code?: string }).code !== "23505") {
        console.error("link_referral_on_signup insert_failed", insertError);
        return jsonResponse(500, { ok: false, error: "insert_failed" });
      }
      // Rare race: fetch existing row to return data
      const { data: fetched, error: fetchError } = await supabase
        .from("referrals")
        .select("creator_id, referral_codes(code)")
        .eq("user_id", userId)
        .maybeSingle();
      if (fetchError) {
        console.error("link_referral_on_signup fetch_after_conflict_failed", fetchError);
      } else if (fetched) {
        creatorId = fetched.creator_id;
        code = fetched.referral_codes?.code ?? code;
      }
    }

    // Update profile hints (first-touch only)
    await supabase
      .from("profiles")
      .update({
        referred_code: code,
        referred_creator_id: creatorId,
        referred_at: nowIso(),
      })
      .eq("user_id", userId)
      .is("referred_code", null);

    logRequest({ route: "link_referral_on_signup", user_id: userId, install_id: installId, code, creator_id: creatorId });
    return jsonResponse(200, {
      ok: true,
      data: {
        linked: true,
        code,
        creator_id: creatorId,
      },
    });
  } catch (error) {
    if (error instanceof Error && /^install_id_(required|invalid|too_short|too_long)$/i.test(error.message)) {
      return jsonResponse(400, { ok: false, error: error.message });
    }
    console.error("link_referral_on_signup unexpected_error", error);
    return jsonResponse(500, { ok: false, error: "unexpected_error" });
  }
});
