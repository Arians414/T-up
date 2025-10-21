import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

/**
 * POST /admin_run_payout_rollup
 * Body: { month: "YYYY-MM" }
 * Requires service role Authorization header.
 */

import { ensureServiceRole, getAdminClient, jsonResponse, nowIso, readJson } from "../_shared/db.ts";

const MONTH_REGEX = /^\d{4}-\d{2}$/;

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
    const monthInput = typeof body.month === "string" ? body.month.trim() : "";
    if (!MONTH_REGEX.test(monthInput)) {
      return jsonResponse(400, { ok: false, error: "month_invalid" });
    }

    const monthStartIso = `${monthInput}-01T00:00:00.000Z`;
    const monthStart = new Date(monthStartIso);
    if (Number.isNaN(monthStart.getTime())) {
      return jsonResponse(400, { ok: false, error: "month_invalid" });
    }
    const nextMonth = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1));

    const supabase = getAdminClient();

    const { data: rows, error: fetchError } = await supabase
      .from("referral_revenue_log")
      .select("creator_id, amount_net_cents")
      .gte("period_start", monthStart.toISOString())
      .lt("period_end", nextMonth.toISOString());

    if (fetchError) {
      console.error("admin_run_payout_rollup fetch_failed", fetchError);
      return jsonResponse(500, { ok: false, error: "aggregate_failed" });
    }

    const totals = new Map<string, number>();
    for (const row of rows ?? []) {
      if (!row?.creator_id) continue;
      const amount = typeof row.amount_net_cents === "number" ? row.amount_net_cents : 0;
      totals.set(row.creator_id, (totals.get(row.creator_id) ?? 0) + amount);
    }

    const monthString = monthStart.toISOString().substring(0, 10);
    const generatedAt = nowIso();

    const result: Array<{ creator_id: string; month: string; amount_cents: number; status: string; generated_at: string }> = [];

    for (const [creatorId, amount] of totals) {
      const record = {
        creator_id: creatorId,
        month: monthString,
        amount_cents: Math.max(0, Math.round(amount)),
        status: "pending" as const,
        generated_at: generatedAt,
      };

      const { data, error } = await supabase
        .from("creator_payouts")
        .upsert(record, { onConflict: "creator_id,month" })
        .select("creator_id, month, amount_cents, status, generated_at")
        .single();

      if (error) {
        console.error("admin_run_payout_rollup upsert_failed", error, record);
        return jsonResponse(500, { ok: false, error: "upsert_failed" });
      }
      if (data) {
        result.push(data as typeof record);
      }
    }

    return jsonResponse(200, { ok: true, data: { month: monthString, payouts: result } });
  } catch (error) {
    console.error("admin_run_payout_rollup unexpected_error", error);
    return jsonResponse(500, { ok: false, error: "unexpected_error" });
  }
});
