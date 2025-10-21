import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  corsHeaders,
  getServiceSupabaseClient,
  getSupabaseClientWithAuth,
  jsonResponse,
  logToAppLogs,
  z,
  deriveProfileSmokingPrefs,
  extractMeasurementPrefsFromPayload,
  loadLatestMeasurementPrefs,
  normalizeMeasurementPrefsForProfile,
  normalizeSmokingPrefsForProfile,
  isEmptyObjectRecord,
} from "../_shared/utils.ts";

const requestSchema = z.object({
  payload: z.record(z.any()),
  schema_version: z.string().min(1).optional(),
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
      event: "complete_intake2",
      source: "edge",
      severity: "warn",
      details: { reason: "unauthorized", error: userError?.message ?? userError ?? null },
    });
    return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
  }

  let parsedBody: z.infer<typeof requestSchema>;
  try {
    parsedBody = requestSchema.parse(await req.json());
  } catch (error) {
    await logToAppLogs({
      event: "complete_intake2",
      source: "edge",
      severity: "warn",
      userId: userData.user.id,
      details: { reason: "invalid_payload", error: error instanceof Error ? error.message : String(error) },
    });
    return jsonResponse({ ok: false, error: "Invalid payload" }, 400);
  }

  const supabase = getServiceSupabaseClient();
  const normalizedPayload = (parsedBody.payload ?? {}) as Record<string, unknown>;
  try {
    const { data, error } = await supabase
      .rpc("complete_intake2_atomic", {
        p_payload: normalizedPayload,
        p_schema_version: parsedBody.schema_version ?? "v1",
        p_user_id: userData.user.id,
      })
      .single();

    if (error || !data) {
      await logToAppLogs({
        event: "complete_intake2",
        source: "edge",
        severity: "error",
        userId: userData.user.id,
        details: { reason: "rpc_failed", error: error ?? null },
      });
      return jsonResponse({ ok: false, error: "Failed to complete intake" }, 500);
    }

    const reused = Boolean((data as Record<string, unknown>)?.reused);
    const userId = userData.user.id;

    // Capture intake-derived preferences so profile stays in sync with the latest questionnaire.
    const profileUpdates: Record<string, unknown> = {};
    const { data: profileSnapshot, error: profileFetchError } = await supabase
      .from("profiles")
      .select("measurement_prefs, smoking_prefs")
      .eq("user_id", userId)
      .maybeSingle();

    let nextProfileSnapshot: Record<string, unknown> | null = profileSnapshot ?? null;

    if (profileFetchError) {
      await logToAppLogs({
        event: "complete_intake2",
        source: "edge",
        severity: "warn",
        userId,
        details: { step: "fetch_profile_for_prefs", error: profileFetchError },
      });
    } else {
      const smokingPrefs = deriveProfileSmokingPrefs(normalizedPayload);
      if (smokingPrefs) {
        const existingSmoking = normalizeSmokingPrefsForProfile(profileSnapshot?.smoking_prefs ?? null);
        const profileSmokingEmpty = isEmptyObjectRecord(profileSnapshot?.smoking_prefs);
        if (
          profileSmokingEmpty ||
          !existingSmoking ||
          existingSmoking.cigarettes !== smokingPrefs.cigarettes ||
          existingSmoking.vape !== smokingPrefs.vape ||
          existingSmoking.weed !== smokingPrefs.weed
        ) {
          profileUpdates.smoking_prefs = smokingPrefs;
        }
      }

      // Measurement unit prefs from Intake responses
      let measurementPrefs = normalizeMeasurementPrefsForProfile(extractMeasurementPrefsFromPayload(normalizedPayload));
      if (!measurementPrefs) {
        const measurementFromIntake = await loadLatestMeasurementPrefs(supabase, userId);
        measurementPrefs = normalizeMeasurementPrefsForProfile(measurementFromIntake);
      }
      if (measurementPrefs) {
        const existingMeasurement = normalizeMeasurementPrefsForProfile(profileSnapshot?.measurement_prefs ?? null);
        const serializedExisting = existingMeasurement ? JSON.stringify(existingMeasurement) : null;
        const serializedNext = JSON.stringify(measurementPrefs);
        if (serializedExisting !== serializedNext) {
          profileUpdates.measurement_prefs = measurementPrefs;
        }
      }

      if (profileSnapshot) {
        nextProfileSnapshot = { ...profileSnapshot };
      }
    }

    if (Object.keys(profileUpdates).length > 0) {
      const { error: prefsUpdateError } = await supabase
        .from("profiles")
        .update(profileUpdates)
        .eq("user_id", userId);
      if (prefsUpdateError) {
        await logToAppLogs({
          event: "complete_intake2",
          source: "edge",
          severity: "warn",
          userId,
          details: { step: "update_profile_prefs", error: prefsUpdateError },
        });
      } else if (nextProfileSnapshot) {
        nextProfileSnapshot = { ...nextProfileSnapshot, ...profileUpdates };
      }
    }

    const responseProfile = {
      measurement_prefs: (profileUpdates.measurement_prefs ?? nextProfileSnapshot?.measurement_prefs) ?? null,
      smoking_prefs: (profileUpdates.smoking_prefs ?? nextProfileSnapshot?.smoking_prefs) ?? null,
    };

    await logToAppLogs({
      event: "complete_intake2",
      source: "edge",
      severity: reused ? "info" : "info",
      userId,
      details: { reused },
    });

    return jsonResponse({
      ok: true,
      reused,
      score: data.score,
      potential: data.potential,
      generatedAt: data.generated_at ?? null,
      modelVersion: data.model_version ?? null,
      profile: responseProfile,
    });
  } catch (error) {
    await logToAppLogs({
      event: "complete_intake2",
      source: "edge",
      severity: "error",
      userId: userData.user.id,
      details: { error: error instanceof Error ? error.message : String(error) },
    });
    return jsonResponse({ ok: false, error: "Unexpected error" }, 500);
  }
});
