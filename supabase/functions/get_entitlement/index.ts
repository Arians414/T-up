import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  getServiceSupabaseClient,
  getSupabaseClientWithAuth,
  jsonResponse,
  logToAppLogs,
  corsHeaders,
  loadLatestMeasurementPrefs,
  loadLatestSmokingPrefs,
  normalizeMeasurementPrefsForProfile,
  normalizeSmokingPrefsForProfile,
  isEmptyObjectRecord,
} from "../_shared/utils.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "GET") {
    return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
  }

  const { client: authClient, accessToken } = getSupabaseClientWithAuth(req);
  const {
    data: userData,
    error: userError,
  } = await authClient.auth.getUser(accessToken);

  if (userError || !userData?.user) {
    await logToAppLogs({
      event: "get_entitlement.request",
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
    event: "get_entitlement.request",
    source: "edge",
    severity: "info",
    userId,
    details: { method: req.method, userAgent: req.headers.get("user-agent") ?? undefined },
  });

  try {
    const supabase = getServiceSupabaseClient();
    const { data: profileData, error } = await supabase
      .from("profiles")
      .select("entitlement_status, trial_ends_at, measurement_prefs, smoking_prefs")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      await logToAppLogs({
        event: "get_entitlement",
        source: "edge",
        userId,
        details: { error },
      });
      return jsonResponse({ ok: false, error: "Failed to fetch entitlement", user_id: userId }, 500);
    }

    let profile = profileData ?? null;
    let measurementPrefs = normalizeMeasurementPrefsForProfile(profile?.measurement_prefs ?? null);
    let smokingPrefs = normalizeSmokingPrefsForProfile(profile?.smoking_prefs ?? null);

    const updates: Record<string, unknown> = {};

    if (!measurementPrefs) {
      const latestMeasurement = await loadLatestMeasurementPrefs(supabase, userId);
      const normalizedMeasurement = normalizeMeasurementPrefsForProfile(latestMeasurement);
      if (normalizedMeasurement) {
        updates.measurement_prefs = normalizedMeasurement;
        measurementPrefs = normalizedMeasurement;
      }
    }

    if (!smokingPrefs || isEmptyObjectRecord(profile?.smoking_prefs)) {
      const latestSmoking = await loadLatestSmokingPrefs(supabase, userId);
      const normalizedSmoking = normalizeSmokingPrefsForProfile(latestSmoking);
      if (normalizedSmoking) {
        updates.smoking_prefs = normalizedSmoking;
        smokingPrefs = normalizedSmoking;
      }
    }

    if (Object.keys(updates).length > 0) {
      const { data: updatedProfile, error: updateError } = await supabase
        .from("profiles")
        .update(updates)
        .eq("user_id", userId)
        .select("entitlement_status, trial_ends_at, measurement_prefs, smoking_prefs")
        .maybeSingle();

      if (updateError) {
        await logToAppLogs({
          event: "get_entitlement",
          source: "edge",
          severity: "warn",
          userId,
          details: { step: "backfill_profile_prefs", error: updateError },
        });
      } else if (updatedProfile) {
        profile = updatedProfile;
        measurementPrefs = normalizeMeasurementPrefsForProfile(updatedProfile.measurement_prefs ?? null) ?? measurementPrefs;
        smokingPrefs = normalizeSmokingPrefsForProfile(updatedProfile.smoking_prefs ?? null) ?? smokingPrefs;
      }
    }

    return jsonResponse({
      ok: true,
      entitlement_status: profile?.entitlement_status ?? "none",
      trial_ends_at: profile?.trial_ends_at ?? null,
      fetched_at: new Date().toISOString(),
      profile: {
        measurement_prefs: measurementPrefs ?? null,
        smoking_prefs: smokingPrefs ?? null,
      },
    });
  } catch (error) {
    await logToAppLogs({
      event: "get_entitlement",
      source: "edge",
      userId,
      details: { error: error instanceof Error ? error.message : String(error) },
    });
    return jsonResponse({ ok: false, error: "Unexpected error", user_id: userId }, 500);
  }
});
