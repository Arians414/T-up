import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

/**
 * POST /admin_create_creator
 * Body: { name: string, email?: string }
 * Auth: service role (Authorization: Bearer <service_key>)
 * Response: { ok: true, data: { creator: { id, name, email, created_at } } }
 */

import { getAdminClient, ensureServiceRole, jsonResponse, logRequest, readJson } from "../_shared/db.ts";
import { requireString } from "../_shared/validation.ts";

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
    const supabase = getAdminClient();
    const name = requireString(body.name, "name");
    const emailValue = body.email === undefined || body.email === null ? null : requireString(body.email, "email");

    const existingQuery = supabase
      .from("creators")
      .select("id, name, email, created_at")
      .eq("name", name)
      .limit(1);
    const existing = emailValue === null
      ? await existingQuery.is("email", null).maybeSingle()
      : await existingQuery.eq("email", emailValue).maybeSingle();

    if (existing.data) {
      logRequest({ route: "admin_create_creator", user_id: null, install_id: null, code: null, creator_id: existing.data.id });
      return jsonResponse(200, { ok: true, data: { creator: existing.data } });
    }

    const { data, error } = await supabase
      .from("creators")
      .insert({ name, email: emailValue })
      .select("id, name, email, created_at")
      .single();

    if (error || !data) {
      console.error("admin_create_creator insert_failed", error);
      return jsonResponse(500, { ok: false, error: "insert_failed" });
    }

    logRequest({ route: "admin_create_creator", user_id: null, install_id: null, code: null, creator_id: data.id });
    return jsonResponse(200, { ok: true, data: { creator: data } });
  } catch (error) {
    if (error instanceof Error && /_(required|invalid|too_short|too_long)$/i.test(error.message)) {
      return jsonResponse(400, { ok: false, error: error.message });
    }
    console.error("admin_create_creator unexpected_error", error);
    return jsonResponse(500, { ok: false, error: "unexpected_error" });
  }
});
