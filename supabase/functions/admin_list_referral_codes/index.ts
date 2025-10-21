import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

/**
 * GET /admin_list_referral_codes
 * Query params: creator_id, active, code, limit, offset
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
    const activeParam = url.searchParams.get("active");
    const codeParam = url.searchParams.get("code");
    const limit = clampLimit(parseInt(url.searchParams.get("limit") ?? ""), DEFAULT_LIMIT);
    const offset = clampOffset(parseInt(url.searchParams.get("offset") ?? "0"));
    const rangeEnd = offset + limit - 1;

    const supabase = getAdminClient();
    let query = supabase
      .from("vw_code_summary")
      .select("*")
      .order("created_at", { ascending: false });

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

    if (activeParam !== null) {
      if (activeParam === "true" || activeParam === "false") {
        query = query.eq("active", activeParam === "true");
      } else {
        return jsonResponse(400, { ok: false, error: "active_invalid" });
      }
    }

    if (codeParam) {
      try {
        const normalized = normalizeReferralCode(codeParam);
        query = query.eq("code", normalized);
      } catch (error) {
        if (error instanceof Error) {
          return jsonResponse(400, { ok: false, error: error.message });
        }
        throw error;
      }
    }

    const { data, error } = await query.range(offset, rangeEnd);

    if (error) {
      console.error("admin_list_referral_codes query_failed", error);
      return jsonResponse(500, { ok: false, error: "query_failed" });
    }

    return jsonResponse(200, {
      ok: true,
      data: {
        items: data ?? [],
        limit,
        offset,
      },
    });
  } catch (error) {
    console.error("admin_list_referral_codes unexpected_error", error);
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
