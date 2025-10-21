import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  getServiceSupabaseClient,
  getSupabaseClientWithAuth,
  jsonResponse,
  logToAppLogs,
  corsHeaders,
} from "../_shared/utils.ts";

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
      event: "ensure_profile.request",
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
    event: "ensure_profile.request",
    source: "edge",
    severity: "info",
    userId,
    details: {
      method: req.method,
      userAgent: req.headers.get("user-agent") ?? undefined,
    },
  });

  try {
    const supabase = getServiceSupabaseClient();
    const { error } = await supabase
      .from("profiles")
      .upsert({ user_id: userId }, { onConflict: "user_id" });

    if (error) {
      await logToAppLogs({
        event: "ensure_profile",
        source: "edge",
        userId,
        details: { error },
      });
      return jsonResponse({ ok: false, error: "Failed to ensure profile" }, 500);
    }

    return jsonResponse({ ok: true, user_id: userId });
  } catch (error) {
    await logToAppLogs({
      event: "ensure_profile",
      source: "edge",
      userId,
      details: { error: error instanceof Error ? error.message : String(error) },
    });
    return jsonResponse({ ok: false, error: "Unexpected error" }, 500);
  }
});
