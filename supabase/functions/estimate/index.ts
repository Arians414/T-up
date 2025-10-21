import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  getServiceSupabaseClient,
  getSupabaseClientWithAuth,
  jsonResponse,
  logToAppLogs,
  corsHeaders,
  computeNextDueAt19Local,
  z,
} from "../_shared/utils.ts";

const requestSchema = z.object({
  source: z.enum(["intake_p2", "weekly_checkin", "recalc"]),
  week_number: z.number().int().min(1).max(8).optional(),
  related_checkin_id: z.string().uuid().optional(),
  completed_at: z.string().datetime().optional(),
});

const MODEL_VERSION = "v1.0.0";

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
      event: "estimate.request",
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
    event: "estimate.request",
    source: "edge",
    severity: "info",
    userId,
    details: { method: req.method, userAgent: req.headers.get("user-agent") ?? undefined },
  });

  let payload: z.infer<typeof requestSchema>;
  try {
    payload = requestSchema.parse(await req.json());
  } catch (_error) {
    return jsonResponse({ ok: false, error: "Invalid payload", user_id: userId }, 400);
  }

  if (payload.source === "weekly_checkin" && payload.week_number === undefined) {
    return jsonResponse({ ok: false, error: "week_number required for weekly_checkin", user_id: userId }, 400);
  }

  let completedAtDate = new Date();
  if (payload.completed_at) {
    const parsedCompletedAt = new Date(payload.completed_at);
    if (Number.isNaN(parsedCompletedAt.getTime())) {
      return jsonResponse({ ok: false, error: "Invalid completed_at", user_id: userId }, 400);
    }
    completedAtDate = parsedCompletedAt;
  }

  const supabase = getServiceSupabaseClient();

  let generatedAt = completedAtDate.toISOString();
  let score = 0;
  let potential: number | null = payload.source === "intake_p2" ? 0.15 : null;
  let modelVersionAtScore = MODEL_VERSION;

  let weeklyPayloadFromCheckin: Record<string, unknown> | undefined;
  let submittedAtFromCheckin: string | undefined;

  if (payload.source === "weekly_checkin" && payload.related_checkin_id) {
    const {
      data: existingHistory,
      error: existingHistoryError,
    } = await supabase
      .from("estimate_history")
      .select("score, potential, model_version, generated_at")
      .eq("user_id", userId)
      .eq("related_checkin_id", payload.related_checkin_id)
      .order("generated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingHistoryError) {
      await logToAppLogs({
        event: "estimate",
        source: "edge",
        userId,
        details: { step: "check_existing_history", error: existingHistoryError },
      });
      return jsonResponse({ ok: false, error: "Failed to read existing estimate", user_id: userId }, 500);
    }

    if (existingHistory) {
      const existingScore = Number(existingHistory.score ?? NaN);
      if (!Number.isFinite(existingScore)) {
        return jsonResponse({ ok: false, error: "Existing estimate invalid", user_id: userId }, 500);
      }

      // Ensure due times are standardized even on reuse
      const { data: profileForReuse, error: profileForReuseErr } = await supabase
        .from("profiles")
        .select("timezone, current_week_number")
        .eq("user_id", userId)
        .maybeSingle();
      if (profileForReuseErr) {
        await logToAppLogs({ event: "estimate", source: "edge", userId, details: { step: "fetch_profile_reuse", error: profileForReuseErr } });
        return jsonResponse({ ok: false, error: "Failed to read profile", user_id: userId }, 500);
      }

      const { data: checkinForReuse, error: checkinForReuseErr } = await supabase
        .from("weekly_checkins")
        .select("submitted_at, week_number")
        .eq("checkin_id", payload.related_checkin_id)
        .maybeSingle();
      if (checkinForReuseErr) {
        await logToAppLogs({ event: "estimate", source: "edge", userId, details: { step: "fetch_checkin_reuse", error: checkinForReuseErr } });
        return jsonResponse({ ok: false, error: "Failed to read weekly checkin", user_id: userId }, 500);
      }

      const timezone = typeof profileForReuse?.timezone === "string" && profileForReuse.timezone.trim().length > 0
        ? profileForReuse.timezone.trim()
        : undefined;
      const baseForSchedule = payload.completed_at ? completedAtDate : (checkinForReuse?.submitted_at ? new Date(checkinForReuse.submitted_at) : new Date());
      const nextWeekDueAt = computeNextDueAt19Local(timezone, baseForSchedule);

      const profileUpdatesReuse: Record<string, unknown> = { next_week_due_at: nextWeekDueAt };
      const reqWeekNo = payload.week_number ?? checkinForReuse?.week_number ?? null;
      if (typeof reqWeekNo === "number" && Number.isFinite(reqWeekNo)) {
        const targetWeekReuse = Math.min(8, Math.max(reqWeekNo + 1, 1));
        profileUpdatesReuse.current_week_number = targetWeekReuse;
      }
      const { error: updateProfileReuseErr } = await supabase
        .from("profiles")
        .update(profileUpdatesReuse)
        .eq("user_id", userId);
      if (updateProfileReuseErr) {
        await logToAppLogs({ event: "estimate", source: "edge", userId, details: { step: "update_profile_reuse", error: updateProfileReuseErr } });
      }

      const reuseWeekNumber = typeof profileUpdatesReuse.current_week_number === "number"
        ? profileUpdatesReuse.current_week_number
        : (typeof profileForReuse?.current_week_number === "number" ? profileForReuse.current_week_number : null);

      const { error: updateCheckinReuseErr } = await supabase
        .from("weekly_checkins")
        .update({ due_at: nextWeekDueAt })
        .eq("checkin_id", payload.related_checkin_id);
      if (updateCheckinReuseErr) {
        await logToAppLogs({ event: "estimate", source: "edge", userId, details: { step: "update_checkin_reuse", error: updateCheckinReuseErr } });
      }

      return jsonResponse({
        ok: true,
        reused: true,
        score: existingScore,
        potential: existingHistory.potential ?? undefined,
        modelVersion: existingHistory.model_version ?? MODEL_VERSION,
        generatedAt: existingHistory.generated_at ?? new Date().toISOString(),
        nextWeekDueAt,
        profile: {
          current_week_number: reuseWeekNumber,
          next_week_due_at: nextWeekDueAt,
        },
      });
    }

    // Load weekly_checkins payload for enrichment
    const { data: checkinRow, error: checkinError } = await supabase
      .from("weekly_checkins")
      .select("payload, submitted_at")
      .eq("checkin_id", payload.related_checkin_id)
      .maybeSingle();
    if (checkinError) {
      await logToAppLogs({ event: "estimate", source: "edge", userId, details: { step: "fetch_checkin", error: checkinError } });
      return jsonResponse({ ok: false, error: "Failed to read weekly checkin", user_id: userId }, 500);
    }
    weeklyPayloadFromCheckin = (checkinRow?.payload ?? {}) as Record<string, unknown>;
    submittedAtFromCheckin = checkinRow?.submitted_at ?? undefined;
  }

  const baseScore = 550;
  const scoreDelta = payload.source === "weekly_checkin"
    ? (payload.week_number ?? 0) * 5
    : payload.source === "recalc"
    ? 10
    : 0;
  score = baseScore + scoreDelta;
  potential = payload.source === "intake_p2" ? 0.15 : null;
  generatedAt = completedAtDate.toISOString();

  try {
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("last_result, timezone, current_week_number, next_week_due_at")
      .eq("user_id", userId)
      .maybeSingle();

    if (profileError) {
      await logToAppLogs({
        event: "estimate",
        source: "edge",
        userId,
        details: { step: "fetch_profile", error: profileError },
      });
      return jsonResponse({ ok: false, error: "Failed to read profile", reason: "fetch_profile_failed", user_id: userId }, 500);
    }

    if (!profile) {
      const { error: insertProfileError } = await supabase.from("profiles").insert({ user_id: userId });
      if (insertProfileError && (insertProfileError as Record<string, unknown>).code !== "23505") {
        await logToAppLogs({
          event: "estimate",
          source: "edge",
          userId,
          details: { step: "insert_profile", error: insertProfileError },
        });
        return jsonResponse({ ok: false, error: "Failed to prepare profile", user_id: userId }, 500);
      }
    }

    const { error: insertHistoryError } = await supabase.from("estimate_history").insert({
      user_id: userId,
      source: payload.source,
      related_checkin_id: payload.related_checkin_id ?? null,
      week_number: payload.week_number ?? null,
      model_version: modelVersionAtScore,
      score,
      potential,
      generated_at: generatedAt,
      payload: payload.source === "weekly_checkin" ? (weeklyPayloadFromCheckin ?? {}) : {},
    });

    if (insertHistoryError) {
      await logToAppLogs({
        event: "estimate",
        source: "edge",
        userId,
        details: { step: "insert_history", error: insertHistoryError },
      });
      return jsonResponse({ ok: false, error: "Failed to save estimate", reason: "insert_history_failed", user_id: userId }, 500);
    }

    const existingLastResult = (profile?.last_result ?? {}) as Record<string, unknown>;
    let nextLastResult: Record<string, unknown>;

    if (payload.source === "intake_p2") {
      nextLastResult = {
        score,
        potential,
        model_version_at_score: modelVersionAtScore,
        model_version_at_potential: modelVersionAtScore,
        generated_at: generatedAt,
      };
    } else {
      nextLastResult = {
        ...existingLastResult,
        score,
        model_version_at_score: modelVersionAtScore,
        generated_at: generatedAt,
      };
      if (potential !== null && potential !== undefined) {
        nextLastResult.potential = potential;
      }
    }

    const profileUpdates: Record<string, unknown> = {
      last_result: nextLastResult,
      updated_at: generatedAt,
    };

    let nextWeekDueAt: string | undefined;
    if (payload.source === "weekly_checkin") {
      const existingWeekNumber = typeof profile?.current_week_number === "number" && Number.isFinite(profile.current_week_number)
        ? profile.current_week_number
        : 0;
      const requestedWeekNumber = typeof payload.week_number === "number" && Number.isFinite(payload.week_number)
        ? payload.week_number
        : existingWeekNumber;
      const targetWeek = Math.min(8, Math.max(requestedWeekNumber + 1, 1));
      profileUpdates.current_week_number = targetWeek;

      const timezone = typeof profile?.timezone === "string" && profile.timezone.trim().length > 0
        ? profile.timezone.trim()
        : undefined;
      const baseForSchedule = submittedAtFromCheckin ? new Date(submittedAtFromCheckin) : completedAtDate;
      const computedDue = computeNextDueAt19Local(timezone, baseForSchedule);
      nextWeekDueAt = computedDue;
      profileUpdates.next_week_due_at = computedDue;

      if (payload.related_checkin_id) {
        const { error: updateCheckinDueError } = await supabase
          .from("weekly_checkins")
          .update({ due_at: computedDue })
          .eq("checkin_id", payload.related_checkin_id);
        if (updateCheckinDueError) {
          await logToAppLogs({ event: "estimate", source: "edge", userId, details: { step: "update_checkin_due", error: updateCheckinDueError } });
        }
      }
    }

    const { error: updateProfileError } = await supabase
      .from("profiles")
      .update(profileUpdates)
      .eq("user_id", userId);

    if (updateProfileError) {
      await logToAppLogs({
        event: "estimate",
        source: "edge",
        userId,
        details: { step: "update_profile", error: updateProfileError },
      });
      return jsonResponse({ ok: false, error: "Failed to update profile", reason: "update_profile_failed", user_id: userId }, 500);
    }

    const responseProfile = {
      current_week_number: typeof profileUpdates.current_week_number === "number"
        ? profileUpdates.current_week_number
        : (typeof profile?.current_week_number === "number" ? profile.current_week_number : null),
      next_week_due_at: profileUpdates.next_week_due_at ?? profile?.next_week_due_at ?? null,
    };

    return jsonResponse({
      ok: true,
      score,
      potential: potential ?? undefined,
      modelVersion: modelVersionAtScore,
      generatedAt,
      nextWeekDueAt,
      profile: responseProfile,
    });
  } catch (error) {
    await logToAppLogs({
      event: "estimate",
      source: "edge",
      userId,
      details: { error: error instanceof Error ? error.message : String(error) },
    });
    return jsonResponse({ ok: false, error: "Unexpected error", reason: "unexpected", user_id: userId }, 500);
  }
});


