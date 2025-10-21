import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  corsHeaders,
  computeNextWeekDueAt,
  getServiceSupabaseClient,
  getSupabaseClientWithAuth,
  jsonResponse,
  logToAppLogs,
} from "../_shared/utils.ts";

const isDevEnabled = () => (Deno.env.get("DEV_TRIAL_ENABLED") ?? "").toLowerCase() === "true";
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
  }

  if (!isDevEnabled()) {
    await logToAppLogs({
      event: "dev_open_week",
      source: "edge",
      severity: "warn",
      details: { reason: "disabled" },
    });
    return jsonResponse({ ok: false, error: "Not enabled" }, 403);
  }

  const { client: authClient, accessToken } = getSupabaseClientWithAuth(req);
  const {
    data: userData,
    error: userError,
  } = await authClient.auth.getUser(accessToken);

  if (userError || !userData?.user) {
    return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
  }

  const userId = userData.user.id;
  const supabase = getServiceSupabaseClient();

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("user_id", userId)
    .maybeSingle();

  if (profileError) {
    await logToAppLogs({
      event: "dev_open_week",
      source: "edge",
      severity: "error",
      userId,
      details: { step: "fetch_profile", error: profileError },
    });
    return jsonResponse({ ok: false, error: "Failed to read profile" }, 500);
  }

  const timezone =
    typeof profile?.timezone === "string" && profile.timezone.trim().length > 0
      ? profile.timezone.trim()
      : "UTC";

  const now = new Date();
  const baseForToday = new Date(now.getTime() - WEEK_MS);
  let candidateIso = computeNextWeekDueAt(baseForToday, timezone);
  let dueAt = new Date(candidateIso);

  if (Number.isNaN(dueAt.getTime())) {
    dueAt = new Date(now);
  }

  if (dueAt <= now) {
    dueAt = new Date(now.getTime() + 60 * 1000);
  }

  const dueIso = dueAt.toISOString();

  const { error: upsertError } = await supabase
    .from("profiles")
    .upsert(
      {
        user_id: userId,
        current_week_number: 1,
        next_week_due_at: dueIso,
      },
      { onConflict: "user_id" },
    );

  if (upsertError) {
    await logToAppLogs({
      event: "dev_open_week",
      source: "edge",
      severity: "error",
      userId,
      details: { step: "update_profile", error: upsertError },
    });
    return jsonResponse({ ok: false, error: "Failed to update profile" }, 500);
  }

  await logToAppLogs({
    event: "dev_open_week",
    source: "edge",
    severity: "info",
    userId,
    details: { next_week_due_at: dueIso },
  });

  return jsonResponse({ ok: true, next_week_due_at: dueIso });
});
