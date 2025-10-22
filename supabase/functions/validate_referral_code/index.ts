import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { jsonResponseWithCors } from "../_shared/http.ts";
import { getAnonClient } from "../_shared/db.ts";
import { z } from "../_shared/utils.ts";

/**
 * POST /validate_referral_code
 * Validates if a referral code exists and is active
 * Can be called without authentication (anon key)
 */

const requestSchema = z.object({
  code: z.string().min(1).max(20),
});

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return jsonResponseWithCors(200, {});
  }

  if (req.method !== "POST") {
    return jsonResponseWithCors(405, { ok: false, error: "method_not_allowed" });
  }

  try {
    const body = await req.json();
    const parsed = requestSchema.safeParse(body);

    if (!parsed.success) {
      return jsonResponseWithCors(400, { 
        ok: false, 
        error: "invalid_request",
        valid: false,
      });
    }

    const { code } = parsed.data;
    const normalizedCode = code.trim().toUpperCase();

    // Use anon client - no auth required for validation
    const supabase = getAnonClient();

    // Check if code exists and is active
    const { data: referralCode, error } = await supabase
      .from("referral_codes")
      .select("id, code, creator_id, active")
      .eq("code", normalizedCode)
      .eq("active", true)
      .maybeSingle();

    if (error) {
      console.error("[validate_referral_code] database error", error);
      return jsonResponseWithCors(500, { 
        ok: false, 
        error: "database_error",
        valid: false,
      });
    }

    if (!referralCode) {
      // Code not found or inactive
      return jsonResponseWithCors(200, { 
        ok: true,
        valid: false,
        code: normalizedCode,
      });
    }

    // Code is valid and active
    return jsonResponseWithCors(200, { 
      ok: true,
      valid: true,
      code: referralCode.code,
      code_id: referralCode.id,
      creator_id: referralCode.creator_id,
    });

  } catch (error) {
    console.error("[validate_referral_code] unexpected error", error);
    return jsonResponseWithCors(500, { 
      ok: false, 
      error: "internal_error",
      valid: false,
    });
  }
});

