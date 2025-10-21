import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  corsHeaders,
  getServiceSupabaseClient,
  getSupabaseClientWithAuth,
  jsonResponse,
  logToAppLogs,
  computeNextWeekDueAt,
  z,
} from "../_shared/utils.ts";

const requestSchema = z.object({
  timezone: z.string().min(1).optional(),
});

const isDevEnabled = () => (Deno.env.get("DEV_TRIAL_ENABLED") ?? "").toLowerCase() === "true";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
  }

  if (!isDevEnabled()) {
    await logToAppLogs({
      event: "dev_start_trial.denied",
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

  let payload: z.infer<typeof requestSchema> = {};
  try {
    if (req.headers.get("Content-Length")) {
      const json = await req.json();
      payload = requestSchema.parse(json);
    }
  } catch (error) {
    await logToAppLogs({
      event: "dev_start_trial.invalid_payload",
      source: "edge",
      severity: "warn",
      userId: userData.user.id,
      details: { error: error instanceof Error ? error.message : String(error) },
    });
    return jsonResponse({ ok: false, error: "Invalid payload" }, 400);
  }

  const supabase = getServiceSupabaseClient();

  const now = new Date();
  const ends = new Date(now);
  ends.setDate(ends.getDate() + 7);

  const userId = userData.user.id;

  const { error: upsertError } = await supabase.from("profiles").upsert({ user_id: userId }, { onConflict: "user_id" });
  if (upsertError) {
    await logToAppLogs({
      event: "dev_start_trial.upsert_failed",
      source: "edge",
      userId,
      details: { error: upsertError },
    });
    return jsonResponse({ ok: false, error: "Failed to start trial" }, 500);
  }

  const {
    data: existingProfile,
    error: profileReadError,
  } = await supabase
    .from("profiles")
    .select("timezone, current_week_number, next_week_due_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (profileReadError) {
    await logToAppLogs({
      event: "dev_start_trial.profile_read_failed",
      source: "edge",
      userId,
      details: { error: profileReadError },
    });
    return jsonResponse({ ok: false, error: "Failed to start trial" }, 500);
  }

  const timezoneOverride = payload.timezone?.trim();
  const resolvedTimezone = timezoneOverride && timezoneOverride.length > 0
    ? timezoneOverride
    : typeof existingProfile?.timezone === "string" && existingProfile.timezone.trim().length > 0
    ? existingProfile.timezone.trim()
    : undefined;

  const trialStartedAtIso = now.toISOString();
  const trialEndsAtIso = ends.toISOString();
  const nextWeekDueAtIso = computeNextWeekDueAt(now, resolvedTimezone);

  const updates: Record<string, unknown> = {
    trial_started_at: trialStartedAtIso,
    trial_ends_at: trialEndsAtIso,
    entitlement_status: "trial",
    ever_started_trial: true,
    current_week_number: 1,
    next_week_due_at: nextWeekDueAtIso,
  };

  if (resolvedTimezone) {
    updates.timezone = resolvedTimezone;
  }

  const { data: updated, error: updateError } = await supabase
    .from("profiles")
    .update(updates)
    .eq("user_id", userId)
    .select("trial_started_at, trial_ends_at, entitlement_status, timezone, current_week_number, next_week_due_at")
    .maybeSingle();

  if (updateError) {
    await logToAppLogs({
      event: "dev_start_trial.update_failed",
      source: "edge",
      userId,
      details: { error: updateError },
    });
    return jsonResponse({ ok: false, error: "Failed to start trial" }, 500);
  }

  await logToAppLogs({
    event: "dev_start_trial",
    source: "edge",
    severity: "info",
    userId,
    details: { entitlement_status: updated?.entitlement_status ?? "trial" },
  });

  return jsonResponse({
    ok: true,
    trial_started_at: updated?.trial_started_at ?? trialStartedAtIso,
    trial_ends_at: updated?.trial_ends_at ?? trialEndsAtIso,
    entitlement_status: updated?.entitlement_status ?? "trial",
    timezone: updated?.timezone ?? resolvedTimezone ?? null,
    current_week_number: updated?.current_week_number ?? 1,
    next_week_due_at: updated?.next_week_due_at ?? nextWeekDueAtIso,
  });
});
