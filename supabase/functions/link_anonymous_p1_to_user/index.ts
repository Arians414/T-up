import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  getServiceSupabaseClient,
  getSupabaseClientWithAuth,
  jsonResponse,
  logToAppLogs,
  corsHeaders,
  z,
  extractMeasurementPrefsFromPayload,
  loadLatestMeasurementPrefs,
  normalizeMeasurementPrefsForProfile,
} from "../_shared/utils.ts";

const requestSchema = z.object({
  install_id: z.string().uuid(),
});

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
  }

  const { client: authClient, accessToken } = getSupabaseClientWithAuth(req);
  const {
    data: userData,
    error: userError,
  } = await authClient.auth.getUser(accessToken);

  if (userError || !userData?.user) {
    await logToAppLogs({
      event: "link_anonymous_p1_to_user.request",
      source: "edge",
      severity: "warn",
      details: {
        method: req.method,
        userAgent: req.headers.get("user-agent") ?? undefined,
        hasAuth: Boolean(accessToken),
        error: userError?.message ?? userError ?? "Auth session missing!",
      },
    });
    return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
  }

  const userId = userData.user.id;

  await logToAppLogs({
    event: "link_anonymous_p1_to_user.request",
    source: "edge",
    severity: "info",
    userId,
    details: { method: req.method, userAgent: req.headers.get("user-agent") ?? undefined },
  });

  let parsed: z.infer<typeof requestSchema>;
  try {
    parsed = requestSchema.parse(await req.json());
  } catch (_error) {
    return jsonResponse({ ok: false, error: "Invalid payload", user_id: userId }, 400);
  }

  const supabase = getServiceSupabaseClient();
  const nowIso = new Date().toISOString();

  try {
    const { error: ensureProfileError } = await supabase
      .from("profiles")
      .upsert({ user_id: userId }, { onConflict: "user_id" });
    if (ensureProfileError) {
      await logToAppLogs({
        event: "link_anonymous_p1_to_user",
        source: "edge",
        userId,
        details: { step: "ensure_profile", error: ensureProfileError },
      });
      return jsonResponse({ ok: false, error: "Failed to ensure profile", user_id: userId }, 500);
    }

    const { data: profile, error: fetchProfileError } = await supabase
      .from("profiles")
      .select("user_id, intake_p1_completed_at, measurement_prefs")
      .eq("user_id", userId)
      .maybeSingle();

    if (fetchProfileError) {
      await logToAppLogs({
        event: "link_anonymous_p1_to_user",
        source: "edge",
        userId,
        details: { error: fetchProfileError },
      });
      return jsonResponse({ ok: false, error: "Failed to read profile", user_id: userId }, 500);
    }

    const { data: anonymousRow, error: fetchAnonError } = await supabase
      .from("anonymous_intake_p1_submissions")
      .select("submission_id, payload")
      .eq("install_id", parsed.install_id)
      .is("linked_user_id", null)
      .eq("intake_locked", false)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fetchAnonError) {
      await logToAppLogs({
        event: "link_anonymous_p1_to_user",
        source: "edge",
        userId,
        details: { error: fetchAnonError },
      });
      return jsonResponse({ ok: false, error: "Failed to read anonymous intake", user_id: userId }, 500);
    }

    let linkedSubmissionId: string | null = null;
    let measurementFromIntake = extractMeasurementPrefsFromPayload(anonymousRow?.payload ?? null);

    if (anonymousRow?.submission_id) {
      const { error: updateAnonError } = await supabase
        .from("anonymous_intake_p1_submissions")
        .update({ linked_user_id: userId, linked_at: nowIso })
        .eq("submission_id", anonymousRow.submission_id);

      if (updateAnonError) {
        await logToAppLogs({
          event: "link_anonymous_p1_to_user",
          source: "edge",
          userId,
          details: { step: "update_anonymous", error: updateAnonError },
        });
        return jsonResponse({ ok: false, error: "Failed to link intake", user_id: userId }, 500);
      }

      linkedSubmissionId = anonymousRow.submission_id;
    }

    if (!measurementFromIntake) {
      measurementFromIntake = await loadLatestMeasurementPrefs(supabase, userId);
    }

    if (!profile?.intake_p1_completed_at) {
      const { error: updateProfileError } = await supabase
        .from("profiles")
        .update({ intake_p1_completed_at: nowIso })
        .eq("user_id", userId);
      if (updateProfileError) {
        await logToAppLogs({
          event: "link_anonymous_p1_to_user",
          source: "edge",
          userId,
          details: { step: "update_profile", error: updateProfileError },
        });
        return jsonResponse({ ok: false, error: "Failed to update profile", user_id: userId }, 500);
      }
    }

    const measurementPrefsForProfile = normalizeMeasurementPrefsForProfile(measurementFromIntake);
    if (measurementPrefsForProfile) {
      const { error: prefsUpdateError } = await supabase
        .from("profiles")
        .update({ measurement_prefs: measurementPrefsForProfile })
        .eq("user_id", userId);
      if (prefsUpdateError) {
        await logToAppLogs({
          event: "link_anonymous_p1_to_user",
          source: "edge",
          severity: "warn",
          userId,
          details: { step: "update_measurement_prefs", error: prefsUpdateError },
        });
      }
    }

    if (!linkedSubmissionId) {
      linkedSubmissionId = anonymousRow?.submission_id ?? null;
    }

    return jsonResponse({ ok: true, linked: Boolean(linkedSubmissionId), submission_id: linkedSubmissionId, user_id: userId });
  } catch (error) {
    await logToAppLogs({
      event: "link_anonymous_p1_to_user",
      source: "edge",
      userId,
      details: { error: error instanceof Error ? error.message : String(error) },
    });
    return jsonResponse({ ok: false, error: "Unexpected error", user_id: userId }, 500);
  }
});
