import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

/**
 * GET /admin_list_referrals
 * Query params: creator_id, code, user_id, limit, offset
 * Requires service role Authorization header.
 */

import { ensureServiceRole, getAdminClient, jsonResponse } from "../_shared/db.ts";
import { normalizeReferralCode, requireUUID } from "../_shared/validation.ts";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 200;

serve(async (req) => {
  if (req.method !== "GET") {
    return jsonResponse(405, { ok: false, error: "method_not_allowed" });
  }

  const authError = ensureServiceRole(req);
  if (authError) {
    return authError;
  }

  try {
    const url = new URL(req.url);
    const creatorIdParam = url.searchParams.get("creator_id");
    const codeParam = url.searchParams.get("code");
    const userIdParam = url.searchParams.get("user_id");

    const limit = clampLimit(parseInt(url.searchParams.get("limit") ?? ""), DEFAULT_LIMIT);
    const offset = clampOffset(parseInt(url.searchParams.get("offset") ?? "0"));
    const rangeEnd = offset + limit - 1;

    const supabase = getAdminClient();
    let query = supabase
      .from("referrals")
      .select("id, user_id, code_id, creator_id, attributed_at, referral_codes(code)")
      .order("attributed_at", { ascending: false });

    if (creatorIdParam) {
      try {
        const creatorId = requireUUID(creatorIdParam, "creator_id");
        query = query.eq("creator_id", creatorId);
      } catch (error) {
        if (error instanceof Error) {
          return jsonResponse(400, { ok: false, error: error.message });
        }
        throw error;
      }
    }

    if (userIdParam) {
      try {
        const userId = requireUUID(userIdParam, "user_id");
        query = query.eq("user_id", userId);
      } catch (error) {
        if (error instanceof Error) {
          return jsonResponse(400, { ok: false, error: error.message });
        }
        throw error;
      }
    }

    if (codeParam) {
      try {
        const normalized = normalizeReferralCode(codeParam);
        query = query.eq("referral_codes.code", normalized);
      } catch (error) {
        if (error instanceof Error) {
          return jsonResponse(400, { ok: false, error: error.message });
        }
        throw error;
      }
    }

    const { data, error } = await query.range(offset, rangeEnd);

    if (error) {
      console.error("admin_list_referrals query_failed", error);
      return jsonResponse(500, { ok: false, error: "query_failed" });
    }

    const items = (data ?? []).map((row) => ({
      id: row.id,
      user_id: row.user_id,
      code_id: row.code_id,
      creator_id: row.creator_id,
      attributed_at: row.attributed_at,
      code: row.referral_codes?.code ?? null,
    }));

    return jsonResponse(200, {
      ok: true,
      data: {
        items,
        limit,
        offset,
      },
    });
  } catch (error) {
    console.error("admin_list_referrals unexpected_error", error);
    return jsonResponse(500, { ok: false, error: "unexpected_error" });
  }
});

const clampLimit = (value: number, fallback: number): number => {
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.min(value, MAX_LIMIT);
};

const clampOffset = (value: number): number => {
  if (!Number.isFinite(value) || value < 0) return 0;
  return value;
};
