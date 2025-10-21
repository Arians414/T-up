import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  getServiceSupabaseClient,
  getSupabaseClientWithAuth,
  jsonResponse,
  logToAppLogs,
} from "../_shared/utils.ts";

serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
  }

  const { client: authClient, accessToken } = getSupabaseClientWithAuth(req);
  const {
    data: userData,
    error: userError,
  } = await authClient.auth.getUser(accessToken);

  if (userError || !userData?.user) {
    return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
  }

  const supabase = getServiceSupabaseClient();
  const userId = userData.user.id;

  try {
    const { error: deleteError } = await supabase.from("profiles").delete().eq("user_id", userId);
    if (deleteError) {
      await logToAppLogs({
        event: "delete_user_account",
        source: "edge",
        details: { error: deleteError },
      });
      return jsonResponse({ ok: false, error: "Failed to delete account" }, 500);
    }

    await logToAppLogs({
      event: "delete_user_account",
      source: "edge",
      severity: "info",
      userId,
      details: { message: "User account deleted" },
    });

    return jsonResponse({ ok: true, deleted: true });
  } catch (error) {
    await logToAppLogs({
      event: "delete_user_account",
      source: "edge",
      details: { error: error instanceof Error ? error.message : String(error) },
    });
    return jsonResponse({ ok: false, error: "Unexpected error" }, 500);
  }
});
