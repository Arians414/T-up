import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

/**
 * GET /admin_list_creators
 * Query params:
 *   q (optional search by name/email)
 *   limit (default 100, max 200)
 *   offset (default 0)
 *
 * Requires service role Authorization header.
 * Returns aggregated creator stats from vw_creator_summary.
 */

import { ensureServiceRole, getAdminClient, jsonResponse } from "../_shared/db.ts";

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
    const q = url.searchParams.get("q")?.trim();

    const limit = clampLimit(parseInt(url.searchParams.get("limit") ?? ""), DEFAULT_LIMIT);
    const offset = clampOffset(parseInt(url.searchParams.get("offset") ?? "0"));
    const rangeEnd = offset + limit - 1;

    const supabase = getAdminClient();
    let query = supabase.from("vw_creator_summary").select("*").order("created_at", { ascending: false });

    if (q && q.length > 0) {
      const pattern = `%${q.replace(/%/g, "\\%").replace(/_/g, "\\_")}%`;
      query = query.or(`name.ilike.${pattern},email.ilike.${pattern}`, { foreignTable: undefined });
    }

    const { data, error } = await query.range(offset, rangeEnd);

    if (error) {
      console.error("admin_list_creators query_failed", error);
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
    console.error("admin_list_creators unexpected_error", error);
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
